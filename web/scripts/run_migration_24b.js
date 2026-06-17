'use strict';
/**
 * Migration 24b — Rebuild V_CALENDAR_ACTIONS
 *
 * Problem:  Old view was based on ALERT_ACTIONS (only rows where RM explicitly
 *           clicked an action button) → only showed one customer (CUST003).
 *
 * Fix:      Flip the base tables to RM_APPOINTMENTS and RM_TASKS (all records
 *           for the RM across ALL customers), then LEFT JOIN ALERT_ACTIONS to
 *           surface the alert context where it exists.
 *
 * Result:   All customers with appointments or tasks appear in the list.
 */

require('dotenv').config();
const db = require('../backend/config/database');

async function run() {
  await db.initialize();
  console.log('Migration 24b — Rebuild V_CALENDAR_ACTIONS (all-customer scope)\n');

  /* ── V_CALENDAR_ACTIONS (rebuilt) ───────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE VIEW V_CALENDAR_ACTIONS AS

        /* ── 1. ALL RM Appointments ────────────────────────────────────── */
        SELECT
          NVL(aa.ACTION_ID, 0)                                          AS ACTION_ID,
          ra.RM_USER_ID,
          aa.ALERT_ID,
          ra.CUSTOMER_ID,
          'schedule_discussion'                                          AS ACTION_TYPE,
          '📅'                                                           AS ACTION_ICON,
          'Schedule Discussion'                                          AS ACTION_LABEL,
          NVL(c.FULL_NAME, ra.CUSTOMER_NAME)                           AS CUSTOMER_NAME,
          c.TIER,
          alt.TITLE                                                      AS ALERT_TITLE,
          alt.ALERT_TYPE,
          alt.SEVERITY,
          ra.APPOINTMENT_ID                                              AS REF_ID,
          'APPOINTMENT'                                                  AS REF_TYPE,
          ra.TITLE,
          ra.MEETING_TYPE                                                AS SUB_TYPE,
          SUBSTR(NVL(ra.NOTES,''),1,500)                               AS NOTES,
          NVL(ra.STATUS,'scheduled')                                    AS STATUS,
          TO_CHAR(ra.APPOINTMENT_DATE,'YYYY-MM-DD"T"HH24:MI:SS')      AS ACTION_DATE_ISO,
          TO_CHAR(ra.APPOINTMENT_DATE,'DD Mon YYYY HH24:MI')           AS ACTION_DATE_FMT,
          ra.DURATION_MIN,
          CAST(NULL AS VARCHAR2(10))                                    AS PRIORITY,
          CAST(NULL AS VARCHAR2(50))                                    AS DUE_DATE_FMT,
          TO_CHAR(ra.CREATED_AT,'DD Mon YYYY HH24:MI')                 AS CREATED_FMT,
          ra.CREATED_AT
        FROM RM_APPOINTMENTS ra
        /* Link to alert action — use most recent if multiple exist */
        LEFT JOIN (
          SELECT ACTION_ID, REFERENCE_ID, ALERT_ID, ACTION_TYPE, CREATED_AT
          FROM (
            SELECT aa2.*,
                   ROW_NUMBER() OVER (
                     PARTITION BY aa2.REFERENCE_ID
                     ORDER BY aa2.CREATED_AT DESC
                   ) AS RN
            FROM ALERT_ACTIONS aa2
            WHERE aa2.ACTION_TYPE = 'schedule_discussion'
          ) WHERE RN = 1
        ) aa ON (
          REGEXP_LIKE(aa.REFERENCE_ID,'^[0-9]+$')
          AND TO_NUMBER(aa.REFERENCE_ID) = ra.APPOINTMENT_ID
        )
        LEFT JOIN CUSTOMERS c  ON ra.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN ALERTS alt   ON aa.ALERT_ID = alt.ALERT_ID

        UNION ALL

        /* ── 2. ALL RM Tasks — Rebalancing ──────────────────────────── */
        SELECT
          NVL(aa.ACTION_ID, 0)                                          AS ACTION_ID,
          t.RM_USER_ID,
          aa.ALERT_ID,
          t.CUSTOMER_ID,
          'initiate_rebalancing'                                        AS ACTION_TYPE,
          '⚖️'                                                          AS ACTION_ICON,
          'Initiate Rebalancing'                                        AS ACTION_LABEL,
          NVL(c.FULL_NAME, t.CUSTOMER_ID)                             AS CUSTOMER_NAME,
          c.TIER,
          alt.TITLE                                                     AS ALERT_TITLE,
          alt.ALERT_TYPE,
          alt.SEVERITY,
          t.TASK_ID                                                     AS REF_ID,
          'RM_TASKS'                                                    AS REF_TYPE,
          t.TITLE,
          t.TASK_TYPE                                                   AS SUB_TYPE,
          SUBSTR(NVL(t.DESCRIPTION,''),1,500)                         AS NOTES,
          NVL(t.STATUS,'open')                                         AS STATUS,
          TO_CHAR(t.DUE_DATE,'YYYY-MM-DD')                            AS ACTION_DATE_ISO,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                           AS ACTION_DATE_FMT,
          CAST(NULL AS NUMBER)                                          AS DURATION_MIN,
          t.PRIORITY,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                           AS DUE_DATE_FMT,
          TO_CHAR(t.CREATED_AT,'DD Mon YYYY HH24:MI')                 AS CREATED_FMT,
          t.CREATED_AT
        FROM RM_TASKS t
        LEFT JOIN (
          SELECT ACTION_ID, REFERENCE_ID, ALERT_ID, ACTION_TYPE, CREATED_AT
          FROM (
            SELECT aa2.*,
                   ROW_NUMBER() OVER (
                     PARTITION BY aa2.REFERENCE_ID
                     ORDER BY aa2.CREATED_AT DESC
                   ) AS RN
            FROM ALERT_ACTIONS aa2
            WHERE aa2.ACTION_TYPE = 'initiate_rebalancing'
          ) WHERE RN = 1
        ) aa ON (
          REGEXP_LIKE(aa.REFERENCE_ID,'^[0-9]+$')
          AND TO_NUMBER(aa.REFERENCE_ID) = t.TASK_ID
        )
        LEFT JOIN CUSTOMERS c  ON t.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN ALERTS alt   ON aa.ALERT_ID = alt.ALERT_ID
        WHERE t.TASK_TYPE = 'rebalancing'

        UNION ALL

        /* ── 3. ALL RM Tasks — Follow-up / other ───────────────────── */
        SELECT
          NVL(aa.ACTION_ID, 0)                                          AS ACTION_ID,
          t.RM_USER_ID,
          aa.ALERT_ID,
          t.CUSTOMER_ID,
          'create_task'                                                 AS ACTION_TYPE,
          '✅'                                                          AS ACTION_ICON,
          'Follow-up Task'                                              AS ACTION_LABEL,
          NVL(c.FULL_NAME, t.CUSTOMER_ID)                             AS CUSTOMER_NAME,
          c.TIER,
          alt.TITLE                                                     AS ALERT_TITLE,
          alt.ALERT_TYPE,
          alt.SEVERITY,
          t.TASK_ID                                                     AS REF_ID,
          'RM_TASKS'                                                    AS REF_TYPE,
          t.TITLE,
          t.TASK_TYPE                                                   AS SUB_TYPE,
          SUBSTR(NVL(t.DESCRIPTION,''),1,500)                         AS NOTES,
          NVL(t.STATUS,'open')                                         AS STATUS,
          TO_CHAR(t.DUE_DATE,'YYYY-MM-DD')                            AS ACTION_DATE_ISO,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                           AS ACTION_DATE_FMT,
          CAST(NULL AS NUMBER)                                          AS DURATION_MIN,
          t.PRIORITY,
          TO_CHAR(t.DUE_DATE,'DD Mon YYYY')                           AS DUE_DATE_FMT,
          TO_CHAR(t.CREATED_AT,'DD Mon YYYY HH24:MI')                 AS CREATED_FMT,
          t.CREATED_AT
        FROM RM_TASKS t
        LEFT JOIN (
          SELECT ACTION_ID, REFERENCE_ID, ALERT_ID, ACTION_TYPE, CREATED_AT
          FROM (
            SELECT aa2.*,
                   ROW_NUMBER() OVER (
                     PARTITION BY aa2.REFERENCE_ID
                     ORDER BY aa2.CREATED_AT DESC
                   ) AS RN
            FROM ALERT_ACTIONS aa2
            WHERE aa2.ACTION_TYPE = 'create_task'
          ) WHERE RN = 1
        ) aa ON (
          REGEXP_LIKE(aa.REFERENCE_ID,'^[0-9]+$')
          AND TO_NUMBER(aa.REFERENCE_ID) = t.TASK_ID
        )
        LEFT JOIN CUSTOMERS c  ON t.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN ALERTS alt   ON aa.ALERT_ID = alt.ALERT_ID
        WHERE t.TASK_TYPE != 'rebalancing'
    `);
    console.log('✅  Rebuilt V_CALENDAR_ACTIONS (all-customer scope)');
  } catch (e) {
    console.error('❌  V_CALENDAR_ACTIONS:', e.message);
    throw e;
  }

  /* ── Re-grant ─────────────────────────────────────────────────────── */
  try {
    await db.execute(`GRANT SELECT ON V_CALENDAR_ACTIONS TO PUBLIC`);
    console.log('✅  Granted SELECT on V_CALENDAR_ACTIONS to PUBLIC');
  } catch (e) {
    console.log(`⏭   GRANT: ${e.message}`);
  }

  /* ── Sanity check ─────────────────────────────────────────────────── */
  const cnt = await db.execute(`SELECT COUNT(*) AS CNT FROM V_CALENDAR_ACTIONS WHERE RM_USER_ID = 'rm001'`);
  console.log(`\n📊 V_CALENDAR_ACTIONS rows for rm001: ${cnt.rows[0].CNT}`);

  const custs = await db.execute(
    `SELECT DISTINCT CUSTOMER_ID, CUSTOMER_NAME, ACTION_TYPE
       FROM V_CALENDAR_ACTIONS
      WHERE RM_USER_ID = 'rm001'
      ORDER BY CUSTOMER_ID`
  );
  console.log('Customers covered:');
  custs.rows.forEach(r => console.log(`   ${r.CUSTOMER_ID} | ${r.CUSTOMER_NAME} | ${r.ACTION_TYPE}`));

  console.log('\n✅  Migration 24b complete');
  await db.close();
}

run().catch(err => {
  console.error('Migration 24b FAILED:', err);
  process.exit(1);
});
