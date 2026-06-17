'use strict';
const db = require('../config/database');

/**
 * Log an action to AUDIT_LOG.
 * Fire-and-forget — errors are swallowed to avoid breaking main flows.
 */
async function log(userId, action, entityType = null, entityId = null, details = null, ipAddress = null) {
  try {
    await db.execute(
      `INSERT INTO AUDIT_LOG (USER_ID, ACTION, ENTITY_TYPE, ENTITY_ID, DETAILS, IP_ADDRESS)
       VALUES (:1, :2, :3, :4, :5, :6)`,
      [
        userId || null,
        action,
        entityType || null,
        entityId ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
      ]
    );
  } catch (err) {
    console.warn('[Audit] log failed (non-fatal):', err.message);
  }
}

/**
 * Get recent audit logs (for Compliance Dashboard).
 */
async function getRecent(limit = 100, userId = null) {
  const params = [];
  let whereClause = '';
  if (userId) {
    whereClause = 'WHERE al.USER_ID = :1';
    params.push(userId);
  }
  params.push(limit);

  const sql = `
    SELECT al.LOG_ID, al.USER_ID, al.ACTION, al.ENTITY_TYPE, al.ENTITY_ID,
           al.DETAILS, al.IP_ADDRESS, al.CREATED_AT,
           u.FULL_NAME AS USER_NAME, u.ROLE AS USER_ROLE
      FROM AUDIT_LOG al
      LEFT JOIN RM_USERS u ON al.USER_ID = u.USER_ID
    ${whereClause}
    ORDER BY al.CREATED_AT DESC
    FETCH FIRST :${params.length} ROWS ONLY
  `;
  const result = await db.execute(sql, params);
  return result.rows || [];
}

/**
 * Express middleware — auto-log every authenticated API request.
 */
function middleware(req, res, next) {
  res.on('finish', () => {
    const userId = req.user?.userId || null;
    const action = `${req.method} ${req.path}`;
    const ip     = req.ip || req.headers['x-forwarded-for'];
    // Only log mutations or AI calls
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path.includes('/analyze') || req.path.includes('/copilot')) {
      log(userId, action, null, null, { statusCode: res.statusCode, query: req.query }, ip).catch(() => {});
    }
  });
  next();
}

module.exports = { log, getRecent, middleware };
