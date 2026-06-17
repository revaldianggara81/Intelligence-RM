-- =============================================================================
-- 13_PAF_AGENT_COPILOT_EXT_TOOLS.sql
-- Creates 4 HTTP tools for external data access by PAF_AGENT_COPILOT.
-- Run AFTER 11_PAF_AGENT_COPILOT_TOOLS.sql and BEFORE re-running
-- 12_CREATE_PAF_AGENT_COPILOT.sql (updated version with 10 tools).
--
-- Tools created:
--   7. TOOL_COPILOT_BIRATE_HTTP    (HTTP - Bank Indonesia Open Data API)
--   8. TOOL_COPILOT_IDX_HTTP       (HTTP - IDX / Bursa Efek Indonesia API)
--   9. TOOL_COPILOT_COREBANK_HTTP  (HTTP - Danamon Core Banking REST API)
--  10. TOOL_COPILOT_ECONEWS_HTTP   (HTTP - Reuters / Internal News Feed API)
--
-- Prerequisites:
--   1. All 6 internal tools already created (11_PAF_AGENT_COPILOT_TOOLS.sql)
--   2. External API credentials registered in Oracle Wallet (see Section 0)
--   3. Network ACL grants for outbound HTTPS from ADB (see Section 0)
--
-- Run as ADMIN (schema owner).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- SECTION 0 - Prerequisites: Credentials + Network ACL
--
-- Before creating HTTP tools, you must:
--   a) Register API credentials in Oracle Wallet for each external endpoint
--   b) Grant outbound HTTPS network access from the ADB instance
--
-- Run each block once. Skip if credentials already exist.
-- =============================================================================

-- 0a. Create credential for Bank Indonesia API (API key / basic auth)
--     Replace <BI_API_KEY> with the actual key from apimgt.bi.go.id
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_BI_API',
    username        => 'api_key',
    password        => '<BI_API_KEY>'
  );
  DBMS_OUTPUT.PUT_LINE('[0a] CRED_BI_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0a] CRED_BI_API already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0b. Create credential for IDX (Bursa Efek Indonesia) Market Data API
--     Replace <IDX_API_KEY> with the actual key from idx.co.id developer portal
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_IDX_API',
    username        => 'api_key',
    password        => '<IDX_API_KEY>'
  );
  DBMS_OUTPUT.PUT_LINE('[0b] CRED_IDX_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0b] CRED_IDX_API already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0c. Create credential for Danamon Core Banking REST API (OAuth2 client credentials)
--     Replace <CLIENT_ID> and <CLIENT_SECRET> with values from API Management team
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_COREBANK_API',
    username        => '<CLIENT_ID>',
    password        => '<CLIENT_SECRET>'
  );
  DBMS_OUTPUT.PUT_LINE('[0c] CRED_COREBANK_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0c] CRED_COREBANK_API already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0d. Create credential for Reuters Connect / News API
--     Replace <NEWS_API_KEY> with the actual key from Reuters Connect or internal news feed
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_NEWS_API',
    username        => 'api_key',
    password        => '<NEWS_API_KEY>'
  );
  DBMS_OUTPUT.PUT_LINE('[0d] CRED_NEWS_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0d] CRED_NEWS_API already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0e. Grant outbound HTTPS network access from ADB to each external host
--     Adjust host values to match your actual API provider endpoints.
BEGIN
  -- Bank Indonesia
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => 'apimgt.bi.go.id',
    lower_port => 443, upper_port => 443,
    ace => xs$ace_type(
      privilege_list => xs$name_list('connect'),
      principal_name => 'ADMIN',
      principal_type => xs_acl.ptype_db
    )
  );
  -- IDX (Bursa Efek Indonesia)
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => 'api.idx.co.id',
    lower_port => 443, upper_port => 443,
    ace => xs$ace_type(
      privilege_list => xs$name_list('connect'),
      principal_name => 'ADMIN',
      principal_type => xs_acl.ptype_db
    )
  );
  -- Danamon Core Banking API (internal — adjust hostname)
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => 'corebank-api.danamon.co.id',
    lower_port => 443, upper_port => 443,
    ace => xs$ace_type(
      privilege_list => xs$name_list('connect'),
      principal_name => 'ADMIN',
      principal_type => xs_acl.ptype_db
    )
  );
  -- Reuters Connect News API
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => 'api.reutersconnect.com',
    lower_port => 443, upper_port => 443,
    ace => xs$ace_type(
      privilege_list => xs$name_list('connect'),
      principal_name => 'ADMIN',
      principal_type => xs_acl.ptype_db
    )
  );
  DBMS_OUTPUT.PUT_LINE('[0e] Network ACL grants applied for 4 external hosts.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[0e] Network ACL warning: ' || SQLERRM);
END;
/

-- 0f. Verify credentials and network ACL
SELECT credential_name, enabled
FROM   all_credentials
WHERE  credential_name IN (
         'CRED_BI_API', 'CRED_IDX_API',
         'CRED_COREBANK_API', 'CRED_NEWS_API'
       )
ORDER BY credential_name;

SELECT host, lower_port, upper_port
FROM   dba_network_acl_privileges
WHERE  principal = 'ADMIN'
  AND  host IN (
         'apimgt.bi.go.id', 'api.idx.co.id',
         'corebank-api.danamon.co.id', 'api.reutersconnect.com'
       )
ORDER BY host;
/


-- =============================================================================
-- TOOL 7 - TOOL_COPILOT_BIRATE_HTTP
-- Type   : HTTP (REST GET)
-- Source : Bank Indonesia Open Data API (apimgt.bi.go.id)
-- Purpose: Retrieves current BI 7-Day Reverse Repo Rate and BI exchange rates
--          (USD/IDR, SGD/IDR, EUR/IDR, JPY/IDR) in real time.
--          Enables the Copilot to answer competitive positioning questions:
--          "Is our deposit rate still above BI Rate?" and to put customer
--          USD/overseas-linked portfolios in currency context.
-- Endpoint: GET https://apimgt.bi.go.id/v1/monetary/bi-rate
--           GET https://apimgt.bi.go.id/v1/monetary/exchange-rate
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_BIRATE_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_BIRATE_HTTP dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk mengambil data kebijakan moneter Bank Indonesia secara real-time. '
    || 'Data tersedia: BI 7-Day Reverse Repo Rate terkini (suku bunga acuan BI), '
    || 'kurs tengah BI untuk USD/IDR, SGD/IDR, EUR/IDR, dan JPY/IDR. '
    || 'Gunakan tool ini untuk: membandingkan suku bunga deposito Danamon vs BI Rate, '
    || 'memberikan konteks kurs bagi nasabah dengan produk berdenominasi asing, '
    || 'menjawab pertanyaan "apakah produk kita masih kompetitif vs suku bunga pasar". '
    || 'Endpoint: Bank Indonesia Open Data API (apimgt.bi.go.id). '
    || 'Input opsional: data_type (''bi-rate'' atau ''exchange-rate''), '
    || 'currency_pair (contoh: ''USD/IDR'', ''SGD/IDR''), '
    || 'date (format YYYY-MM-DD, kosong = data terkini).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_BIRATE_HTTP',
    attributes  => '{
      "tool_type": "HTTP",
      "tool_params": {
        "base_url"        : "https://apimgt.bi.go.id/v1/monetary",
        "method"          : "GET",
        "credential_name" : "CRED_BI_API",
        "headers"         : {"Accept": "application/json", "X-Api-Key": "{credential}"}
      },
      "tool_inputs": [
        {
          "name"        : "data_type",
          "description" : "Jenis data yang diminta. Nilai valid: ''bi-rate'' (BI 7-Day Reverse Repo Rate) atau ''exchange-rate'' (kurs tengah BI). Default: ''bi-rate''.",
          "type"        : "string",
          "required"    : false
        },
        {
          "name"        : "currency_pair",
          "description" : "Pasangan mata uang untuk kurs (hanya berlaku jika data_type=''exchange-rate''). Contoh: ''USD/IDR'', ''SGD/IDR'', ''EUR/IDR'', ''JPY/IDR''. Kosong = semua mata uang utama.",
          "type"        : "string",
          "required"    : false
        },
        {
          "name"        : "date",
          "description" : "Tanggal data dalam format YYYY-MM-DD. Kosong = data terkini (hari ini).",
          "type"        : "string",
          "required"    : false
        }
      ]
    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[7/10] TOOL_COPILOT_BIRATE_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('       Type    : HTTP GET');
  DBMS_OUTPUT.PUT_LINE('       Source  : Bank Indonesia Open Data API');
  DBMS_OUTPUT.PUT_LINE('       Data    : BI Rate + Kurs Tengah BI (USD/IDR, SGD/IDR, EUR/IDR, JPY/IDR)');
  DBMS_OUTPUT.PUT_LINE('       Cred    : CRED_BI_API');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[7/10] ERROR: TOOL_COPILOT_BIRATE_HTTP - ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 8 - TOOL_COPILOT_IDX_HTTP
-- Type   : HTTP (REST GET)
-- Source : IDX (Bursa Efek Indonesia) Market Data API (api.idx.co.id)
-- Purpose: Retrieves real-time and intraday IDX market data:
--          IHSG composite index level, daily change, YTD return, LQ45 index,
--          and top-10 sector performance. Provides the market benchmark context
--          that the Copilot needs to evaluate customer equity fund performance
--          and give market-aware portfolio insights.
-- Endpoint: GET https://api.idx.co.id/v1/composite
--           GET https://api.idx.co.id/v1/index/{index_code}
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_IDX_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_IDX_HTTP dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk mengambil data pasar modal Indonesia secara real-time dari IDX (Bursa Efek Indonesia). '
    || 'Data tersedia: level indeks IHSG hari ini, perubahan harian (poin dan persen), '
    || 'return IHSG year-to-date (YTD), level indeks LQ45, dan kinerja sektor (top 10 sektor IDX). '
    || 'Gunakan tool ini untuk: membandingkan performa reksa dana saham nasabah vs benchmark IHSG, '
    || 'memberikan konteks kondisi pasar saat menjawab pertanyaan tentang portofolio ekuitas, '
    || 'menjawab pertanyaan "IHSG hari ini berapa?" atau "sektor apa yang naik bulan ini?". '
    || 'Endpoint: IDX Market Data API (api.idx.co.id). '
    || 'Input opsional: index_code (''COMPOSITE''/''LQ45''/''IDX30'', default: ''COMPOSITE''), '
    || 'period (''daily''/''mtd''/''ytd'', default: ''daily'').';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_IDX_HTTP',
    attributes  => '{
      "tool_type": "HTTP",
      "tool_params": {
        "base_url"        : "https://api.idx.co.id/v1",
        "method"          : "GET",
        "credential_name" : "CRED_IDX_API",
        "headers"         : {"Accept": "application/json", "Authorization": "Bearer {credential}"}
      },
      "tool_inputs": [
        {
          "name"        : "index_code",
          "description" : "Kode indeks pasar yang ingin diambil. Nilai valid: ''COMPOSITE'' (IHSG), ''LQ45'' (LQ45 Index), ''IDX30'' (IDX30 Index). Default: ''COMPOSITE''.",
          "type"        : "string",
          "required"    : false
        },
        {
          "name"        : "period",
          "description" : "Periode data yang diminta: ''daily'' (data hari ini + kemarin), ''mtd'' (month-to-date), ''ytd'' (year-to-date return). Default: ''daily''.",
          "type"        : "string",
          "required"    : false
        },
        {
          "name"        : "include_sectors",
          "description" : "Sertakan data kinerja 10 sektor IDX: ''true'' atau ''false''. Default: ''false''.",
          "type"        : "string",
          "required"    : false
        }
      ]
    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[8/10] TOOL_COPILOT_IDX_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('       Type    : HTTP GET');
  DBMS_OUTPUT.PUT_LINE('       Source  : IDX (Bursa Efek Indonesia) Market Data API');
  DBMS_OUTPUT.PUT_LINE('       Data    : IHSG, LQ45, IDX30 levels + sektor performance');
  DBMS_OUTPUT.PUT_LINE('       Cred    : CRED_IDX_API');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[8/10] ERROR: TOOL_COPILOT_IDX_HTTP - ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 9 - TOOL_COPILOT_COREBANK_HTTP
-- Type   : HTTP (REST GET / POST)
-- Source : Danamon Core Banking REST API (corebank-api.danamon.co.id)
-- Purpose: Retrieves real-time account data directly from the Core Banking
--          system (Finnacle) that is NOT yet synced to the Oracle Analytics DB.
--          Covers: current savings balance, last 30-day transactions, active
--          product status (whether a maturing deposit has been rolled over),
--          and current credit facility utilisation.
--          Fills the data-freshness gap between the Oracle DB snapshot and
--          the live core banking ledger.
-- Endpoint: GET https://corebank-api.danamon.co.id/api/v1/accounts/{customer_id}
--           GET https://corebank-api.danamon.co.id/api/v1/transactions/{customer_id}
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_COREBANK_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_COREBANK_HTTP dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk mengambil data rekening nasabah secara real-time dari sistem Core Banking '
    || 'Danamon (Finnacle). Melengkapi TOOL_COPILOT_CUSTOMER_SQL yang hanya berisi data snapshot. '
    || 'Data tersedia: saldo rekening tabungan/giro saat ini (real-time), '
    || 'daftar transaksi 30 hari terakhir, status produk deposito terkini '
    || '(apakah sudah diperpanjang/dicairkan), dan utilisasi fasilitas kredit aktif. '
    || 'Gunakan tool ini saat: RM bertanya saldo rekening terkini, '
    || 'mengecek apakah deposito jatuh tempo sudah di-rollover, '
    || 'atau menilai likuiditas nasabah sebelum menawarkan produk baru. '
    || 'PENTING: Tool ini mengakses data live -- hanya gunakan saat data real-time diperlukan. '
    || 'Untuk data historis dan agregat, gunakan TOOL_COPILOT_CUSTOMER_SQL. '
    || 'Input wajib: customer_id. '
    || 'Input opsional: data_type (''balance''/''transactions''/''products''), days_back (default: 30).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_COREBANK_HTTP',
    attributes  => '{
      "tool_type": "HTTP",
      "tool_params": {
        "base_url"        : "https://corebank-api.danamon.co.id/api/v1",
        "method"          : "GET",
        "credential_name" : "CRED_COREBANK_API",
        "headers"         : {
          "Accept"        : "application/json",
          "Authorization" : "Bearer {credential}",
          "X-Channel-Id"  : "PAF-COPILOT"
        }
      },
      "tool_inputs": [
        {
          "name"        : "customer_id",
          "description" : "ID nasabah Danamon (format: CUSTXXX, contoh: CUST001). WAJIB diisi. Digunakan sebagai path parameter untuk memanggil /accounts/{customer_id} atau /transactions/{customer_id}.",
          "type"        : "string",
          "required"    : true
        },
        {
          "name"        : "data_type",
          "description" : "Jenis data yang diminta dari core banking: ''balance'' (saldo rekening saat ini), ''transactions'' (riwayat transaksi), ''products'' (status produk aktif termasuk deposito). Default: ''balance''.",
          "type"        : "string",
          "required"    : false
        },
        {
          "name"        : "days_back",
          "description" : "Jumlah hari ke belakang untuk data transaksi (hanya berlaku jika data_type=''transactions''). Rentang: 1-90. Default: 30.",
          "type"        : "integer",
          "required"    : false
        }
      ]
    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[9/10] TOOL_COPILOT_COREBANK_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('       Type    : HTTP GET');
  DBMS_OUTPUT.PUT_LINE('       Source  : Danamon Core Banking REST API (Finnacle)');
  DBMS_OUTPUT.PUT_LINE('       Data    : Saldo real-time, transaksi 30 hari, status produk live');
  DBMS_OUTPUT.PUT_LINE('       Cred    : CRED_COREBANK_API (OAuth2 client credentials)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[9/10] ERROR: TOOL_COPILOT_COREBANK_HTTP - ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 10 - TOOL_COPILOT_ECONEWS_HTTP
-- Type   : HTTP (REST GET)
-- Source : Reuters Connect API or Danamon Internal News Feed API
-- Purpose: Fetches the latest economic and financial news headlines from the
--          past 24-72 hours relevant to Indonesian banking, capital markets,
--          and macroeconomic policy. Enables the Copilot to brief the RM on
--          market-moving news before a customer call and to contextualize
--          portfolio impacts of external events (rate decisions, regulatory
--          changes, geopolitical events).
-- Endpoint: GET https://api.reutersconnect.com/content/search (or internal feed)
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_COPILOT_ECONEWS_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_COPILOT_ECONEWS_HTTP dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk mengambil headline berita ekonomi dan keuangan terkini (24-72 jam terakhir) '
    || 'yang relevan bagi Relationship Manager Bank Danamon. '
    || 'Sumber: Reuters Connect API atau internal news feed Danamon. '
    || 'Data tersedia: judul berita dan ringkasan singkat tentang: '
    || 'kebijakan moneter BI (kenaikan/penurunan suku bunga), '
    || 'kondisi pasar modal Indonesia (IHSG, reksa dana, obligasi), '
    || 'regulasi OJK terbaru yang berdampak pada produk perbankan, '
    || 'berita makroekonomi Indonesia (inflasi, pertumbuhan, kurs), '
    || 'dan berita sektor yang mempengaruhi portofolio nasabah. '
    || 'Gunakan tool ini saat: RM meminta briefing pasar sebelum kunjungan nasabah, '
    || 'menjelaskan dampak berita terhadap portofolio nasabah tertentu, '
    || 'atau memeriksa regulasi terbaru yang relevan dengan produk yang akan ditawarkan. '
    || 'Input opsional: keywords (topik pencarian, contoh: ''BI Rate'', ''reksa dana'', ''OJK''), '
    || 'hours_back (24/48/72, default: 24), max_results (5-20, default: 10), '
    || 'category (''monetary_policy''/''capital_market''/''regulation''/''macro''/''all'').';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_COPILOT_ECONEWS_HTTP',
    attributes  => '{
      "tool_type": "HTTP",
      "tool_params": {
        "base_url"        : "https://api.reutersconnect.com/content/search",
        "method"          : "GET",
        "credential_name" : "CRED_NEWS_API",
        "headers"         : {
          "Accept"        : "application/json",
          "Authorization" : "Bearer {credential}"
        }
      },
      "tool_inputs": [
        {
          "name"        : "keywords",
          "description" : "Kata kunci pencarian berita dalam Bahasa Indonesia atau Inggris. Contoh: ''BI Rate suku bunga'', ''reksa dana IHSG'', ''OJK regulasi'', ''inflasi Indonesia''. Kosong = berita ekonomi Indonesia terkini (top headlines).",
          "type"        : "string",
          "required"    : false
        },
        {
          "name"        : "hours_back",
          "description" : "Rentang waktu berita yang diambil (jam ke belakang dari sekarang). Nilai valid: 24, 48, 72. Default: 24.",
          "type"        : "integer",
          "required"    : false
        },
        {
          "name"        : "max_results",
          "description" : "Jumlah maksimum berita yang dikembalikan. Rentang: 5-20. Default: 10.",
          "type"        : "integer",
          "required"    : false
        },
        {
          "name"        : "category",
          "description" : "Filter kategori berita: ''monetary_policy'' (kebijakan moneter BI), ''capital_market'' (pasar modal, IHSG, reksa dana), ''regulation'' (regulasi OJK/BI), ''macro'' (makroekonomi: inflasi, GDP, kurs), ''all'' (semua kategori). Default: ''all''.",
          "type"        : "string",
          "required"    : false
        }
      ]
    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[10/10] TOOL_COPILOT_ECONEWS_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('        Type    : HTTP GET');
  DBMS_OUTPUT.PUT_LINE('        Source  : Reuters Connect API / Danamon Internal News Feed');
  DBMS_OUTPUT.PUT_LINE('        Data    : Headline ekonomi, kebijakan BI/OJK, kondisi pasar');
  DBMS_OUTPUT.PUT_LINE('        Cred    : CRED_NEWS_API');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[10/10] ERROR: TOOL_COPILOT_ECONEWS_HTTP - ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- VERIFICATION - confirm all 4 HTTP tools registered
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('VERIFICATION - HTTP External Tools');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

-- 1. Confirm all 4 HTTP tools exist
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name IN (
         'TOOL_COPILOT_BIRATE_HTTP',
         'TOOL_COPILOT_IDX_HTTP',
         'TOOL_COPILOT_COREBANK_HTTP',
         'TOOL_COPILOT_ECONEWS_HTTP'
       )
ORDER BY tool_name;

-- 2. Full tool count: should now be 10 (6 internal + 4 HTTP)
SELECT COUNT(*) AS total_copilot_tools
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_COPILOT%';

-- 3. Credentials registered
SELECT credential_name, enabled
FROM   all_credentials
WHERE  credential_name IN (
         'CRED_BI_API', 'CRED_IDX_API',
         'CRED_COREBANK_API', 'CRED_NEWS_API'
       )
ORDER BY credential_name;
/

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('All 4 HTTP external tools ready.');
  DBMS_OUTPUT.PUT_LINE('Next step: run updated 12_CREATE_PAF_AGENT_COPILOT.sql');
  DBMS_OUTPUT.PUT_LINE('  (adds all 10 tools to PAF_AGENT_COPILOT, max_iterations=12)');
END;
/


-- =============================================================================
-- QUICK CONNECTIVITY TEST - validate each HTTP endpoint is reachable
-- Run manually after credentials and ACL are set up.
-- =============================================================================

-- Test A: BI Rate API connectivity
-- DECLARE
--   v_resp  CLOB;
-- BEGIN
--   v_resp := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_BI_API',
--     uri             => 'https://apimgt.bi.go.id/v1/monetary/bi-rate',
--     method          => 'GET'
--   ).body;
--   DBMS_OUTPUT.PUT_LINE('BI API: ' || SUBSTR(v_resp, 1, 500));
-- END;
-- /

-- Test B: IDX API connectivity
-- DECLARE
--   v_resp  CLOB;
-- BEGIN
--   v_resp := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_IDX_API',
--     uri             => 'https://api.idx.co.id/v1/composite',
--     method          => 'GET'
--   ).body;
--   DBMS_OUTPUT.PUT_LINE('IDX API: ' || SUBSTR(v_resp, 1, 500));
-- END;
-- /

-- Test C: Core Banking API connectivity
-- DECLARE
--   v_resp  CLOB;
-- BEGIN
--   v_resp := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_COREBANK_API',
--     uri             => 'https://corebank-api.danamon.co.id/api/v1/health',
--     method          => 'GET'
--   ).body;
--   DBMS_OUTPUT.PUT_LINE('CoreBank API: ' || SUBSTR(v_resp, 1, 500));
-- END;
-- /

-- Test D: News API connectivity
-- DECLARE
--   v_resp  CLOB;
-- BEGIN
--   v_resp := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_NEWS_API',
--     uri             => 'https://api.reutersconnect.com/content/search?q=Indonesia+economy&limit=3',
--     method          => 'GET'
--   ).body;
--   DBMS_OUTPUT.PUT_LINE('News API: ' || SUBSTR(v_resp, 1, 500));
-- END;
-- /
