'use strict';
const express    = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const customerSvc = require('../services/customerService');
const alertSvc    = require('../services/alertService');

const router = express.Router();

/** GET /api/dashboard — RM dashboard summary */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const [summary, alerts] = await Promise.all([
    customerSvc.getDashboardSummary(req.user.userId),
    alertSvc.getOpenAlerts(req.user.userId),
  ]);

  // Top 3 high-severity alerts
  const highAlerts = alerts.filter(a => a.SEVERITY === 'high').slice(0, 3);
  const medAlerts  = alerts.filter(a => a.SEVERITY === 'medium').slice(0, 3);

  res.json({
    summary,
    recentAlerts: [...highAlerts, ...medAlerts].slice(0, 5),
    alertCounts: {
      high:   alerts.filter(a => a.SEVERITY === 'high').length,
      medium: alerts.filter(a => a.SEVERITY === 'medium').length,
      low:    alerts.filter(a => a.SEVERITY === 'low').length,
      total:  alerts.length,
    },
  });
}));

module.exports = router;
