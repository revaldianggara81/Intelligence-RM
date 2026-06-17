'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql) => {
    try { await db.execute(sql); console.log('[✓]', label); }
    catch(e) {
      if (/ORA-00955|ORA-01430|ORA-02261|ORA-02291/.test(e.message))
        console.log('[~]', label, '(already exists)');
      else console.error('[✗]', label, e.message);
    }
  };

  // ── 1. SCHEDULER_LOG reference table ─────────────────────────────────────
  await run('CREATE SCHEDULER_LOG', `CREATE TABLE SCHEDULER_LOG (
    LOG_ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    JOB_NAME       VARCHAR2(100)  NOT NULL,
    RUN_AT         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    STATUS         VARCHAR2(20)   DEFAULT 'RUNNING',
    ALERTS_CREATED NUMBER         DEFAULT 0,
    ALERTS_UPDATED NUMBER         DEFAULT 0,
    DURATION_MS    NUMBER,
    ERROR_MSG      VARCHAR2(2000),
    RUN_BY         VARCHAR2(100)  DEFAULT 'SCHEDULER'
  )`);

  await run('IDX_SLOG_JOB_RUN',
    `CREATE INDEX IDX_SLOG_JOB_RUN ON SCHEDULER_LOG (JOB_NAME, RUN_AT DESC)`);

  // ── 2. PL/SQL Stored Procedure ────────────────────────────────────────────
  // Mirrors Node.js alertService.detectAlerts() but runs inside Oracle
  // so DBMS_SCHEDULER can call it without any app-layer dependency.
  console.log('[…] Creating PROC_PUSH_MATURITY_ALERTS ...');
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

    -- ── 1. Maturity reminders (products maturing within 90 days) ────────────
    FOR r IN (
      SELECT cp.HOLDING_ID, cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.AMOUNT,
             ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_LEFT
        FROM CUSTOMER_PRODUCTS cp
       WHERE cp.STATUS = 'Active'
         AND cp.MATURITY_DATE IS NOT NULL
         AND ROUND(cp.MATURITY_DATE - SYSDATE) BETWEEN 0 AND 90
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
        CASE WHEN r.DAYS_LEFT <= 14 THEN 'high'
             WHEN r.DAYS_LEFT <= 30 THEN 'medium'
             ELSE 'low' END,
        'Deposito Jatuh Tempo ' || TO_CHAR(r.DAYS_LEFT) || ' Hari',
        r.PRODUCT_NAME || ' senilai Rp ' ||
          TRIM(TO_CHAR(r.AMOUNT, 'FM999,999,999,999')) ||
          ' akan jatuh tempo dalam ' || TO_CHAR(r.DAYS_LEFT) || ' hari. Segera hubungi nasabah.',
        'days_to_maturity',
        TO_CHAR(r.HOLDING_ID),
        '90'
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
          ' (' || TO_CHAR(r.IDLE_PCT) || '% dari AUM) yang belum diinvestasikan. Rekomendasikan produk sesuai profil risiko.',
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
          '% di kategori ' || r.CATEGORY || ' (Rp ' ||
          TRIM(TO_CHAR(r.CAT_AMOUNT, 'FM999,999,999,999')) ||
          '). Rebalancing disarankan untuk diversifikasi risiko.',
        'concentration_pct',
        TO_CHAR(r.CAT_PCT),
        '50.00'
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 5. Tier upgrade opportunity (AUM >= 250 juta, bukan Privilege) ───────
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
          ' dan berpotensi upgrade ke tier Prioritas/Privilege. Hubungi segera untuk menawarkan benefit eksklusif.',
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

  -- Update log row with final status
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
    console.log('[✓] CREATE PROC_PUSH_MATURITY_ALERTS');
  } catch(e) {
    console.error('[✗] PROC_PUSH_MATURITY_ALERTS:', e.message);
  }

  // ── 3. Drop existing DBMS_SCHEDULER job (idempotent) ─────────────────────
  try {
    await db.execute(`BEGIN DBMS_SCHEDULER.DROP_JOB('JOB_MATURITY_ALERTS', FORCE => TRUE); END;`);
    console.log('[~] Dropped existing JOB_MATURITY_ALERTS');
  } catch(_) { /* job did not exist — OK */ }

  // ── 4. Create DBMS_SCHEDULER job (daily at 01:00 UTC = 08:00 WIB) ─────────
  try {
    await db.execute(`BEGIN
  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'JOB_MATURITY_ALERTS',
    job_type        => 'STORED_PROCEDURE',
    job_action      => 'PROC_PUSH_MATURITY_ALERTS',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=DAILY;BYHOUR=1;BYMINUTE=0;BYSECOND=0',
    end_date        => NULL,
    enabled         => TRUE,
    auto_drop       => FALSE,
    comments        => 'Daily auto-detect and push portfolio alerts for all customers. 01:00 UTC = 08:00 WIB.'
  );
END;`);
    console.log('[✓] Created JOB_MATURITY_ALERTS (FREQ=DAILY;BYHOUR=1)');
  } catch(e) {
    console.error('[✗] CREATE_JOB:', e.message);
  }

  // ── 5. Run once now to generate initial alerts ────────────────────────────
  console.log('[…] Running PROC_PUSH_MATURITY_ALERTS (initial seed) ...');
  try {
    await db.execute(`BEGIN PROC_PUSH_MATURITY_ALERTS('MIGRATION'); END;`);
    console.log('[✓] Initial alert scan complete');
    // Show what was logged
    const logResult = await db.execute(
      `SELECT STATUS, ALERTS_CREATED, DURATION_MS
         FROM SCHEDULER_LOG
        WHERE JOB_NAME = 'JOB_MATURITY_ALERTS'
        ORDER BY RUN_AT DESC
        FETCH FIRST 1 ROWS ONLY`
    );
    const row = logResult.rows?.[0];
    if (row) {
      console.log(`    Status: ${row.STATUS} | Alerts created: ${row.ALERTS_CREATED} | Duration: ${row.DURATION_MS}ms`);
    }
  } catch(e) {
    console.error('[✗] Initial run:', e.message);
  }

  await db.close();
  console.log('[✓] Migration 13 complete');
})();
