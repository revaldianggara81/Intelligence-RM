'use strict';
const express       = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const alertSvc      = require('../services/alertService');
const audit         = require('../services/auditService');
const historySvc    = require('../services/aiHistoryService');

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
      onComplete(accumulated).catch(e => console.error('[captureSSE/alerts]', e.message));
    return _end.apply(null, arguments);
  };
}

/** GET /api/alerts — open alerts for RM */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const alerts = await alertSvc.getOpenAlerts(req.user.userId);
  res.json({ alerts, count: alerts.length });
}));

/** GET /api/alerts/customer/:customerId */
router.get('/customer/:customerId', requireAuth, asyncHandler(async (req, res) => {
  const status = req.query.status || null;
  const alerts = await alertSvc.getByCustomer(req.params.customerId, status);
  res.json({ alerts });
}));

/** POST /api/alerts/:id/acknowledge */
router.post('/:id/acknowledge', requireAuth, asyncHandler(async (req, res) => {
  await alertSvc.acknowledge(req.params.id, req.user.userId);
  audit.log(req.user.userId, 'ACKNOWLEDGE_ALERT', 'ALERT', req.params.id, null, req.ip).catch(() => {});
  res.json({ message: 'Alert acknowledged' });
}));

/** POST /api/alerts/:id/resolve */
router.post('/:id/resolve', requireAuth, asyncHandler(async (req, res) => {
  await alertSvc.resolve(req.params.id, req.user.userId);
  audit.log(req.user.userId, 'RESOLVE_ALERT', 'ALERT', req.params.id, null, req.ip).catch(() => {});
  res.json({ message: 'Alert resolved' });
}));

/**
 * GET /api/alerts/:id/analyze
 * SSE stream — portfolio alert intervention analysis.
 */
router.get('/:id/analyze', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  audit.log(req.user.userId, 'AI_ALERT_ANALYZE', 'ALERT', req.params.id, null, req.ip).catch(() => {});

  captureSSEResult(res, async (text) => {
    await historySvc.save({
      module:   'alert',
      userId:   req.user.userId,
      entityId: req.params.id,
      title:    `Alert Analysis — Alert #${req.params.id}`,
      result:   text,
    });
  });

  alertSvc.analyzeAndStream(req.params.id, res, req.user.userId).catch(err => {
    console.error('[Route/alerts] analyze error:', err);
    if (!res.writableEnded) res.end();
  });
});

/** POST /api/alerts/detect — auto-detect new alerts for RM's customers */
router.post('/detect', requireAuth, asyncHandler(async (req, res) => {
  const created = await alertSvc.detectAlerts(req.user.userId);
  res.json({ message: `${created.length} new alerts detected`, alerts: created });
}));

/* ═══════════════════════════════════════════════════════════════
   ALERT ACTIONS — Schedule Discussion / Rebalancing / Task
   All stored in ALERT_ACTIONS (audit) + APPOINTMENTS or RM_TASKS
═══════════════════════════════════════════════════════════════ */
const db = require('../config/database');

/**
 * GET /api/alerts/:alertId/actions
 * List all actions taken on a specific alert.
 */
router.get('/:alertId/actions', requireAuth, asyncHandler(async (req, res) => {
  const r = await db.execute(
    `SELECT ACTION_ID, ACTION_TYPE, REFERENCE_ID, REFERENCE_TYPE, NOTES,
            TO_CHAR(CREATED_AT,'DD Mon YYYY HH24:MI') AS CREATED_FMT
       FROM ALERT_ACTIONS
      WHERE ALERT_ID = :1
      ORDER BY CREATED_AT DESC`,
    [req.params.alertId]
  );
  res.json({ actions: r.rows || [] });
}));

/**
 * POST /api/alerts/:alertId/actions/schedule
 * Schedule a discussion appointment linked to this alert.
 * Body: { customerId, customerName, title, meetingType, appointmentDate, durationMin, notes }
 */
router.post('/:alertId/actions/schedule', requireAuth, asyncHandler(async (req, res) => {
  const alertId = req.params.alertId;
  const { customerId, customerName, title, meetingType, appointmentDate, durationMin, notes } = req.body;

  if (!appointmentDate)
    return res.status(400).json({ error: 'appointmentDate wajib diisi' });

  // Create appointment
  await db.execute(
    `INSERT INTO RM_APPOINTMENTS
       (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE,
        APPOINTMENT_DATE, DURATION_MIN, NOTES, STATUS)
     VALUES (:1,:2,:3,:4,:5,
       TO_TIMESTAMP(:6,'YYYY-MM-DD"T"HH24:MI'),
       :7,:8,'scheduled')`,
    [req.user.userId, customerId || null, customerName || null,
     title || 'Diskusi Alert Portofolio', meetingType || 'phone',
     appointmentDate, durationMin || 30, notes || null],
    { autoCommit: true }
  );

  // Get generated appointment ID
  const lastAppt = await db.execute(
    `SELECT MAX(APPOINTMENT_ID) AS ID FROM RM_APPOINTMENTS WHERE RM_USER_ID=:1`,
    [req.user.userId]
  );
  const apptId = lastAppt.rows?.[0]?.ID;

  // Log to ALERT_ACTIONS
  await db.execute(
    `INSERT INTO ALERT_ACTIONS
       (ALERT_ID, ACTION_TYPE, CUSTOMER_ID, RM_USER_ID, REFERENCE_ID, REFERENCE_TYPE, NOTES)
     VALUES (:1,'schedule_discussion',:2,:3,:4,'APPOINTMENT',:5)`,
    [alertId, customerId || null, req.user.userId, String(apptId || ''), notes || title || null],
    { autoCommit: true }
  );

  audit.log(req.user.userId, 'ALERT_ACTION_SCHEDULE', 'ALERT_ACTIONS', alertId,
            { customerId, appointmentDate }, req.ip).catch(() => {});

  res.status(201).json({ ok: true, action: 'schedule_discussion', appointmentId: apptId });
}));

/**
 * POST /api/alerts/:alertId/actions/rebalancing
 * Initiate a rebalancing task linked to this alert.
 * Body: { customerId, customerName, title, description, dueDate, priority }
 */
router.post('/:alertId/actions/rebalancing', requireAuth, asyncHandler(async (req, res) => {
  const alertId = req.params.alertId;
  const { customerId, customerName, title, description, dueDate, priority } = req.body;

  const taskResult = await db.execute(
    `INSERT INTO RM_TASKS
       (RM_USER_ID, CUSTOMER_ID, ALERT_ID, TASK_TYPE,
        TITLE, DESCRIPTION, DUE_DATE, PRIORITY, STATUS)
     VALUES (:1,:2,:3,'rebalancing',:4,:5,
       ${dueDate ? "TO_DATE(:6,'YYYY-MM-DD')" : 'NULL'},
       :${dueDate ? 7 : 6},'open')`,
    dueDate
      ? [req.user.userId, customerId || null, alertId,
         title || `Rebalancing Portofolio — ${customerName || customerId}`,
         description || null, dueDate, priority || 'high']
      : [req.user.userId, customerId || null, alertId,
         title || `Rebalancing Portofolio — ${customerName || customerId}`,
         description || null, priority || 'high'],
    { autoCommit: true }
  );

  const lastTask = await db.execute(
    `SELECT MAX(TASK_ID) AS ID FROM RM_TASKS WHERE RM_USER_ID=:1 AND TASK_TYPE='rebalancing'`,
    [req.user.userId]
  );
  const taskId = lastTask.rows?.[0]?.ID;

  await db.execute(
    `INSERT INTO ALERT_ACTIONS
       (ALERT_ID, ACTION_TYPE, CUSTOMER_ID, RM_USER_ID, REFERENCE_ID, REFERENCE_TYPE, NOTES)
     VALUES (:1,'initiate_rebalancing',:2,:3,:4,'RM_TASKS',:5)`,
    [alertId, customerId || null, req.user.userId, String(taskId || ''), description || title || null],
    { autoCommit: true }
  );

  audit.log(req.user.userId, 'ALERT_ACTION_REBALANCING', 'ALERT_ACTIONS', alertId,
            { customerId, taskId }, req.ip).catch(() => {});

  res.status(201).json({ ok: true, action: 'initiate_rebalancing', taskId });
}));

/**
 * POST /api/alerts/:alertId/actions/task
 * Create a follow-up task linked to this alert.
 * Body: { customerId, customerName, title, description, dueDate, priority }
 */
router.post('/:alertId/actions/task', requireAuth, asyncHandler(async (req, res) => {
  const alertId = req.params.alertId;
  const { customerId, customerName, title, description, dueDate, priority } = req.body;

  await db.execute(
    `INSERT INTO RM_TASKS
       (RM_USER_ID, CUSTOMER_ID, ALERT_ID, TASK_TYPE,
        TITLE, DESCRIPTION, DUE_DATE, PRIORITY, STATUS)
     VALUES (:1,:2,:3,'follow_up',:4,:5,
       ${dueDate ? "TO_DATE(:6,'YYYY-MM-DD')" : 'NULL'},
       :${dueDate ? 7 : 6},'open')`,
    dueDate
      ? [req.user.userId, customerId || null, alertId,
         title || `Follow-up — ${customerName || customerId}`,
         description || null, dueDate, priority || 'medium']
      : [req.user.userId, customerId || null, alertId,
         title || `Follow-up — ${customerName || customerId}`,
         description || null, priority || 'medium'],
    { autoCommit: true }
  );

  const lastTask = await db.execute(
    `SELECT MAX(TASK_ID) AS ID FROM RM_TASKS WHERE RM_USER_ID=:1 AND TASK_TYPE='follow_up'`,
    [req.user.userId]
  );
  const taskId = lastTask.rows?.[0]?.ID;

  await db.execute(
    `INSERT INTO ALERT_ACTIONS
       (ALERT_ID, ACTION_TYPE, CUSTOMER_ID, RM_USER_ID, REFERENCE_ID, REFERENCE_TYPE, NOTES)
     VALUES (:1,'create_task',:2,:3,:4,'RM_TASKS',:5)`,
    [alertId, customerId || null, req.user.userId, String(taskId || ''), description || title || null],
    { autoCommit: true }
  );

  audit.log(req.user.userId, 'ALERT_ACTION_TASK', 'ALERT_ACTIONS', alertId,
            { customerId, taskId }, req.ip).catch(() => {});

  res.status(201).json({ ok: true, action: 'create_task', taskId });
}));

/**
 * GET /api/alerts/tasks — RM's open tasks
 */
router.get('/tasks/list', requireAuth, asyncHandler(async (req, res) => {
  const r = await db.execute(
    `SELECT t.TASK_ID, t.CUSTOMER_ID, t.ALERT_ID, t.TASK_TYPE,
            t.TITLE, t.DESCRIPTION, t.PRIORITY, t.STATUS,
            TO_CHAR(t.DUE_DATE,'DD Mon YYYY')  AS DUE_FMT,
            TO_CHAR(t.CREATED_AT,'DD Mon HH24:MI') AS CREATED_FMT,
            c.FULL_NAME AS CUSTOMER_NAME
       FROM RM_TASKS t
       LEFT JOIN CUSTOMERS c ON c.CUSTOMER_ID = t.CUSTOMER_ID
      WHERE t.RM_USER_ID = :1
        AND t.STATUS = 'open'
      ORDER BY
        CASE t.PRIORITY WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        t.DUE_DATE ASC NULLS LAST,
        t.CREATED_AT DESC`,
    [req.user.userId]
  );
  res.json({ tasks: r.rows || [] });
}));

/**
 * PATCH /api/alerts/tasks/:taskId/status
 * Mark task done/cancelled.
 */
router.patch('/tasks/:taskId/status', requireAuth, asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['open','done','cancelled'].includes(status))
    return res.status(400).json({ error: 'status must be open/done/cancelled' });

  const upd = await db.execute(
    `UPDATE RM_TASKS SET STATUS=:1, UPDATED_AT=CURRENT_TIMESTAMP
      WHERE TASK_ID=:2 AND RM_USER_ID=:3`,
    [status, req.params.taskId, req.user.userId],
    { autoCommit: true }
  );
  if (!(upd.rowsAffected)) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
}));

/* ═══════════════════════════════════════════════════════════════
   ALERT SUBSCRIPTIONS — per-category, per-segment opt-in/opt-out
═══════════════════════════════════════════════════════════════ */

// Fallback alert-type catalogue (used when DB is unavailable)
const ALERT_TYPE_META_FALLBACK = [
  { type: 'maturity',           label: 'Deposito Jatuh Tempo',     icon: '⏰' },
  { type: 'portfolio_loss',     label: 'Kerugian Portofolio',       icon: '📉' },
  { type: 'idle_money',         label: 'Dana Idle',                 icon: '💤' },
  { type: 'concentration_risk', label: 'Risiko Konsentrasi',        icon: '⚠️' },
  { type: 'upgrade_opportunity',label: 'Peluang Upgrade Tier',      icon: '🚀' },
  { type: 'underperform',       label: 'Underperform vs Benchmark', icon: '📊' },
  { type: 'market_event',       label: 'Event Pasar (IHSG/USD)',    icon: '🌐' },
];

// DB-backed alert-type catalogue with 5-minute in-memory cache
let _alertTypeCache = null;
let _alertTypeCacheExpiry = 0;

async function getAlertTypeMeta() {
  if (_alertTypeCache && Date.now() < _alertTypeCacheExpiry) return _alertTypeCache;
  try {
    const r = await db.execute(
      `SELECT ALERT_TYPE AS TYPE, LABEL, ICON, DESCRIPTION
         FROM ALERT_TYPE_CATALOGUE
        WHERE IS_ACTIVE = 1
        ORDER BY SORT_ORDER, ALERT_TYPE`
    );
    if (r.rows && r.rows.length > 0) {
      _alertTypeCache = r.rows.map(row => ({
        type:        row.TYPE,
        label:       row.LABEL,
        icon:        row.ICON,
        description: row.DESCRIPTION || '',
      }));
      _alertTypeCacheExpiry = Date.now() + 5 * 60_000; // 5 minutes
      return _alertTypeCache;
    }
  } catch (_) { /* fall through to static fallback */ }
  return ALERT_TYPE_META_FALLBACK;
}

/**
 * GET /api/alerts/types
 * Returns the dynamic alert-type catalogue from ALERT_TYPE_CATALOGUE table.
 */
router.get('/types', requireAuth, asyncHandler(async (req, res) => {
  const types = await getAlertTypeMeta();
  res.json({ alertTypes: types });
}));

/**
 * GET /api/alerts/subscriptions
 * Returns subscription matrix: alert types, available segments, current prefs, counts.
 */
router.get('/subscriptions', requireAuth, asyncHandler(async (req, res) => {
  const rmUserId = req.user.userId;

  // Load alert types from DB catalogue (cached)
  const alertTypes = await getAlertTypeMeta();

  // Distinct tiers for this RM's customers (dynamic segments)
  const tierResult = await db.execute(
    `SELECT DISTINCT UPPER(TIER) AS TIER
       FROM CUSTOMERS
      WHERE RM_USER_ID = :1
        AND TIER IS NOT NULL
        AND LENGTH(TRIM(TIER)) > 0
      ORDER BY 1`,
    [rmUserId]
  );
  const segments = ['ALL', ...(tierResult.rows || []).map(r => r.TIER)];

  // Current subscription rows
  const subscriptions = await alertSvc.getSubscriptions(rmUserId);

  // Suppressed count = total open - filtered open
  const [totalOpen, filteredAlerts] = await Promise.all([
    alertSvc.getTotalOpenCount(rmUserId),
    alertSvc.getOpenAlerts(rmUserId),
  ]);
  const suppressedCount = totalOpen - filteredAlerts.length;

  res.json({
    alertTypes,
    segments,
    subscriptions,
    suppressedCount,
    totalOpen,
    filteredOpen: filteredAlerts.length,
  });
}));

/**
 * PATCH /api/alerts/subscriptions/:alertType
 * Upsert subscription preference for a specific alert type.
 * Body: { isActive, customerSegments, severityFilter }
 */
router.patch('/subscriptions/:alertType', requireAuth, asyncHandler(async (req, res) => {
  const { alertType } = req.params;
  const { isActive, customerSegments, severityFilter } = req.body;

  const validTypes = (await getAlertTypeMeta()).map(m => m.type);
  if (!validTypes.includes(alertType))
    return res.status(400).json({ error: `Invalid alertType: ${alertType}` });

  await alertSvc.upsertSubscription(req.user.userId, alertType,
    { isActive, customerSegments, severityFilter });

  audit.log(req.user.userId, 'UPDATE_ALERT_SUBSCRIPTION', 'RM_ALERT_SUBSCRIPTIONS',
            alertType, { isActive, customerSegments, severityFilter }, req.ip).catch(() => {});

  res.json({ ok: true, alertType, isActive, customerSegments, severityFilter });
}));

module.exports = router;
