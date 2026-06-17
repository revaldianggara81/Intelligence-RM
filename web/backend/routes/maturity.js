'use strict';
const express       = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const maturitySvc   = require('../services/maturityService');
const notifSvc      = require('../services/notificationService');
const audit         = require('../services/auditService');
const historySvc    = require('../services/aiHistoryService');
const db            = require('../config/database');

const router = express.Router();

/**
 * Wraps res to capture streamed SSE token text, then calls onComplete(text)
 * when the stream ends. All original writes/end still pass through untouched.
 */
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
        try {
          const d = JSON.parse(line.slice(6));
          if (d.token) accumulated += d.token;
        } catch (_) {}
      }
    } catch (_) {}
    return _write.apply(null, arguments);
  };

  res.end = function () {
    if (accumulated.trim() && onComplete) {
      onComplete(accumulated).catch(err =>
        console.error('[captureSSE/maturity] save error:', err.message)
      );
    }
    return _end.apply(null, arguments);
  };
}

/** GET /api/maturity — list maturing deposits for this RM (uses per-RM horizon) */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  // Use explicit ?days param, otherwise read RM's configured horizon from Oracle
  let days = parseInt(req.query.days) || 0;
  if (!days) {
    try {
      const prefs = await notifSvc.getHorizonPrefs(req.user.userId);
      days = prefs.MATURITY_HORIZON_DAYS || 30;
    } catch (_) { days = 30; }
  }
  const deposits = await maturitySvc.getMaturingDeposits(req.user.userId, days);
  res.json({ deposits, count: deposits.length, horizonDays: days });
}));

/** GET /api/maturity/horizon — get RM's maturity reminder horizon settings */
router.get('/horizon', requireAuth, asyncHandler(async (req, res) => {
  const horizon = await notifSvc.getHorizonPrefs(req.user.userId);
  res.json({ horizon });
}));

/** PATCH /api/maturity/horizon — update RM's maturity horizon settings */
router.patch('/horizon', requireAuth, asyncHandler(async (req, res) => {
  const updated = await notifSvc.saveHorizonPrefs(req.user.userId, req.body);
  audit.log(req.user.userId, 'MATURITY_HORIZON_UPDATE', 'NOTIFICATION_PREFS',
    req.user.userId, req.body, req.ip).catch(() => {});
  res.json({ ok: true, horizon: updated });
}));

/**
 * GET /api/maturity/:customerId/analyze
 * SSE stream — analyzes maturity and streams action plan tokens.
 */
router.get('/:customerId/analyze', requireAuth, asyncHandler(async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx
  res.flushHeaders();

  audit.log(req.user.userId, 'AI_MATURITY_ANALYZE', 'CUSTOMER', req.params.customerId, null, req.ip).catch(() => {});

  let customerName = req.params.customerId;
  try {
    const r = await db.execute(
      'SELECT FULL_NAME FROM CUSTOMERS WHERE CUSTOMER_ID = :1',
      [req.params.customerId]
    );
    customerName = r.rows?.[0]?.FULL_NAME ;
  } catch (_) {}

  captureSSEResult(res, async (text) => {
    await historySvc.save({
      module:     'maturity',
      userId:     req.user.userId,
      customerId: req.params.customerId,
      entityId:   null,
      title:      `Maturity Analysis — ${customerName}`,
      result:     text,
    });
  });

  maturitySvc.analyzeAndStream(req.params.customerId, res).catch(err => {
    console.error('[Route/maturity] stream error:', err);
    if (!res.writableEnded) res.end();
  });
}));

module.exports = router;
