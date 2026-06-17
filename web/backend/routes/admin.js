'use strict';
const express        = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const db             = require('../config/database');
const audit          = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/admin/users
 * All RM users with formatted last-login timestamp.
 */
router.get('/users', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(`
    SELECT USER_ID, USERNAME, FULL_NAME, ROLE, BRANCH, IS_ACTIVE,
           TO_CHAR(LAST_LOGIN, 'DD Mon HH24:MI') AS LAST_LOGIN_FMT,
           TO_CHAR(CREATED_AT, 'DD Mon YYYY')    AS CREATED_FMT
      FROM RM_USERS
     ORDER BY IS_ACTIVE DESC, FULL_NAME
  `);
  res.json({ users: result.rows || [] });
}));

/**
 * GET /api/admin/settings
 * All SYSTEM_SETTINGS rows.
 */
router.get('/settings', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(`
    SELECT SETTING_KEY, SETTING_VALUE, DESCRIPTION,
           TO_CHAR(UPDATED_AT, 'DD Mon YYYY HH24:MI') AS UPDATED_FMT,
           UPDATED_BY
      FROM SYSTEM_SETTINGS
     ORDER BY SETTING_KEY
  `);
  res.json({ settings: result.rows || [] });
}));

/**
 * PUT /api/admin/settings/:key
 * Update a single setting value.
 */
router.put('/settings/:key', requireAuth, asyncHandler(async (req, res) => {
  const { value } = req.body;
  if (value === undefined || value === null)
    return res.status(400).json({ error: 'value is required' });

  const upd = await db.execute(
    `UPDATE SYSTEM_SETTINGS
        SET SETTING_VALUE = :1, UPDATED_AT = CURRENT_TIMESTAMP, UPDATED_BY = :2
      WHERE SETTING_KEY = :3`,
    [String(value), req.user.userId, req.params.key],
    { autoCommit: true }
  );

  if ((upd.rowsAffected || 0) === 0)
    return res.status(404).json({ error: 'Setting not found' });

  audit.log(req.user.userId, 'UPDATE_SETTING', 'SYSTEM_SETTINGS', req.params.key,
            { value: String(value) }, req.ip).catch(() => {});

  res.json({ message: 'Setting updated', key: req.params.key, value: String(value) });
}));

/**
 * GET /api/admin/agents
 * PAF agent registry.
 */
router.get('/agents', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(`
    SELECT AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE,
           TO_CHAR(LAST_RUN_AT, 'DD Mon HH24:MI') AS LAST_RUN_FMT,
           TO_CHAR(CREATED_AT,  'DD Mon YYYY')     AS CREATED_FMT
      FROM PAF_AGENTS
     ORDER BY AGENT_NAME
  `);
  res.json({ agents: result.rows || [] });
}));

/**
 * PATCH /api/admin/agents/:id/status
 * Toggle an agent's status (Running / Stopped).
 */
router.patch('/agents/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ['Running', 'Stopped', 'Paused'];
  if (!allowed.includes(status))
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

  const upd = await db.execute(
    `UPDATE PAF_AGENTS SET STATUS = :1 WHERE AGENT_ID = :2`,
    [status, req.params.id],
    { autoCommit: true }
  );

  if ((upd.rowsAffected || 0) === 0)
    return res.status(404).json({ error: 'Agent not found' });

  audit.log(req.user.userId, 'UPDATE_AGENT_STATUS', 'PAF_AGENTS', req.params.id,
            { status }, req.ip).catch(() => {});
  res.json({ message: 'Agent status updated', agentId: req.params.id, status });
}));

/**
 * GET /api/admin/health
 * Platform service health check.
 * Oracle DB is live-pinged; external services are checked via env config.
 */
router.get('/health', requireAuth, asyncHandler(async (req, res) => {
  const services = [];

  // ── Oracle DB — live ping ─────────────────────────────────
  const t0 = Date.now();
  try {
    await db.execute('SELECT 1 FROM DUAL');
    services.push({
      name:    'Oracle DB 26ai',
      status:  '✓ Connected',
      color:   'ok',
      latency: (Date.now() - t0) + 'ms',
    });
  } catch (_) {
    services.push({ name: 'Oracle DB 26ai', status: '✗ Error', color: 'danger', latency: '–' });
  }

  // ── External services — presence of env vars indicates configuration ──
  const ext = [
    { name: 'OCI Generative AI',   envKey: 'OCI_GENAI_ENDPOINT'   },
    { name: 'OCI Select AI',       envKey: 'OCI_SELECTAI_ENDPOINT' },
    { name: 'Core Banking API',    envKey: 'CORE_BANKING_URL'      },
    { name: 'Market Data Feed',    envKey: 'MARKET_DATA_URL'       },
    { name: 'OCI Object Storage',  envKey: 'OCI_STORAGE_NS'        },
    { name: 'Notification Service',envKey: 'SMTP_HOST'             },
  ];
  ext.forEach(s => {
    const ok = !!process.env[s.envKey];
    services.push({
      name:    s.name,
      status:  ok ? '✓ Configured' : '⚠ Not configured',
      color:   ok ? 'ok' : 'warn',
      latency: '–',
    });
  });

  res.json({ services, checkedAt: new Date().toISOString() });
}));

/**
 * GET /api/admin/thresholds
 * All alert threshold configuration rows, ordered by category.
 */
router.get('/thresholds', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(`
    SELECT THRESHOLD_ID, THRESHOLD_KEY, CATEGORY, LABEL, DESCRIPTION,
           THRESHOLD_VALUE, UNIT, MIN_VALUE, MAX_VALUE, IS_ACTIVE,
           UPDATED_BY,
           TO_CHAR(UPDATED_AT, 'DD Mon YYYY HH24:MI') AS UPDATED_FMT
      FROM ALERT_THRESHOLDS
     ORDER BY CATEGORY, THRESHOLD_ID
  `);
  res.json({ thresholds: result.rows || [] });
}));

/**
 * PUT /api/admin/thresholds/:key
 * Update one threshold value. Validates min/max from Oracle.
 */
router.put('/thresholds/:key', requireAuth, asyncHandler(async (req, res) => {
  const { value } = req.body;
  if (value === undefined || value === null)
    return res.status(400).json({ error: 'value required' });

  const numVal = Number(value);
  if (isNaN(numVal))
    return res.status(400).json({ error: 'value must be numeric' });

  // Fetch row to validate bounds
  const chk = await db.execute(
    `SELECT MIN_VALUE, MAX_VALUE, LABEL
       FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = :1`,
    [req.params.key]
  );
  const row = chk.rows?.[0];
  if (!row) return res.status(404).json({ error: 'Threshold not found' });
  if (row.MIN_VALUE !== null && numVal < row.MIN_VALUE)
    return res.status(400).json({ error: `${row.LABEL}: nilai minimum ${row.MIN_VALUE}` });
  if (row.MAX_VALUE !== null && numVal > row.MAX_VALUE)
    return res.status(400).json({ error: `${row.LABEL}: nilai maksimum ${row.MAX_VALUE}` });

  await db.execute(
    `UPDATE ALERT_THRESHOLDS
        SET THRESHOLD_VALUE = :1,
            UPDATED_BY      = :2,
            UPDATED_AT      = CURRENT_TIMESTAMP
      WHERE THRESHOLD_KEY = :3`,
    [numVal, req.user.userId, req.params.key],
    { autoCommit: true }
  );

  audit.log(req.user.userId, 'UPDATE_ALERT_THRESHOLD', 'ALERT_THRESHOLDS',
            req.params.key, { value: numVal }, req.ip).catch(() => {});

  res.json({ ok: true, key: req.params.key, value: numVal });
}));

module.exports = router;
