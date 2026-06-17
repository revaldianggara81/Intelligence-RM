'use strict';
/**
 * notificationService.js
 * Manages in-app notifications (badge + inbox) and optional email digest
 * via SMTP (nodemailer) and/or OCI Notification Service (ONS).
 *
 * Oracle tables:
 *   NOTIFICATIONS        — per-RM notification inbox rows
 *   NOTIFICATION_PREFS   — per-RM channel preferences
 */
const db       = require('../config/database');
const emailSvc = require('./emailService');

// ── Preferences ─────────────────────────────────────────────────────────────

/** Get (or return defaults for) an RM's notification preferences. */
async function getPrefs(rmUserId) {
  const r = await db.execute(
    `SELECT RM_USER_ID, IN_APP_ENABLED, EMAIL_ENABLED,
            EMAIL_ADDRESS, DIGEST_FREQ, OCI_NOTIF_ENABLED,
            NVL(MATURITY_HORIZON_DAYS, 30) AS MATURITY_HORIZON_DAYS,
            NVL(MATURITY_HIGH_DAYS,    14) AS MATURITY_HIGH_DAYS,
            NVL(MATURITY_MEDIUM_DAYS,  30) AS MATURITY_MEDIUM_DAYS
       FROM NOTIFICATION_PREFS
      WHERE RM_USER_ID = :1`,
    [rmUserId]
  );
  if (r.rows?.[0]) return r.rows[0];
  return {
    RM_USER_ID: rmUserId, IN_APP_ENABLED: 1,
    EMAIL_ENABLED: 0, EMAIL_ADDRESS: null,
    DIGEST_FREQ: 'immediate', OCI_NOTIF_ENABLED: 0,
    MATURITY_HORIZON_DAYS: 30, MATURITY_HIGH_DAYS: 14, MATURITY_MEDIUM_DAYS: 30,
  };
}

/** Get RM's maturity reminder horizon settings only. */
async function getHorizonPrefs(rmUserId) {
  const r = await db.execute(
    `SELECT RM_USER_ID,
            NVL(MATURITY_HORIZON_DAYS, 30) AS MATURITY_HORIZON_DAYS,
            NVL(MATURITY_HIGH_DAYS,    14) AS MATURITY_HIGH_DAYS,
            NVL(MATURITY_MEDIUM_DAYS,  30) AS MATURITY_MEDIUM_DAYS
       FROM NOTIFICATION_PREFS
      WHERE RM_USER_ID = :1`,
    [rmUserId]
  );
  if (r.rows?.[0]) return r.rows[0];
  return {
    RM_USER_ID: rmUserId,
    MATURITY_HORIZON_DAYS: 30, MATURITY_HIGH_DAYS: 14, MATURITY_MEDIUM_DAYS: 30,
  };
}

/** Save RM's maturity reminder horizon settings. */
async function saveHorizonPrefs(rmUserId, { maturity_horizon_days, maturity_high_days, maturity_medium_days }) {
  const horizon = Math.max(7, Math.min(90, parseInt(maturity_horizon_days) || 30));
  const high    = Math.max(1, Math.min(horizon, parseInt(maturity_high_days) || 14));
  const medium  = Math.max(high, Math.min(horizon, parseInt(maturity_medium_days) || 30));

  await db.execute(
    `MERGE INTO NOTIFICATION_PREFS t
     USING (SELECT :1 AS RM_USER_ID FROM DUAL) s
     ON (t.RM_USER_ID = s.RM_USER_ID)
     WHEN MATCHED THEN
       UPDATE SET MATURITY_HORIZON_DAYS = :2,
                  MATURITY_HIGH_DAYS    = :3,
                  MATURITY_MEDIUM_DAYS  = :4,
                  UPDATED_AT = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (RM_USER_ID, MATURITY_HORIZON_DAYS, MATURITY_HIGH_DAYS, MATURITY_MEDIUM_DAYS)
       VALUES (:5, :6, :7, :8)`,
    [rmUserId, horizon, high, medium, rmUserId, horizon, high, medium]
  );
  return { MATURITY_HORIZON_DAYS: horizon, MATURITY_HIGH_DAYS: high, MATURITY_MEDIUM_DAYS: medium };
}

/** Upsert an RM's notification preferences. */
async function savePrefs(rmUserId, { in_app_enabled, email_enabled, email_address, digest_freq, oci_notif_enabled }) {
  const inApp   = in_app_enabled   ? 1 : 0;
  const email   = email_enabled    ? 1 : 0;
  const oci     = oci_notif_enabled ? 1 : 0;
  const freq    = digest_freq || 'immediate';
  const emailAddr = email_address || null;

  await db.execute(
    `MERGE INTO NOTIFICATION_PREFS t
     USING (SELECT :1 AS RM_USER_ID FROM DUAL) s
     ON (t.RM_USER_ID = s.RM_USER_ID)
     WHEN MATCHED THEN
       UPDATE SET IN_APP_ENABLED = :2, EMAIL_ENABLED = :3,
                  EMAIL_ADDRESS = :4, DIGEST_FREQ = :5,
                  OCI_NOTIF_ENABLED = :6, UPDATED_AT = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (RM_USER_ID, IN_APP_ENABLED, EMAIL_ENABLED, EMAIL_ADDRESS, DIGEST_FREQ, OCI_NOTIF_ENABLED)
       VALUES (:7, :8, :9, :10, :11, :12)`,
    [rmUserId, inApp, email, emailAddr, freq, oci,
     rmUserId, inApp, email, emailAddr, freq, oci]
  );
}

// ── In-App Inbox ─────────────────────────────────────────────────────────────

/** Count unread notifications for a user. */
async function getUnreadCount(rmUserId) {
  const r = await db.execute(
    `SELECT COUNT(*) AS CNT FROM NOTIFICATIONS WHERE RM_USER_ID = :1 AND IS_READ = 0`,
    [rmUserId]
  );
  return Number(r.rows?.[0]?.CNT || 0);
}

/** List recent notifications for a user (newest first). */
async function getNotifications(rmUserId, limit = 25) {
  const r = await db.execute(
    `SELECT NOTIF_ID, NOTIF_TYPE, TITLE, MESSAGE, SEVERITY,
            CUSTOMER_ID, ALERT_ID, IS_READ,
            TO_CHAR(CREATED_AT, 'DD Mon YYYY HH24:MI') AS CREATED_FMT
       FROM NOTIFICATIONS
      WHERE RM_USER_ID = :1
      ORDER BY CREATED_AT DESC
      FETCH FIRST :2 ROWS ONLY`,
    [rmUserId, Math.min(limit, 50)]
  );
  return r.rows || [];
}

/** Mark a single notification as read. */
async function markRead(notifId, rmUserId) {
  await db.execute(
    `UPDATE NOTIFICATIONS SET IS_READ = 1
      WHERE NOTIF_ID = :1 AND RM_USER_ID = :2`,
    [notifId, rmUserId]
  );
}

/** Mark ALL notifications as read for a user. */
async function markAllRead(rmUserId) {
  await db.execute(
    `UPDATE NOTIFICATIONS SET IS_READ = 1
      WHERE RM_USER_ID = :1 AND IS_READ = 0`,
    [rmUserId]
  );
}

// ── Push: Alerts → Notifications ─────────────────────────────────────────────

/**
 * Called after the scheduler runs.
 * Converts any ALERTS that don't yet have a NOTIFICATIONS row into
 * in-app notifications, then optionally emails and/or OCI-publishes.
 */
async function pushAlertNotifications() {
  try {
    // Find open alerts with no notification yet
    const r = await db.execute(
      `SELECT a.ALERT_ID, a.CUSTOMER_ID, a.ALERT_TYPE, a.SEVERITY,
              a.TITLE, a.MESSAGE, c.RM_USER_ID
         FROM ALERTS a
         JOIN CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID
        WHERE a.STATUS = 'Open'
          AND NOT EXISTS (
            SELECT 1 FROM NOTIFICATIONS n WHERE n.ALERT_ID = a.ALERT_ID
          )
        ORDER BY a.TRIGGERED_AT DESC
        FETCH FIRST 200 ROWS ONLY`
    );
    const newAlerts = r.rows || [];
    if (!newAlerts.length) return { created: 0 };

    // Insert NOTIFICATIONS rows
    let created = 0;
    for (const a of newAlerts) {
      try {
        await db.execute(
          `INSERT INTO NOTIFICATIONS
             (RM_USER_ID, NOTIF_TYPE, TITLE, MESSAGE, SEVERITY, CUSTOMER_ID, ALERT_ID)
           VALUES (:1, :2, :3, :4, :5, :6, :7)`,
          [a.RM_USER_ID, a.ALERT_TYPE, a.TITLE,
           a.MESSAGE, a.SEVERITY, a.CUSTOMER_ID, a.ALERT_ID]
        );
        created++;
      } catch(e) {
        if (!/ORA-00001/.test(e.message)) // skip unique violations silently
          console.warn('[Notif] insert row:', e.message);
      }
    }

    // Group alerts by RM for outbound channels
    const byRM = {};
    newAlerts.forEach(a => {
      if (!byRM[a.RM_USER_ID]) byRM[a.RM_USER_ID] = [];
      byRM[a.RM_USER_ID].push(a);
    });

    for (const [rmUserId, alerts] of Object.entries(byRM)) {
      const prefs = await getPrefs(rmUserId).catch(() => null);
      if (!prefs) continue;
      if (prefs.EMAIL_ENABLED)      await _sendEmailDigest(rmUserId, alerts, prefs).catch(e => console.warn('[Notif] email:', e.message));
      if (prefs.OCI_NOTIF_ENABLED)  await _publishOciNotification(rmUserId, alerts).catch(e => console.warn('[Notif] oci:', e.message));
    }

    console.log(`[Notif] ${created} notification(s) pushed`);
    return { created };
  } catch(e) {
    console.error('[Notif] pushAlertNotifications error:', e.message);
    return { created: 0, error: e.message };
  }
}

/**
 * Manual email digest: send ALL open alerts for an RM regardless of prefs.
 * Used by the "Send Digest" button.
 */
async function sendDigestNow(rmUserId) {
  // Get RM email info
  const rmR = await db.execute(
    `SELECT USER_ID, FULL_NAME, EMAIL FROM RM_USERS WHERE USER_ID = :1`, [rmUserId]
  );
  const rm = rmR.rows?.[0];
  if (!rm) return { ok: false, error: 'RM not found' };

  // Get prefs (for override email address)
  const prefs = await getPrefs(rmUserId);
  const toEmail = prefs.EMAIL_ADDRESS || rm.EMAIL;
  if (!toEmail) return { ok: false, error: 'Alamat email tidak ditemukan. Set di Preferensi Notifikasi.' };

  // Fetch all open alerts for this RM
  const r = await db.execute(
    `SELECT a.ALERT_ID, a.CUSTOMER_ID, a.ALERT_TYPE, a.SEVERITY, a.TITLE, a.MESSAGE
       FROM ALERTS a
       JOIN CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID
      WHERE c.RM_USER_ID = :1
        AND a.STATUS = 'Open'
      ORDER BY a.SEVERITY DESC, a.TRIGGERED_AT DESC
      FETCH FIRST 50 ROWS ONLY`,
    [rmUserId]
  );
  const alerts = r.rows || [];
  if (!alerts.length) return { ok: true, message: 'Tidak ada alert terbuka saat ini.', sent: 0 };

  const result = await _buildAndSendEmail(rm.FULL_NAME, toEmail, alerts);
  return result.ok
    ? { ok: true, sent: alerts.length, to: toEmail }
    : { ok: false, error: result.error };
}

// ── Private helpers ──────────────────────────────────────────────────────────

async function _sendEmailDigest(rmUserId, alerts, prefs) {
  if (prefs.DIGEST_FREQ === 'none') return;
  const rmR = await db.execute(
    `SELECT FULL_NAME, EMAIL FROM RM_USERS WHERE USER_ID = :1`, [rmUserId]
  );
  const rm = rmR.rows?.[0];
  if (!rm) return;
  const toEmail = prefs.EMAIL_ADDRESS || rm.EMAIL;
  if (!toEmail) return;
  await _buildAndSendEmail(rm.FULL_NAME, toEmail, alerts);
}

async function _buildAndSendEmail(rmName, toEmail, alerts) {
  const sevLabel = s =>
    s === 'high' ? '🔴 HIGH' : s === 'medium' ? '🟡 MEDIUM' : '🟢 LOW';
  const sevBg = s =>
    s === 'high' ? '#dc2626' : s === 'medium' ? '#d97706' : '#16a34a';

  const textLines = alerts.map(a =>
    `[${(a.SEVERITY||'low').toUpperCase()}] ${a.TITLE} — ${a.CUSTOMER_ID}`
  );

  const textBody = [
    `Halo ${rmName},`,
    '',
    `${alerts.length} alert terbuka memerlukan tindakan Anda:`,
    '',
    ...textLines,
    '',
    'Login ke platform untuk melihat detail dan mengambil tindakan.',
    '',
    'Oracle AI · Intelligence RM Platform · Bank Danamon',
  ].join('\n');

  const alertRows = alerts.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eef0f3;">
        <span style="background:${sevBg(a.SEVERITY)};color:#fff;font-size:10px;
          font-weight:700;padding:2px 7px;border-radius:10px;font-family:monospace;">
          ${sevLabel(a.SEVERITY)}
        </span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef0f3;font-weight:600;color:#1a2e4a;font-size:13px;">
        ${_escHtml(a.TITLE)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef0f3;color:#6e8aaa;font-size:12px;">
        ${a.CUSTOMER_ID || '–'}
      </td>
    </tr>`).join('');

  const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f0f4f8;padding:24px;margin:0;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;
              box-shadow:0 2px 12px rgba(0,0,0,.08);border:1px solid #dce0e8;">
    <div style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:22px 28px;">
      <div style="color:#00ccff;font-size:10px;font-family:monospace;letter-spacing:1.5px;
                  text-transform:uppercase;margin-bottom:6px;">Oracle AI · Bank Danamon</div>
      <div style="color:#fff;font-size:22px;font-weight:700;">🔔 ${alerts.length} Alert Memerlukan Perhatian</div>
      <div style="color:#8fb8d4;font-size:12px;margin-top:6px;">
        ${new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'full',timeStyle:'short'})} WIB
      </div>
    </div>
    <div style="padding:22px 28px;">
      <p style="color:#1a2e4a;font-size:14px;margin:0 0 16px;">
        Halo <strong>${_escHtml(rmName)}</strong>, berikut ringkasan alert portofolio nasabah Anda yang memerlukan tindakan segera:
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eef0f3;border-radius:6px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:9px 12px;text-align:left;font-size:10px;color:#6e8aaa;
                       font-weight:700;letter-spacing:.06em;text-transform:uppercase;width:100px;">Severity</th>
            <th style="padding:9px 12px;text-align:left;font-size:10px;color:#6e8aaa;
                       font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Alert</th>
            <th style="padding:9px 12px;text-align:left;font-size:10px;color:#6e8aaa;
                       font-weight:700;letter-spacing:.06em;text-transform:uppercase;width:110px;">Customer</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
      <a href="${process.env.APP_URL || 'http://localhost:3000'}"
         style="display:inline-block;background:#0075c9;color:#fff;font-size:13px;font-weight:600;
                padding:11px 26px;border-radius:7px;text-decoration:none;">
        → Buka Intelligence RM Platform
      </a>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #eef0f3;">
      <p style="font-size:11px;color:#9eafc0;margin:0;">
        Email ini dikirim secara otomatis oleh Oracle AI Intelligence RM Platform · Bank Danamon.
        Untuk berhenti menerima email notifikasi, ubah preferensi di platform.
      </p>
    </div>
  </div>
</body></html>`;

  return emailSvc.sendShareEmail({
    to: toEmail,
    subject: `🔔 ${alerts.length} Alert Baru — Danamon Intelligence RM`,
    textBody,
    htmlBody,
    senderName: 'Intelligence RM Platform',
  });
}

/** Publish to OCI Notification Service (ONS) using oci-common signing. */
async function _publishOciNotification(rmUserId, alerts) {
  const topicId  = process.env.OCI_NOTIFICATION_TOPIC_ID;
  const endpoint = process.env.OCI_NOTIFICATION_ENDPOINT;
  if (!topicId || !endpoint || process.env.OCI_NOTIFICATION_ENABLED !== 'true') return;

  try {
    const oci    = require('../config/oci');
    const common = require('oci-common');
    const https  = require('https');
    const url    = require('url');

    const msgBody = `${alerts.length} alert baru untuk RM ${rmUserId}: ${alerts.slice(0,3).map(a=>a.TITLE).join(', ')}${alerts.length > 3 ? ` dan ${alerts.length-3} lainnya` : ''}`;
    const payload = JSON.stringify({ body: msgBody, title: `🔔 ${alerts.length} Alert — Intelligence RM Platform` });

    const parsed  = url.parse(`${endpoint}/20181201/ons/topics/${topicId}/messages`);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
    };

    const provider = oci.getProvider();
    const signer   = new common.DefaultRequestSigner(provider);
    const httpReq  = {
      uri: parsed.href, method: 'POST',
      headers,
      body: payload,
    };
    await signer.signHttpRequest(httpReq);

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: parsed.hostname,
        path:     parsed.path,
        method:   'POST',
        headers:  httpReq.headers,
        rejectUnauthorized: false,
      }, res => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    console.log(`[Notif] OCI ONS published for RM ${rmUserId}`);
  } catch(e) {
    console.warn('[Notif] OCI ONS error:', e.message);
  }
}

function _escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

module.exports = {
  getPrefs, savePrefs,
  getHorizonPrefs, saveHorizonPrefs,
  getUnreadCount, getNotifications,
  markRead, markAllRead,
  pushAlertNotifications, sendDigestNow,
};
