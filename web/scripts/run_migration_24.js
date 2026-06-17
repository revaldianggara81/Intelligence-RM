'use strict';
/**
 * Migration 24 — Calendar Action History Sub-module
 *
 * Creates:
 *   V_CALENDAR_ACTIONS               — Consolidated view of all alert actions
 *                                      (schedule_discussion, initiate_rebalancing, create_task)
 *   SP_UPDATE_CALENDAR_ACTION_STATUS — Stored procedure to update action status
 *
 * Used by: GET /api/calendar/actions, PATCH /api/calendar/actions/:refType/:refId/status
 */

require('dotenv').config();
const db = require('../backend/config/database');

async function run() {
  await db.initialize();
  console.log('Migration 24 — Calendar Action History Sub-module\n');

  /* ── 1. V_CALENDAR_ACTIONS view ──────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE VIEW V_CALENDAR_ACTIONS AS
        /* ── Schedule Discussions (from ALERT_ACTIONS → RM_APPOINTMENTS) ── */
        SELECT
          aa.ACTION_ID,
          aa.RM_USER_ID,
          aa.ALERT_ID,
          aa.CUSTOMER_ID,
          'schedule_discussion'                                      AS ACTION_TYPE,
          '📅'                                                       AS ACTION_ICON,
          'Schedule Discussion'                                      AS ACTION_LABEL,
          NVL(c.FULL_NAME, aa.CUSTOMER_ID)                          AS CUSTOMER_NAME,
          c.TIER,
          alt.TITLE                                                  AS ALERT_TITLE,
          alt.ALERT_TYPE,
          alt.SEVERITY,
          ra.APPOINTMENT_ID                                          AS REF_ID,
          'APPOINTMENT'                                              AS REF_TYPE,
          NVL(ra.TITLE,'Diskusi Portofolio')                        AS TITLE,
          ra.MEETING_TYPE                                            AS SUB_TYPE,
          SUBSTR(NVL(ra.NOTES,''),1,500)                            AS NOTES,
          NVL(ra.STATUS,'scheduled')                                 AS STATUS,
          TO_CHAR(ra.APPOINTMENT_DATE,'YYYY-MM-DD"T"HH24:MI:SS')   AS ACTION_DATE_ISO,
          TO_CHAR(ra.APPOINTMENT_DATE,'DD Mon YYYY HH24:MI')        AS ACTION_DATE_FMT,
          ra.DURATION_MIN,
          CAST(NULL AS VARCHAR2(10))                                 AS PRIORITY,
          CAST(NULL AS VARCHAR2(50))                                 AS DUE_DATE_FMT,
          TO_CHAR(aa.CREATED_AT,'DD Mon YYYY HH24:MI')              AS CREATED_FMT,
          aa.CREATED_AT
        FROM ALERT_ACTIONS aa
        LEFT JOIN RM_APPOINTMENTS ra
          ON ra.APPOINTMENT_ID = TO_NUMBER(
               CASE WHEN REGEXP_LIKE(aa.REFERENCE_ID,'^[0-9]+$')
                    THEN aa.REFERENCE_ID ELSE '0' END)
        LEFT JOIN CUSTOMERS c  ON aa.CUSTOMER_ID  = c.CUSTOMER_ID
        LEFT JOIN ALERTS alt   ON aa.ALERT_ID     = alt.ALERT_ID
        WHERE aa.ACTION_TYPE = 'schedule_discussion'

        UNION ALL

        /* ── Initiate Rebalancing (from ALERT_ACTIONS → RM_TASKS) ──────── */
        SELECT
          aa.ACTION_ID,
          aa.RM_USER_ID,
          aa.ALERT_ID,
          aa.CUSTOMER_ID,
          'initiate_rebalancing'                                    AS ACTION_TYPE,
          '⚖️'                                                      AS ACTION_ICON,
          'Initiate Rebalancing'                                    AS ACTION_LABEL,
          NVL(c.FULL_NAME, aa.CUSTOMER_ID)                         AS CUSTOMER_NAME,
          c.TIER,
          alt.TITLE                                                 AS ALERT_TITLE,
          alt.ALERT_TYPE,
          alt.SEVERITY,
          t.TASK_ID                                                 AS REF_ID,
          'RM_TASKS'                                                AS REF_TYPE,
          NVL(t.TITLE,'Rebalancing Portofolio')                    AS TITLE,
          t.TASK_TYPE                                               AS SUB_TYPE,
          SUBSTR(NVL(t.DESCRIPTION,''),1,500)                      AS NOTES,
          NVL(t.STATUS,'open')                                      AS STATUS,
          TO_CHAR(t.DUE_DATE,'YYYY-MM-DD')                         AS ACTION_DATE_ISO,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                        AS ACTION_DATE_FMT,
          CAST(NULL AS NUMBER)                                       AS DURATION_MIN,
          t.PRIORITY,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                        AS DUE_DATE_FMT,
          TO_CHAR(aa.CREATED_AT,'DD Mon YYYY HH24:MI')             AS CREATED_FMT,
          aa.CREATED_AT
        FROM ALERT_ACTIONS aa
        LEFT JOIN RM_TASKS t
          ON t.TASK_ID = TO_NUMBER(
               CASE WHEN REGEXP_LIKE(aa.REFERENCE_ID,'^[0-9]+$')
                    THEN aa.REFERENCE_ID ELSE '0' END)
        LEFT JOIN CUSTOMERS c  ON aa.CUSTOMER_ID  = c.CUSTOMER_ID
        LEFT JOIN ALERTS alt   ON aa.ALERT_ID     = alt.ALERT_ID
        WHERE aa.ACTION_TYPE = 'initiate_rebalancing'

        UNION ALL

        /* ── Create Follow-up Task (from ALERT_ACTIONS → RM_TASKS) ─────── */
        SELECT
          aa.ACTION_ID,
          aa.RM_USER_ID,
          aa.ALERT_ID,
          aa.CUSTOMER_ID,
          'create_task'                                             AS ACTION_TYPE,
          '✅'                                                      AS ACTION_ICON,
          'Follow-up Task'                                          AS ACTION_LABEL,
          NVL(c.FULL_NAME, aa.CUSTOMER_ID)                         AS CUSTOMER_NAME,
          c.TIER,
          alt.TITLE                                                 AS ALERT_TITLE,
          alt.ALERT_TYPE,
          alt.SEVERITY,
          t.TASK_ID                                                 AS REF_ID,
          'RM_TASKS'                                                AS REF_TYPE,
          NVL(t.TITLE,'Follow-up Task')                            AS TITLE,
          t.TASK_TYPE                                               AS SUB_TYPE,
          SUBSTR(NVL(t.DESCRIPTION,''),1,500)                      AS NOTES,
          NVL(t.STATUS,'open')                                      AS STATUS,
          TO_CHAR(t.DUE_DATE,'YYYY-MM-DD')                         AS ACTION_DATE_ISO,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                        AS ACTION_DATE_FMT,
          CAST(NULL AS NUMBER)                                       AS DURATION_MIN,
          t.PRIORITY,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                        AS DUE_DATE_FMT,
          TO_CHAR(aa.CREATED_AT,'DD Mon YYYY HH24:MI')             AS CREATED_FMT,
          aa.CREATED_AT
        FROM ALERT_ACTIONS aa
        LEFT JOIN RM_TASKS t
          ON t.TASK_ID = TO_NUMBER(
               CASE WHEN REGEXP_LIKE(aa.REFERENCE_ID,'^[0-9]+$')
                    THEN aa.REFERENCE_ID ELSE '0' END)
        LEFT JOIN CUSTOMERS c  ON aa.CUSTOMER_ID  = c.CUSTOMER_ID
        LEFT JOIN ALERTS alt   ON aa.ALERT_ID     = alt.ALERT_ID
        WHERE aa.ACTION_TYPE = 'create_task'
    `);
    console.log('✅  Created/replaced V_CALENDAR_ACTIONS');
  } catch (e) {
    console.error('❌  V_CALENDAR_ACTIONS:', e.message);
    throw e;
  }

  /* ── 2. SP_UPDATE_CALENDAR_ACTION_STATUS ─────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE PROCEDURE SP_UPDATE_CALENDAR_ACTION_STATUS(
        p_ref_id      IN  NUMBER,
        p_ref_type    IN  VARCHAR2,
        p_status      IN  VARCHAR2,
        p_rm_user_id  IN  VARCHAR2,
        p_rows_updated OUT NUMBER
      ) AS
      BEGIN
        IF p_ref_type = 'APPOINTMENT' THEN
          UPDATE RM_APPOINTMENTS
             SET STATUS     = p_status,
                 UPDATED_AT = CURRENT_TIMESTAMP
           WHERE APPOINTMENT_ID = p_ref_id
             AND RM_USER_ID     = p_rm_user_id;
          p_rows_updated := SQL%ROWCOUNT;

        ELSIF p_ref_type = 'RM_TASKS' THEN
          UPDATE RM_TASKS
             SET STATUS     = p_status,
                 UPDATED_AT = CURRENT_TIMESTAMP
           WHERE TASK_ID    = p_ref_id
             AND RM_USER_ID = p_rm_user_id;
          p_rows_updated := SQL%ROWCOUNT;

        ELSE
          p_rows_updated := 0;
        END IF;
        COMMIT;
      EXCEPTION
        WHEN OTHERS THEN
          ROLLBACK;
          RAISE;
      END SP_UPDATE_CALENDAR_ACTION_STATUS;
    `, [], { autoCommit: true });
    console.log('✅  Created/replaced SP_UPDATE_CALENDAR_ACTION_STATUS');
  } catch (e) {
    console.error('❌  SP_UPDATE_CALENDAR_ACTION_STATUS:', e.message);
    throw e;
  }

  /* ── 3. Grants ───────────────────────────────────────────────────────── */
  try {
    await db.execute(`GRANT SELECT ON V_CALENDAR_ACTIONS TO PUBLIC`);
    console.log('✅  Granted SELECT on V_CALENDAR_ACTIONS to PUBLIC');
  } catch (e) {
    console.log(`⏭   GRANT V_CALENDAR_ACTIONS: ${e.message}`);
  }
  try {
    await db.execute(`GRANT EXECUTE ON SP_UPDATE_CALENDAR_ACTION_STATUS TO PUBLIC`);
    console.log('✅  Granted EXECUTE on SP_UPDATE_CALENDAR_ACTION_STATUS to PUBLIC');
  } catch (e) {
    console.log(`⏭   GRANT SP_UPDATE_CALENDAR_ACTION_STATUS: ${e.message}`);
  }

  console.log('\n✅  Migration 24 complete — Calendar Action History ready');
  await db.close();
}

run().catch(err => {
  console.error('Migration 24 FAILED:', err);
  process.exit(1);
});
