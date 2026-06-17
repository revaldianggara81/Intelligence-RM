-- =============================================================================
-- 07_PAF_AGENT_CAMPAIGN_TOOLS.sql
-- Creates all PAF tools for PAF_AGENT_CAMPAIGN (In-Database Agent)
--
-- Tools created:
--   0. DANAMON_CAMPAIGN_PROFILE    (Select AI / NL2SQL profile - xai.grok-3-fast)
--   1. TOOL_CAMPAIGN_TARGET_SQL    (SQL - campaign eligibility + target profile)
--   2. TOOL_CAMPAIGN_ALERTS_SQL    (SQL - open alerts for campaign targets)
--   3. TOOL_CAMPAIGN_PROFILE_RAG   (RAG - customer profile context)
--   4. TOOL_CAMPAIGN_PRODUCT_RAG   (RAG - product/catalog campaign context)
--   5. TOOL_CAMPAIGN_NOTES_RAG     (RAG - meeting notes + interaction history)
--
-- Prerequisites:
--   1. OCI_CRED credential exists (xai/Grok via OCI GenAI)
--   2. OCI_GENAI_CRED credential exists for RAG vector search
--   3. Tables: CAMPAIGNS, CAMPAIGN_ELIGIBILITY, CUSTOMERS,
--              CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS, MEETING_NOTES,
--              RM_USERS populated
--   4. Embedding objects exist:
--      CUSTOMER_EMBEDDINGS, PRODUCT_EMBEDDINGS_V, MEETING_NOTES_EMBEDDINGS
--
-- Run as DBN (schema owner), then run 08_CREATE_PAF_AGENT_CAMPAIGN.sql.
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- SECTION 0 - Create DANAMON_CAMPAIGN_PROFILE
-- Uses xai.grok-3-fast for campaign reasoning and Bahasa Indonesia narratives.
-- Tables in scope: CAMPAIGNS, CAMPAIGN_ELIGIBILITY, CUSTOMERS,
--                  CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS,
--                  MEETING_NOTES, RM_USERS
-- =============================================================================

DECLARE
  v_profile_name     VARCHAR2(100) := 'DANAMON_CAMPAIGN_PROFILE';
  v_provider         VARCHAR2(100) := 'oci';
  v_model            VARCHAR2(100) := 'xai.grok-3-fast';
  v_credential       VARCHAR2(100) := 'OCI_CRED';
  v_region           VARCHAR2(100) := 'us-chicago-1';
  v_compartment_id   VARCHAR2(200) := 'ocid1.compartment.oc1..aaaaaaaa3iceukudgqtfk2msr2mofvbvd6zvbimem2enzurv7fhuosdeqgla';
BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE(v_profile_name);
    DBMS_OUTPUT.PUT_LINE('[0] DANAMON_CAMPAIGN_PROFILE dropped (re-creating).');
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
        '{"owner":"DBN","name":"CAMPAIGNS",' ||
          '"description":"Master kampanye RM. Kolom: CAMPAIGN_ID (PK), NAME, DESCRIPTION, TYPE (privilege_upgrade/product_placement/retention), STATUS (Active/Inactive), START_DATE, END_DATE, RULES (JSON), CREATED_AT."},' ||
        '{"owner":"DBN","name":"CAMPAIGN_ELIGIBILITY",' ||
          '"description":"Hasil scan eligibilitas kampanye per nasabah. Kolom: ELIGIBILITY_ID (PK), CAMPAIGN_ID (FK), CUSTOMER_ID (FK), IS_ELIGIBLE (1/0), RULE1_PASS, RULE2_PASS, RULE3_PASS, AUM_3M_AVG, NOTES, SCANNED_AT."},' ||
        '{"owner":"DBN","name":"CUSTOMERS",' ||
          '"description":"Profil nasabah Bank Danamon. Kolom: CUSTOMER_ID (PK), FULL_NAME, AGE, GENDER, RISK_PROFILE, TIER, TIER_LABEL, MONTHLY_INCOME, TOTAL_AUM, RM_USER_ID, KYC_STATUS, KYC_EXPIRY, NOTES, EMAIL, PHONE."},' ||
        '{"owner":"DBN","name":"CUSTOMER_PRODUCTS",' ||
          '"description":"Produk/portofolio nasabah. Kolom: HOLDING_ID (PK), CUSTOMER_ID (FK), PRODUCT_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, START_DATE, MATURITY_DATE, STATUS (Active/Matured/Redeemed), RETURN_PCT."},' ||
        '{"owner":"DBN","name":"PRODUCT_CATALOG",' ||
          '"description":"Katalog produk kampanye dan rekomendasi. Kolom: PRODUCT_ID (PK), PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES."},' ||
        '{"owner":"DBN","name":"ALERTS",' ||
          '"description":"Alert aktif nasabah. Kolom: ALERT_ID (PK), CUSTOMER_ID (FK), ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD, STATUS, TRIGGERED_AT."},' ||
        '{"owner":"DBN","name":"MEETING_NOTES",' ||
          '"description":"Catatan pertemuan/interaksi RM. Kolom: NOTE_ID (PK), CUSTOMER_ID, RM_USER_ID, MEETING_DATE, NOTE_TYPE, SUMMARY, TOPICS, PRODUCTS_DISCUSSED, FOLLOW_UP, CREATED_AT."},' ||
        '{"owner":"DBN","name":"RM_USERS",' ||
          '"description":"Data Relationship Manager. Kolom: USER_ID (PK), USERNAME, FULL_NAME, ROLE, EMAIL, BRANCH, IS_ACTIVE."}' ||
      ']}'
  );

  DBMS_OUTPUT.PUT_LINE('[0] DANAMON_CAMPAIGN_PROFILE created.');
  DBMS_OUTPUT.PUT_LINE('    Model  : xai.grok-3-fast via OCI GenAI');
  DBMS_OUTPUT.PUT_LINE('    Tables : CAMPAIGNS, CAMPAIGN_ELIGIBILITY, CUSTOMERS,');
  DBMS_OUTPUT.PUT_LINE('             CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS,');
  DBMS_OUTPUT.PUT_LINE('             MEETING_NOTES, RM_USERS');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[0] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 1 - TOOL_CAMPAIGN_TARGET_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Retrieves campaign targets, eligibility rule results, customer
--          profile, RM owner, active product holdings, and active portfolio value.
-- Profile: DANAMON_CAMPAIGN_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_TARGET_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_TARGET_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool utama untuk analisis target kampanye. Mengambil daftar nasabah per kampanye ' ||
    'beserta status eligible, hasil rule, AUM rata-rata 3 bulan, profil nasabah, RM owner, ' ||
    'jumlah produk aktif, nilai portofolio aktif, dan ringkasan holding aktif. ' ||
    'Gunakan untuk menentukan prioritas kontak dan alasan pendekatan kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_TARGET_SQL',
    attributes  =>
      '{"tool_type": "SQL",' ||
      ' "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "CAMPAIGNS",' ||
      '    "description": "Master kampanye RM. Kolom: CAMPAIGN_ID, NAME, DESCRIPTION, TYPE, STATUS, START_DATE, END_DATE, RULES. Gunakan UPPER(STATUS)=ACTIVE untuk kampanye aktif."},' ||
      '   {"name": "CAMPAIGN_ELIGIBILITY",' ||
      '    "description": "Hasil scan eligibilitas per nasabah. Kolom: CAMPAIGN_ID, CUSTOMER_ID, IS_ELIGIBLE, RULE1_PASS, RULE2_PASS, RULE3_PASS, AUM_3M_AVG, NOTES, SCANNED_AT. Gunakan untuk prioritas target dan alasan eligible."},' ||
      '   {"name": "CUSTOMERS",' ||
      '    "description": "Profil nasabah. Kolom: CUSTOMER_ID, FULL_NAME, AGE, TIER, TIER_LABEL, RISK_PROFILE, MONTHLY_INCOME, TOTAL_AUM, RM_USER_ID, KYC_STATUS, KYC_EXPIRY, NOTES, EMAIL, PHONE."},' ||
      '   {"name": "CUSTOMER_PRODUCTS",' ||
      '    "description": "Produk/portofolio nasabah. Kolom: CUSTOMER_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, START_DATE, MATURITY_DATE, STATUS, RETURN_PCT. Gunakan UPPER(STATUS)=ACTIVE untuk holding aktif."},' ||
      '   {"name": "RM_USERS",' ||
      '    "description": "Data RM owner. Kolom: USER_ID, FULL_NAME, USERNAME, EMAIL, BRANCH, ROLE, IS_ACTIVE."}' ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[1/5] TOOL_CAMPAIGN_TARGET_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_TARGET_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_TARGET_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool utama untuk analisis target kampanye. Mengambil daftar nasabah per kampanye ' ||
    'beserta status eligible, hasil rule, AUM rata-rata 3 bulan, profil nasabah, RM owner, ' ||
    'jumlah produk aktif, nilai portofolio aktif, dan ringkasan holding aktif. ' ||
    'Gunakan untuk menentukan prioritas kontak dan alasan pendekatan kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_TARGET_SQL',
    attributes  =>
      '{"tool_type": "SQL", 
       "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[1/5] TOOL_CAMPAIGN_TARGET_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- TOOL 2 - TOOL_CAMPAIGN_ALERTS_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Retrieves open customer alerts for active campaign targets.
-- Profile: DANAMON_CAMPAIGN_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_ALERTS_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_ALERTS_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk membaca alert Open pada nasabah target kampanye aktif. ' ||
    'Output mencakup campaign, nasabah, RM, severity, tipe alert, judul, pesan, metrik, ' ||
    'dan tanggal trigger. Gunakan untuk menyesuaikan timing, mitigasi risiko, dan prioritas follow-up.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_ALERTS_SQL',
    attributes  =>
      '{"tool_type": "SQL",' ||
      ' "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "CAMPAIGNS",' ||
      '    "description": "Master kampanye aktif. Join ke CAMPAIGN_ELIGIBILITY memakai CAMPAIGN_ID. Gunakan UPPER(STATUS)=ACTIVE."},' ||
      '   {"name": "CAMPAIGN_ELIGIBILITY",' ||
      '    "description": "Daftar nasabah target kampanye. Kolom: CAMPAIGN_ID, CUSTOMER_ID, IS_ELIGIBLE, RULE flags, AUM_3M_AVG."},' ||
      '   {"name": "CUSTOMERS",' ||
      '    "description": "Profil nasabah target untuk konteks alert. Kolom: CUSTOMER_ID, FULL_NAME, TIER, TIER_LABEL, RISK_PROFILE, TOTAL_AUM, RM_USER_ID."},' ||
      '   {"name": "ALERTS",' ||
      '    "description": "Alert nasabah. Kolom: ALERT_ID, CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD, STATUS, TRIGGERED_AT. Gunakan UPPER(STATUS)=OPEN untuk alert aktif."},' ||
      '   {"name": "RM_USERS",' ||
      '    "description": "Data RM owner. Kolom: USER_ID, FULL_NAME, EMAIL, BRANCH."}' ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[2/5] TOOL_CAMPAIGN_ALERTS_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_ALERTS_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_ALERTS_SQL dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk membaca alert Open pada nasabah target kampanye aktif. ' ||
    'Output mencakup campaign, nasabah, RM, severity, tipe alert, judul, pesan, metrik, ' ||
    'dan tanggal trigger. Gunakan untuk menyesuaikan timing, mitigasi risiko, dan prioritas follow-up.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_ALERTS_SQL',
    attributes  =>
      '{"tool_type": "SQL",
       "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[2/5] TOOL_CAMPAIGN_ALERTS_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- TOOL 3 - TOOL_CAMPAIGN_PROFILE_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Customer profile narratives, goals, preferences, and decision style.
-- Source : CUSTOMER_EMBEDDINGS
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_PROFILE_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari konteks profil nasabah secara semantik. ' ||
    'Gunakan untuk memahami preferensi risiko, tujuan keuangan, gaya keputusan, ' ||
    'latar belakang, dan kecenderungan respons terhadap kampanye. ' ||
    'Query sebaiknya mencantumkan nama/customer_id dan tujuan kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_PROFILE_RAG',
    attributes  =>
      '{"tool_type": "RAG",' ||
      ' "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "CUSTOMER_EMBEDDINGS",' ||
      '    "description": "Embedding teks profil nasabah. CONTENT_TYPE berisi profile, risk preference, goal, background, dan financial behavior. Gunakan untuk mencari preferensi, tujuan, dan gaya keputusan nasabah secara semantik."}' ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[3/5] TOOL_CAMPAIGN_PROFILE_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_PROFILE_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari konteks profil nasabah secara semantik. ' ||
    'Gunakan untuk memahami preferensi risiko, tujuan keuangan, gaya keputusan, ' ||
    'latar belakang, dan kecenderungan respons terhadap kampanye. ' ||
    'Query sebaiknya mencantumkan nama/customer_id dan tujuan kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_PROFILE_RAG',
    attributes  =>
      '{"tool_type": "RAG",
       "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[3/5] TOOL_CAMPAIGN_PROFILE_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 4 - TOOL_CAMPAIGN_PRODUCT_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Product/catalog context for campaign value proposition.
-- Source : PRODUCT_EMBEDDINGS_V
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_PRODUCT_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_PRODUCT_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk konteks produk kampanye dari knowledge base Bank Danamon. ' ||
    'Gunakan untuk mencari fitur produk, manfaat utama, tenor, risiko, batas nominal, ' ||
    'dan talking points produk yang sesuai dengan segmen target kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_PRODUCT_RAG',
    attributes  =>
      '{"tool_type": "RAG",' ||
      ' "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "PRODUCT_EMBEDDINGS_V",' ||
      '    "description": "Embedding deskripsi produk Bank Danamon aktif, join PRODUCT_EMBEDDINGS dan PRODUCT_CATALOG. Gunakan untuk mencari manfaat produk, risk level, target nasabah, fitur, selling points, dan kecocokan terhadap kampanye."}' ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[4/5] TOOL_CAMPAIGN_PRODUCT_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_PRODUCT_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_PRODUCT_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk konteks produk kampanye dari knowledge base Bank Danamon. ' ||
    'Gunakan untuk mencari fitur produk, manfaat utama, tenor, risiko, batas nominal, ' ||
    'dan talking points produk yang sesuai dengan segmen target kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_PRODUCT_RAG',
    attributes  =>
      '{"tool_type": "RAG",
       "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[4/5] TOOL_CAMPAIGN_PRODUCT_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 5 - TOOL_CAMPAIGN_NOTES_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Meeting notes and interaction history for personalized scripts.
-- Source : MEETING_NOTES_EMBEDDINGS
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_NOTES_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk catatan pertemuan dan histori interaksi nasabah. ' ||
    'Gunakan untuk menemukan produk yang pernah dibahas, keberatan nasabah, ' ||
    'preferensi komunikasi, follow-up tertunda, dan konteks personal untuk skrip kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_NOTES_RAG',
    attributes  =>
      '{"tool_type": "RAG",' ||
      ' "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "MEETING_NOTES_EMBEDDINGS",' ||
      '    "description": "Embedding catatan pertemuan dan histori interaksi nasabah. Gunakan untuk mencari produk yang pernah dibahas, keberatan, preferensi komunikasi, follow-up, dan konteks personal."}' ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[5/5] TOOL_CAMPAIGN_NOTES_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CAMPAIGN_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CAMPAIGN_NOTES_RAG dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk catatan pertemuan dan histori interaksi nasabah. ' ||
    'Gunakan untuk menemukan produk yang pernah dibahas, keberatan nasabah, ' ||
    'preferensi komunikasi, follow-up tertunda, dan konteks personal untuk skrip kampanye.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CAMPAIGN_NOTES_RAG',
    attributes  =>
      '{"tool_type": "RAG",
       "tool_params": {"profile_name": "DANAMON_CAMPAIGN_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[5/5] TOOL_CAMPAIGN_NOTES_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/5] ERROR: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- Verification
-- =============================================================================

SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_CAMPAIGN_PROFILE';

SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_CAMPAIGN%'
ORDER  BY tool_name;
