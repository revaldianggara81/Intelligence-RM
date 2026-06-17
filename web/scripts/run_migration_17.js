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

  // ── 1. Create ALERT_THRESHOLDS table ─────────────────────────────────────
  await run('CREATE ALERT_THRESHOLDS',
    `CREATE TABLE ALERT_THRESHOLDS (
      THRESHOLD_ID    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      THRESHOLD_KEY   VARCHAR2(60)   NOT NULL,
      CATEGORY        VARCHAR2(50)   NOT NULL,
      LABEL           VARCHAR2(100)  NOT NULL,
      DESCRIPTION     VARCHAR2(500),
      THRESHOLD_VALUE NUMBER         NOT NULL,
      UNIT            VARCHAR2(20),
      MIN_VALUE       NUMBER,
      MAX_VALUE       NUMBER,
      IS_ACTIVE       NUMBER(1)      DEFAULT 1,
      UPDATED_BY      VARCHAR2(50)   DEFAULT 'SYSTEM',
      UPDATED_AT      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT UK_THRESH_KEY UNIQUE (THRESHOLD_KEY)
    )`);

  // ── 2. Seed threshold values ──────────────────────────────────────────────
  const thresholds = [
    ['PORTFOLIO_LOSS_TRIGGER_PCT',  'portfolio_loss',     'Trigger Kerugian Portfolio',    'Batas % kerugian unrealized yang memicu alert portfolio_loss. Nilai negatif.',       -7,         '%',    -50,  -1  ],
    ['PORTFOLIO_LOSS_HIGH_PCT',     'portfolio_loss',     'Ambang Severity HIGH',          'Di bawah nilai ini → severity HIGH (merah). Harus lebih kecil dari trigger.',       -12,        '%',    -50,  -1  ],
    ['IDLE_MONEY_MIN_AUM',          'idle_money',         'Minimum AUM yang Dicek',        'AUM minimum nasabah (IDR) agar idle money diperiksa.',                              100000000,  'IDR',  0,    null],
    ['IDLE_MONEY_TRIGGER_PCT',      'idle_money',         'Trigger % Dana Idle',           '% dari AUM yang belum diinvestasikan untuk memicu alert.',                          40,         '%',    1,    99  ],
    ['IDLE_MONEY_HIGH_PCT',         'idle_money',         'Ambang % Idle Severity HIGH',   '% idle money di atas nilai ini → severity HIGH.',                                   70,         '%',    1,    99  ],
    ['CONCENTRATION_TRIGGER_PCT',   'concentration_risk', 'Trigger Konsentrasi Aset',      '% alokasi satu kategori produk untuk memicu risiko konsentrasi.',                   50,         '%',    1,    99  ],
    ['CONCENTRATION_HIGH_PCT',      'concentration_risk', 'Ambang Konsentrasi HIGH',       '% konsentrasi di atas nilai ini → severity HIGH (merah).',                          70,         '%',    1,    99  ],
    ['UPGRADE_AUM_THRESHOLD',       'upgrade_opportunity','Ambang AUM Upgrade Tier',       'Minimum AUM (IDR) untuk memicu peluang upgrade ke tier Prioritas/Privilege.',       250000000,  'IDR',  0,    null],
  ];

  for (const [key, cat, label, desc, val, unit, minV, maxV] of thresholds) {
    try {
      await db.execute(
        `MERGE INTO ALERT_THRESHOLDS t
         USING (SELECT :1 AS K FROM DUAL) s
         ON (t.THRESHOLD_KEY = s.K)
         WHEN MATCHED THEN
           UPDATE SET THRESHOLD_VALUE = :2, UPDATED_AT = CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (THRESHOLD_KEY, CATEGORY, LABEL, DESCRIPTION,
                   THRESHOLD_VALUE, UNIT, MIN_VALUE, MAX_VALUE)
           VALUES (:3, :4, :5, :6, :7, :8, :9, :10)`,
        [key, val, key, cat, label, desc, val, unit, minV, maxV]
      );
      await db.execute('COMMIT');
      console.log('[✓] Seeded:', key, '=', val, unit);
    } catch(e) {
      console.error('[✗] Seed', key, ':', e.message);
    }
  }

  // ── 3. Recreate PROC_PUSH_MATURITY_ALERTS (threshold-aware) ──────────────
  console.log('[…] Recreating PROC_PUSH_MATURITY_ALERTS (threshold-aware)...');
  try {
    await db.execute(`CREATE OR REPLACE PROCEDURE PROC_PUSH_MATURITY_ALERTS (
  p_run_by IN VARCHAR2 DEFAULT 'SCHEDULER'
) AS
  v_start             TIMESTAMP  := SYSTIMESTAMP;
  v_created           NUMBER     := 0;
  v_log_id            NUMBER;
  v_err_msg           VARCHAR2(2000) := NULL;

  -- Configurable thresholds (read from ALERT_THRESHOLDS at runtime)
  v_loss_trigger      NUMBER := -7;
  v_loss_high         NUMBER := -12;
  v_idle_min_aum      NUMBER := 100000000;
  v_idle_trigger_pct  NUMBER := 40;
  v_idle_high_pct     NUMBER := 70;
  v_conc_trigger_pct  NUMBER := 50;
  v_conc_high_pct     NUMBER := 70;
  v_upgrade_aum       NUMBER := 250000000;
BEGIN
  -- Load dynamic thresholds (MAX() avoids NO_DATA_FOUND on empty result)
  SELECT NVL(MAX(THRESHOLD_VALUE), -7)        INTO v_loss_trigger     FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'PORTFOLIO_LOSS_TRIGGER_PCT' AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), -12)       INTO v_loss_high        FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'PORTFOLIO_LOSS_HIGH_PCT'    AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), 100000000) INTO v_idle_min_aum     FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'IDLE_MONEY_MIN_AUM'         AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), 40)        INTO v_idle_trigger_pct FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'IDLE_MONEY_TRIGGER_PCT'     AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), 70)        INTO v_idle_high_pct    FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'IDLE_MONEY_HIGH_PCT'        AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), 50)        INTO v_conc_trigger_pct FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'CONCENTRATION_TRIGGER_PCT'  AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), 70)        INTO v_conc_high_pct    FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'CONCENTRATION_HIGH_PCT'     AND IS_ACTIVE = 1;
  SELECT NVL(MAX(THRESHOLD_VALUE), 250000000) INTO v_upgrade_aum      FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'UPGRADE_AUM_THRESHOLD'      AND IS_ACTIVE = 1;

  -- Insert RUNNING log row
  INSERT INTO SCHEDULER_LOG (JOB_NAME, STATUS, RUN_BY)
  VALUES ('JOB_MATURITY_ALERTS', 'RUNNING', p_run_by)
  RETURNING LOG_ID INTO v_log_id;
  COMMIT;

  BEGIN

    -- ── 1. Maturity reminders — per-RM horizon from NOTIFICATION_PREFS ──────
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
        r.CUSTOMER_ID, 'maturity',
        CASE WHEN r.DAYS_LEFT <= r.HIGH_DAYS   THEN 'high'
             WHEN r.DAYS_LEFT <= r.MEDIUM_DAYS THEN 'medium'
             ELSE 'low' END,
        'Deposito Jatuh Tempo ' || TO_CHAR(r.DAYS_LEFT) || ' Hari',
        r.PRODUCT_NAME || ' senilai Rp ' ||
          TRIM(TO_CHAR(r.AMOUNT, 'FM999,999,999,999')) ||
          ' akan jatuh tempo dalam ' || TO_CHAR(r.DAYS_LEFT) || ' hari. Segera hubungi nasabah.',
        'days_to_maturity', TO_CHAR(r.HOLDING_ID), TO_CHAR(r.RM_HORIZON)
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 2. Portfolio loss > v_loss_trigger% ──────────────────────────────────
    FOR r IN (
      SELECT cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.AMOUNT, cp.RETURN_PCT
        FROM CUSTOMER_PRODUCTS cp
       WHERE cp.STATUS = 'Active'
         AND cp.RETURN_PCT IS NOT NULL
         AND cp.RETURN_PCT < v_loss_trigger
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
        r.CUSTOMER_ID, 'portfolio_loss',
        CASE WHEN r.RETURN_PCT < v_loss_high THEN 'high' ELSE 'medium' END,
        'Kerugian ' || r.PRODUCT_NAME || ' ' || TO_CHAR(r.RETURN_PCT) || '%',
        r.PRODUCT_NAME || ' mengalami kerugian unrealized ' ||
          TO_CHAR(r.RETURN_PCT) || '% dari pokok Rp ' ||
          TRIM(TO_CHAR(r.AMOUNT, 'FM999,999,999,999')) || '.',
        'portfolio_loss_pct', TO_CHAR(r.RETURN_PCT), TO_CHAR(v_loss_trigger)
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 3. Idle money > v_idle_trigger_pct% of AUM ───────────────────────────
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
       WHERE c.TOTAL_AUM >= v_idle_min_aum
         AND (c.TOTAL_AUM - NVL(inv.TOTAL_INVESTED,0)) / c.TOTAL_AUM > v_idle_trigger_pct / 100
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
        r.CUSTOMER_ID, 'idle_money',
        CASE WHEN r.IDLE_PCT > v_idle_high_pct THEN 'high' ELSE 'medium' END,
        'Dana Idle ' || TO_CHAR(r.IDLE_PCT) || '% — Peluang Investasi',
        r.FULL_NAME || ' memiliki Rp ' ||
          TRIM(TO_CHAR(r.TOTAL_AUM - r.INVESTED, 'FM999,999,999,999')) ||
          ' (' || TO_CHAR(r.IDLE_PCT) || '% dari AUM) yang belum diinvestasikan.',
        'idle_cash_pct', TO_CHAR(r.IDLE_PCT), TO_CHAR(v_idle_trigger_pct)
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 4. Over-concentration > v_conc_trigger_pct% in one category ──────────
    FOR r IN (
      SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM,
             cp.CATEGORY,
             SUM(cp.AMOUNT) AS CAT_AMOUNT,
             ROUND(SUM(cp.AMOUNT) / c.TOTAL_AUM * 100, 1) AS CAT_PCT
        FROM CUSTOMERS c
        JOIN CUSTOMER_PRODUCTS cp ON cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS = 'Active'
       WHERE c.TOTAL_AUM > 0
         AND cp.CATEGORY IS NOT NULL AND cp.CATEGORY != ' '
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
              AND a.ALERT_TYPE  = 'concentration_risk'
              AND a.STATUS      = 'Open'
         )
       GROUP BY c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM, cp.CATEGORY
      HAVING ROUND(SUM(cp.AMOUNT) / c.TOTAL_AUM * 100, 1) > v_conc_trigger_pct
    ) LOOP
      INSERT INTO ALERTS (
        CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
        METRIC_KEY, METRIC_VALUE, THRESHOLD
      ) VALUES (
        r.CUSTOMER_ID, 'concentration_risk',
        CASE WHEN r.CAT_PCT > v_conc_high_pct THEN 'high' ELSE 'medium' END,
        'Risiko Konsentrasi ' || r.CATEGORY || ' ' || TO_CHAR(r.CAT_PCT) || '%',
        'Portofolio ' || r.FULL_NAME || ' terkonsentrasi ' || TO_CHAR(r.CAT_PCT) ||
          '% di kategori ' || r.CATEGORY || '. Rebalancing disarankan.',
        'concentration_pct', TO_CHAR(r.CAT_PCT), TO_CHAR(v_conc_trigger_pct)
      );
      v_created := v_created + 1;
    END LOOP;

    -- ── 5. Tier upgrade opportunity ───────────────────────────────────────────
    FOR r IN (
      SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM, c.TIER
        FROM CUSTOMERS c
       WHERE c.TOTAL_AUM >= v_upgrade_aum
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
        r.CUSTOMER_ID, 'upgrade_opportunity', 'high',
        'Peluang Upgrade Tier — AUM Rp ' ||
          TRIM(TO_CHAR(r.TOTAL_AUM, 'FM999,999,999,999')),
        r.FULL_NAME || ' memiliki AUM Rp ' ||
          TRIM(TO_CHAR(r.TOTAL_AUM, 'FM999,999,999,999')) ||
          ' dan berpotensi upgrade ke tier Prioritas/Privilege.',
        'aum_idr', TO_CHAR(ROUND(r.TOTAL_AUM)), TO_CHAR(v_upgrade_aum)
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
         SET STATUS    = 'ERROR', ERROR_MSG = v_err_msg
       WHERE LOG_ID = v_log_id;
      COMMIT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END PROC_PUSH_MATURITY_ALERTS;`);
    console.log('[✓] PROC_PUSH_MATURITY_ALERTS recreated (threshold-aware)');
  } catch(e) {
    console.error('[✗] PROC_PUSH_MATURITY_ALERTS:', e.message);
  }

  // Verify
  try {
    const errR = await db.execute(
      `SELECT COUNT(*) AS CNT FROM USER_ERRORS WHERE NAME='PROC_PUSH_MATURITY_ALERTS'`
    );
    const errs = errR.rows?.[0]?.CNT || 0;
    console.log(errs === 0 ? '[✓] Procedure compiled without errors' : `[✗] ${errs} compile error(s) — check USER_ERRORS`);
  } catch(e) {}

  await db.close();
  console.log('[✓] Migration 17 complete — ALERT_THRESHOLDS ready, proc reads thresholds dynamically');
})();
