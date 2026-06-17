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

  // ── 1. PRODUCT_PERFORMANCE table ──────────────────────────────────────────
  await run('CREATE PRODUCT_PERFORMANCE',
    `CREATE TABLE PRODUCT_PERFORMANCE (
      PERF_ID          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      PRODUCT_ID       VARCHAR2(20)   NOT NULL,
      PRODUCT_NAME     VARCHAR2(200),
      CATEGORY         VARCHAR2(50),
      BENCHMARK_NAME   VARCHAR2(150),
      RETURN_1M        NUMBER,
      RETURN_3M        NUMBER,
      RETURN_6M        NUMBER,
      RETURN_1Y        NUMBER,
      BENCH_RETURN_1M  NUMBER,
      BENCH_RETURN_3M  NUMBER,
      BENCH_RETURN_6M  NUMBER,
      BENCH_RETURN_1Y  NUMBER,
      UPDATED_AT       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UPDATED_BY       VARCHAR2(50) DEFAULT 'SYSTEM',
      CONSTRAINT UK_PROD_PERF UNIQUE (PRODUCT_ID)
    )`);

  await run('IDX PRODUCT_PERFORMANCE CATEGORY',
    `CREATE INDEX IDX_PROD_PERF_CAT ON PRODUCT_PERFORMANCE(CATEGORY)`);

  // ── 2. Seed PRODUCT_PERFORMANCE ───────────────────────────────────────────
  // Format: [productId, productName, category, benchmarkName,
  //          r1m, r3m, r6m, r1y,  b1m, b3m, b6m, b1y]
  // Returns in % per period (not annualized), benchmarks use same period.
  const prods = [
    ['PROD001','Deposito Reguler 6 Bulan',       'deposito',
     'BI Rate (Bank Indonesia)',
      0.48, 1.45, 2.90, 5.80,   0.48, 1.44, 2.88, 5.75],

    ['PROD002','Deposito Prioritas 12 Bulan',     'deposito',
     'BI Rate (Bank Indonesia)',
      0.52, 1.60, 3.12, 6.20,   0.48, 1.44, 2.88, 5.75],

    ['PROD003','Reksa Dana Pendapatan Tetap',     'reksa_dana',
     'INFOVESTA Fixed Income Index',
     -0.30, 0.80, 1.50, 2.80,   0.90, 3.80, 7.20, 10.50],  // gap 3M = -3.0%

    ['PROD004','Reksa Dana Saham Bluechip',       'reksa_dana',
     'IHSG (^JKSE)',
     -4.50,-7.20,-9.80,-15.30, -0.30,-0.50,-1.20,-4.80],   // gap 3M = -6.7% HIGH

    ['PROD005','Obligasi Negara Ritel ORI024',    'obligasi',
     'ICBI (Indonesian Composite Bond Index)',
      0.20, 1.20, 2.30, 4.80,   1.10, 3.80, 7.60,11.20],   // gap 3M = -2.6%

    ['PROD006','Asuransi Jiwa Unit Link',         'asuransi',
     '60% IHSG + 40% Fixed Income',
     -1.50, 0.50, 1.00, 2.00,   0.50, 4.20, 8.40,12.60],   // gap 3M = -3.7%

    ['PROD007','Tabungan Danamon Lebih',          'tabungan',
     'BI Rate (Bank Indonesia)',
      0.16, 0.50, 1.00, 2.00,   0.16, 0.48, 0.96, 1.92],   // slight outperform

    ['PROD008','Deposito Reguler 3 Bulan',        'deposito',
     'BI Rate (Bank Indonesia)',
      0.46, 1.38, 2.76, 5.50,   0.48, 1.44, 2.88, 5.75],   // gap -0.06% no alert
  ];

  for (const [pid, pname, cat, bench, r1m, r3m, r6m, r1y, b1m, b3m, b6m, b1y] of prods) {
    try {
      await db.execute(
        `MERGE INTO PRODUCT_PERFORMANCE t
         USING (SELECT :1 AS K FROM DUAL) s ON (t.PRODUCT_ID = s.K)
         WHEN MATCHED THEN UPDATE SET
           PRODUCT_NAME=:2, CATEGORY=:3, BENCHMARK_NAME=:4,
           RETURN_1M=:5, RETURN_3M=:6, RETURN_6M=:7, RETURN_1Y=:8,
           BENCH_RETURN_1M=:9, BENCH_RETURN_3M=:10, BENCH_RETURN_6M=:11, BENCH_RETURN_1Y=:12,
           UPDATED_AT=CURRENT_TIMESTAMP, UPDATED_BY='SYSTEM'
         WHEN NOT MATCHED THEN
           INSERT (PRODUCT_ID,PRODUCT_NAME,CATEGORY,BENCHMARK_NAME,
                   RETURN_1M,RETURN_3M,RETURN_6M,RETURN_1Y,
                   BENCH_RETURN_1M,BENCH_RETURN_3M,BENCH_RETURN_6M,BENCH_RETURN_1Y)
           VALUES (:13,:14,:15,:16,:17,:18,:19,:20,:21,:22,:23,:24)`,
        [pid,pname,cat,bench,r1m,r3m,r6m,r1y,b1m,b3m,b6m,b1y,
         pid,pname,cat,bench,r1m,r3m,r6m,r1y,b1m,b3m,b6m,b1y]
      );
      await db.execute('COMMIT');
      const gap3m = r3m - b3m;
      console.log(`[✓] Seeded: ${pid} gap_3m=${gap3m.toFixed(2)}%`);
    } catch(e) { console.error('[✗] Seed', pid, e.message); }
  }

  // ── 3. Add underperform thresholds to ALERT_THRESHOLDS ───────────────────
  const thresholds = [
    ['UNDERPERFORM_TRIGGER_PCT','underperform_asset',
     'Trigger Underperform vs Benchmark',
     'Alert dipicu bila return produk lebih rendah dari benchmark sebesar ini (per periode 3M)',
      2.0, '%', 0.5, 15.0],
    ['UNDERPERFORM_HIGH_PCT','underperform_asset',
     'Eskalasi HIGH Underperform',
     'Alert diescalate ke HIGH severity bila gap underperformance melebihi nilai ini',
      6.0, '%', 1.0, 20.0],
  ];

  for (const [key, cat, label, desc, val, unit, mn, mx] of thresholds) {
    try {
      await db.execute(
        `MERGE INTO ALERT_THRESHOLDS t
         USING (SELECT :1 AS K FROM DUAL) s ON (t.THRESHOLD_KEY = s.K)
         WHEN MATCHED THEN UPDATE SET UPDATED_AT=CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (THRESHOLD_KEY,CATEGORY,LABEL,DESCRIPTION,THRESHOLD_VALUE,UNIT,MIN_VALUE,MAX_VALUE,IS_ACTIVE,UPDATED_BY)
           VALUES (:2,:3,:4,:5,:6,:7,:8,:9,1,'SYSTEM')`,
        [key, key, cat, label, desc, val, unit, mn, mx]
      );
      await db.execute('COMMIT');
      console.log('[✓] Threshold:', key);
    } catch(e) { console.error('[✗] Threshold', key, e.message); }
  }

  // ── 4. PROC_PUSH_UNDERPERFORM_ALERTS ─────────────────────────────────────
  console.log('[…] Creating PROC_PUSH_UNDERPERFORM_ALERTS...');
  try {
    await db.execute(`CREATE OR REPLACE PROCEDURE PROC_PUSH_UNDERPERFORM_ALERTS AS
  v_trigger_pct  NUMBER;
  v_high_pct     NUMBER;
  v_total        NUMBER := 0;
BEGIN
  -- Read dynamic thresholds
  SELECT MAX(THRESHOLD_VALUE) INTO v_trigger_pct
    FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'UNDERPERFORM_TRIGGER_PCT' AND IS_ACTIVE = 1;
  SELECT MAX(THRESHOLD_VALUE) INTO v_high_pct
    FROM ALERT_THRESHOLDS WHERE THRESHOLD_KEY = 'UNDERPERFORM_HIGH_PCT'   AND IS_ACTIVE = 1;

  v_trigger_pct := NVL(v_trigger_pct, 2);
  v_high_pct    := NVL(v_high_pct,    6);

  -- Loop underperforming products (gap_3m <= -trigger_pct)
  FOR prod IN (
    SELECT pp.PRODUCT_ID, pp.PRODUCT_NAME, pp.CATEGORY, pp.BENCHMARK_NAME,
           pp.RETURN_3M, pp.BENCH_RETURN_3M,
           (pp.RETURN_3M - pp.BENCH_RETURN_3M) AS GAP_3M,
           pp.RETURN_1M, (pp.RETURN_1M - pp.BENCH_RETURN_1M) AS GAP_1M
      FROM PRODUCT_PERFORMANCE pp
     WHERE pp.RETURN_3M IS NOT NULL
       AND pp.BENCH_RETURN_3M IS NOT NULL
       AND (pp.RETURN_3M - pp.BENCH_RETURN_3M) <= -(v_trigger_pct)
     ORDER BY (pp.RETURN_3M - pp.BENCH_RETURN_3M)
  ) LOOP

    -- Loop customers holding this product
    FOR cust IN (
      SELECT cp.CUSTOMER_ID, cp.AMOUNT, cp.PRODUCT_NAME AS CP_PNAME
        FROM CUSTOMER_PRODUCTS cp
       WHERE cp.PRODUCT_ID = prod.PRODUCT_ID
         AND cp.STATUS     = 'Active'
         AND cp.AMOUNT     > 0
         AND NOT EXISTS (
           SELECT 1 FROM ALERTS a
            WHERE a.CUSTOMER_ID = cp.CUSTOMER_ID
              AND a.ALERT_TYPE  = 'underperform'
              AND a.METRIC_KEY  = prod.PRODUCT_ID
              AND a.STATUS      = 'Open'
         )
    ) LOOP
      DECLARE
        v_sev     VARCHAR2(20) := 'medium';
        v_gap_abs NUMBER  := ABS(prod.GAP_3M);
        v_title   VARCHAR2(300);
        v_msg     VARCHAR2(2000);
        v_gap_str VARCHAR2(30) := TO_CHAR(prod.GAP_3M, 'FM+990.00') || '%';
        v_r3m_str VARCHAR2(30) := TO_CHAR(prod.RETURN_3M, 'FM+990.00') || '%';
        v_b3m_str VARCHAR2(30) := TO_CHAR(prod.BENCH_RETURN_3M, 'FM+990.00') || '%';
        v_amt_str VARCHAR2(50) := TRIM(TO_CHAR(cust.AMOUNT, 'FM999,999,999,999'));
      BEGIN
        IF v_gap_abs >= v_high_pct THEN v_sev := 'high'; END IF;

        v_title := NVL(cust.CP_PNAME, prod.PRODUCT_NAME) ||
                   ' Underperform ' || TO_CHAR(v_gap_abs, 'FM990.00') || '% vs Benchmark (3M)';

        v_msg   := 'Produk ' || NVL(cust.CP_PNAME, prod.PRODUCT_NAME) ||
                   ' membukukan return 3M sebesar ' || v_r3m_str ||
                   ', sementara benchmark ' || prod.BENCHMARK_NAME ||
                   ' mencapai ' || v_b3m_str ||
                   '. Gap underperformance: ' || v_gap_str ||
                   '. Nasabah memegang produk ini senilai Rp ' || v_amt_str ||
                   '. Evaluasi apakah perlu switch atau rebalancing portofolio.';

        INSERT INTO ALERTS (
          CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,
          METRIC_KEY, METRIC_VALUE, THRESHOLD
        ) VALUES (
          cust.CUSTOMER_ID,
          'underperform',
          v_sev,
          v_title,
          v_msg,
          prod.PRODUCT_ID,
          v_gap_str,
          TO_CHAR(-(v_trigger_pct), 'FM+990.00') || '%'
        );
        v_total := v_total + 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP; -- cust

  END LOOP; -- prod

  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK;
END PROC_PUSH_UNDERPERFORM_ALERTS;`);
    console.log('[✓] PROC_PUSH_UNDERPERFORM_ALERTS created');
  } catch(e) { console.error('[✗] Procedure:', e.message); }

  // Verify procedure compile
  try {
    const r = await db.execute(
      `SELECT COUNT(*) AS C FROM USER_ERRORS WHERE NAME='PROC_PUSH_UNDERPERFORM_ALERTS'`
    );
    const c = r.rows?.[0]?.C || 0;
    console.log(c === 0 ? '[✓] Procedure compiled clean' : `[✗] ${c} compile error(s)`);
  } catch(_) {}

  await db.close();
  console.log('[✓] Migration 19 complete — PRODUCT_PERFORMANCE, PROC_PUSH_UNDERPERFORM_ALERTS ready');
})();
