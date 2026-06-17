'use strict';
const express       = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const recSvc        = require('../services/recommendationService');
const audit         = require('../services/auditService');
const historySvc    = require('../services/aiHistoryService');
const db            = require('../config/database');

async function resolveCustomerName(customerId) {
  try {
    const r = await db.execute('SELECT FULL_NAME FROM CUSTOMERS WHERE CUSTOMER_ID = :1', [customerId]);
    return r.rows?.[0]?.FULL_NAME || customerId;
  } catch (_) { return customerId; }
}

const router = express.Router();

function captureSSEResult(res, onComplete) {
  let accumulated = '';
  const _write = res.write.bind(res);
  const _end   = res.end.bind(res);
  res.write = function () {
    try {
      const str = Buffer.isBuffer(arguments[0])
        ? arguments[0].toString('utf8') : String(arguments[0] || '');
      for (const line of str.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try { const d = JSON.parse(line.slice(6)); if (d.token) accumulated += d.token; } catch (_) {}
      }
    } catch (_) {}
    return _write.apply(null, arguments);
  };
  res.end = function () {
    if (accumulated.trim() && onComplete)
      onComplete(accumulated).catch(e => console.error('[captureSSE/rec]', e.message));
    return _end.apply(null, arguments);
  };
}

/** GET /api/recommendations/products — active product catalog (with goal tags) */
router.get('/products', requireAuth, asyncHandler(async (req, res) => {
  const products = await recSvc.getActiveProducts();
  res.json({ products });
}));

/**
 * GET /api/recommendations/compare?ids=PROD001,PROD002,PROD003
 * Returns 2–3 products side-by-side for comparison.
 */
router.get('/compare', requireAuth, asyncHandler(async (req, res) => {
  const idsParam = String(req.query.ids || '');
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (ids.length < 2) return res.status(400).json({ error: 'Provide 2–3 product IDs via ?ids=X,Y,Z' });

  const placeholders = ids.map((_, i) => `:${i + 1}`).join(',');
  const r = await db.execute(
    `SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION,
            INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS,
            RISK_LEVEL, GOAL_TAG, RETURN_TYPE, FEATURES,
            IS_ACTIVE
       FROM PRODUCT_CATALOG
      WHERE PRODUCT_ID IN (${placeholders})`,
    ids
  );
  // Return products in the same order as requested
  const map = {};
  (r.rows || []).forEach(p => { map[p.PRODUCT_ID] = p; });
  const products = ids.map(id => map[id]).filter(Boolean);
  res.json({ products });
}));

/** GET /api/recommendations/products/:productId — single product detail */
router.get('/products/:productId', requireAuth, asyncHandler(async (req, res) => {
  const r = await db.execute(
    `SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION,
            INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS,
            RISK_LEVEL, GOAL_TAG, RETURN_TYPE, FEATURES,
            TO_CHAR(VALID_FROM,'YYYY-MM-DD') AS VALID_FROM,
            TO_CHAR(VALID_TO,  'YYYY-MM-DD') AS VALID_TO,
            IS_ACTIVE
       FROM PRODUCT_CATALOG WHERE PRODUCT_ID = :1`,
    [req.params.productId]
  );
  const product = r.rows?.[0];
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product });
}));

/**
 * GET /api/recommendations/:customerId/analyze
 * SSE stream — product recommendation for a customer.
 */
router.get('/:customerId/analyze', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  audit.log(req.user.userId, 'AI_RECOMMENDATION', 'CUSTOMER', req.params.customerId, null, req.ip).catch(() => {});

  captureSSEResult(res, async (text) => {
    await historySvc.save({
      module:     'recommendation',
      userId:     req.user.userId,
      customerId: req.params.customerId,
      title:      `Product Recommendation — ${await resolveCustomerName(req.params.customerId)}`,
      result:     text,
    });
  });

  recSvc.analyzeAndStream(req.params.customerId, res).catch(err => {
    console.error('[Route/recommendations] stream error:', err);
    if (!res.writableEnded) res.end();
  });
});

module.exports = router;
