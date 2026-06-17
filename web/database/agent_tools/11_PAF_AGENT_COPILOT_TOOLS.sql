-- =============================================================================
-- 11_PAF_AGENT_COPILOT_TOOLS.sql
-- Creates all 6 PAF Agent tools for PAF_AGENT_COPILOT
--
-- Tools created:
--   1. TOOL_COPILOT_CUSTOMER_SQL    (SQL  - CUSTOMERS + CUSTOMER_PRODUCTS)
--   2. TOOL_COPILOT_SITUATION_SQL   (SQL  - ALERTS + CAMPAIGNS + CAMPAIGN_ELIGIBILITY
--                                           + MEETING_NOTES)
--   3. TOOL_COPILOT_PRODUCT_SQL     (SQL  - PRODUCT_CATALOG)
--   4. TOOL_COPILOT_PROFILE_RAG     (RAG  - CUSTOMER_EMBEDDINGS)
--   5. TOOL_COPILOT_NOTES_RAG       (RAG  - MEETING_NOTES_EMBEDDINGS)
--   6. TOOL_COPILOT_PRODUCT_RAG     (RAG  - PRODUCT_EMBEDDINGS_V)
--
-- Prerequisites:
--   1. DANAMON_COPILOT_PROFILE created (Section 0 below - run first)
--   2. DANAMON_RAG_PROFILE already exists (from config-select-ai.sql)
--   3. PRODUCT_EMBEDDINGS_V view exists (from 04_TOOL_PRODUCT_CATALOG_RAG.sql)
--   4. All base tables populated; embedding tables populated with vector data
--
-- Run as ADMIN (schema owner).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- SECTION 0 - Create DANAMON_COPILOT_PROFILE
-- Comprehensive Select AI profile for copilot SQL tools.
-- Includes ALL major transactional tables so the copilot can answer any
-- free-form RM question about customers, portfolio, products, alerts,
-- campaigns, and meeting history from a single profile.
-- =============================================================================
DECLARE
   v_profile_name varchar2(100) := 'DANAMON_COPILOT_PROFILE_GROK_OCI';
   provider          varchar2(100) := 'oci';
   model            varchar2(100) := 'xai.grok-3-fast'; 
   credential_name varchar2(100) := 'OCI_CRED';
   region           varchar2(100) := 'us-chicago-1';
   oci_compartment_id varchar2(100) := 'ocid1.compartment.oc1..aaaaaaaa3iceukudgqtfk2msr2mofvbvd6zvbimem2enzurv7fhuosdeqgla';
BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE('DANAMON_COPILOT_PROFILE_GROK_OCI');
    DBMS_OUTPUT.PUT_LINE('[0] DANAMON_COPILOT_PROFILE dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

   begin
      dbms_cloud_ai.create_profile(
         profile_name => v_profile_name,
         attributes   => '{
            "provider"        : "'||provider||
            '","credential_name" : "'||credential_name||
            '","model"           : "'||model||
            '","oci_compartment_id": "'||oci_compartment_id||
            '","region"          : "'||region||
      '","object_list"     : [
        {"owner": "DBN", "name": "CUSTOMERS"},
        {"owner": "DBN", "name": "CUSTOMER_PRODUCTS"},
        {"owner": "DBN", "name": "PRODUCT_CATALOG"},
        {"owner": "DBN", "name": "ALERTS"},
        {"owner": "DBN", "name": "CAMPAIGNS"},
        {"owner": "DBN", "name": "CAMPAIGN_ELIGIBILITY"},
        {"owner": "DBN", "name": "MEETING_NOTES"},
        {"owner": "DBN", "name": "RM_USERS"}
          ]
        }'
      );
  END;
  DBMS_OUTPUT.PUT_LINE('[0] DANAMON_COPILOT_PROFILE created.');
  DBMS_OUTPUT.PUT_LINE('    Tables: CUSTOMERS, CUSTOMER_PRODUCTS, PRODUCT_CATALOG,');
  DBMS_OUTPUT.PUT_LINE('            ALERTS, CAMPAIGNS, CAMPAIGN_ELIGIBILITY,');
  DBMS_OUTPUT.PUT_LINE('            MEETING_NOTES, RM_USERS');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[0] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 1 - TOOL_COPILOT_CUSTOMER_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Answers any structured question about customer profile and portfolio.
--          The primary data tool - covers AUM, holdings, maturity dates, return
--          percentages, tier, risk profile, KYC status, and RM assignments.
--          Most copilot queries about "a specific customer" start here.
-- Profile: DANAMON_COPILOT_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_CUSTOMER_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_CUSTOMER_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk menjawab pertanyaan terstruktur tentang profil dan portofolio nasabah '
    || 'Bank Danamon. '
    || 'Dapat menjawab: total AUM nasabah, daftar produk yang dimiliki, nilai deposito aktif, '
    || 'return reksa dana saat ini, produk yang akan jatuh tempo, distribusi portofolio per kategori, '
    || 'nasabah dengan AUM tertinggi, profil risiko nasabah, status KYC, dan informasi kontak. '
    || 'Tabel: CUSTOMERS (CUSTOMER_ID, FULL_NAME, TIER, RISK_PROFILE, TOTAL_AUM, RM_USER_ID, '
    || 'KYC_STATUS, KYC_EXPIRY, EMAIL, PHONE), '
    || 'CUSTOMER_PRODUCTS (CUSTOMER_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, '
    || 'MATURITY_DATE, STATUS, RETURN_PCT). '
    || 'Input opsional: customer_id, full_name, rm_user_id, category, status';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_CUSTOMER_SQL',
    attributes  => '{"tool_type": "SQL",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"},
                     "tool_inputs": [
                       {
                         "name"       : "CUSTOMERS",
                         "description": "Profil nasabah Bank Danamon. Kolom utama: CUSTOMER_ID (PK), FULL_NAME (nama lengkap), AGE, GENDER, TIER (prioritas/privilege/regular), RISK_PROFILE (Conservative/Moderate/Aggressive), MONTHLY_INCOME, TOTAL_AUM (total aset under management dalam Rupiah), RM_USER_ID (Relationship Manager yang bertanggung jawab), KYC_STATUS (Verified/Expired/Pending), KYC_EXPIRY (tanggal kedaluwarsa KYC), EMAIL, PHONE."
                       },
                       {
                         "name"       : "CUSTOMER_PRODUCTS",
                         "description": "Portofolio produk investasi nasabah. Kolom utama: HOLDING_ID (PK), CUSTOMER_ID (FK ke CUSTOMERS), PRODUCT_NAME (nama produk spesifik), CATEGORY (deposito/reksa_dana/obligasi/asuransi/tabungan), AMOUNT (nilai investasi dalam Rupiah), INTEREST_RATE (suku bunga persentase per tahun), START_DATE (tanggal mulai), MATURITY_DATE (tanggal jatuh tempo), STATUS (Active=aktif, Matured=jatuh tempo, Redeemed=dicairkan), RETURN_PCT (persentase return saat ini). JOIN ke CUSTOMERS via CUSTOMER_ID."
                       }
                     ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[1/6] TOOL_COPILOT_CUSTOMER_SQL created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : SQL (NL2SQL via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Tables : CUSTOMERS, CUSTOMER_PRODUCTS');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/6] ERROR: TOOL_COPILOT_CUSTOMER_SQL - ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_CUSTOMER_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_CUSTOMER_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk menjawab pertanyaan terstruktur tentang profil dan portofolio nasabah '
    || 'Bank Danamon. '
    || 'Dapat menjawab: total AUM nasabah, daftar produk yang dimiliki, nilai deposito aktif, '
    || 'return reksa dana saat ini, produk yang akan jatuh tempo, distribusi portofolio per kategori, '
    || 'nasabah dengan AUM tertinggi, profil risiko nasabah, status KYC, dan informasi kontak. '
    || 'Tabel: CUSTOMERS (CUSTOMER_ID, FULL_NAME, TIER, RISK_PROFILE, TOTAL_AUM, RM_USER_ID, '
    || 'KYC_STATUS, KYC_EXPIRY, EMAIL, PHONE), '
    || 'CUSTOMER_PRODUCTS (CUSTOMER_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, '
    || 'MATURITY_DATE, STATUS, RETURN_PCT). '
    || 'Input opsional: customer_id, full_name, rm_user_id, category, status';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_CUSTOMER_SQL',
    attributes  => '{"tool_type": "SQL",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[1/6] TOOL_COPILOT_CUSTOMER_SQL created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : SQL (NL2SQL via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Tables : CUSTOMERS, CUSTOMER_PRODUCTS');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/6] ERROR: TOOL_COPILOT_CUSTOMER_SQL - ' || SQLERRM);
    RAISE;
END;
/
-- =============================================================================
-- TOOL 2 - TOOL_COPILOT_SITUATION_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: 360-degree situational awareness tool - queries active alerts,
--          campaign eligibility, and structured meeting history. Lets the RM
--          ask "what is the current situation for this customer?" and get a
--          complete picture: open alerts, campaign opportunities, last meeting.
-- Profile: DANAMON_COPILOT_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_SITUATION_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_SITUATION_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mendapatkan gambaran situasi 360 derajat nasabah Bank Danamon. '
    || 'Dapat menjawab: semua alert aktif nasabah beserta severity, kampanye yang sedang berjalan '
    || 'dan eligibilitas nasabah, tanggal dan ringkasan pertemuan terakhir, '
    || 'frekuensi interaksi RM-nasabah, tindak lanjut yang belum diselesaikan, '
    || 'dan distribusi alert per tipe. '
    || 'Tabel: ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, STATUS, TRIGGERED_AT), '
    || 'CAMPAIGNS + CAMPAIGN_ELIGIBILITY (kampanye aktif dan eligibilitas nasabah), '
    || 'MEETING_NOTES (CUSTOMER_ID, MEETING_DATE, NOTE_TYPE, SUMMARY, FOLLOW_UP). '
    || 'Input opsional: customer_id, rm_user_id, status, days_back.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_SITUATION_SQL',
    attributes  => '{"tool_type": "SQL",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"},
                     "tool_inputs": [
                       {
                         "name"       : "ALERTS",
                         "description": "Alert aktif nasabah. Kolom: ALERT_ID, CUSTOMER_ID (FK), ALERT_TYPE (maturity/portfolio_loss/kyc_expiry/cc_missed/campaign), SEVERITY (high/medium/low), TITLE, MESSAGE, STATUS (Open/Acknowledged/Resolved), TRIGGERED_AT. Gunakan STATUS=Open untuk alert belum ditangani. JOIN ke CUSTOMERS via CUSTOMER_ID."
                       },
                       {
                         "name"       : "CAMPAIGNS",
                         "description": "Kampanye Bank Danamon. Kolom: CAMPAIGN_ID (PK), NAME, DESCRIPTION, TYPE (privilege_upgrade/product_placement/retention), STATUS (Active/Inactive), START_DATE, END_DATE. JOIN ke CAMPAIGN_ELIGIBILITY via CAMPAIGN_ID."
                       },
                       {
                         "name"       : "CAMPAIGN_ELIGIBILITY",
                         "description": "Eligibilitas nasabah per kampanye. Kolom: CAMPAIGN_ID (FK), CUSTOMER_ID (FK), IS_ELIGIBLE (1=eligible), AUM_3M_AVG, NOTES, SCANNED_AT. JOIN ke CAMPAIGNS via CAMPAIGN_ID dan CUSTOMERS via CUSTOMER_ID. Filter IS_ELIGIBLE=1 untuk nasabah yang qualify."
                       },
                       {
                         "name"       : "MEETING_NOTES",
                         "description": "Catatan pertemuan terstruktur RM dengan nasabah. Kolom: NOTE_ID (PK), CUSTOMER_ID (FK), RM_USER_ID (FK), MEETING_DATE (tanggal pertemuan), NOTE_TYPE (meeting/call/visit/inquiry), SUMMARY (ringkasan singkat pertemuan), TOPICS (JSON array topik yang dibahas), PRODUCTS_DISCUSSED (JSON array produk yang didiskusikan), FOLLOW_UP (tindak lanjut yang dijanjikan), CREATED_AT. Gunakan untuk mencari riwayat interaksi terstruktur per nasabah."
                       }
                     ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[2/6] TOOL_COPILOT_SITUATION_SQL created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : SQL (NL2SQL via DANAMON_COPILOT_PROFILE)');
  DBMS_OUTPUT.PUT_LINE('      Tables : ALERTS, CAMPAIGNS, CAMPAIGN_ELIGIBILITY, MEETING_NOTES');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/6] ERROR: TOOL_COPILOT_SITUATION_SQL - ' || SQLERRM);
    RAISE;
END;
/

-- untuk testing memastikan tidak ada error
DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_SITUATION_SQL');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  v_desc :=
    'SQL tool untuk mendapatkan gambaran situasi 360 derajat nasabah Bank Danamon. '
    || 'Dapat menjawab: semua alert aktif nasabah beserta severity, kampanye yang sedang berjalan '
    || 'dan eligibilitas nasabah, tanggal dan ringkasan pertemuan terakhir, '
    || 'frekuensi interaksi RM-nasabah, tindak lanjut yang belum diselesaikan, '
    || 'dan distribusi alert per tipe. '
    || 'Tabel: ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, STATUS, TRIGGERED_AT), '
    || 'CAMPAIGNS + CAMPAIGN_ELIGIBILITY (kampanye aktif dan eligibilitas nasabah), '
    || 'MEETING_NOTES (CUSTOMER_ID, MEETING_DATE, NOTE_TYPE, SUMMARY, FOLLOW_UP). '
    || 'Input opsional: customer_id, rm_user_id, status, days_back.';
  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_SITUATION_SQL',
    attributes  => '{
                  "tool_type": "SQL",
                  "tool_params": {
                    "profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"}
                      }',
    description => v_desc
  );
  DBMS_OUTPUT.PUT_LINE('TOOL_COPILOT_SITUATION_SQL created.');
END;
/

-- =============================================================================
-- TOOL 3 - TOOL_COPILOT_PRODUCT_SQL
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Answers precise, structured questions about the Bank Danamon product
--          catalog - interest rates, minimum investment amounts, risk levels,
--          available tenors, and product comparisons. Complements the RAG
--          product tool with exact numeric data.
-- Profile: DANAMON_COPILOT_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_PRODUCT_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_PRODUCT_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk menjawab pertanyaan terstruktur tentang katalog produk Bank Danamon. '
    || 'Dapat menjawab: daftar semua produk aktif, perbandingan suku bunga deposito, '
    || 'produk dengan return tertinggi per kategori, produk yang cocok untuk profil risiko tertentu, '
    || 'minimum investasi per produk, tenor yang tersedia, dan produk yang valid pada tanggal tertentu. '
    || 'Tabel: PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, INTEREST_RATE, RISK_LEVEL, '
    || 'MIN_AMOUNT, TENURE_MONTHS, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES). '
    || 'Selalu filter IS_ACTIVE=1 kecuali diminta sebaliknya. '
    || 'Input opsional: category, risk_level, min_rate, max_min_amount.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_PRODUCT_SQL',
    attributes  => '{"tool_type": "SQL",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"},
                     "tool_inputs": [
                       {
                         "name"       : "PRODUCT_CATALOG",
                         "description": "Katalog produk investasi Bank Danamon yang tersedia untuk nasabah. Kolom utama: PRODUCT_ID (PK), PRODUCT_NAME (nama produk), CATEGORY (deposito=deposito berjangka, reksa_dana=reksa dana, obligasi=surat utang, asuransi=asuransi unit link, tabungan=tabungan berencana), DESCRIPTION (deskripsi singkat), INTEREST_RATE (suku bunga/imbal hasil persentase per tahun), MIN_AMOUNT (minimum investasi dalam Rupiah), MAX_AMOUNT (maksimum investasi), TENURE_MONTHS (tenor dalam bulan), RISK_LEVEL (low=rendah risiko, medium=sedang, high=tinggi), IS_ACTIVE (1=tersedia, 0=tidak aktif), VALID_FROM, VALID_TO (periode ketersediaan), FEATURES (JSON array fitur unggulan). Selalu filter IS_ACTIVE=1. Urutkan berdasarkan INTEREST_RATE DESC untuk perbandingan return."
                       }
                     ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[3/6] TOOL_COPILOT_PRODUCT_SQL created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : SQL (NL2SQL via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Tables : PRODUCT_CATALOG');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/6] ERROR: TOOL_COPILOT_PRODUCT_SQL - ' || SQLERRM);
    RAISE;
END;
/


DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_PRODUCT_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_PRODUCT_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  v_desc :=
    'SQL tool untuk menjawab pertanyaan terstruktur tentang katalog produk Bank Danamon. '
    || 'Dapat menjawab: daftar semua produk aktif, perbandingan suku bunga deposito, '
    || 'produk dengan return tertinggi per kategori, produk yang cocok untuk profil risiko tertentu, '
    || 'minimum investasi per produk, tenor yang tersedia, dan produk yang valid pada tanggal tertentu. '
    || 'Tabel: PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, INTEREST_RATE, RISK_LEVEL, '
    || 'MIN_AMOUNT, TENURE_MONTHS, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES). '
    || 'Selalu filter IS_ACTIVE=1 kecuali diminta sebaliknya. '
    || 'Input opsional: category, risk_level, min_rate, max_min_amount.';
  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_PRODUCT_SQL',
    attributes  => '{"tool_type": "SQL",
                     "tool_params": {
                        "profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"
                        }
                      }',
    description => v_desc
  );
  DBMS_OUTPUT.PUT_LINE('[3/6] TOOL_COPILOT_PRODUCT_SQL created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : SQL (NL2SQL via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Tables : PRODUCT_CATALOG');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/6] ERROR: TOOL_COPILOT_PRODUCT_SQL - ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 4 - TOOL_COPILOT_PROFILE_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Retrieves narrative customer profile segments matching the RM's
--          question semantically - investment style, goals, life stage, risk
--          attitude, and financial behaviour. Adds qualitative context that
--          the SQL tools cannot surface from structured columns alone.
-- Profile: DANAMON_RAG_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_PROFILE_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mengambil konteks profil nasabah secara semantik dari dokumen teks embedding. '
    || 'Mengambil segmen naratif yang relevan tentang: gaya investasi nasabah, '
    || 'tujuan keuangan jangka panjang, preferensi produk, latar belakang finansial, '
    || 'perilaku dalam kondisi pasar negatif, dan karakteristik unik nasabah. '
    || 'Tabel: CUSTOMER_EMBEDDINGS (EMBEDDING VECTOR 1024 FLOAT32, CONTENT, CUSTOMER_ID, '
    || 'CONTENT_TYPE: profile_summary/risk_preference/investment_goal/background/financial_behavior). '
    || 'Gunakan tool ini ketika pertanyaan membutuhkan pemahaman kualitatif/naratif tentang nasabah '
    || 'yang tidak tersedia dalam kolom SQL terstruktur. '
    || 'Input wajib: query (topik atau konteks yang ingin dipahami). '
    || 'Input opsional: customer_id (untuk filter nasabah tertentu).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_PROFILE_RAG',
    attributes  => '{"tool_type": "RAG",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"},
                     "tool_inputs": [
                       {
                         "name"       : "CUSTOMER_EMBEDDINGS",
                         "description": "Embedding teks profil nasabah Bank Danamon. CONTENT_TYPE: profile_summary (ringkasan profil lengkap), risk_preference (toleransi dan preferensi risiko investasi), investment_goal (tujuan investasi jangka panjang dan rencana keuangan), background (latar belakang pekerjaan, keluarga, pengalaman finansial), financial_behavior (pola dan kebiasaan finansial, reaksi terhadap volatilitas). Setiap baris adalah satu segmen naratif. Gunakan untuk memahami konteks kualitatif nasabah yang tidak bisa dijawab dengan SQL."
                       }
                     ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[4/6] TOOL_COPILOT_PROFILE_RAG created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : RAG (Vector Search via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Table  : CUSTOMER_EMBEDDINGS (VECTOR 1024 FLOAT32)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/6] ERROR: TOOL_COPILOT_PROFILE_RAG - ' || SQLERRM);
    RAISE;
END;
/

-- test
DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_PROFILE_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mengambil konteks profil nasabah secara semantik dari dokumen teks embedding. '
    || 'Mengambil segmen naratif yang relevan tentang: gaya investasi nasabah, '
    || 'tujuan keuangan jangka panjang, preferensi produk, latar belakang finansial, '
    || 'perilaku dalam kondisi pasar negatif, dan karakteristik unik nasabah. '
    || 'Tabel: CUSTOMER_EMBEDDINGS (EMBEDDING VECTOR 1024 FLOAT32, CONTENT, CUSTOMER_ID, '
    || 'CONTENT_TYPE: profile_summary/risk_preference/investment_goal/background/financial_behavior). '
    || 'Gunakan tool ini ketika pertanyaan membutuhkan pemahaman kualitatif/naratif tentang nasabah '
    || 'yang tidak tersedia dalam kolom SQL terstruktur. '
    || 'Input wajib: query (topik atau konteks yang ingin dipahami). '
    || 'Input opsional: customer_id (untuk filter nasabah tertentu).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_PROFILE_RAG',
    attributes  => '{"tool_type": "RAG",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"}
                     }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[4/6] TOOL_COPILOT_PROFILE_RAG created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : RAG (Vector Search via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Table  : CUSTOMER_EMBEDDINGS (VECTOR 1024 FLOAT32)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/6] ERROR: TOOL_COPILOT_PROFILE_RAG - ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- TOOL 5 - TOOL_COPILOT_NOTES_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Semantic search over RM-customer meeting note fragments. Surfaces
--          what was discussed, decisions made, objections raised, and follow-up
--          items - all matched by meaning, not just keyword. Enables the RM
--          to ask "what did we discuss about reksa dana with Budi?" naturally.
-- Profile: DANAMON_RAG_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_NOTES_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari konten catatan pertemuan RM-nasabah secara semantik. '
    || 'Mengambil fragmen catatan yang relevan berdasarkan topik, produk yang didiskusikan, '
    || 'keputusan yang diambil, keberatan nasabah, atau tindak lanjut yang dijanjikan. '
    || 'Berbeda dengan TOOL_COPILOT_SITUATION_SQL yang mencari metadata pertemuan (tanggal, tipe), '
    || 'tool ini mencari ISI percakapan secara semantik. '
    || 'Tabel: MEETING_NOTES_EMBEDDINGS (EMBEDDING VECTOR 1024 FLOAT32, CONTENT, '
    || 'CUSTOMER_ID, NOTE_ID, CREATED_AT). '
    || 'Gunakan untuk pertanyaan seperti: "apa yang didiskusikan tentang X", '
    || '"keberatan apa yang disampaikan nasabah Y", "apa janji tindak lanjut dengan Z". '
    || 'Input wajib: query (topik atau pertanyaan spesifik). '
    || 'Input opsional: customer_id (untuk filter nasabah tertentu).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_NOTES_RAG',
    attributes  => '{"tool_type": "RAG",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"},
                     "tool_inputs": [
                       {
                         "name"       : "MEETING_NOTES_EMBEDDINGS",
                         "description": "Embedding isi catatan pertemuan RM dengan nasabah Bank Danamon. Setiap baris adalah satu fragmen isi catatan. Berisi: percakapan tentang produk investasi, alasan nasabah menerima atau menolak produk, kondisi keuangan yang disampaikan nasabah, rencana keuangan yang didiskusikan, janji tindak lanjut, dan konteks personal nasabah yang relevan. Gunakan untuk pertanyaan semantik tentang ISI percakapan, bukan metadata pertemuan."
                       }
                     ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[5/6] TOOL_COPILOT_NOTES_RAG created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : RAG (Vector Search via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Table  : MEETING_NOTES_EMBEDDINGS (VECTOR 1024 FLOAT32)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/6] ERROR: TOOL_COPILOT_NOTES_RAG - ' || SQLERRM);
    RAISE;
END;
/


--test 
DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_NOTES_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari konten catatan pertemuan RM-nasabah secara semantik. '
    || 'Mengambil fragmen catatan yang relevan berdasarkan topik, produk yang didiskusikan, '
    || 'keputusan yang diambil, keberatan nasabah, atau tindak lanjut yang dijanjikan. '
    || 'Berbeda dengan TOOL_COPILOT_SITUATION_SQL yang mencari metadata pertemuan (tanggal, tipe), '
    || 'tool ini mencari ISI percakapan secara semantik. '
    || 'Tabel: MEETING_NOTES_EMBEDDINGS (EMBEDDING VECTOR 1024 FLOAT32, CONTENT, '
    || 'CUSTOMER_ID, NOTE_ID, CREATED_AT). '
    || 'Gunakan untuk pertanyaan seperti: "apa yang didiskusikan tentang X", '
    || '"keberatan apa yang disampaikan nasabah Y", "apa janji tindak lanjut dengan Z". '
    || 'Input wajib: query (topik atau pertanyaan spesifik). '
    || 'Input opsional: customer_id (untuk filter nasabah tertentu).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_NOTES_RAG',
    attributes  => '{"tool_type": "RAG",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"}
                    }',
    description => v_desc
  );
  DBMS_OUTPUT.PUT_LINE('[5/6] TOOL_COPILOT_NOTES_RAG created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : RAG (Vector Search via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      Table  : MEETING_NOTES_EMBEDDINGS (VECTOR 1024 FLOAT32)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/6] ERROR: TOOL_COPILOT_NOTES_RAG - ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 6 - TOOL_COPILOT_PRODUCT_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Semantic product discovery from product narrative embeddings.
--          While TOOL_COPILOT_PRODUCT_SQL returns exact numeric data,
--          this RAG tool finds products by meaning - "suitable for retirement
--          planning", "low volatility but good return", "capital protection".
--          Returns product descriptions including benefits, target investors,
--          and suitability narratives.
-- Profile: DANAMON_RAG_PROFILE
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_PRODUCT_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_PRODUCT_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk menemukan produk Bank Danamon yang relevan secara semantik dengan kebutuhan nasabah. '
    || 'Berbeda dengan TOOL_COPILOT_PRODUCT_SQL yang mencari berdasarkan nilai numerik terstruktur, '
    || 'tool ini menemukan produk berdasarkan MAKNA - cocok untuk pensiun, perlindungan modal, '
    || 'pertumbuhan jangka panjang, atau likuiditas tinggi. '
    || 'View: PRODUCT_EMBEDDINGS_V (EMBEDDING, CONTENT, PRODUCT_ID, PRODUCT_NAME, '
    || 'CATEGORY, RISK_LEVEL, INTEREST_RATE, MIN_AMOUNT) - hanya produk IS_ACTIVE=1. '
    || 'Gunakan untuk pertanyaan: "produk apa yang cocok untuk X?", '
    || '"bandingkan keunggulan produk Y dan Z", "jelaskan manfaat reksa dana saham". '
    || 'Input wajib: query (kebutuhan nasabah atau deskripsi produk yang dicari).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_PRODUCT_RAG',
    attributes  => '{"tool_type": "RAG",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"},
                     "tool_inputs": [
                       {
                         "name"       : "PRODUCT_EMBEDDINGS_V",
                         "description": "Embedding deskripsi naratif produk investasi Bank Danamon yang aktif. Setiap baris adalah satu narasi produk yang mencakup: cara kerja produk, keunggulan dan manfaat, profil investor yang cocok, risiko yang perlu diketahui, dan pembanding dengan produk lain. Metadata: PRODUCT_ID, PRODUCT_NAME, CATEGORY, RISK_LEVEL, INTEREST_RATE, MIN_AMOUNT. Gunakan untuk pencarian produk berdasarkan kebutuhan kualitatif nasabah atau perbandingan naratif antar produk."
                       }
                     ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[6/6] TOOL_COPILOT_PRODUCT_RAG created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : RAG (Vector Search via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      View   : PRODUCT_EMBEDDINGS_V (aktif saja, IS_ACTIVE=1)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[6/6] ERROR: TOOL_COPILOT_PRODUCT_RAG - ' || SQLERRM);
    RAISE;
END;
/

--
--
DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_PRODUCT_RAG');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_PRODUCT_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk menemukan produk Bank Danamon yang relevan secara semantik dengan kebutuhan nasabah. '
    || 'Berbeda dengan TOOL_COPILOT_PRODUCT_SQL yang mencari berdasarkan nilai numerik terstruktur, '
    || 'tool ini menemukan produk berdasarkan MAKNA - cocok untuk pensiun, perlindungan modal, '
    || 'pertumbuhan jangka panjang, atau likuiditas tinggi. '
    || 'View: PRODUCT_EMBEDDINGS_V (EMBEDDING, CONTENT, PRODUCT_ID, PRODUCT_NAME, '
    || 'CATEGORY, RISK_LEVEL, INTEREST_RATE, MIN_AMOUNT) - hanya produk IS_ACTIVE=1. '
    || 'Gunakan untuk pertanyaan: "produk apa yang cocok untuk X?", '
    || '"bandingkan keunggulan produk Y dan Z", "jelaskan manfaat reksa dana saham". '
    || 'Input wajib: query (kebutuhan nasabah atau deskripsi produk yang dicari).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_PRODUCT_RAG',
    attributes  => '{"tool_type": "RAG",
                     "tool_params": {"profile_name": "DANAMON_COPILOT_PROFILE_GROK_OCI"}
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[6/6] TOOL_COPILOT_PRODUCT_RAG created.');
  DBMS_OUTPUT.PUT_LINE('      Type   : RAG (Vector Search via DANAMON_COPILOT_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('      View   : PRODUCT_EMBEDDINGS_V (aktif saja, IS_ACTIVE=1)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[6/6] ERROR: TOOL_COPILOT_PRODUCT_RAG - ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- VERIFICATION
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('VERIFICATION - Copilot Tools & Profile');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

-- 1. Confirm DANAMON_COPILOT_PROFILE was created
SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name IN ('DANAMON_COPILOT_PROFILE', 'DANAMON_RAG_PROFILE')
ORDER BY profile_name;

-- 2. List all 6 copilot tools
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_COPILOT%'
ORDER BY tool_name;

-- 3. Source table/view row counts
SELECT 'CUSTOMERS'             AS obj, COUNT(*) AS rows FROM CUSTOMERS              UNION ALL
SELECT 'CUSTOMER_PRODUCTS'     AS obj, COUNT(*) AS rows FROM CUSTOMER_PRODUCTS      UNION ALL
SELECT 'PRODUCT_CATALOG'       AS obj, COUNT(*) AS rows FROM PRODUCT_CATALOG        UNION ALL
SELECT 'ALERTS'                AS obj, COUNT(*) AS rows FROM ALERTS                 UNION ALL
SELECT 'CAMPAIGNS'             AS obj, COUNT(*) AS rows FROM CAMPAIGNS              UNION ALL
SELECT 'CAMPAIGN_ELIGIBILITY'  AS obj, COUNT(*) AS rows FROM CAMPAIGN_ELIGIBILITY   UNION ALL
SELECT 'MEETING_NOTES'         AS obj, COUNT(*) AS rows FROM MEETING_NOTES          UNION ALL
SELECT 'CUSTOMER_EMBEDDINGS'   AS obj, COUNT(*) AS rows FROM CUSTOMER_EMBEDDINGS    UNION ALL
SELECT 'MEETING_NOTES_EMBED'   AS obj, COUNT(*) AS rows FROM MEETING_NOTES_EMBEDDINGS UNION ALL
SELECT 'PRODUCT_EMBEDDINGS_V'  AS obj, COUNT(*) AS rows FROM PRODUCT_EMBEDDINGS_V;

-- 4. Vector indexes
SELECT table_name, index_name, status
FROM   user_indexes
WHERE  table_name IN ('CUSTOMER_EMBEDDINGS', 'MEETING_NOTES_EMBEDDINGS', 'PRODUCT_EMBEDDINGS')
  AND  index_name LIKE '%VEC%'
ORDER BY table_name;
/

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('All 6 copilot tools ready.');
  DBMS_OUTPUT.PUT_LINE('Next step: run 12_CREATE_PAF_AGENT_COPILOT.sql');
END;
/


-- =============================================================================
-- SECTION 2 - TOOL TESTS
-- Tests each copilot tool using the correct Oracle APIs:
--   SQL tools  -> DBMS_CLOUD_AI.GENERATE  (action => 'narrate' = NL2SQL)
--   RAG tools  -> DBMS_CLOUD_AI.GENERATE  (action => 'chat'    = vector retrieval)
--              + direct VECTOR_DISTANCE search (bypasses LLM, pure Oracle VECTOR)
--
-- Prerequisites: all 6 tools created, profile active, embedding tables populated.
-- Run as ADMIN (schema owner).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- TEST 1 - TOOL_COPILOT_CUSTOMER_SQL  (SQL / NL2SQL)
-- =============================================================================

-- 1a. Catalog: confirm tool is registered
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_COPILOT_CUSTOMER_SQL';

-- 1b. Profile: confirm DANAMON_COPILOT_PROFILE_GROK_OCI is active
SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_COPILOT_PROFILE_GROK_OCI';

-- 1c. Data: base table row counts
SELECT 'CUSTOMERS'         AS tbl, COUNT(*) AS rows FROM CUSTOMERS        UNION ALL
SELECT 'CUSTOMER_PRODUCTS' AS tbl, COUNT(*) AS rows FROM CUSTOMER_PRODUCTS;

-- 1d. Functional: NL2SQL via DBMS_CLOUD_AI.GENERATE (action => 'narrate')
--     Expected  : narrative answer derived from a SQL query on CUSTOMERS / CUSTOMER_PRODUCTS
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 1d: TOOL_COPILOT_CUSTOMER_SQL (NL2SQL narrate) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Tampilkan 5 nasabah dengan total AUM tertinggi beserta tier dan status KYC mereka.',
    profile_name => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
    action       => 'narrate'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-1d] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST 2 - TOOL_COPILOT_SITUATION_SQL  (SQL / NL2SQL)
-- =============================================================================

-- 2a. Catalog
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_COPILOT_SITUATION_SQL';

-- 2b. Data: base table row counts
SELECT 'ALERTS'               AS tbl, COUNT(*) AS rows FROM ALERTS              UNION ALL
SELECT 'CAMPAIGNS'            AS tbl, COUNT(*) AS rows FROM CAMPAIGNS            UNION ALL
SELECT 'CAMPAIGN_ELIGIBILITY' AS tbl, COUNT(*) AS rows FROM CAMPAIGN_ELIGIBILITY UNION ALL
SELECT 'MEETING_NOTES'        AS tbl, COUNT(*) AS rows FROM MEETING_NOTES;

-- 2c. Alert severity distribution (quick sanity check)
SELECT SEVERITY, STATUS, COUNT(*) AS cnt
FROM   ALERTS
GROUP BY SEVERITY, STATUS
ORDER BY SEVERITY, STATUS;

-- 2d. Functional: NL2SQL narrate
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 2d: TOOL_COPILOT_SITUATION_SQL (NL2SQL narrate) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Tampilkan semua alert dengan severity HIGH yang masih Open beserta nama nasabah dan tipe alert-nya.',
    profile_name => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
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
-- TEST 3 - TOOL_COPILOT_PRODUCT_SQL  (SQL / NL2SQL)
-- =============================================================================

-- 3a. Catalog
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_COPILOT_PRODUCT_SQL';

-- 3b. Data: active products by category
SELECT CATEGORY, COUNT(*) AS active_products
FROM   PRODUCT_CATALOG
WHERE  IS_ACTIVE = 1
GROUP BY CATEGORY
ORDER BY CATEGORY;

-- 3c. Functional: NL2SQL narrate
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 3c: TOOL_COPILOT_PRODUCT_SQL (NL2SQL narrate) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Bandingkan semua produk deposito aktif berdasarkan suku bunga tertinggi. Tampilkan nama produk, tenor bulan, dan minimum investasi.',
    profile_name => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
    action       => 'narrate'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-3c] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST 4 - TOOL_COPILOT_PROFILE_RAG  (RAG / Vector)
-- =============================================================================

-- 4a. Catalog
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_COPILOT_PROFILE_RAG';

-- 4b. Embedding table health
SELECT COUNT(*)                      AS total_rows,
       COUNT(EMBEDDING)              AS populated,
       COUNT(*) - COUNT(EMBEDDING)   AS nulls,
       COUNT(DISTINCT CUSTOMER_ID)   AS distinct_customers
FROM   CUSTOMER_EMBEDDINGS;

-- Content-type breakdown
SELECT CONTENT_TYPE, COUNT(*) AS cnt
FROM   CUSTOMER_EMBEDDINGS
GROUP BY CONTENT_TYPE
ORDER BY cnt DESC;

-- Sample rows - confirm content and vector dimension
SELECT CUSTOMER_ID,
       CONTENT_TYPE,
       SUBSTR(CONTENT, 1, 100)         AS content_preview,
       VECTOR_DIMENSION(EMBEDDING)     AS embed_dim
FROM   CUSTOMER_EMBEDDINGS
FETCH FIRST 3 ROWS ONLY;

-- 4c. Vector index
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'CUSTOMER_EMBEDDINGS'
  AND  index_name LIKE '%VEC%';

-- 4d. Functional: semantic retrieval via GENERATE (action => 'chat')
--     NOTE: 'chat' activates the embedding model for vector search;
--           'narrate'/'query' would trigger NL2SQL on embedding columns (wrong).
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 4d: TOOL_COPILOT_PROFILE_RAG (GENERATE chat) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Apa preferensi risiko dan tujuan investasi nasabah CUST001?',
    profile_name => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-4d] FAILED: ' || SQLERRM);
END;
/

-- 4e. Direct vector similarity search (bypasses LLM - pure Oracle VECTOR_DISTANCE)
--     Adjust credential_name / url / model to match your OCI GenAI embedding config.
DECLARE
  C_PARAMS  CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-multilingual-v3.0"}';
  v_qvec    VECTOR(1024, FLOAT32);
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 4e: TOOL_COPILOT_PROFILE_RAG (direct VECTOR_DISTANCE) ---');
  v_qvec := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
               'preferensi risiko konservatif proteksi modal', JSON(C_PARAMS));
  FOR r IN (
    SELECT CUSTOMER_ID,
           CONTENT_TYPE,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE), 4) AS cosine_dist,
           SUBSTR(CONTENT, 1, 120)                               AS content_preview
    FROM   CUSTOMER_EMBEDDINGS
    ORDER BY VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE)
    FETCH FIRST 5 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(
      r.CUSTOMER_ID || ' [' || r.CONTENT_TYPE || '] dist=' || r.cosine_dist
      || CHR(10) || '  ' || r.content_preview);
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-4e] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST 5 - TOOL_COPILOT_NOTES_RAG  (RAG / Vector)
-- =============================================================================

-- 5a. Catalog
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_COPILOT_NOTES_RAG';

-- 5b. Embedding table health
SELECT COUNT(*)                     AS total_rows,
       COUNT(EMBEDDING)             AS populated,
       COUNT(*) - COUNT(EMBEDDING)  AS nulls,
       COUNT(DISTINCT CUSTOMER_ID)  AS distinct_customers,
       COUNT(DISTINCT NOTE_ID)      AS distinct_notes
FROM   MEETING_NOTES_EMBEDDINGS;

-- Sample rows
SELECT CUSTOMER_ID,
       NOTE_ID,
       SUBSTR(CONTENT, 1, 100)       AS content_preview,
       VECTOR_DIMENSION(EMBEDDING)   AS embed_dim
FROM   MEETING_NOTES_EMBEDDINGS
FETCH FIRST 3 ROWS ONLY;

-- 5c. Vector index
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'MEETING_NOTES_EMBEDDINGS'
  AND  index_name LIKE '%VEC%';

-- 5d. Functional: semantic search via GENERATE chat
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 5d: TOOL_COPILOT_NOTES_RAG (GENERATE chat) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Apa yang pernah dibahas tentang reksa dana saham dan risiko pasar dalam pertemuan dengan nasabah?',
    profile_name => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-5d] FAILED: ' || SQLERRM);
END;
/

-- 5e. Direct vector similarity search
DECLARE
  C_PARAMS  CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-multilingual-v3.0"}';
  v_qvec    VECTOR(1024, FLOAT32);
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 5e: TOOL_COPILOT_NOTES_RAG (direct VECTOR_DISTANCE) ---');
  v_qvec := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
               'reksa dana saham risiko pasar diskusi nasabah', JSON(C_PARAMS));
  FOR r IN (
    SELECT CUSTOMER_ID,
           NOTE_ID,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE), 4) AS cosine_dist,
           SUBSTR(CONTENT, 1, 120)                               AS content_preview
    FROM   MEETING_NOTES_EMBEDDINGS
    ORDER BY VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE)
    FETCH FIRST 5 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(
      r.CUSTOMER_ID || ' note=' || r.NOTE_ID || ' dist=' || r.cosine_dist
      || CHR(10) || '  ' || r.content_preview);
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-5e] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST 6 - TOOL_COPILOT_PRODUCT_RAG  (RAG / Vector)
-- =============================================================================

-- 6a. Catalog
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_COPILOT_PRODUCT_RAG';

-- 6b. Embedding view health (PRODUCT_EMBEDDINGS_V - IS_ACTIVE=1 filter built in)
SELECT COUNT(*)                     AS total_rows,
       COUNT(EMBEDDING)             AS populated,
       COUNT(*) - COUNT(EMBEDDING)  AS nulls,
       COUNT(DISTINCT PRODUCT_ID)   AS distinct_products
FROM   PRODUCT_EMBEDDINGS_V;

-- Category breakdown
SELECT CATEGORY, RISK_LEVEL, COUNT(*) AS cnt
FROM   PRODUCT_EMBEDDINGS_V
GROUP BY CATEGORY, RISK_LEVEL
ORDER BY CATEGORY, RISK_LEVEL;

-- Sample rows
SELECT PRODUCT_ID,
       PRODUCT_NAME,
       CATEGORY,
       RISK_LEVEL,
       SUBSTR(CONTENT, 1, 100)       AS content_preview,
       VECTOR_DIMENSION(EMBEDDING)   AS embed_dim
FROM   PRODUCT_EMBEDDINGS_V
FETCH FIRST 3 ROWS ONLY;

-- 6c. Vector index (on base table PRODUCT_EMBEDDINGS)
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'PRODUCT_EMBEDDINGS'
  AND  index_name LIKE '%VEC%';

-- 6d. Functional: semantic product discovery via GENERATE chat
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 6d: TOOL_COPILOT_PRODUCT_RAG (GENERATE chat) ---');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Produk investasi apa yang paling cocok untuk perencanaan pensiun jangka panjang dengan risiko rendah dan perlindungan modal?',
    profile_name => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 3000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-6d] FAILED: ' || SQLERRM);
END;
/

-- 6e. Direct vector similarity search
DECLARE
  C_PARAMS  CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_GENAI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-multilingual-v3.0"}';
  v_qvec    VECTOR(1024, FLOAT32);
  v_t0      TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- TEST 6e: TOOL_COPILOT_PRODUCT_RAG (direct VECTOR_DISTANCE) ---');
  v_qvec := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
               'pensiun jangka panjang risiko rendah proteksi modal', JSON(C_PARAMS));
  FOR r IN (
    SELECT PRODUCT_ID,
           PRODUCT_NAME,
           CATEGORY,
           RISK_LEVEL,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE), 4) AS cosine_dist,
           SUBSTR(CONTENT, 1, 100)                               AS content_preview
    FROM   PRODUCT_EMBEDDINGS_V
    ORDER BY VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE)
    FETCH FIRST 5 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(
      r.PRODUCT_NAME || ' [' || r.CATEGORY || '/' || r.RISK_LEVEL || '] dist=' || r.cosine_dist
      || CHR(10) || '  ' || r.content_preview);
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('[TEST-6e] FAILED: ' || SQLERRM);
END;
/


-- =============================================================================
-- TEST SUMMARY
-- =============================================================================
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('============================================================');
  DBMS_OUTPUT.PUT_LINE('COPILOT TOOL TESTS COMPLETE');
  DBMS_OUTPUT.PUT_LINE('------------------------------------------------------------');
  DBMS_OUTPUT.PUT_LINE('SQL tools  (1-3): expect NL2SQL narrative from GENERATE narrate');
  DBMS_OUTPUT.PUT_LINE('RAG tools  (4-6): expect semantic answer from GENERATE chat');
  DBMS_OUTPUT.PUT_LINE('                  + top-5 nearest-neighbor rows from VECTOR_DISTANCE');
  DBMS_OUTPUT.PUT_LINE('------------------------------------------------------------');
  DBMS_OUTPUT.PUT_LINE('If any step fails, check:');
  DBMS_OUTPUT.PUT_LINE('  - DANAMON_COPILOT_PROFILE_GROK_OCI status = ACTIVE');
  DBMS_OUTPUT.PUT_LINE('  - OCI_GENAI_CRED_VEC credential is valid');
  DBMS_OUTPUT.PUT_LINE('  - Embedding tables populated (non-zero populated count)');
  DBMS_OUTPUT.PUT_LINE('  - Vector indexes exist and are VALID');
  DBMS_OUTPUT.PUT_LINE('  - C_PARAMS url/model match your OCI tenancy region');
  DBMS_OUTPUT.PUT_LINE('============================================================');
END;
/
