'use strict';
/**
 * Appointment Service — Calendar module
 * CRUD for RM_APPOINTMENTS table.
 * All queries are scoped to the authenticated RM's USER_ID.
 */
const db = require('../config/database');

/**
 * List appointments for a given month (or all if no month specified).
 * @param {string} rmUserId
 * @param {object} opts — { year, month } both 1-based integers; omit for current month
 * @returns {Promise<object[]>}
 */
async function list(rmUserId, { year, month } = {}) {
  const now   = new Date();
  const y     = year  || now.getFullYear();
  const m     = month || (now.getMonth() + 1);

  // First day of month — Oracle TO_DATE
  const startStr = `${String(m).padStart(2,'0')}/01/${y}`;
  // First day of next month
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear  = m === 12 ? y + 1 : y;
  const endStr    = `${String(nextMonth).padStart(2,'0')}/01/${nextYear}`;

  const result = await db.execute(
    `SELECT
       a.APPOINTMENT_ID, a.RM_USER_ID, a.CUSTOMER_ID, a.CUSTOMER_NAME,
       a.TITLE, a.MEETING_TYPE, a.NOTES,
       TO_CHAR(a.APPOINTMENT_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS APPOINTMENT_DATE,
       a.DURATION_MIN, a.STATUS,
       TO_CHAR(a.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS CREATED_AT
     FROM RM_APPOINTMENTS a
    WHERE a.RM_USER_ID = :1
      AND a.APPOINTMENT_DATE >= TO_DATE(:2, 'MM/DD/YYYY')
      AND a.APPOINTMENT_DATE  < TO_DATE(:3, 'MM/DD/YYYY')
    ORDER BY a.APPOINTMENT_DATE ASC`,
    [rmUserId, startStr, endStr]
  );
  return result.rows || [];
}

/**
 * List upcoming scheduled appointments (next N).
 * @param {string} rmUserId
 * @param {number} limit
 */
async function getUpcoming(rmUserId, limit = 5) {
  const result = await db.execute(
    `SELECT
       a.APPOINTMENT_ID, a.CUSTOMER_ID, a.CUSTOMER_NAME,
       a.TITLE, a.MEETING_TYPE, a.NOTES,
       TO_CHAR(a.APPOINTMENT_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS APPOINTMENT_DATE,
       a.DURATION_MIN, a.STATUS
     FROM RM_APPOINTMENTS a
    WHERE a.RM_USER_ID = :1
      AND a.STATUS = 'scheduled'
      AND a.APPOINTMENT_DATE >= SYSDATE
    ORDER BY a.APPOINTMENT_DATE ASC
    FETCH FIRST :2 ROWS ONLY`,
    [rmUserId, limit]
  );
  return result.rows || [];
}

/**
 * Get a single appointment by ID (RM-scoped for security).
 */
async function getById(appointmentId, rmUserId) {
  const result = await db.execute(
    `SELECT
       a.APPOINTMENT_ID, a.RM_USER_ID, a.CUSTOMER_ID, a.CUSTOMER_NAME,
       a.TITLE, a.MEETING_TYPE, a.NOTES,
       TO_CHAR(a.APPOINTMENT_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS APPOINTMENT_DATE,
       a.DURATION_MIN, a.STATUS,
       TO_CHAR(a.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS CREATED_AT,
       TO_CHAR(a.UPDATED_AT,  'YYYY-MM-DD"T"HH24:MI:SS') AS UPDATED_AT
     FROM RM_APPOINTMENTS a
    WHERE a.APPOINTMENT_ID = :1
      AND a.RM_USER_ID     = :2`,
    [appointmentId, rmUserId]
  );
  return result.rows?.[0] || null;
}

/**
 * Create a new appointment.
 * @param {string} rmUserId
 * @param {object} data — { customerId?, customerName?, title, meetingType, notes?, appointmentDate, durationMin? }
 * @returns {Promise<number>} new APPOINTMENT_ID
 */
async function create(rmUserId, data) {
  const {
    customerId    = null,
    customerName  = null,
    title,
    meetingType,
    notes         = null,
    appointmentDate,
    durationMin   = 30,
  } = data;

  if (!title)           throw new Error('title diperlukan');
  if (!meetingType)     throw new Error('meetingType diperlukan');
  if (!appointmentDate) throw new Error('appointmentDate diperlukan');

  // Convert ISO string from frontend → Oracle-compatible timestamp string
  const dtStr = appointmentDate.replace('T', ' ').substring(0, 19); // YYYY-MM-DD HH24:MI:SS

  const result = await db.execute(
    `INSERT INTO RM_APPOINTMENTS
       (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES,
        APPOINTMENT_DATE, DURATION_MIN, STATUS)
     VALUES (:1, :2, :3, :4, :5, :6,
             TO_TIMESTAMP(:7,'YYYY-MM-DD HH24:MI:SS'),
             :8, 'scheduled')
     RETURNING APPOINTMENT_ID INTO :9`,
    [rmUserId, customerId, customerName, title, meetingType, notes,
     dtStr, durationMin,
     { dir: require('oracledb').BIND_OUT, type: require('oracledb').NUMBER }]
  );
  // outBinds shape: [[value]] or [value] depending on driver version
  const ob = result.outBinds;
  if (Array.isArray(ob) && Array.isArray(ob[0])) return ob[0][0];
  if (Array.isArray(ob)) return ob[0];
  return result.lastRowid;
}

/**
 * Update an existing appointment (full update — all editable fields).
 */
async function update(appointmentId, rmUserId, data) {
  const {
    customerId,
    customerName,
    title,
    meetingType,
    notes,
    appointmentDate,
    durationMin,
    status,
  } = data;

  const dtStr = appointmentDate
    ? appointmentDate.replace('T', ' ').substring(0, 19)
    : null;

  await db.execute(
    `UPDATE RM_APPOINTMENTS SET
       CUSTOMER_ID      = NVL(:1, CUSTOMER_ID),
       CUSTOMER_NAME    = NVL(:2, CUSTOMER_NAME),
       TITLE            = NVL(:3, TITLE),
       MEETING_TYPE     = NVL(:4, MEETING_TYPE),
       NOTES            = :5,
       APPOINTMENT_DATE = CASE WHEN :6 IS NOT NULL
                               THEN TO_TIMESTAMP(:6,'YYYY-MM-DD HH24:MI:SS')
                               ELSE APPOINTMENT_DATE END,
       DURATION_MIN     = NVL(:7, DURATION_MIN),
       STATUS           = NVL(:8, STATUS),
       UPDATED_AT       = CURRENT_TIMESTAMP
     WHERE APPOINTMENT_ID = :9
       AND RM_USER_ID     = :10`,
    [customerId, customerName, title, meetingType, notes,
     dtStr, durationMin, status,
     appointmentId, rmUserId]
  );
}

/**
 * Update only the status of an appointment (quick action: complete / cancel).
 */
async function updateStatus(appointmentId, rmUserId, status) {
  const allowed = ['scheduled', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw new Error('Status tidak valid');

  await db.execute(
    `UPDATE RM_APPOINTMENTS
        SET STATUS     = :1,
            UPDATED_AT = CURRENT_TIMESTAMP
      WHERE APPOINTMENT_ID = :2
        AND RM_USER_ID     = :3`,
    [status, appointmentId, rmUserId]
  );
}

/**
 * Delete an appointment (hard delete — RM-scoped).
 */
async function remove(appointmentId, rmUserId) {
  await db.execute(
    `DELETE FROM RM_APPOINTMENTS
      WHERE APPOINTMENT_ID = :1
        AND RM_USER_ID     = :2`,
    [appointmentId, rmUserId]
  );
}

module.exports = { list, getUpcoming, getById, create, update, updateStatus, remove };
