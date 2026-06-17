'use strict';
/**
 * Calendar Actions Route — /api/calendar/actions
 *
 * Exposes the consolidated V_CALENDAR_ACTIONS view so the Calendar
 * sub-module can display Schedule Discussion, Initiate Rebalancing,
 * and Follow-up Task records in one unified list.
 */
const express    = require('express');
const oracledb   = require('oracledb');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const db         = require('../config/database');
const audit      = require('../services/auditService');

const router = express.Router();

/* ═══════════════════════════════════════════════════════════════
   GET /api/calendar/actions
   Query params:
     type      — schedule_discussion | initiate_rebalancing | create_task
     status    — scheduled | completed | cancelled | open | done
     dateFrom  — YYYY-MM-DD
     dateTo    — YYYY-MM-DD
     search    — free-text search on customer name or title
     limit     — max rows (default 200)
═══════════════════════════════════════════════════════════════ */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const rmUserId = req.user.userId;
  const { type, status, dateFrom, dateTo, search } = req.query;
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);

  /* Build dynamic WHERE clause */
  const binds = [rmUserId];
  let bIdx = 2;
  const conds = ['v.RM_USER_ID = :1', 'v.CUSTOMER_ID IS NOT NULL'];

  if (type && ['schedule_discussion','initiate_rebalancing','create_task'].includes(type)) {
    conds.push(`v.ACTION_TYPE = :${bIdx}`);
    binds.push(type);
    bIdx++;
  }
  if (status) {
    conds.push(`LOWER(v.STATUS) = :${bIdx}`);
    binds.push(status.toLowerCase());
    bIdx++;
  }
  if (dateFrom) {
    conds.push(`(v.ACTION_DATE_ISO IS NULL OR v.ACTION_DATE_ISO >= :${bIdx})`);
    binds.push(dateFrom);
    bIdx++;
  }
  if (dateTo) {
    conds.push(`(v.ACTION_DATE_ISO IS NULL OR v.ACTION_DATE_ISO <= :${bIdx})`);
    binds.push(dateTo + 'Z');
    bIdx++;
  }
  if (search) {
    conds.push(`(UPPER(v.CUSTOMER_NAME) LIKE :${bIdx} OR UPPER(v.TITLE) LIKE :${bIdx})`);
    binds.push(`%${search.toUpperCase()}%`);
    bIdx++;
  }

  const whereStr = conds.join(' AND ');

  /* Query with pagination (Oracle FETCH FIRST syntax) */
  const sql = `
    SELECT
      v.ACTION_ID, v.ALERT_ID, v.CUSTOMER_ID,
      v.ACTION_TYPE, v.ACTION_ICON, v.ACTION_LABEL,
      v.CUSTOMER_NAME, v.TIER,
      v.ALERT_TITLE, v.ALERT_TYPE, v.SEVERITY,
      v.REF_ID, v.REF_TYPE,
      v.TITLE, v.SUB_TYPE, v.NOTES, v.STATUS,
      v.ACTION_DATE_ISO, v.ACTION_DATE_FMT,
      v.DURATION_MIN, v.PRIORITY, v.DUE_DATE_FMT,
      v.CREATED_FMT
    FROM V_CALENDAR_ACTIONS v
    WHERE ${whereStr}
    ORDER BY v.CREATED_AT DESC
    FETCH FIRST :${bIdx} ROWS ONLY
  `;
  binds.push(limit);

  const result = await db.execute(sql, binds);
  const rows   = result.rows || [];

  /* Summary counts (always from full RM data, ignoring filters) */
  const summaryResult = await db.execute(
    `SELECT
       COUNT(*) AS TOTAL,
       SUM(CASE WHEN ACTION_TYPE='schedule_discussion'  THEN 1 ELSE 0 END) AS DISCUSSIONS,
       SUM(CASE WHEN ACTION_TYPE='initiate_rebalancing' THEN 1 ELSE 0 END) AS REBALANCINGS,
       SUM(CASE WHEN ACTION_TYPE='create_task'          THEN 1 ELSE 0 END) AS TASKS,
       SUM(CASE WHEN STATUS IN ('open','scheduled')     THEN 1 ELSE 0 END) AS OPEN_COUNT,
       SUM(CASE WHEN STATUS IN ('done','completed')     THEN 1 ELSE 0 END) AS DONE_COUNT
     FROM V_CALENDAR_ACTIONS
     WHERE RM_USER_ID = :1
       AND CUSTOMER_ID IS NOT NULL`,
    [rmUserId]
  );
  const s = summaryResult.rows?.[0] || {};

  res.json({
    actions: rows,
    total:   rows.length,
    summary: {
      total:       s.TOTAL       || 0,
      discussions: s.DISCUSSIONS || 0,
      rebalancings:s.REBALANCINGS|| 0,
      tasks:       s.TASKS       || 0,
      openCount:   s.OPEN_COUNT  || 0,
      doneCount:   s.DONE_COUNT  || 0,
    },
  });
}));

/* ═══════════════════════════════════════════════════════════════
   PATCH /api/calendar/actions/:refType/:refId/status
   Body: { status }
   refType: APPOINTMENT | RM_TASKS
   Calls SP_UPDATE_CALENDAR_ACTION_STATUS
═══════════════════════════════════════════════════════════════ */
router.patch('/:refType/:refId/status', requireAuth, asyncHandler(async (req, res) => {
  const { refType, refId } = req.params;
  const { status } = req.body;
  const rmUserId = req.user.userId;

  if (!status)
    return res.status(400).json({ error: 'status wajib diisi' });

  /* Validate allowed statuses per ref type */
  const allowedAppt = ['scheduled', 'completed', 'cancelled'];
  const allowedTask = ['open', 'done', 'cancelled'];
  if (refType === 'APPOINTMENT' && !allowedAppt.includes(status))
    return res.status(400).json({ error: `Status tidak valid. Gunakan: ${allowedAppt.join(', ')}` });
  if (refType === 'RM_TASKS' && !allowedTask.includes(status))
    return res.status(400).json({ error: `Status tidak valid. Gunakan: ${allowedTask.join(', ')}` });
  if (!['APPOINTMENT','RM_TASKS'].includes(refType))
    return res.status(400).json({ error: 'refType tidak valid' });

  /* Call stored procedure */
  const result = await db.execute(
    `BEGIN
       SP_UPDATE_CALENDAR_ACTION_STATUS(:refId, :refType, :status, :rmUser, :rowsUpdated);
     END;`,
    {
      refId:       Number(refId),
      refType:     refType,
      status:      status,
      rmUser:      rmUserId,
      rowsUpdated: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    }
  );

  const updated = result.outBinds?.rowsUpdated ?? 0;
  if (!updated)
    return res.status(404).json({ error: 'Action tidak ditemukan atau bukan milik Anda' });

  audit.log(rmUserId, 'UPDATE_CALENDAR_ACTION_STATUS', refType, refId,
    { status }, req.ip).catch(() => {});

  res.json({ ok: true, refId: Number(refId), refType, status });
}));

/* ═══════════════════════════════════════════════════════════════
   GET /api/calendar/actions/summary
   Quick summary for dashboard badges (no auth param leak)
═══════════════════════════════════════════════════════════════ */
router.get('/summary', requireAuth, asyncHandler(async (req, res) => {
  const r = await db.execute(
    `SELECT
       COUNT(*) AS TOTAL,
       SUM(CASE WHEN ACTION_TYPE='schedule_discussion'  THEN 1 ELSE 0 END) AS DISCUSSIONS,
       SUM(CASE WHEN ACTION_TYPE='initiate_rebalancing' THEN 1 ELSE 0 END) AS REBALANCINGS,
       SUM(CASE WHEN ACTION_TYPE='create_task'          THEN 1 ELSE 0 END) AS TASKS,
       SUM(CASE WHEN STATUS IN ('open','scheduled')     THEN 1 ELSE 0 END) AS OPEN_COUNT
     FROM V_CALENDAR_ACTIONS
     WHERE RM_USER_ID = :1
       AND CUSTOMER_ID IS NOT NULL`,
    [req.user.userId]
  );
  const s = r.rows?.[0] || {};
  res.json({
    total:       s.TOTAL        || 0,
    discussions: s.DISCUSSIONS  || 0,
    rebalancings:s.REBALANCINGS || 0,
    tasks:       s.TASKS        || 0,
    openCount:   s.OPEN_COUNT   || 0,
  });
}));

module.exports = router;
