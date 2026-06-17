'use strict';
const db = require('../config/database');

const JOB_NAME = 'JOB_MATURITY_ALERTS';

/**
 * Get DBMS_SCHEDULER job info + most recent SCHEDULER_LOG row.
 */
async function getStatus() {
  let job = null, lastLog = null;

  try {
    const jr = await db.execute(
      `SELECT JOB_NAME,
              CASE WHEN UPPER(TO_CHAR(ENABLED)) = 'TRUE' THEN 'TRUE' ELSE 'FALSE' END AS ENABLED,
              STATE,
              TO_CHAR(LAST_START_DATE, 'DD Mon YYYY HH24:MI') AS LAST_START,
              TO_CHAR(NEXT_RUN_DATE,   'DD Mon YYYY HH24:MI') AS NEXT_RUN,
              RUN_COUNT, FAILURE_COUNT, REPEAT_INTERVAL,
              COMMENTS
         FROM USER_SCHEDULER_JOBS
        WHERE JOB_NAME = :1`,
      [JOB_NAME]
    );
    job = jr.rows?.[0] || null;
  } catch(e) {
    console.warn('[Scheduler] USER_SCHEDULER_JOBS:', e.message);
  }

  try {
    const lr = await db.execute(
      `SELECT LOG_ID, JOB_NAME, STATUS, ALERTS_CREATED, ALERTS_UPDATED,
              DURATION_MS, ERROR_MSG, RUN_BY,
              TO_CHAR(RUN_AT, 'DD Mon YYYY HH24:MI:SS') AS RUN_AT_FMT
         FROM SCHEDULER_LOG
        WHERE JOB_NAME = :1
        ORDER BY RUN_AT DESC
        FETCH FIRST 1 ROWS ONLY`,
      [JOB_NAME]
    );
    lastLog = lr.rows?.[0] || null;
  } catch(e) {
    console.warn('[Scheduler] SCHEDULER_LOG:', e.message);
  }

  return { job, lastLog };
}

/**
 * Trigger the stored procedure immediately (manual run).
 * The procedure itself logs the run in SCHEDULER_LOG.
 */
async function runNow(userId) {
  await db.execute(
    `BEGIN PROC_PUSH_MATURITY_ALERTS(:1); END;`,
    [userId || 'MANUAL']
  );
}

/**
 * Get run history from SCHEDULER_LOG.
 */
async function getLogs(limit = 20) {
  const r = await db.execute(
    `SELECT LOG_ID, JOB_NAME, STATUS, ALERTS_CREATED, DURATION_MS, RUN_BY,
            ERROR_MSG,
            TO_CHAR(RUN_AT, 'DD Mon YYYY HH24:MI:SS') AS RUN_AT_FMT
       FROM SCHEDULER_LOG
      WHERE JOB_NAME = :1
      ORDER BY RUN_AT DESC
      FETCH FIRST :2 ROWS ONLY`,
    [JOB_NAME, Math.min(limit, 100)]
  );
  return r.rows || [];
}

/**
 * Enable or disable the DBMS_SCHEDULER job.
 */
async function setEnabled(enabled) {
  if (enabled) {
    await db.execute(`BEGIN DBMS_SCHEDULER.ENABLE(:1); END;`, [JOB_NAME]);
  } else {
    await db.execute(`BEGIN DBMS_SCHEDULER.DISABLE(:1, FORCE => TRUE); END;`, [JOB_NAME]);
  }
}

/**
 * Update the job's repeat_interval (e.g., change schedule frequency).
 * interval: Oracle scheduler expression, e.g. 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0'
 */
async function updateInterval(interval) {
  await db.execute(
    `BEGIN
       DBMS_SCHEDULER.SET_ATTRIBUTE(:1, 'repeat_interval', :2);
     END;`,
    [JOB_NAME, interval]
  );
}

module.exports = { getStatus, runNow, getLogs, setEnabled, updateInterval };
