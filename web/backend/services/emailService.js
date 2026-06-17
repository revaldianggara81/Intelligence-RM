'use strict';
/**
 * emailService.js
 * Sends AI analysis results via email using nodemailer.
 * Configure SMTP via environment variables.
 *
 * Required .env:
 *   SMTP_HOST    — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT    — SMTP port (465 for SSL, 587 for STARTTLS)
 *   SMTP_SECURE  — "true" for SSL/TLS (port 465), "false" for STARTTLS (port 587)
 *   SMTP_USER    — sender email address
 *   SMTP_PASS    — sender password / app password
 *   SMTP_FROM    — display name & address e.g. '"RM Platform" <rm@danamon.co.id>'
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null; // SMTP not configured — feature gracefully disabled
  }

  _transporter = nodemailer.createTransport({
    host,
    port:   parseInt(process.env.SMTP_PORT  || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false },
  });

  return _transporter;
}

/**
 * Send an AI analysis result as email.
 *
 * @param {object} opts
 * @param {string}   opts.to          - Recipient email address
 * @param {string}   opts.subject     - Email subject
 * @param {string}   opts.textBody    - Plain-text version of the result
 * @param {string}   opts.htmlBody    - HTML version (optional)
 * @param {string}   opts.senderName  - Name of the sending RM
 * @returns {Promise<{ok:boolean, messageId?:string, error?:string}>}
 */
async function sendShareEmail({ to, subject, textBody, htmlBody, senderName }) {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      ok: false,
      error: 'SMTP belum dikonfigurasi. Tambahkan SMTP_HOST, SMTP_USER, SMTP_PASS di .env untuk mengaktifkan fitur email.',
    };
  }

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: 'Alamat email tidak valid.' };
  }

  const from = process.env.SMTP_FROM || `"RM Intelligence Platform" <${process.env.SMTP_USER}>`;

  // Build plain-text body
  const fullText = [
    `Dikirim oleh: ${senderName || 'Relationship Manager'} · Danamon Intelligence Platform`,
    `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
    '',
    subject,
    '─'.repeat(60),
    '',
    textBody || '',
    '',
    '─'.repeat(60),
    'Oracle AI · Bank Danamon Intelligence RM Platform',
    'Pesan ini dibuat secara otomatis oleh sistem AI.',
  ].join('\n');

  // Build HTML body
  const escapedText = (textBody || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,3} (.+)$/gm, '<h3 style="color:#1a5fa3;margin:14px 0 4px;">$1</h3>')
    .replace(/\n/g, '<br>');

  const fullHtml = htmlBody || `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dce0e8;">
    <div style="background:#1a2e4a;padding:18px 24px;">
      <div style="color:#00ccff;font-size:11px;font-family:monospace;letter-spacing:1px;text-transform:uppercase;">Oracle AI · Bank Danamon</div>
      <div style="color:#fff;font-size:18px;font-weight:700;margin-top:4px;">${subject}</div>
    </div>
    <div style="padding:20px 24px;">
      <p style="color:#6e8aaa;font-size:12px;margin-bottom:16px;">
        Dikirim oleh <strong>${senderName || 'Relationship Manager'}</strong> · ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
      </p>
      <div style="font-size:13px;line-height:1.75;color:#1a2e4a;">${escapedText}</div>
    </div>
    <div style="background:#f5f7fa;padding:12px 24px;border-top:1px solid #dce0e8;">
      <p style="font-size:11px;color:#6e8aaa;margin:0;">
        Pesan ini dibuat secara otomatis oleh Oracle AI Intelligence RM Platform · Bank Danamon.
        Jangan balas email ini secara langsung.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: fullText,
      html: fullHtml,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[emailSvc] sendMail error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Quick connectivity test — useful for admin panel.
 */
async function testConnection() {
  const t = getTransporter();
  if (!t) return { ok: false, error: 'SMTP not configured' };
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendShareEmail, testConnection };
