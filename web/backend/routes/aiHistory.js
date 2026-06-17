'use strict';
/**
 * aiHistory.js
 * REST routes for AI analysis history: list, view, delete, and share.
 *
 * Base: /api/ai-history
 *
 * GET  /               — list history (auth user, optional ?module=&limit=&customerId=)
 * GET  /:id            — get single record (full RESULT text)
 * DELETE /:id          — delete own record
 * POST /share/email    — email a history item or free text to a recipient
 * POST /share/whatsapp — get a wa.me link for a history item
 */

const express  = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const historySvc = require('../services/aiHistoryService');
const emailSvc   = require('../services/emailService');
const waSvc      = require('../services/whatsappService');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/ai-history
// List history for logged-in user
// Query: ?module=maturity&limit=20&customerId=DAN-0041872
// ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { module, customerId, limit } = req.query;
  const records = await historySvc.list({
    userId:     req.user.userId,
    module:     module     || null,
    customerId: customerId || null,
    limit:      Math.min(parseInt(limit || '30', 10), 100),
  });
  res.json({ history: records, count: records.length });
}));

// ──────────────────────────────────────────────────────────────
// GET /api/ai-history/:id
// Get a single record with full RESULT text
// ──────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const record = await historySvc.getById(req.params.id, req.user.userId);
  if (!record) return res.status(404).json({ error: 'History item not found' });
  res.json({ record });
}));

// ──────────────────────────────────────────────────────────────
// DELETE /api/ai-history/:id
// ──────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const ok = await historySvc.remove(req.params.id, req.user.userId);
  if (!ok) return res.status(404).json({ error: 'Item not found or not owned by you' });
  res.json({ message: 'Deleted' });
}));

// ──────────────────────────────────────────────────────────────
// POST /api/ai-history/share/email
// Body: { historyId?, text?, title?, to, subject? }
//   - If historyId is provided, the record is fetched from DB.
//   - If text is provided directly, it is used without DB lookup.
// ──────────────────────────────────────────────────────────────
router.post('/share/email', requireAuth, asyncHandler(async (req, res) => {
  const { historyId, text, title, to, subject } = req.body;

  if (!to) return res.status(400).json({ error: 'Alamat email tujuan diperlukan.' });

  let resultText = text || '';
  let finalTitle = title || 'AI Analysis Result';

  if (historyId) {
    const record = await historySvc.getById(historyId, req.user.userId);
    if (!record) return res.status(404).json({ error: 'History item not found' });
    resultText = record.RESULT || '';
    finalTitle = record.TITLE || finalTitle;
  }

  if (!resultText.trim()) {
    return res.status(400).json({ error: 'Konten analisis kosong — tidak ada yang dikirim.' });
  }

  const result = await emailSvc.sendShareEmail({
    to,
    subject:    subject || finalTitle,
    textBody:   resultText,
    senderName: req.user.fullName || req.user.username,
  });

  if (!result.ok) return res.status(500).json({ error: result.error });
  res.json({ message: 'Email berhasil dikirim', messageId: result.messageId });
}));

// ──────────────────────────────────────────────────────────────
// POST /api/ai-history/share/whatsapp
// Body: { historyId?, text?, title?, phone? }
// Returns: { link, text } — client opens the wa.me link
// ──────────────────────────────────────────────────────────────
router.post('/share/whatsapp', requireAuth, asyncHandler(async (req, res) => {
  const { historyId, text, title, phone } = req.body;

  let resultText = text || '';
  let finalTitle = title || 'AI Analysis';
  let module     = '';

  if (historyId) {
    const record = await historySvc.getById(historyId, req.user.userId);
    if (!record) return res.status(404).json({ error: 'History item not found' });
    resultText = record.RESULT || '';
    finalTitle = record.TITLE || finalTitle;
    module     = record.MODULE || '';
  }

  if (!resultText.trim()) {
    return res.status(400).json({ error: 'Konten analisis kosong.' });
  }

  const shareText = waSvc.buildShareText({
    title:      finalTitle,
    result:     resultText,
    senderName: req.user.fullName || req.user.username,
    module,
  });

  const link = waSvc.buildWhatsAppLink({ text: shareText, phone: phone || null });
  res.json({ link, shareText });
}));

module.exports = router;
