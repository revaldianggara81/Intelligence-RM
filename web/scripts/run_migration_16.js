'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql) => {
    try { await db.execute(sql); console.log('[✓]', label); }
    catch(e) {
      if (/ORA-00955|ORA-01430|ORA-02261|ORA-02291/.test(e.message))
        console.log('[~]', label, '(already exists / already added)');
      else console.error('[✗]', label, e.message);
    }
  };

  // ── 1. Add horizon columns to NOTIFICATION_PREFS ──────────────────────────
  await run('ADD MATURITY_HORIZON_DAYS',
    `ALTER TABLE NOTIFICATION_PREFS ADD MATURITY_HORIZON_DAYS NUMBER DEFAULT 30`);
  await run('ADD MATURITY_HIGH_DAYS',
    `ALTER TABLE NOTIFICATION_PREFS ADD MATURITY_HIGH_DAYS    NUMBER DEFAULT 14`);
  await run('ADD MATURITY_MEDIUM_DAYS',
    `ALTER TABLE NOTIFICATION_PREFS ADD MATURITY_MEDIUM_DAYS  NUMBER DEFAULT 30`);

  // ── 2. Backfill defaults for existing rows ────────────────────────────────
  try {
    await db.execute(
      `UPDATE NOTIFICATION_PREFS SET
         MATURITY_HORIZON_DAYS = NVL(MATURITY_HORIZON_DAYS, 30),
         MATURITY_HIGH_DAYS    = NVL(MATURITY_HIGH_DAYS, 14),
         MATURITY_MEDIUM_DAYS  = NVL(MATURITY_MEDIUM_DAYS, 30)`
    );
    await db.execute('COMMIT');
    console.log('[✓] Backfilled horizon defaults');
  } catch(e) { console.warn('[~] Backfill:', e.message); }

  // ── 3. Recreate PROC_PUSH_MATURITY_ALERTS with per-RM horizon ─────────────
  console.log('[…] Recreating PROC_PUSH_MATURITY_ALERTS with per-RM horizons...');
  try {
    await db.execute(`CREATE OR REPLACE PROCEDURE PROC_PUSH_MATURITY_ALERTS (
  p_run_by IN VARCHAR2 DEFAULT 'SCHEDULER'
) AS
  v_start   TIMESTAMP  := SYSTIMESTAMP;
  v_created NUMBER     := 0;
  v_log_id  NUMBER;
  v_err_msg VARCHAR2(2000) := NULL;
BEGIN
  -- Insert RUNNING log row
  INSERT INTO SCHEDULER_LOG (JOB_NAME, STATUS, RUN_BY)
  VALUES ('JOB_MATURITY_ALERTS', 'RUNNING', p_run_by)
  RETURNING LOG_ID INTO v_log_id;
  COMMIT;

  BEGIN

    -- ── 1. Maturity reminders — uses per-RM MATURITY_HORIZON_DAYS ────────────
    FOR r IN (
      SELECT cp.HOLDING_ID, cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.AMOUNT,
             ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_LEFT,
             NVL(np.MATURITY_HORIZON_DAYS, 30) AS RM_HORIZON,
             NVL(np.MATURITY_HIGH_DAYS,    14) AS HIGH_DAYS,
             NVL(np.MATURITY_MEDIUM_DAYS,  30) AS MEDIUM_DAYS
        FROM CUSTOMER_PRODUCTS cp
        JOIN CUSTOMERS c ON c.CUSTOMER_ID = cp.CUSTOMER_ID
        LEFT JOIN NOTIFICATION_PREFS np ON np.RM_USER_ID = c.RM_USER_ID
       WHERE cp.STATUS = 'Active'
         AND cp.MATURITY_DATE IS NOT NULL
         AND ROUND(cp.MATURITY_DATE - SYSDATE) BETWEEN 0
             AND NVL(np.MATURITY_HORIZON_DAYS, 30)
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID  = cp.CUSTOMER_ID
              AND a.ALERT_TYPE   = 'maturity'
              AND a.STATUS       = 'Open'
              AND a.METRIC_VALUE = TO_CHAR(cp.HOLDING_ID)
         )
    ) LOOP
      INSERT INTO ALERTS (
        CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
        METRIC_KEY, METRIC_VALUE, THRESHOLD
      ) VALUES (
        r.CUSTOMER_ID,
        'maturity',
        CASE WHEN r.DAYS_LEFT <= r.HIGH_DAYS   THEN 'high'
             WHEN r.DAYS_LEFT <= r.MEDIUM_DAYS THEN 'medium'
             ELSE 'low' END,
        'Deposito Jatuh Tempo ' || TO_CHAR(r.DAYS_LEFT) || ' Hari',
        r.PRODUCT_NAME || ' senilai Rp ' ||
          TRIM(TO_CHAR(r.AMOUNT, 'FM999,999,999,999')) ||
          ' akan jatuh tempo dalam ' || TO_CHAR(r.DAYS_LEFT) ||
          ' hari. Segera hubungi nasabah.',
        'days_to_maturity',
        TO_CHAR(r.HOLDING_ID),
        TO_CHAR(r.RM_HORIZON)
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 2. Portfolio loss > 7% ───────────────────────────────────────────────
    FOR r IN (
      SELECT cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.AMOUNT, cp.RETURN_PCT
        FROM CUSTOMER_PRODUCTS cp
       WHERE cp.STATUS = 'Active'
         AND cp.RETURN_PCT IS NOT NULL
         AND cp.RETURN_PCT < -7
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID = cp.CUSTOMER_ID
              AND a.ALERT_TYPE  = 'portfolio_loss'
              AND a.STATUS      = 'Open'
         )
    ) LOOP
      INSERT INTO ALERTS (
        CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
        METRIC_KEY, METRIC_VALUE, THRESHOLD
      ) VALUES (
        r.CUSTOMER_ID,
        'portfolio_loss',
        CASE WHEN r.RETURN_PCT < -12 THEN 'high' ELSE 'medium' END,
        'Kerugian ' || r.PRODUCT_NAME || ' ' || TO_CHAR(r.RETURN_PCT) || '%',
        r.PRODUCT_NAME || ' mengalami kerugian unrealized ' ||
          TO_CHAR(r.RETURN_PCT) || '% dari pokok Rp ' ||
          TRIM(TO_CHAR(r.AMOUNT, 'FM999,999,999,999')) || '.',
        'portfolio_loss_pct',
        TO_CHAR(r.RETURN_PCT),
        '-7.00'
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 3. Idle money > 40% of AUM ──────────────────────────────────────────
    FOR r IN (
      SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM,
             NVL(inv.TOTAL_INVESTED, 0) AS INVESTED,
             ROUND((c.TOTAL_AUM - NVL(inv.TOTAL_INVESTED,0)) / c.TOTAL_AUM * 100, 1) AS IDLE_PCT
        FROM CUSTOMERS c
        LEFT JOIN (
          SELECT CUSTOMER_ID, SUM(AMOUNT) AS TOTAL_INVESTED
            FROM CUSTOMER_PRODUCTS
           WHERE STATUS   = 'Active'
             AND CATEGORY IN ('reksa_dana','obligasi','saham','sbr','ori')
           GROUP BY CUSTOMER_ID
        ) inv ON c.CUSTOMER_ID = inv.CUSTOMER_ID
       WHERE c.TOTAL_AUM >= 100000000
         AND (c.TOTAL_AUM - NVL(inv.TOTAL_INVESTED,0)) / c.TOTAL_AUM > 0.40
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
              AND a.ALERT_TYPE  = 'idle_money'
              AND a.STATUS      = 'Open'
         )
    ) LOOP
      INSERT INTO ALERTS (
        CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
        METRIC_KEY, METRIC_VALUE, THRESHOLD
      ) VALUES (
        r.CUSTOMER_ID,
        'idle_money',
        CASE WHEN r.IDLE_PCT > 70 THEN 'high' ELSE 'medium' END,
        'Dana Idle ' || TO_CHAR(r.IDLE_PCT) || '% — Peluang Investasi',
        r.FULL_NAME || ' memiliki Rp ' ||
          TRIM(TO_CHAR(r.TOTAL_AUM - r.INVESTED, 'FM999,999,999,999')) ||
          ' (' || TO_CHAR(r.IDLE_PCT) || '% dari AUM) yang belum diinvestasikan.',
        'idle_cash_pct',
        TO_CHAR(r.IDLE_PCT),
        '40.00'
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 4. Over-concentration > 50% in one category ─────────────────────────
    FOR r IN (
      SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM,
             cp.CATEGORY,
             SUM(cp.AMOUNT) AS CAT_AMOUNT,
             ROUND(SUM(cp.AMOUNT) / c.TOTAL_AUM * 100, 1) AS CAT_PCT
        FROM CUSTOMERS c
        JOIN CUSTOMER_PRODUCTS cp
          ON cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS = 'Active'
       WHERE c.TOTAL_AUM > 0
         AND cp.CATEGORY IS NOT NULL
         AND cp.CATEGORY != ' '
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
              AND a.ALERT_TYPE  = 'concentration_risk'
              AND a.STATUS      = 'Open'
         )
       GROUP BY c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM, cp.CATEGORY
      HAVING ROUND(SUM(cp.AMOUNT) / c.TOTAL_AUM * 100, 1) > 50
    ) LOOP
      INSERT INTO ALERTS (
        CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
        METRIC_KEY, METRIC_VALUE, THRESHOLD
      ) VALUES (
        r.CUSTOMER_ID,
        'concentration_risk',
        CASE WHEN r.CAT_PCT > 70 THEN 'high' ELSE 'medium' END,
        'Risiko Konsentrasi ' || r.CATEGORY || ' ' || TO_CHAR(r.CAT_PCT) || '%',
        'Portofolio ' || r.FULL_NAME || ' terkonsentrasi ' || TO_CHAR(r.CAT_PCT) ||
          '% di kategori ' || r.CATEGORY || '. Rebalancing disarankan.',
        'concentration_pct',
        TO_CHAR(r.CAT_PCT),
        '50.00'
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 5. Tier upgrade opportunity ──────────────────────────────────────────
    FOR r IN (
      SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM, c.TIER
        FROM CUSTOMERS c
       WHERE c.TOTAL_AUM >= 250000000
         AND UPPER(c.TIER) NOT IN ('PRIVILEGE','PRIORITAS')
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
              AND a.ALERT_TYPE  = 'upgrade_opportunity'
              AND a.STATUS      = 'Open'
         )
    ) LOOP
      INSERT INTO ALERTS (
        CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
        METRIC_KEY, METRIC_VALUE, THRESHOLD
      ) VALUES (
        r.CUSTOMER_ID,
        'upgrade_opportunity',
        'high',
        'Peluang Upgrade Tier — AUM Rp ' ||
          TRIM(TO_CHAR(r.TOTAL_AUM, 'FM999,999,999,999')),
        r.FULL_NAME || ' memiliki AUM Rp ' ||
          TRIM(TO_CHAR(r.TOTAL_AUM, 'FM999,999,999,999')) ||
          ' dan berpotensi upgrade ke tier Prioritas/Privilege.',
        'aum_idr',
        TO_CHAR(ROUND(r.TOTAL_AUM)),
        '250000000'
      );
      v_created := v_created + 1;
    END LOOP;

    COMMIT;

  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      v_err_msg := SUBSTR(SQLERRM, 1, 2000);
  END;

  -- Update log row
  UPDATE SCHEDULER_LOG
     SET STATUS         = CASE WHEN v_err_msg IS NULL THEN 'SUCCESS' ELSE 'ERROR' END,
         ALERTS_CREATED = v_created,
         DURATION_MS    = ROUND(
                            EXTRACT(SECOND FROM (SYSTIMESTAMP - v_start)) * 1000 +
                            EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_start)) * 60000
                          ),
         ERROR_MSG       = v_err_msg
   WHERE LOG_ID = v_log_id;
  COMMIT;

EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      v_err_msg := SUBSTR(SQLERRM, 1, 2000);
      UPDATE SCHEDULER_LOG
         SET STATUS    = 'ERROR',
             ERROR_MSG = v_err_msg
       WHERE LOG_ID = v_log_id;
      COMMIT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END PROC_PUSH_MATURITY_ALERTS;`);
    console.log('[✓] PROC_PUSH_MATURITY_ALERTS recreated (horizon-aware)');
  } catch(e) {
    console.error('[✗] PROC_PUSH_MATURITY_ALERTS:', e.message);
  }

  // Verify procedure compiled cleanly
  try {
    const errR = await db.execute(
      `SELECT COUNT(*) AS CNT FROM USER_ERRORS WHERE NAME='PROC_PUSH_MATURITY_ALERTS'`
    );
    const errs = errR.rows?.[0]?.CNT || 0;
    console.log(errs === 0 ? '[✓] Procedure compiled without errors' : `[✗] ${errs} compile error(s)`);
  } catch(e) {}

  await db.close();
  console.log('[✓] Migration 16 complete — per-RM reminder horizon active');
})();
