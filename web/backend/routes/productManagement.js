'use strict';
/**
 * productManagement.js
 * Routes for add/remove product requests, approval workflow,
 * AI deletion-impact warning (SSE), and profit-forecast generation.
 *
 * Mounted at /api/product-management in server.js
 */

const express          = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const svc              = require('../services/productManagementService');
const llm              = require('../services/llmService');
const paf              = require('../services/pafService');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function sseHeaders(res) {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

// ── STATIC ROUTES (must be before /:customerId/* patterns) ───────────────────

/**
 * GET /api/product-management/catalog?customerId=XXX
 * Products from PRODUCT_CATALOG not already held by the customer.
 */
router.get('/catalog', requireAuth, asyncHandler(async (req, res) => {
  const { customerId } = req.query;
  if (!customerId) return res.status(400).json({ error: 'customerId query parameter required' });
  const products = await svc.getCatalog(customerId);
  res.json({ products });
}));

/**
 * GET /api/product-management/requests?customerId=XXX&limit=30
 * List requests: RM sees own; Branch Manager sees all PENDING_APPROVAL + own.
 */
router.get('/requests', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, limit } = req.query;
  const requests = await svc.getRequests({
    userId:     req.user.userId,
    role:       req.user.role || '',
    customerId: customerId || null,
    limit:      Math.min(parseInt(limit || '30', 10), 100),
  });
  res.json({ requests });
}));

/**
 * PUT /api/product-management/requests/:requestId/approve
 * Approve a PENDING_APPROVAL request — Branch Manager only.
 * Body: { managerNotes? }
 */
router.put('/requests/:requestId/approve', requireAuth, asyncHandler(async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('manager') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Hanya Branch Manager yang dapat menyetujui permintaan.' });
  }
  const { managerNotes } = req.body;
  await svc.approveRequest(req.params.requestId, req.user.userId, managerNotes);
  res.json({ ok: true, message: 'Permintaan disetujui dan dieksekusi.' });
}));

/**
 * PUT /api/product-management/requests/:requestId/reject
 * Reject a PENDING_APPROVAL request — Branch Manager only.
 * Body: { reason?, managerNotes? }
 */
router.put('/requests/:requestId/reject', requireAuth, asyncHandler(async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('manager') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Hanya Branch Manager yang dapat menolak permintaan.' });
  }
  const { reason, managerNotes } = req.body;
  await svc.rejectRequest(req.params.requestId, req.user.userId, reason, managerNotes || reason);
  res.json({ ok: true, message: 'Permintaan ditolak.' });
}));

/**
 * GET /api/product-management/requests/:requestId/ai-note?action=APPROVE|REJECT  [SSE]
 * Stream an AI-drafted manager note for approval or rejection.
 */
router.get('/requests/:requestId/ai-note', requireAuth, (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('manager') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Hanya Branch Manager yang dapat menggunakan fitur ini.' });
  }
  sseHeaders(res);
  _streamManagerNote(req.params.requestId, req.query.action || 'APPROVE', res).catch(err => {
    console.error('[productMgmt] ai-note error:', err.message);
    if (!res.writableEnded) {
      paf.emitStage(res, 'Error', 'error', err.message);
      res.end();
    }
  });
});

async function _streamManagerNote(requestId, action, res) {
  paf.emitStage(res, 'AI Note', 'active', 'Menganalisis permintaan...');

  // Direct lookup by ID (no user filter)
  const req = await svc.getRequestById(requestId);
  if (!req) {
    paf.emitStage(res, 'AI Note', 'error', 'Permintaan tidak ditemukan.');
    if (!res.writableEnded) res.end();
    return;
  }

  paf.emitStage(res, 'AI Note', 'done', 'Konteks siap — membuat draft catatan...');

  const prompt = svc.buildManagerNotePrompt(req, action);
  await llm.chatStream(prompt, '', [], res, { maxTokens: 400 });
}

/**
 * GET /api/product-management/forecast/:requestId
 * Retrieve a saved forecast (chart data) for a completed request.
 */
router.get('/forecast/:requestId', requireAuth, asyncHandler(async (req, res) => {
  const forecast = await svc.getForecast(req.params.requestId);
  if (!forecast) return res.status(404).json({ error: 'Forecast not found for this request.' });
  res.json({ forecast });
}));

// ── CUSTOMER-SCOPED ROUTES (:customerId prefix) ───────────────────────────────

/**
 * GET /api/product-management/:customerId/portfolio
 * Active holdings for a customer.
 */
router.get('/:customerId/portfolio', requireAuth, asyncHandler(async (req, res) => {
  const holdings = await svc.getPortfolio(req.params.customerId);
  res.json({ holdings });
}));

/**
 * GET /api/product-management/:customerId/portfolio-forecast
 * Deterministic Q1-Q4 cumulative return forecast for all active holdings.
 * Returns per-product lines + total-portfolio line (no LLM, instant response).
 */
router.get('/:customerId/portfolio-forecast', requireAuth, asyncHandler(async (req, res) => {
  const forecast = await svc.getPortfolioForecast(req.params.customerId);
  res.json({ forecast });
}));

/**
 * POST /api/product-management/:customerId/request-add
 * Request to add a product to the customer's portfolio.
 * Body: { productId, amount, source?, historyId?, notes? }
 * Returns: { requestId, status, needsApproval }
 */
router.post('/:customerId/request-add', requireAuth, asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { productId, productName, productCategory, amount, source, historyId, notes } = req.body;

  if (!productId)                  return res.status(400).json({ error: 'productId diperlukan.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Nominal harus lebih dari 0.' });

  const result = await svc.createRequest({
    action:          'ADD',
    customerId,
    productId,
    productName:     productName || null,
    productCategory: productCategory || null,
    amount:          Number(amount),
    source:          source || 'MANUAL',
    historyId:       historyId || null,
    requestedBy:     req.user.userId,
    notes:           notes || null,
  });

  res.json(result);
}));

/**
 * POST /api/product-management/:customerId/request-remove
 * Request to remove (redeem) a product from the customer's portfolio.
 * Body: { holdingId, notes? }
 * Returns: { requestId, status, needsApproval }
 */
router.post('/:customerId/request-remove', requireAuth, asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { holdingId, notes } = req.body;

  if (!holdingId) return res.status(400).json({ error: 'holdingId diperlukan.' });

  // Resolve holding amount (needed for approval-threshold check)
  const holdings = await svc.getPortfolio(customerId);
  const holding  = holdings.find(h => String(h.HOLDING_ID) === String(holdingId));
  if (!holding) return res.status(404).json({ error: 'Produk tidak ditemukan di portofolio nasabah.' });

  const result = await svc.createRequest({
    action:          'REMOVE',
    customerId,
    productId:       holding.PRODUCT_ID,
    holdingId:       Number(holdingId),
    productName:     holding.PRODUCT_NAME,
    productCategory: holding.CATEGORY,
    amount:          holding.AMOUNT,
    source:          'MANUAL',
    requestedBy:     req.user.userId,
    notes:           notes || null,
  });

  res.json(result);
}));

/**
 * GET /api/product-management/:customerId/delete-warning/:holdingId  [SSE]
 * Streams an AI-generated impact analysis for removing a product.
 */
router.get('/:customerId/delete-warning/:holdingId', requireAuth, (req, res) => {
  sseHeaders(res);
  _streamDeleteWarning(
    req.params.customerId,
    Number(req.params.holdingId),
    req.user.fullName,
    res
  ).catch(err => {
    console.error('[productMgmt] delete-warning error:', err.message);
    if (!res.writableEnded) {
      paf.emitStage(res, 'Error', 'error', 'Terjadi kesalahan: ' + err.message);
      if (typeof paf.emitDone === 'function') paf.emitDone(res);
      else res.end();
    }
  });
});

async function _streamDeleteWarning(customerId, holdingId, rmName, res) {
  paf.emitStage(res, 'AI Impact Analysis', 'active', 'Menganalisis dampak penghapusan produk...');

  const data = await svc.getHoldingWithCustomer(holdingId);
  if (!data) {
    paf.emitStage(res, 'AI Impact Analysis', 'error', 'Data produk tidak ditemukan.');
    if (!res.writableEnded) res.end();
    return;
  }

  const totalAum  = Number(data.TOTAL_AUM || 0);
  const amount    = Number(data.AMOUNT || 0);
  const rate      = Number(data.INTEREST_RATE || 0);
  const pct       = totalAum > 0 ? ((amount / totalAum) * 100).toFixed(1) : '0.0';
  const annualLoss = Math.round(amount * rate / 100).toLocaleString('id-ID');

  const prompt = `
Analisis dampak penghapusan produk "${data.PRODUCT_NAME}" dari portofolio nasabah ${data.FULL_NAME}.

**Produk yang Akan Dihapus:**
- Nama: ${data.PRODUCT_NAME}
- Kategori: ${data.CATEGORY}
- Nominal: Rp ${amount.toLocaleString('id-ID')}
- Imbal hasil: ${rate}% per tahun
- Estimasi kehilangan return tahunan: Rp ${annualLoss}
- Porsi dari total AUM: ${pct}%

**Profil Nasabah:**
- Profil risiko: ${data.RISK_PROFILE}
- Total AUM: Rp ${totalAum.toLocaleString('id-ID')}
- Tier: ${data.TIER}

Berikan analisis komprehensif yang mencakup:

## ⚠️ Dampak Finansial
Estimasi kehilangan return dan pendapatan tahunan jika produk ini dihapus.

## 📊 Dampak Portofolio
Perubahan komposisi aset dan tingkat risiko portofolio.

## 🤖 Rekomendasi AI
Apakah penghapusan ini sebaiknya dilakukan? Ada kondisi/waktu yang lebih tepat?

## 🔄 Alternatif yang Disarankan
Jika produk harus dihapus, produk apa yang bisa menggantikannya dengan profil risiko serupa?

Buat analisis yang jelas dan actionable untuk RM ${rmName || 'Relationship Manager'}.
  `.trim();

  paf.emitStage(res, 'AI Impact Analysis', 'done', 'Konteks siap — memulai analisis...');

  await llm.chatStream(
    prompt,
    llm.buildRMPreamble(data.FULL_NAME),
    [],
    res,
    { maxTokens: 1200 }
  );
}

/**
 * POST /api/product-management/:customerId/forecast/:productId
 * Generate a quarterly profit forecast using the LLM.
 * Body: { amount, requestId? }
 * Returns: { ok, forecast: { q1_return, q2_return, q3_return, q4_return, labels, annual_return, narrative } }
 */
router.post('/:customerId/forecast/:productId', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, productId } = req.params;
  const { amount, requestId } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Nominal investasi harus lebih dari 0.' });
  }

  const forecastData = await svc.generateForecast(customerId, productId, Number(amount));

  // Persist to DB async (non-blocking)
  if (requestId) {
    svc.saveForecast(requestId, customerId, productId, forecastData)
      .catch(e => console.warn('[productMgmt] saveForecast skipped:', e.message));
  }

  res.json({ ok: true, forecast: forecastData });
}));

module.exports = router;
