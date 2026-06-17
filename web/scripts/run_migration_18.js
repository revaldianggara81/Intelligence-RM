'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql) => {
    try { await db.execute(sql); console.log('[✓]', label); }
    catch(e) {
      if (/ORA-00955|ORA-01430|ORA-02261/.test(e.message))
        console.log('[~]', label, '(already exists)');
      else console.error('[✗]', label, e.message);
    }
  };

  // ── 1. MARKET_DATA ────────────────────────────────────────────────────────
  await run('CREATE MARKET_DATA',
    `CREATE TABLE MARKET_DATA (
      DATA_ID      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      SYMBOL       VARCHAR2(20)  NOT NULL,
      MARKET_NAME  VARCHAR2(100) NOT NULL,
      ASSET_CLASS  VARCHAR2(20)  DEFAULT 'equity',
      PRICE        NUMBER,
      PREV_CLOSE   NUMBER,
      CHANGE_ABS   NUMBER,
      CHANGE_PCT   NUMBER,
      DAY_HIGH     NUMBER,
      DAY_LOW      NUMBER,
      HIGH_52W     NUMBER,
      LOW_52W      NUMBER,
      SOURCE       VARCHAR2(30)  DEFAULT 'yahoo_finance',
      FETCHED_AT   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT UK_MARKET_SYMBOL UNIQUE (SYMBOL)
    )`);

  // ── 2. MARKET_ALERT_RULES ─────────────────────────────────────────────────
  await run('CREATE MARKET_ALERT_RULES',
    `CREATE TABLE MARKET_ALERT_RULES (
      RULE_ID               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      RULE_KEY              VARCHAR2(60)   NOT NULL,
      SYMBOL                VARCHAR2(20)   NOT NULL,
      RULE_TYPE             VARCHAR2(20)   NOT NULL,
      THRESHOLD_VALUE       NUMBER         NOT NULL,
      SEVERITY_TRIGGER      VARCHAR2(20)   DEFAULT 'medium',
      SEVERITY_HIGH_THRESH  NUMBER,
      AFFECTED_CATEGORIES   VARCHAR2(500),
      ALERT_TITLE_TMPL      VARCHAR2(300),
      ALERT_MSG_TMPL        VARCHAR2(2000),
      COOLDOWN_HOURS        NUMBER         DEFAULT 8,
      IS_ACTIVE             NUMBER(1)      DEFAULT 1,
      UPDATED_BY            VARCHAR2(50)   DEFAULT 'SYSTEM',
      UPDATED_AT            TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT UK_MARKET_RULE_KEY UNIQUE (RULE_KEY)
    )`);

  // ── 3. MARKET_ALERT_HISTORY ───────────────────────────────────────────────
  await run('CREATE MARKET_ALERT_HISTORY',
    `CREATE TABLE MARKET_ALERT_HISTORY (
      HISTORY_ID     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      RULE_KEY       VARCHAR2(60)  NOT NULL,
      TRIGGERED_AT   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
      TRIGGER_VALUE  NUMBER,
      ALERTS_CREATED NUMBER        DEFAULT 0
    )`);

  await run('IDX MARKET_ALERT_HISTORY RULE_KEY',
    `CREATE INDEX IDX_MAH_RULE_KEY ON MARKET_ALERT_HISTORY(RULE_KEY, TRIGGERED_AT DESC)`);

  // ── 4. Seed initial MARKET_DATA (BI Rate — manual source) ─────────────────
  try {
    await db.execute(
      `MERGE INTO MARKET_DATA t
       USING (SELECT 'BI_RATE' AS SYM FROM DUAL) s
       ON (t.SYMBOL = s.SYM)
       WHEN MATCHED THEN UPDATE SET FETCHED_AT = CURRENT_TIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (SYMBOL, MARKET_NAME, ASSET_CLASS, PRICE, PREV_CLOSE,
                 CHANGE_ABS, CHANGE_PCT, SOURCE)
         VALUES ('BI_RATE', 'BI Rate', 'rate', 5.75, 5.75, 0, 0, 'manual')`
    );
    await db.execute('COMMIT');
    console.log('[✓] Seeded: BI_RATE = 5.75%');
  } catch(e) { console.error('[✗] BI_RATE seed:', e.message); }

  // ── 5. Seed MARKET_ALERT_RULES ────────────────────────────────────────────
  const rules = [
    [
      'IHSG_DROP',
      '^JKSE', 'DROP_PCT', 1.5, 'medium', 3.0,
      'saham,reksa_dana',
      'IHSG turun {CHANGE_PCT}% — Portofolio Saham/RD Terdampak',
      'IHSG melemah {CHANGE_PCT}% hari ini. Nasabah memiliki portofolio saham & reksa dana senilai Rp {AFFECTED_AMT} yang berpotensi terkoreksi. Pertimbangkan untuk menghubungi nasabah dan menenangkan situasi.',
      6,
    ],
    [
      'IHSG_RALLY',
      '^JKSE', 'RALLY_PCT', 2.0, 'medium', null,
      'saham,reksa_dana',
      'IHSG rally {CHANGE_PCT}% — Peluang Investasi',
      'IHSG menguat signifikan {CHANGE_PCT}% hari ini — momentum positif untuk mempertimbangkan top-up investasi saham atau reksa dana. Nasabah memiliki eksposur aktif senilai Rp {AFFECTED_AMT}.',
      8,
    ],
    [
      'USDIDR_IDR_WEAK',
      'USDIDR=X', 'RISE_PCT', 1.0, 'medium', 2.0,
      'saham,obligasi',
      'Rupiah melemah {CHANGE_PCT}% — Portofolio Terdampak',
      'USD/IDR naik {CHANGE_PCT}% (Rupiah melemah). Portofolio saham & obligasi nasabah senilai Rp {AFFECTED_AMT} berpotensi terdampak volatilitas nilai tukar. Pantau posisi dan pertimbangkan langkah defensif.',
      6,
    ],
    [
      'USDIDR_IDR_STRONG',
      'USDIDR=X', 'FALL_PCT', 1.0, 'medium', null,
      'saham,reksa_dana,obligasi',
      'Rupiah menguat {CHANGE_PCT}% — Peluang Rebalancing',
      'USD/IDR turun {CHANGE_PCT}% (Rupiah menguat) — kondisi makro membaik. Momen baik untuk mengevaluasi dan mempertimbangkan penambahan portofolio aset IDR-denominated senilai Rp {AFFECTED_AMT}.',
      8,
    ],
  ];

  for (const [rk, sym, rt, tv, sev, sevHigh, cats, titleTmpl, msgTmpl, cooldown] of rules) {
    try {
      await db.execute(
        `MERGE INTO MARKET_ALERT_RULES t
         USING (SELECT :1 AS K FROM DUAL) s ON (t.RULE_KEY = s.K)
         WHEN MATCHED THEN UPDATE SET
           THRESHOLD_VALUE=:2, SEVERITY_HIGH_THRESH=:3, COOLDOWN_HOURS=:4,
           UPDATED_AT=CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (RULE_KEY, SYMBOL, RULE_TYPE, THRESHOLD_VALUE,
                   SEVERITY_TRIGGER, SEVERITY_HIGH_THRESH,
                   AFFECTED_CATEGORIES, ALERT_TITLE_TMPL, ALERT_MSG_TMPL, COOLDOWN_HOURS)
           VALUES (:5, :6, :7, :8, :9, :10, :11, :12, :13, :14)`,
        [rk, tv, sevHigh, cooldown,
         rk, sym, rt, tv, sev, sevHigh, cats, titleTmpl, msgTmpl, cooldown]
      );
      await db.execute('COMMIT');
      console.log('[✓] Seeded rule:', rk);
    } catch(e) { console.error('[✗] Rule', rk, ':', e.message); }
  }

  // ── 6. PROC_PUSH_MARKET_ALERTS ────────────────────────────────────────────
  console.log('[…] Creating PROC_PUSH_MARKET_ALERTS...');
  try {
    await db.execute(`CREATE OR REPLACE PROCEDURE PROC_PUSH_MARKET_ALERTS AS
  v_total_created NUMBER := 0;
BEGIN
  -- Loop each active market alert rule
  FOR rule IN (
    SELECT RULE_KEY, SYMBOL, RULE_TYPE, THRESHOLD_VALUE,
           SEVERITY_TRIGGER, SEVERITY_HIGH_THRESH,
           AFFECTED_CATEGORIES, ALERT_TITLE_TMPL, ALERT_MSG_TMPL,
           COOLDOWN_HOURS
      FROM MARKET_ALERT_RULES
     WHERE IS_ACTIVE = 1
     ORDER BY RULE_ID
  ) LOOP
    DECLARE
      v_price        NUMBER := NULL;
      v_change_pct   NUMBER := NULL;
      v_market_name  VARCHAR2(100) := NULL;
      v_last_run     TIMESTAMP := NULL;
      v_should_fire  NUMBER := 0;
      v_rule_created NUMBER := 0;
    BEGIN
      -- 1. Get latest market snapshot (MAX avoids NO_DATA_FOUND)
      SELECT MAX(PRICE), MAX(CHANGE_PCT), MAX(MARKET_NAME)
        INTO v_price, v_change_pct, v_market_name
        FROM MARKET_DATA WHERE SYMBOL = rule.SYMBOL;

      -- 2. Get last trigger for cooldown check
      SELECT MAX(TRIGGERED_AT)
        INTO v_last_run
        FROM MARKET_ALERT_HISTORY WHERE RULE_KEY = rule.RULE_KEY;

      -- 3. Only evaluate when data exists and cooldown has passed
      IF v_price IS NOT NULL THEN
        IF v_last_run IS NULL OR
           SYSTIMESTAMP - v_last_run >= NUMTODSINTERVAL(rule.COOLDOWN_HOURS, 'HOUR') THEN

          -- 4. Evaluate rule condition
          IF rule.RULE_TYPE = 'DROP_PCT'  AND v_change_pct  <= -(rule.THRESHOLD_VALUE) THEN v_should_fire := 1; END IF;
          IF rule.RULE_TYPE = 'RALLY_PCT' AND v_change_pct  >=  rule.THRESHOLD_VALUE   THEN v_should_fire := 1; END IF;
          IF rule.RULE_TYPE = 'RISE_PCT'  AND v_change_pct  >=  rule.THRESHOLD_VALUE   THEN v_should_fire := 1; END IF;
          IF rule.RULE_TYPE = 'FALL_PCT'  AND v_change_pct  <= -(rule.THRESHOLD_VALUE) THEN v_should_fire := 1; END IF;
          IF rule.RULE_TYPE = 'ABOVE'     AND v_price       >=  rule.THRESHOLD_VALUE   THEN v_should_fire := 1; END IF;
          IF rule.RULE_TYPE = 'BELOW'     AND v_price       <=  rule.THRESHOLD_VALUE   THEN v_should_fire := 1; END IF;

          IF v_should_fire = 1 THEN
            -- 5. Insert alert for each customer with affected product categories
            FOR cust IN (
              SELECT DISTINCT cp.CUSTOMER_ID,
                     SUM(cp.AMOUNT) AS AFFECTED_AMT
                FROM CUSTOMER_PRODUCTS cp
               WHERE cp.STATUS = 'Active'
                 AND (
                   rule.AFFECTED_CATEGORIES IS NULL
                   OR INSTR(',' || rule.AFFECTED_CATEGORIES || ',', ',' || cp.CATEGORY || ',') > 0
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM ALERTS a
                    WHERE a.CUSTOMER_ID = cp.CUSTOMER_ID
                      AND a.ALERT_TYPE  = 'market_event'
                      AND a.METRIC_KEY  = rule.RULE_KEY
                      AND a.STATUS      = 'Open'
                 )
               GROUP BY cp.CUSTOMER_ID
              HAVING SUM(cp.AMOUNT) > 0
            ) LOOP
              DECLARE
                v_sev     VARCHAR2(20) := rule.SEVERITY_TRIGGER;
                v_title   VARCHAR2(300);
                v_msg     VARCHAR2(2000);
                v_chg_str VARCHAR2(20)  := TO_CHAR(ABS(v_change_pct), 'FM990.000') || '%';
                v_chg_signed VARCHAR2(20) := TO_CHAR(v_change_pct, 'FM+990.000') || '%';
              BEGIN
                -- Escalate to HIGH if above high threshold
                IF rule.SEVERITY_HIGH_THRESH IS NOT NULL
                   AND ABS(v_change_pct) >= rule.SEVERITY_HIGH_THRESH THEN
                  v_sev := 'high';
                END IF;

                v_title := REPLACE(REPLACE(rule.ALERT_TITLE_TMPL,
                                   '{MARKET_NAME}', v_market_name),
                                   '{CHANGE_PCT}',  v_chg_str);
                v_msg   := REPLACE(REPLACE(REPLACE(rule.ALERT_MSG_TMPL,
                                   '{MARKET_NAME}',  v_market_name),
                                   '{CHANGE_PCT}',   v_chg_str),
                                   '{AFFECTED_AMT}',
                                   TRIM(TO_CHAR(cust.AFFECTED_AMT, 'FM999,999,999,999')));

                INSERT INTO ALERTS (
                  CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
                  METRIC_KEY, METRIC_VALUE, THRESHOLD
                ) VALUES (
                  cust.CUSTOMER_ID,
                  'market_event',
                  v_sev,
                  v_title,
                  v_msg,
                  rule.RULE_KEY,
                  v_chg_signed,
                  TO_CHAR(rule.THRESHOLD_VALUE)
                );
                v_rule_created  := v_rule_created  + 1;
                v_total_created := v_total_created + 1;
              EXCEPTION WHEN OTHERS THEN NULL;
              END;
            END LOOP; -- cust

            -- 6. Log this trigger to history (for cooldown tracking)
            INSERT INTO MARKET_ALERT_HISTORY (RULE_KEY, TRIGGER_VALUE, ALERTS_CREATED)
            VALUES (rule.RULE_KEY, v_change_pct, v_rule_created);
            COMMIT;

          END IF; -- v_should_fire
        END IF;   -- cooldown
      END IF;     -- data exists

    EXCEPTION WHEN OTHERS THEN NULL; -- skip rule on any error
    END;
  END LOOP; -- rules

  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK;
END PROC_PUSH_MARKET_ALERTS;`);
    console.log('[✓] PROC_PUSH_MARKET_ALERTS created');
  } catch(e) {
    console.error('[✗] Procedure:', e.message);
  }

  // Verify
  try {
    const r = await db.execute(`SELECT COUNT(*) AS C FROM USER_ERRORS WHERE NAME='PROC_PUSH_MARKET_ALERTS'`);
    const c = r.rows?.[0]?.C || 0;
    console.log(c === 0 ? '[✓] Procedure compiled clean' : `[✗] ${c} compile error(s)`);
  } catch(_) {}

  await db.close();
  console.log('[✓] Migration 18 complete — MARKET_DATA, MARKET_ALERT_RULES, PROC_PUSH_MARKET_ALERTS ready');
})();
