'use strict';
const express       = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const marketSvc     = require('../services/marketDataService');
const audit         = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/market/snapshot
 * Returns latest MARKET_DATA rows.
 */
router.get('/snapshot', requireAuth, asyncHandler(async (req, res) => {
  const symbols = req.query.symbols
    ? req.query.symbols.split(',').map(s => s.trim().toUpperCase())
    : undefined;
  const rows = await marketSvc.getSnapshot(symbols);
  res.json({ data: rows, count: rows.length });
}));

/**
 * POST /api/market/refresh
 * Manually trigger fetch-from-Yahoo + store + run alert procedure.
 */
router.post('/refresh', requireAuth, asyncHandler(async (req, res) => {
  const result = await marketSvc.refreshAll();
  audit.log(req.user.userId, 'MARKET_REFRESH', 'MARKET_DATA', null,
            { symbols: result.fetched.map(f => f.symbol) }, req.ip).catch(() => {});
  res.json({ ok: true, ...result });
}));

/**
 * GET /api/market/rules
 * Returns all market alert rules.
 */
router.get('/rules', requireAuth, asyncHandler(async (req, res) => {
  const rules = await marketSvc.getRules();
  res.json({ rules });
}));

/**
 * PUT /api/market/rules/:key
 * Update a market alert rule (threshold, cooldown, severity, etc.).
 */
router.put('/rules/:key', requireAuth, asyncHandler(async (req, res) => {
  const allowed = ['threshold_value', 'severity_high_thresh', 'cooldown_hours',
                   'is_active', 'severity_trigger', 'alert_title_tmpl',
                   'alert_msg_tmpl', 'affected_categories'];
  const fields = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) fields[k] = req.body[k];
  }
  if (Object.keys(fields).length === 0)
    return res.status(400).json({ error: 'No valid fields to update' });

  const affected = await marketSvc.updateRule(req.params.key, fields, req.user.userId);
  if (!affected)
    return res.status(404).json({ error: 'Rule not found' });

  audit.log(req.user.userId, 'UPDATE_MARKET_RULE', 'MARKET_ALERT_RULES',
            req.params.key, fields, req.ip).catch(() => {});
  res.json({ ok: true, ruleKey: req.params.key, updated: fields });
}));

/**
 * PATCH /api/market/bi-rate
 * Manually update BI Rate value.
 * Body: { rate: 5.75 }
 */
router.patch('/bi-rate', requireAuth, asyncHandler(async (req, res) => {
  const { rate } = req.body;
  if (rate === undefined || rate === null)
    return res.status(400).json({ error: 'rate is required' });

  const saved = await marketSvc.updateBiRate(rate, req.user.userId);
  audit.log(req.user.userId, 'UPDATE_BI_RATE', 'MARKET_DATA', 'BI_RATE',
            { rate: saved }, req.ip).catch(() => {});
  res.json({ ok: true, biRate: saved });
}));

module.exports = router;
