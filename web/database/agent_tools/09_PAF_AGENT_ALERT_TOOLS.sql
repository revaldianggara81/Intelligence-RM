-- =============================================================================
-- 09_PAF_AGENT_ALERT_TOOLS.sql
-- Creates all 4 PAF Agent tools for PAF_AGENT_ALERT
--
-- Tools created:
--   0. DANAMON_ALERT_PROFILE  (Select AI profile - xai.grok-3-fast)
--   1. TOOL_ALERT_ACTIVE_SQL    (SQL - ALERTS + CUSTOMERS + CUSTOMER_PRODUCTS + MARKET_DATA)
--   2. TOOL_ALERT_MATURITY_SQL  (SQL - CUSTOMER_PRODUCTS + CUSTOMERS - upcoming maturities)
--   3. TOOL_ALERT_PROFILE_RAG   (RAG - CUSTOMER_EMBEDDINGS)
--   4. TOOL_ALERT_NOTES_RAG     (RAG - MEETING_NOTES_EMBEDDINGS)
--
-- Output target: Narrative alert analysis matching
--   docs/Portfolio Alert AI Analysis.pdf format
--
-- Prerequisites:
--   1. OCI_CRED credential exists (xai.grok-3-fast via OCI GenAI)
--   2. Tables: ALERTS, CUSTOMER_PRODUCTS, CUSTOMERS, MARKET_DATA, RM_USERS populated
--   3. Embedding tables and vector indexes exist
--
-- Run as ADMIN (schema owner).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- SECTION 0 - Create DANAMON_ALERT_PROFILE
-- Uses xai.grok-3-fast for strong narrative output.
-- Includes MARKET_DATA for WHY DID THIS HAPPEN context.
-- =============================================================================

DECLARE
  v_profile_name   VARCHAR2(100) := 'DANAMON_ALERT_PROFILE';
  v_provider       VARCHAR2(100) := 'oci';
  v_model          VARCHAR2(100) := 'xai.grok-3-fast';
  v_credential     VARCHAR2(100) := 'OCI_CRED';
  v_region         VARCHAR2(100) := 'us-chicago-1';
  v_compartment_id VARCHAR2(200) := 'ocid1.compartment.oc1..aaaaaaaa3iceukudgqtfk2msr2mofvbvd6zvbimem2enzurv7fhuosdeqgla';
BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE(v_profile_name);
    DBMS_OUTPUT.PUT_LINE('[0] DANAMON_ALERT_PROFILE dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DBMS_CLOUD_AI.CREATE_PROFILE(
    profile_name => v_profile_name,
    attributes   =>
      '{"provider":"'            || v_provider       ||
      '","credential_name":"'    || v_credential      ||
      '","model":"'              || v_model           ||
      '","oci_compartment_id":"' || v_compartment_id  ||
      '","region":"'             || v_region          ||
      '","object_list":[' ||
        '{"owner":"DBN","name":"ALERTS",' ||
          '"description":"Alert nasabah Bank Danamon. Kolom: ALERT_ID (PK), CUSTOMER_ID (FK), ALERT_TYPE (maturity/portfolio_loss/kyc_expiry/cc_missed/campaign), SEVERITY (high/medium/low), TITLE, MESSAGE (detail lengkap termasuk nama produk dan nominal), METRIC_KEY (return_30d/days_to_maturity/portfolio_loss_pct/kyc_days_left), METRIC_VALUE (nilai numerik misalnya -18.3 untuk return), THRESHOLD (ambang batas pemicu alert), STATUS (Open/Acknowledged/Resolved), TRIGGERED_AT. Filter default: STATUS=Open."},' ||
        '{"owner":"DBN","name":"CUSTOMERS",' ||
          '"description":"Profil nasabah Bank Danamon. Kolom: CUSTOMER_ID (PK), FULL_NAME, AGE, TIER (prioritas/privilege/regular), TIER_LABEL, RISK_PROFILE (Conservative/Moderate/Aggressive), MONTHLY_INCOME, TOTAL_AUM (total aset dalam Rp), RM_USER_ID (FK ke RM_USERS), KYC_STATUS, KYC_EXPIRY, NOTES (catatan RM). JOIN ke ALERTS via CUSTOMER_ID."},' ||
        '{"owner":"DBN","name":"CUSTOMER_PRODUCTS",' ||
          '"description":"Semua produk/portofolio nasabah. Kolom: HOLDING_ID (PK), CUSTOMER_ID (FK), PRODUCT_NAME, CATEGORY (Deposito/Reksa Dana/Obligasi/Asuransi/Tabungan), AMOUNT (nominal investasi Rp), INTEREST_RATE (% p.a.), START_DATE, MATURITY_DATE, STATUS (Active/Matured/Redeemed), RETURN_PCT (return saat ini %). Gunakan untuk portofolio breakdown dan menghitung total sebelum vs sesudah penurunan."},' ||
        '{"owner":"DBN","name":"MARKET_DATA",' ||
          '"description":"Data pasar terkini. Kolom: SYMBOL (^JKSE=IHSG Jakarta Stock Exchange, USDIDR=X=Nilai tukar USD/IDR, BI_RATE=Suku bunga Bank Indonesia), MARKET_NAME (nama display), PRICE (harga terkini), PREV_CLOSE (harga sebelumnya), CHANGE_ABS (perubahan absolut), CHANGE_PCT (perubahan % -- negatif = turun), HIGH_52W, LOW_52W, FETCHED_AT. Gunakan untuk menjelaskan MENGAPA penurunan terjadi (konteks pasar)."},' ||
        '{"owner":"DBN","name":"RM_USERS",' ||
          '"description":"Data Relationship Manager. Kolom: USER_ID (PK), FULL_NAME, USERNAME, EMAIL, BRANCH."}'  ||
      ']}'
  );

  DBMS_OUTPUT.PUT_LINE('[0] DANAMON_ALERT_PROFILE created.');
  DBMS_OUTPUT.PUT_LINE('    Model   : xai.grok-3-fast via OCI GenAI');
  DBMS_OUTPUT.PUT_LINE('    Tables  : ALERTS, CUSTOMERS, CUSTOMER_PRODUCTS, MARKET_DATA, RM_USERS');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[0] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 1 - TOOL_ALERT_ACTIVE_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: PRIMARY tool - retrieves open alerts PLUS full portfolio breakdown
--          PLUS current market data (IHSG, USD/IDR).
--          One query gives the agent everything for sections 1-3 of the PDF:
--          WHAT HAPPENED + HOW BAD IS THE DAMAGE + market context for WHY.
-- Profile: DANAMON_ALERT_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_ACTIVE_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_ACTIVE_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool UTAMA untuk analisis alert. Mengambil alert aktif beserta portfolio LENGKAP ' ||
    'nasabah yang terkena alert DAN kondisi pasar terkini. ' ||
    'Output mencakup: detail alert (tipe, severity, metric_value, threshold, tanggal), ' ||
    'profil nasabah (nama, usia, AUM total, profil risiko, RM), ' ||
    'setiap produk yang dimiliki (nama, kategori, Rp, return%, jatuh tempo), ' ||
    'estimasi kerugian Rp (untuk portfolio_loss: amount * metric_value/100), ' ||
    'nilai portofolio sebelum vs perkiraan sesudah penurunan, ' ||
    'dan data pasar: IHSG change%, USD/IDR rate, BI Rate dari MARKET_DATA. ' ||
    'PHASE 1 -- panggil ini pertama kali untuk semua alert aktif nasabah.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_ACTIVE_SQL',
    attributes  =>
      '{"tool_type": "SQL",' ||
      ' "tool_params": {"profile_name": "DANAMON_ALERT_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "ALERTS",' ||
      '    "description": "Alert aktif. Kolom kunci: ALERT_TYPE, SEVERITY, MESSAGE, METRIC_KEY, METRIC_VALUE (nilai numerik: -18.3 = turun 18.3%), THRESHOLD, TRIGGERED_AT. Filter STATUS=Open. JOIN ke CUSTOMERS via CUSTOMER_ID."},' ||
      '   {"name": "CUSTOMERS",' ||
      '    "description": "Profil nasabah. FULL_NAME, AGE, TOTAL_AUM, RISK_PROFILE, TIER_LABEL, RM_USER_ID. JOIN ke ALERTS via CUSTOMER_ID."},' ||
      '   {"name": "CUSTOMER_PRODUCTS",' ||
      '    "description": "Semua produk aktif nasabah. LEFT JOIN ke CUSTOMERS via CUSTOMER_ID. CATEGORY, AMOUNT, RETURN_PCT, MATURITY_DATE. Untuk portfolio_loss alert: hitung TOTAL_BEFORE = SUM(AMOUNT) dan TOTAL_AFTER = SUM(AMOUNT * (1 + RETURN_PCT/100))."},' ||
      '   {"name": "MARKET_DATA",' ||
      '    "description": "Konteks pasar. SYMBOL: ^JKSE (IHSG), USDIDR=X (USD/IDR), BI_RATE. Kolom CHANGE_PCT = perubahan % (negatif=turun), PRICE = nilai terkini. Gunakan untuk bagian WHY DID THIS HAPPEN."}'  ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[1/4] TOOL_ALERT_ACTIVE_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_ACTIVE_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_ACTIVE_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool UTAMA untuk analisis alert. Mengambil alert aktif beserta portfolio LENGKAP ' ||
    'nasabah yang terkena alert DAN kondisi pasar terkini. ' ||
    'Output mencakup: detail alert (tipe, severity, metric_value, threshold, tanggal), ' ||
    'profil nasabah (nama, usia, AUM total, profil risiko, RM), ' ||
    'setiap produk yang dimiliki (nama, kategori, Rp, return%, jatuh tempo), ' ||
    'estimasi kerugian Rp (untuk portfolio_loss: amount * metric_value/100), ' ||
    'nilai portofolio sebelum vs perkiraan sesudah penurunan, ' ||
    'dan data pasar: IHSG change%, USD/IDR rate, BI Rate dari MARKET_DATA. ' ||
    'PHASE 1 -- panggil ini pertama kali untuk semua alert aktif nasabah.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_ACTIVE_SQL',
    attributes  =>
      '{"tool_type": "SQL",
       "tool_params": {"profile_name": "DANAMON_ALERT_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[1/4] TOOL_ALERT_ACTIVE_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- TOOL 2 - TOOL_ALERT_MATURITY_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Proactive maturity radar - finds products maturing soon and KYC
--          expiries. Used for the YOUR ACTION PLAN section: "In N days --
--          when Deposito matures, do not let it auto-renew without a call."
-- Profile: DANAMON_ALERT_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_MATURITY_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_MATURITY_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk radar jatuh tempo produk dan KYC expiry. ' ||
    'Digunakan dalam PHASE 2 untuk menyusun bagian YOUR ACTION PLAN: ' ||
    '"Dalam N hari saat Deposito jatuh tempo, jangan auto-rollover tanpa diskusi." ' ||
    'Output: produk yang jatuh tempo dalam 7/14/30/60/90 hari, total dana yang akan cair, ' ||
    'KYC yang akan kedaluwarsa, kategori produk untuk strategi reinvestasi. ' ||
    'Input opsional: customer_id (fokus satu nasabah), days_ahead (default 90), rm_user_id.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_MATURITY_SQL',
    attributes  =>
      '{"tool_type": "SQL",' ||
      ' "tool_params": {"profile_name": "DANAMON_ALERT_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "CUSTOMER_PRODUCTS",' ||
      '    "description": "Produk aktif nasabah. MATURITY_DATE untuk radar jatuh tempo. CATEGORY, AMOUNT, INTEREST_RATE. Gunakan: MATURITY_DATE BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE)+90. Filter STATUS=Active. JOIN ke CUSTOMERS untuk nama dan RM."},' ||
      '   {"name": "CUSTOMERS",' ||
      '    "description": "JOIN via CUSTOMER_ID. Kolom FULL_NAME, TIER, RM_USER_ID. KYC_EXPIRY untuk nasabah yang KYC-nya akan habis. Gunakan KYC_EXPIRY <= TRUNC(SYSDATE)+30 untuk KYC radar."}'  ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[2/4] TOOL_ALERT_MATURITY_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_MATURITY_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_MATURITY_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk radar jatuh tempo produk dan KYC expiry. ' ||
    'Digunakan dalam PHASE 2 untuk menyusun bagian YOUR ACTION PLAN: ' ||
    '"Dalam N hari saat Deposito jatuh tempo, jangan auto-rollover tanpa diskusi." ' ||
    'Output: produk yang jatuh tempo dalam 7/14/30/60/90 hari, total dana yang akan cair, ' ||
    'KYC yang akan kedaluwarsa, kategori produk untuk strategi reinvestasi. ' ||
    'Input opsional: customer_id (fokus satu nasabah), days_ahead (default 90), rm_user_id.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_MATURITY_SQL',
    attributes  =>
      '{"tool_type": "SQL", 
       "tool_params": {"profile_name": "DANAMON_ALERT_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[2/4] TOOL_ALERT_MATURITY_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- TOOL 3 - TOOL_ALERT_PROFILE_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Customer personality for WHAT TO SAY IN THE CALL section:
--          how does this customer react to losses? what communication style?
--          Also contains historical market recovery context (2020 COVID crash).
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_PROFILE_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk konteks karakter nasabah dan histori pasar. ' ||
    'Digunakan dalam PHASE 3 untuk menyusun WHAT TO SAY IN THE CALL: ' ||
    'bagaimana nasabah ini biasanya bereaksi terhadap kerugian/berita negatif, ' ||
    'gaya komunikasi yang efektif, dan apakah ada preseden historis yang relevan ' ||
    '(misal: 2020 COVID crash recovery -- pasar pulih dalam 5 bulan). ' ||
    'Query: "[nama nasabah] reaction loss market portfolio communication style" ' ||
    'atau "market recovery history Indonesia JCI 2020 2021 recovery time".';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_PROFILE_RAG',
    attributes  =>
      '{"tool_type": "RAG",' ||
      ' "tool_params": {"profile_name": "DANAMON_RAG_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[3/4] TOOL_ALERT_PROFILE_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 4 - TOOL_ALERT_NOTES_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Meeting history - how did RM handle similar situations before?
--          What commitments were made? Feeds WHAT TO SAY and THREE THINGS
--          NOT TO DO sections with real historical context.
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_NOTES_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk catatan pertemuan RM-nasabah yang relevan dengan situasi alert. ' ||
    'Digunakan dalam PHASE 3 untuk menemukan: ' ||
    'bagaimana nasabah bereaksi pada situasi serupa sebelumnya, ' ||
    'pendekatan yang berhasil atau gagal saat menangani kekhawatiran portofolio, ' ||
    'janji tindak lanjut yang masih terbuka, ' ||
    'keputusan reinvestasi atau penolakan produk sebelumnya. ' ||
    'Query harus spesifik: "[nama nasabah] portfolio loss concern market drop reaction" ' ||
    'atau "[nama nasabah] reinvestment discussion objection history".';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_NOTES_RAG',
    attributes  =>
      '{"tool_type": "RAG",' ||
      ' "tool_params": {"profile_name": "DANAMON_RAG_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "MEETING_NOTES_EMBEDDINGS",' ||
      '    "description": "Embedding catatan pertemuan RM-nasabah. Berisi: diskusi tentang penurunan pasar, reaksi nasabah saat mendengar kerugian, keputusan untuk tetap berinvestasi atau menarik dana, pendekatan komunikasi yang berhasil, dan janji tindak lanjut yang perlu diverifikasi."}'  ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[4/4] TOOL_ALERT_NOTES_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_NOTES_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk catatan pertemuan RM-nasabah yang relevan dengan situasi alert. ' ||
    'Digunakan dalam PHASE 3 untuk menemukan: ' ||
    'bagaimana nasabah bereaksi pada situasi serupa sebelumnya, ' ||
    'pendekatan yang berhasil atau gagal saat menangani kekhawatiran portofolio, ' ||
    'janji tindak lanjut yang masih terbuka, ' ||
    'keputusan reinvestasi atau penolakan produk sebelumnya. ' ||
    'Query harus spesifik: "[nama nasabah] portfolio loss concern market drop reaction" ' ||
    'atau "[nama nasabah] reinvestment discussion objection history".';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_NOTES_RAG',
    attributes  =>
      '{"tool_type": "RAG",
       "tool_params": {"profile_name": "DANAMON_RAG_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[4/4] TOOL_ALERT_NOTES_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/4] ERROR: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT tool_name, status,
       SUBSTR(description, 1, 70) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_ALERT%'
ORDER  BY tool_name;

SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name IN ('DANAMON_ALERT_PROFILE','DANAMON_RAG_PROFILE');

-- Alert summary for context
SELECT ALERT_TYPE, SEVERITY, COUNT(*) AS cnt
FROM   ALERTS WHERE STATUS = 'Open'
GROUP BY ALERT_TYPE, SEVERITY
ORDER BY CASE SEVERITY WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END;

-- Market data available
SELECT SYMBOL, MARKET_NAME, PRICE, CHANGE_PCT,
       TO_CHAR(FETCHED_AT,'DD Mon HH24:MI') AS last_update
FROM   MARKET_DATA
ORDER BY SYMBOL;

BEGIN
  DBMS_OUTPUT.PUT_LINE('All 4 alert tools ready.');
  DBMS_OUTPUT.PUT_LINE('Running tool-level tests below...');
  DBMS_OUTPUT.PUT_LINE('Next step: run 10_CREATE_PAF_AGENT_ALERT.sql');
END;
/


-- =============================================================================
-- SECTION 2 - TOOL TESTS
--
-- SQL tools  -> DBMS_CLOUD_AI.GENERATE(action => 'narrate') to test NL2SQL
-- RAG tools  -> DBMS_CLOUD_AI.GENERATE(action => 'chat')    to test semantic retrieval
--
-- These blocks intentionally continue on error so one failing test does not
-- stop the rest of the diagnostics.
-- =============================================================================


-- =============================================================================
-- TEST 1 - TOOL_ALERT_ACTIVE_SQL  (SQL / NL2SQL)
-- =============================================================================

-- 1a. Catalog registration
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_ALERT_ACTIVE_SQL';

-- 1b. Direct data sanity: active alerts joined to customers/RM
SELECT a.ALERT_ID,
       a.ALERT_TYPE,
       a.SEVERITY,
       a.METRIC_KEY,
       a.METRIC_VALUE,
       c.CUSTOMER_ID,
       c.FULL_NAME,
       c.TOTAL_AUM,
       ru.FULL_NAME AS RM_NAME,
       TO_CHAR(a.TRIGGERED_AT, 'DD Mon YYYY HH24:MI') AS triggered_at_fmt
FROM   ALERTS a
JOIN   CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID
LEFT JOIN RM_USERS ru ON ru.USER_ID = c.RM_USER_ID
WHERE  UPPER(a.STATUS) = 'OPEN'
ORDER  BY CASE LOWER(a.SEVERITY) WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          a.TRIGGERED_AT DESC
FETCH FIRST 10 ROWS ONLY;

-- 1c. Direct data sanity: active portfolio rows for customers with alerts
SELECT c.CUSTOMER_ID,
       c.FULL_NAME,
       cp.PRODUCT_NAME,
       cp.CATEGORY,
       cp.AMOUNT,
       cp.RETURN_PCT,
       ROUND(cp.AMOUNT * (1 + NVL(cp.RETURN_PCT, 0) / 100)) AS EST_VALUE_TODAY,
       cp.MATURITY_DATE
FROM   ALERTS a
JOIN   CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID
LEFT JOIN CUSTOMER_PRODUCTS cp
       ON cp.CUSTOMER_ID = c.CUSTOMER_ID
      AND UPPER(cp.STATUS) = 'ACTIVE'
WHERE  UPPER(a.STATUS) = 'OPEN'
ORDER  BY c.CUSTOMER_ID, cp.AMOUNT DESC NULLS LAST
FETCH FIRST 20 ROWS ONLY;

-- 1d. Market data required by WHY DID THIS HAPPEN
SELECT SYMBOL,
       MARKET_NAME,
       PRICE,
       CHANGE_PCT,
       TO_CHAR(FETCHED_AT, 'DD Mon YYYY HH24:MI') AS fetched_at_fmt
FROM   MARKET_DATA
WHERE  SYMBOL IN ('^JKSE', 'USDIDR=X', 'BI_RATE')
ORDER  BY SYMBOL;

-- 1e. Functional: NL2SQL via DANAMON_ALERT_PROFILE
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 1e: TOOL_ALERT_ACTIVE_SQL (NL2SQL narrate) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Ringkas semua alert aktif high severity. Sertakan nama nasabah, RM, produk yang terdampak, metric value, estimasi paper loss Rp, dan konteks market data IHSG/USDIDR.',
    profile_name => 'DANAMON_ALERT_PROFILE',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-1e] FAILED: ' || SQLERRM);
END;
/

 

-- =============================================================================
-- TEST 2 - TOOL_ALERT_MATURITY_SQL  (SQL / NL2SQL)
-- =============================================================================

-- 2a. Catalog registration
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_ALERT_MATURITY_SQL';

-- 2b. Direct data sanity: products maturing in 90 days
SELECT c.CUSTOMER_ID,
       c.FULL_NAME,
       c.TIER,
       c.KYC_STATUS,
       TO_CHAR(c.KYC_EXPIRY, 'DD Mon YYYY') AS kyc_expiry_fmt,
       cp.PRODUCT_NAME,
       cp.CATEGORY,
       cp.AMOUNT,
       cp.INTEREST_RATE,
       TO_CHAR(cp.MATURITY_DATE, 'DD Mon YYYY') AS maturity_date_fmt,
       ROUND(cp.MATURITY_DATE - SYSDATE) AS days_to_maturity
FROM   CUSTOMER_PRODUCTS cp
JOIN   CUSTOMERS c ON c.CUSTOMER_ID = cp.CUSTOMER_ID
WHERE  UPPER(cp.STATUS) = 'ACTIVE'
  AND  cp.MATURITY_DATE IS NOT NULL
  AND  cp.MATURITY_DATE BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 90
ORDER  BY cp.MATURITY_DATE ASC, cp.AMOUNT DESC
FETCH FIRST 20 ROWS ONLY;

-- 2c. Direct data sanity: KYC expiry in 30 days
SELECT c.CUSTOMER_ID,
       c.FULL_NAME,
       c.TIER,
       c.KYC_STATUS,
       TO_CHAR(c.KYC_EXPIRY, 'DD Mon YYYY') AS kyc_expiry_fmt,
       ROUND(c.KYC_EXPIRY - SYSDATE) AS days_to_kyc_expiry,
       ru.FULL_NAME AS RM_NAME
FROM   CUSTOMERS c
LEFT JOIN RM_USERS ru ON ru.USER_ID = c.RM_USER_ID
WHERE  c.KYC_EXPIRY IS NOT NULL
  AND  c.KYC_EXPIRY <= TRUNC(SYSDATE) + 30
ORDER  BY c.KYC_EXPIRY ASC
FETCH FIRST 20 ROWS ONLY;

-- 2d. Functional: NL2SQL via DANAMON_ALERT_PROFILE
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 2d: TOOL_ALERT_MATURITY_SQL (NL2SQL narrate) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Cari semua produk aktif yang jatuh tempo dalam 90 hari dan nasabah dengan KYC expiry dalam 30 hari. Tampilkan nama nasabah, produk, nominal Rp, tanggal, hari tersisa, dan RM.',
    profile_name => 'DANAMON_ALERT_PROFILE',
    action       => 'narrate'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-2d] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST 3 - TOOL_ALERT_PROFILE_RAG  (RAG / Vector)
-- =============================================================================

-- 3a. Catalog registration
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_ALERT_PROFILE_RAG';

-- 3b. Embedding table health
SELECT COUNT(*)                     AS total_rows,
       COUNT(EMBEDDING)             AS populated_embeddings,
       COUNT(*) - COUNT(EMBEDDING)  AS null_embeddings,
       COUNT(DISTINCT CUSTOMER_ID)  AS distinct_customers
FROM   CUSTOMER_EMBEDDINGS;

-- 3c. Content type breakdown
SELECT CONTENT_TYPE, COUNT(*) AS cnt
FROM   CUSTOMER_EMBEDDINGS
GROUP  BY CONTENT_TYPE
ORDER  BY cnt DESC;

-- 3d. Sample profile embedding rows
SELECT CUSTOMER_ID,
       CONTENT_TYPE,
       SUBSTR(CONTENT, 1, 120) AS content_preview,
       VECTOR_DIMENSION(EMBEDDING) AS embed_dim
FROM   CUSTOMER_EMBEDDINGS
FETCH FIRST 5 ROWS ONLY;

-- 3e. Vector index health
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'CUSTOMER_EMBEDDINGS'
  AND  index_name LIKE '%VEC%';

-- 3f. Functional: RAG retrieval via DANAMON_ALERT_PROFILE
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 3f: TOOL_ALERT_PROFILE_RAG (GENERATE chat/RAG) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Untuk konteks alert portfolio loss, jelaskan gaya komunikasi dan preferensi risiko nasabah CUST003. Fokus pada bagaimana RM harus menyampaikan penurunan pasar.',
    profile_name => 'DANAMON_ALERT_PROFILE',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-3f] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST 4 - TOOL_ALERT_NOTES_RAG  (RAG / Vector)
-- =============================================================================

-- 4a. Catalog registration
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_ALERT_NOTES_RAG';

-- 4b. Embedding table health
SELECT COUNT(*)                     AS total_rows,
       COUNT(EMBEDDING)             AS populated_embeddings,
       COUNT(*) - COUNT(EMBEDDING)  AS null_embeddings,
       COUNT(DISTINCT CUSTOMER_ID)  AS distinct_customers,
       COUNT(DISTINCT NOTE_ID)      AS distinct_notes
FROM   MEETING_NOTES_EMBEDDINGS;

-- 4c. Sample meeting note embedding rows
SELECT CUSTOMER_ID,
       NOTE_ID,
       SUBSTR(CONTENT, 1, 120) AS content_preview,
       VECTOR_DIMENSION(EMBEDDING) AS embed_dim
FROM   MEETING_NOTES_EMBEDDINGS
FETCH FIRST 5 ROWS ONLY;

-- 4d. Vector index health
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'MEETING_NOTES_EMBEDDINGS'
  AND  index_name LIKE '%VEC%';

-- 4e. Functional: RAG retrieval via DANAMON_ALERT_PROFILE
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 4e: TOOL_ALERT_NOTES_RAG (GENERATE chat/RAG) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Cari histori pertemuan tentang reaksi nasabah terhadap portfolio loss, penurunan pasar, reksa dana saham, atau keberatan investasi. Berikan poin yang relevan untuk skrip telepon RM.',
    profile_name => 'DANAMON_ALERT_PROFILE',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-4e] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST SUMMARY
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('==========================================');
  DBMS_OUTPUT.PUT_LINE('ALERT TOOL TESTS COMPLETE');
  DBMS_OUTPUT.PUT_LINE('Expected pass criteria:');
  DBMS_OUTPUT.PUT_LINE('  1. All TOOL_ALERT_* rows appear in USER_AI_AGENT_TOOLS.');
  DBMS_OUTPUT.PUT_LINE('  2. SQL sanity queries return data or valid empty sets.');
  DBMS_OUTPUT.PUT_LINE('  3. GENERATE narrate/chat blocks print a response, not FAILED.');
  DBMS_OUTPUT.PUT_LINE('Next step if all pass: run 10_CREATE_PAF_AGENT_ALERT.sql');
  DBMS_OUTPUT.PUT_LINE('==========================================');
END;
/
