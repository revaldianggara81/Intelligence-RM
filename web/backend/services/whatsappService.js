'use strict';
/**
 * whatsappService.js
 * Generates WhatsApp share links for AI analysis results.
 *
 * Two approaches:
 * 1. wa.me deep link — opens WhatsApp on the client, pre-filled with text.
 *    Works in the browser without any server-side credentials.
 *    Phone number is optional (opens WhatsApp with pre-filled text, no recipient).
 *
 * 2. Twilio (optional) — server-side send to a specific WhatsApp number.
 *    Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env.
 */

// ---------------------------------------------------------------------------
// Build a wa.me link (client-side — no credentials needed)
// ---------------------------------------------------------------------------

/**
 * Build a wa.me deep-link that opens WhatsApp with pre-filled message text.
 *
 * @param {object} opts
 * @param {string} opts.text       - Message to pre-fill (will be URL-encoded)
 * @param {string} [opts.phone]    - Recipient phone in E.164 without '+' (optional)
 * @returns {string} wa.me URL
 */
function buildWhatsAppLink({ text, phone }) {
  const encoded = encodeURIComponent(text || '');
  if (phone) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/**
 * Build the share text body for a WhatsApp message.
 *
 * @param {object} opts
 * @param {string} opts.title       - Analysis title
 * @param {string} opts.result      - Full AI text (trimmed to 1500 chars for WA)
 * @param {string} opts.senderName  - RM name
 * @param {string} opts.module      - Module name for context
 * @returns {string}
 */
function buildShareText({ title, result, senderName, module }) {
  const moduleLabels = {
    maturity:         '📅 Maturity Reminder',
    recommendation:   '💡 Product Recommendation',
    campaign_scan:    '★ Campaign Scan',
    campaign_pitch:   '★ Campaign Pitch',
    alert:            '🚨 Portfolio Alert',
    copilot:          '🤖 AI Copilot',
  };
  const moduleLabel = moduleLabels[module] || module || 'AI Analysis';
  const date = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

  // WhatsApp limit is ~65K chars — trim at 1500 for readability
  const snippet = (result || '').slice(0, 1500).trim();
  const truncated = result && result.length > 1500 ? '\n\n_(teks dipotong — lihat detail lengkap di platform RM)_' : '';

  return [
    `*${moduleLabel}*`,
    `*${title || 'AI Analysis'}*`,
    `_Dikirim oleh: ${senderName || 'RM'} · ${date} WIB_`,
    '',
    '─────────────────────',
    snippet,
    truncated,
    '─────────────────────',
    '_Oracle AI · Bank Danamon Intelligence RM Platform_',
  ].filter(l => l !== undefined).join('\n');
}

// ---------------------------------------------------------------------------
// Optional Twilio server-side send
// ---------------------------------------------------------------------------

/**
 * Send a WhatsApp message via Twilio (server-side).
 * Only works if TWILIO_* env vars are set.
 *
 * @param {object} opts
 * @param {string} opts.to    - Recipient phone e.g. "+628123456789"
 * @param {string} opts.body  - Message text
 * @returns {Promise<{ok:boolean, sid?:string, error?:string}>}
 */
async function sendViaTwilio({ to, body }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env.' };
  }

  try {
    // Lazy-load twilio only if configured (not in package.json by default)
    const twilio = require('twilio'); // eslint-disable-line global-require
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({
      body,
      from: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
      to:   to.startsWith('whatsapp:')         ? to         : `whatsapp:${to}`,
    });
    return { ok: true, sid: msg.sid };
  } catch (err) {
    console.error('[whatsappSvc] Twilio error:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { buildWhatsAppLink, buildShareText, sendViaTwilio };
