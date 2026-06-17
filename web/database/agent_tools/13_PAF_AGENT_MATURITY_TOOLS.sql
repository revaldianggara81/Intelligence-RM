-- =============================================================================
-- 13_PAF_AGENT_MATURITY_TOOLS.sql
-- Creates all PAF tools for PAF_AGENT_MATURITY (In-Database Agent)
--
-- Tools created:
--   0. DANAMON_MATURITY_PROFILE  (Select AI / NL2SQL profile - xai.grok-3-fast)
--   1. TOOL_MATURITY_HOLDINGS_SQL  (SQL - maturing deposits + holdings + alerts)
--   2. TOOL_MATURITY_PROFILE_SQL   (SQL - full customer profile + AUM + income)
--   3. TOOL_MATURITY_PRODUCTS_SQL  (SQL - product catalog alternatives with rates)
--   4. TOOL_MATURITY_CONTEXT_RAG   (RAG - product & market context)
--   5. TOOL_MATURITY_NOTES_RAG     (RAG - meeting notes + customer history)
--
-- Output target: Narrative-style maturity reminder matching
--   docs/Maturity Reminder AI Analysis.pdf format
--
-- Prerequisites:
--   1. OCI_CRED credential exists (xai/Grok via OCI GenAI)
--   2. Tables: CUSTOMERS, CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS,
--              MEETING_NOTES, RM_USERS populated
--   3. Vector embedding tables and indexes exist
--      (run 07_POPULATE_EMBEDDINGS.sql first)
--
-- Run as ADMIN (schema owner).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- SECTION 0 - Create DANAMON_MATURITY_PROFILE
-- Uses xai.grok-3-fast for strong narrative/reasoning output quality
-- Tables in scope: CUSTOMERS, CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS,
--                  MEETING_NOTES, RM_USERS
-- =============================================================================

DECLARE
  v_profile_name     VARCHAR2(100) := 'DANAMON_MATURITY_PROFILE';
  v_provider         VARCHAR2(100) := 'oci';
  v_model            VARCHAR2(100) := 'xai.grok-3-fast';
  v_credential       VARCHAR2(100) := 'OCI_CRED';
  v_region           VARCHAR2(100) := 'us-chicago-1';
  v_compartment_id   VARCHAR2(200) := 'ocid1.compartment.oc1..aaaaaaaa3iceukudgqtfk2msr2mofvbvd6zvbimem2enzurv7fhuosdeqgla';
BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE(v_profile_name);
    DBMS_OUTPUT.PUT_LINE('[0] DANAMON_MATURITY_PROFILE dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DBMS_CLOUD_AI.CREATE_PROFILE(
    profile_name => v_profile_name,
    attributes   =>
      '{"provider":"'         || v_provider       ||
      '","credential_name":"' || v_credential      ||
      '","model":"'           || v_model           ||
      '","oci_compartment_id":"' || v_compartment_id ||
      '","region":"'          || v_region          ||
      '","object_list":[' ||
        '{"owner":"ADMIN","name":"CUSTOMERS",' ||
          '"description":"Profil nasabah Bank Danamon. Kolom: CUSTOMER_ID (PK VARCHAR2), FULL_NAME, AGE, TIER (prioritas/privilege/regular), TIER_LABEL, RISK_PROFILE (Conservative/Moderate/Aggressive), MONTHLY_INCOME (total pendapatan bulanan dalam Rp), TOTAL_AUM (total aset dalam Rp), RM_USER_ID (FK), KYC_STATUS (Verified/Expired/Pending), KYC_EXPIRY, NOTES (catatan RM termasuk sumber pendapatan spesifik), EMAIL, PHONE."},' ||
        '{"owner":"ADMIN","name":"CUSTOMER_PRODUCTS",' ||
          '"description":"Produk/portofolio yang dimiliki nasabah. Kolom: HOLDING_ID (PK), CUSTOMER_ID (FK), PRODUCT_NAME, CATEGORY (Deposito/Reksa Dana/Obligasi/Asuransi/Tabungan), AMOUNT (nominal Rp), INTEREST_RATE (% per tahun), PURCHASE_DATE, START_DATE, MATURITY_DATE, STATUS (Active/Matured/Redeemed), RETURN_PCT. DAYS_TO_MATURITY = ROUND(MATURITY_DATE - SYSDATE)."},' ||
        '{"owner":"ADMIN","name":"PRODUCT_CATALOG",' ||
          '"description":"Katalog produk investasi aktif di Bank Danamon. Kolom: PRODUCT_ID (PK), PRODUCT_NAME, CATEGORY (Deposito/Reksa Dana/Obligasi/Asuransi/Tabungan), DESCRIPTION, INTEREST_RATE (% p.a.), MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL (Low/Medium/High), FEATURES, IS_ACTIVE (1=active)."},' ||
        '{"owner":"ADMIN","name":"ALERTS",' ||
          '"description":"Alert aktif nasabah. Kolom: ALERT_ID (PK), CUSTOMER_ID (FK), ALERT_TYPE (maturity/portfolio_loss/kyc_expiry/cc_missed/campaign), SEVERITY (high/medium/low), TITLE, MESSAGE (detail lengkap termasuk nominal), METRIC_KEY, METRIC_VALUE, THRESHOLD, STATUS (Open/Acknowledged/Resolved), TRIGGERED_AT."},' ||
        '{"owner":"ADMIN","name":"MEETING_NOTES",' ||
          '"description":"Catatan pertemuan RM dengan nasabah. Kolom: NOTE_ID (PK), CUSTOMER_ID (FK), RM_USER_ID (FK), NOTE_DATE, TITLE, CONTENT (isi diskusi, pertanyaan nasabah, keputusan), TAGS, CREATED_AT."},' ||
        '{"owner":"ADMIN","name":"RM_USERS",' ||
          '"description":"Data Relationship Manager. Kolom: USER_ID (PK), FULL_NAME, USERNAME, EMAIL, BRANCH."}'  ||
      ']}'
  );

  DBMS_OUTPUT.PUT_LINE('[0] DANAMON_MATURITY_PROFILE created.');
  DBMS_OUTPUT.PUT_LINE('    Model   : xai.grok-3-fast via OCI GenAI');
  DBMS_OUTPUT.PUT_LINE('    Tables  : CUSTOMERS, CUSTOMER_PRODUCTS, PRODUCT_CATALOG,');
  DBMS_OUTPUT.PUT_LINE('              ALERTS, MEETING_NOTES, RM_USERS');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[0] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 1 - TOOL_MATURITY_HOLDINGS_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Retrieves maturing deposits PLUS any open alerts for each customer.
--          Gives the agent full situational context: deposit amount + maturity +
--          any secondary issues (missed CC, KYC expiry, portfolio loss).
-- Profile: DANAMON_MATURITY_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MATURITY_HOLDINGS_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_MATURITY_HOLDINGS_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool utama untuk analisis jatuh tempo. Mengambil semua deposito aktif yang ' ||
    'akan jatuh tempo (default: 60 hari) beserta profil singkat nasabah dan semua alert aktif. ' ||
    'Output mencakup: nama nasabah, nominal deposito (Rp), tanggal jatuh tempo, hari tersisa, ' ||
    'estimasi bunga yang diterima, profil risiko, tier, total AUM, penghasilan bulanan, ' ||
    'serta semua alert Open (cc_missed, kyc_expiry, portfolio_loss, dll). ' ||
    'Tabel: CUSTOMER_PRODUCTS JOIN CUSTOMERS LEFT JOIN ALERTS (STATUS=Open). ' ||
    'Input opsional: customer_id (untuk analisis satu nasabah), days_ahead (default 60).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name        => 'TOOL_MATURITY_HOLDINGS_SQL',
    tool_type        => 'SQL',
    tool_description => v_desc,
    tool_metadata    => JSON_OBJECT(
      'profile_name' VALUE 'DANAMON_MATURITY_PROFILE',
      'sql_query'    VALUE
        'SELECT ' ||
        '  c.CUSTOMER_ID, c.FULL_NAME, c.AGE, ' ||
        '  c.RISK_PROFILE, c.TIER, c.TIER_LABEL, ' ||
        '  c.TOTAL_AUM, c.MONTHLY_INCOME, ' ||
        '  c.KYC_STATUS, c.KYC_EXPIRY, ' ||
        '  c.NOTES AS CUSTOMER_NOTES, ' ||
        '  cp.HOLDING_ID, cp.PRODUCT_NAME AS DEPOSIT_NAME, ' ||
        '  cp.AMOUNT AS DEPOSIT_AMOUNT, ' ||
        '  cp.INTEREST_RATE, ' ||
        '  cp.START_DATE, cp.PURCHASE_DATE, ' ||
        '  cp.MATURITY_DATE, ' ||
        '  ROUND(cp.MATURITY_DATE - SYSDATE)                               AS DAYS_TO_MATURITY, ' ||
        '  TO_CHAR(cp.MATURITY_DATE, ''DD Mon YYYY'')                       AS MATURITY_DATE_FMT, ' ||
        '  ROUND(cp.AMOUNT * cp.INTEREST_RATE / 100 / 12 * ' ||
        '    MONTHS_BETWEEN(cp.MATURITY_DATE, NVL(cp.START_DATE, cp.PURCHASE_DATE))) ' ||
        '                                                                   AS EST_INTEREST_EARNED, ' ||
        '  ROUND(cp.AMOUNT * cp.INTEREST_RATE / 100)                       AS ANNUAL_INTEREST, ' ||
        '  a.ALERT_TYPE, a.SEVERITY  AS ALERT_SEVERITY, ' ||
        '  a.TITLE    AS ALERT_TITLE, ' ||
        '  a.MESSAGE  AS ALERT_MESSAGE, ' ||
        '  a.METRIC_VALUE, ' ||
        '  TO_CHAR(a.TRIGGERED_AT, ''DD Mon YYYY'')                         AS ALERT_DATE ' ||
        'FROM CUSTOMER_PRODUCTS cp ' ||
        'JOIN CUSTOMERS c ON c.CUSTOMER_ID = cp.CUSTOMER_ID ' ||
        'LEFT JOIN ALERTS a ' ||
        '  ON  a.CUSTOMER_ID = cp.CUSTOMER_ID ' ||
        '  AND a.STATUS      = ''Open'' ' ||
        '  AND a.ALERT_TYPE != ''maturity'' ' ||
        'WHERE cp.CATEGORY     = ''Deposito'' ' ||
        '  AND cp.STATUS       = ''Active'' ' ||
        '  AND cp.MATURITY_DATE IS NOT NULL ' ||
        '  AND cp.MATURITY_DATE - SYSDATE <= 60 ' ||
        'ORDER BY cp.MATURITY_DATE ASC, c.TOTAL_AUM DESC, a.SEVERITY ASC'
    )
  );

  DBMS_OUTPUT.PUT_LINE('[1/5] TOOL_MATURITY_HOLDINGS_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 2 - TOOL_MATURITY_PROFILE_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Deep customer profile for a single customer: full portfolio breakdown,
--          income sources from NOTES, all product holdings, KYC status.
--          Used to build the "ABOUT THIS CUSTOMER" narrative section.
-- Profile: DANAMON_MATURITY_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MATURITY_PROFILE_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_MATURITY_PROFILE_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil profil LENGKAP satu nasabah: semua produk yang dimiliki ' ||
    'termasuk yang sudah matured/redeemed, detail penghasilan bulanan, catatan RM, dan ' ||
    'KYC status. Digunakan untuk membangun narasi "ABOUT THIS CUSTOMER" yang kaya konteks. ' ||
    'Input wajib: customer_id. ' ||
    'Output: baris per produk + kolom profil nasabah yang direpeat tiap baris.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name        => 'TOOL_MATURITY_PROFILE_SQL',
    tool_type        => 'SQL',
    tool_description => v_desc,
    tool_metadata    => JSON_OBJECT(
      'profile_name' VALUE 'DANAMON_MATURITY_PROFILE',
      'sql_query'    VALUE
        'SELECT ' ||
        '  c.CUSTOMER_ID, c.FULL_NAME, c.EMAIL, c.PHONE, ' ||
        '  c.AGE, c.TIER, c.TIER_LABEL, ' ||
        '  c.RISK_PROFILE, ' ||
        '  c.MONTHLY_INCOME, ' ||
        '  c.TOTAL_AUM, ' ||
        '  c.KYC_STATUS, ' ||
        '  TO_CHAR(c.KYC_EXPIRY, ''DD Mon YYYY'')  AS KYC_EXPIRY_FMT, ' ||
        '  c.NOTES, ' ||
        '  cp.PRODUCT_NAME, cp.CATEGORY, ' ||
        '  cp.AMOUNT, cp.INTEREST_RATE, ' ||
        '  TO_CHAR(cp.START_DATE,    ''DD Mon YYYY'') AS START_DATE_FMT, ' ||
        '  TO_CHAR(cp.MATURITY_DATE, ''DD Mon YYYY'') AS MATURITY_DATE_FMT, ' ||
        '  cp.STATUS                               AS HOLDING_STATUS, ' ||
        '  cp.RETURN_PCT, ' ||
        '  ROUND(cp.AMOUNT * cp.INTEREST_RATE / 100) AS ANNUAL_YIELD_RP, ' ||
        '  CASE WHEN cp.MATURITY_DATE IS NOT NULL ' ||
        '       THEN ROUND(cp.MATURITY_DATE - SYSDATE) ' ||
        '       ELSE NULL END                      AS DAYS_TO_MATURITY ' ||
        'FROM CUSTOMERS c ' ||
        'LEFT JOIN CUSTOMER_PRODUCTS cp ON cp.CUSTOMER_ID = c.CUSTOMER_ID ' ||
        'ORDER BY ' ||
        '  CASE cp.STATUS WHEN ''Active'' THEN 1 WHEN ''Matured'' THEN 2 ELSE 3 END, ' ||
        '  cp.CATEGORY, cp.MATURITY_DATE ASC'
    )
  );

  DBMS_OUTPUT.PUT_LINE('[2/5] TOOL_MATURITY_PROFILE_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 3 - TOOL_MATURITY_PRODUCTS_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Active product catalog for reinvestment alternatives.
--          Agent uses this to propose 3 concrete options with exact rates.
-- Profile: DANAMON_MATURITY_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MATURITY_PRODUCTS_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_MATURITY_PRODUCTS_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil produk investasi aktif sebagai alternatif reinvestasi ' ||
    'saat deposito jatuh tempo. Mencakup: Deposito (berbagai tenor/rate), Obligasi Negara ' ||
    '(ORI, SBR, SR, ORI-seri terbaru), Reksa Dana Pasar Uang, Reksa Dana Pendapatan Tetap. ' ||
    'Output: nama produk, kategori, suku bunga/return, minimum investasi, maksimum investasi ' ||
    '(penting untuk obligasi negara yang ada batasnya), tenor, risk level, fitur utama. ' ||
    'Gunakan untuk menyusun 3 opsi reinvestasi konkret dengan perhitungan Rp per tahun. ' ||
    'Input opsional: risk_level, category, min_amount untuk filter.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name        => 'TOOL_MATURITY_PRODUCTS_SQL',
    tool_type        => 'SQL',
    tool_description => v_desc,
    tool_metadata    => JSON_OBJECT(
      'profile_name' VALUE 'DANAMON_MATURITY_PROFILE',
      'sql_query'    VALUE
        'SELECT ' ||
        '  PRODUCT_ID, PRODUCT_NAME, CATEGORY, ' ||
        '  DESCRIPTION, FEATURES, ' ||
        '  INTEREST_RATE, ' ||
        '  MIN_AMOUNT, MAX_AMOUNT, ' ||
        '  TENURE_MONTHS, RISK_LEVEL, ' ||
        '  CASE ' ||
        '    WHEN MAX_AMOUNT IS NOT NULL AND MAX_AMOUNT > 0 ' ||
        '    THEN ''Max per nasabah: Rp '' || ' ||
        '         TO_CHAR(MAX_AMOUNT,''999,999,999,999'') ' ||
        '    ELSE ''Tidak ada batas maksimum'' ' ||
        '  END AS MAX_NOTE ' ||
        'FROM PRODUCT_CATALOG ' ||
        'WHERE IS_ACTIVE = 1 ' ||
        '  AND CATEGORY IN (''Deposito'',''Reksa Dana'',''Obligasi'') ' ||
        'ORDER BY ' ||
        '  CASE CATEGORY ' ||
        '    WHEN ''Obligasi''   THEN 1 ' ||
        '    WHEN ''Deposito''   THEN 2 ' ||
        '    WHEN ''Reksa Dana'' THEN 3 ' ||
        '    ELSE 4 ' ||
        '  END, INTEREST_RATE DESC'
    )
  );

  DBMS_OUTPUT.PUT_LINE('[3/5] TOOL_MATURITY_PRODUCTS_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 4 - TOOL_MATURITY_CONTEXT_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Product brochures, ORI/SBR subscription windows, market context.
--          Agent uses this to add time-sensitive notes (e.g., ORI closes on X).
-- Index  : PRODUCT_CATALOG_VIDX on PRODUCT_CATALOG_EMBEDDINGS
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MATURITY_CONTEXT_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_MATURITY_CONTEXT_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk konteks produk dan pasar dari knowledge base Bank Danamon. ' ||
    'Gunakan untuk: ' ||
    '(1) Cari detail fitur dan ketentuan produk obligasi negara (ORI, SBR, SR) termasuk ' ||
    '    tanggal buka/tutup pemesanan dan batas maksimum per nasabah. ' ||
    '(2) Cari kondisi pasar terkini (BI Rate, tren suku bunga, outlook investasi). ' ||
    '(3) Cari perbandingan produk sesuai profil risiko nasabah. ' ||
    'Contoh query: ' ||
    '"ORI-027 subscription window closing date maximum purchase" ' ||
    '"Reksa Dana Pasar Uang liquid daily redemption features" ' ||
    '"Conservative investor deposit alternative fixed income 2026"';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name        => 'TOOL_MATURITY_CONTEXT_RAG',
    tool_type        => 'RAG',
    tool_description => v_desc,
    tool_metadata    => JSON_OBJECT(
      'index_name' VALUE 'PRODUCT_CATALOG_VIDX',
      'credential' VALUE 'OCI_GENAI_CRED',
      'top_k'      VALUE 5,
      'min_score'  VALUE 0.60
    )
  );

  DBMS_OUTPUT.PUT_LINE('[4/5] TOOL_MATURITY_CONTEXT_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 5 - TOOL_MATURITY_NOTES_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Meeting notes and service centre call logs. Agent uses this to:
--          (a) Find what products the customer asked about recently
--          (b) Understand their investment preferences from past conversations
--          (c) Build personalised talking points that reference real history
-- Index  : MEETING_NOTES_VIDX on MEETING_NOTES_EMBEDDINGS
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MATURITY_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_MATURITY_NOTES_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk catatan pertemuan RM dan riwayat interaksi nasabah. ' ||
    'Sangat penting untuk membangun talking points yang personal dan relevan. ' ||
    'Gunakan untuk menemukan: ' ||
    '(1) Produk apa yang ditanyakan nasabah dalam pertemuan/telepon terakhir. ' ||
    '(2) Keberatan atau preferensi yang disampaikan nasabah tentang investasi. ' ||
    '(3) Tujuan keuangan nasabah yang pernah dibahas dengan RM. ' ||
    '(4) Konteks keluarga/situasi personal yang relevan. ' ||
    'Query harus spesifik: gunakan nama nasabah + topik, misal: ' ||
    '"Budi Santoso ORI obligasi deposito preferensi" ' ||
    '"Budi Santoso service centre call March 2026"';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name        => 'TOOL_MATURITY_NOTES_RAG',
    tool_type        => 'RAG',
    tool_description => v_desc,
    tool_metadata    => JSON_OBJECT(
      'index_name' VALUE 'MEETING_NOTES_VIDX',
      'credential' VALUE 'OCI_GENAI_CRED',
      'top_k'      VALUE 5,
      'min_score'  VALUE 0.55
    )
  );

  DBMS_OUTPUT.PUT_LINE('[5/5] TOOL_MATURITY_NOTES_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Verification
-- =============================================================================

SELECT tool_name, tool_type, status
FROM   user_cloud_ai_agent_tools
WHERE  tool_name LIKE 'TOOL_MATURITY%'
ORDER  BY tool_name;
