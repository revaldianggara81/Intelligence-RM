'use strict';
const express          = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const schedulerSvc     = require('../services/schedulerService');
const notifSvc         = require('../services/notificationService');
const audit            = require('../services/auditService');

const router = express.Router();

/** GET /api/scheduler/status — job info + last log row */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const status = await schedulerSvc.getStatus();
  res.json(status);
}));

/** GET /api/scheduler/logs?limit=20 — run history */
router.get('/logs', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const logs  = await schedulerSvc.getLogs(limit);
  res.json({ logs });
}));

/** POST /api/scheduler/run — manual trigger */
router.post('/run', requireAuth, asyncHandler(async (req, res) => {
  await schedulerSvc.runNow(req.user.userId);

  // Push new alerts as in-app notifications + optional email/OCI
  notifSvc.pushAlertNotifications().catch(e => console.warn('[Notif] push error:', e.message));

  audit.log(req.user.userId, 'SCHEDULER_RUN_NOW', 'SCHEDULER', 'JOB_MATURITY_ALERTS', null, req.ip).catch(() => {});

  // Return latest log after run
  const logs = await schedulerSvc.getLogs(1);
  res.json({ message: 'Scheduler job executed', lastLog: logs[0] || null });
}));

/** PATCH /api/scheduler/toggle — enable or disable the job */
router.patch('/toggle', requireAuth, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  await schedulerSvc.setEnabled(Boolean(enabled));
  audit.log(
    req.user.userId,
    enabled ? 'SCHEDULER_ENABLE' : 'SCHEDULER_DISABLE',
    'SCHEDULER', 'JOB_MATURITY_ALERTS', null, req.ip
  ).catch(() => {});
  res.json({ message: `Scheduler ${enabled ? 'enabled' : 'disabled'}` });
}));

/** PATCH /api/scheduler/interval — update repeat_interval */
router.patch('/interval', requireAuth, asyncHandler(async (req, res) => {
  const { interval } = req.body;
  if (!interval) return res.status(400).json({ error: 'interval required' });
  await schedulerSvc.updateInterval(interval);
  audit.log(req.user.userId, 'SCHEDULER_UPDATE_INTERVAL', 'SCHEDULER', 'JOB_MATURITY_ALERTS', { interval }, req.ip).catch(() => {});
  res.json({ message: 'Interval updated', interval });
}));

module.exports = router;
