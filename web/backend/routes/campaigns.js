'use strict';
const express       = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const campSvc       = require('../services/campaignService');
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
      onComplete(accumulated).catch(e => console.error('[captureSSE/campaign]', e.message));
    return _end.apply(null, arguments);
  };
}

/** GET /api/campaigns — active campaigns */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const campaigns = await campSvc.getActiveCampaigns();
  res.json({ campaigns });
}));

/** GET /api/campaigns/:id/eligibility — who is eligible */
router.get('/:id/eligibility', requireAuth, asyncHandler(async (req, res) => {
  const eligibility = await campSvc.getCampaignEligibility(req.params.id);
  res.json({ eligibility });
}));

/**
 * GET /api/campaigns/:id/scan
 * SSE stream — scan all customers and emit eligibility results.
 */
router.get('/:id/scan', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  audit.log(req.user.userId, 'AI_CAMPAIGN_SCAN', 'CAMPAIGN', req.params.id, null, req.ip).catch(() => {});

  captureSSEResult(res, async (text) => {
    await historySvc.save({
      module:    'campaign_scan',
      userId:    req.user.userId,
      entityId:  req.params.id,
      title:     `Campaign Scan — ${req.params.id}`,
      result:    text,
    });
  });

  campSvc.scanAndStream(req.params.id, req.user.userId, res).catch(err => {
    console.error('[Route/campaigns] scan error:', err);
    if (!res.writableEnded) res.end();
  });
});

/**
 * GET /api/campaigns/:id/pitch/:customerId
 * SSE stream — generate a personalized pitch.
 */
router.get('/:id/pitch/:customerId', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  audit.log(req.user.userId, 'AI_CAMPAIGN_PITCH', 'CUSTOMER', req.params.customerId, { campaignId: req.params.id }, req.ip).catch(() => {});

  captureSSEResult(res, async (text) => {
    await historySvc.save({
      module:     'campaign_pitch',
      userId:     req.user.userId,
      customerId: req.params.customerId,
      entityId:   req.params.id,
      title:      `Campaign Pitch — ${await resolveCustomerName(req.params.customerId)}`,
      result:     text,
    });
  });

  campSvc.generatePitch(req.params.id, req.params.customerId, res).catch(err => {
    console.error('[Route/campaigns] pitch error:', err);
    if (!res.writableEnded) res.end();
  });
});

module.exports = router;
