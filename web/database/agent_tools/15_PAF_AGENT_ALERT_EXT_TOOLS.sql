-- =============================================================================
-- 15_PAF_AGENT_ALERT_EXT_TOOLS.sql
-- Creates 3 HTTP tools for real-time external data access by PAF_AGENT_ALERT.
-- Run AFTER 09_PAF_AGENT_ALERT_TOOLS.sql and BEFORE re-running
-- 10_CREATE_PAF_AGENT_ALERT.sql (updated version with 7 tools).
--
-- Tools created:
--   5. TOOL_ALERT_LIVE_MARKET_HTTP   (HTTP - IDX API: live IHSG + sector performance)
--   6. TOOL_ALERT_MACRO_HTTP         (HTTP - BPS/BI API: GDP, inflation, BI Rate outlook)
--   7. TOOL_ALERT_CRASH_HISTORY_HTTP (HTTP - IDX Historical: past crash & recovery data)
--
-- Why external tools for ALERT (vs COPILOT):
--   - MARKET_DATA table is a snapshot (FETCHED_AT). When RM calls a customer about
--     a portfolio_loss, citing stale IHSG data destroys credibility.
--   - Tool 5 overrides stale MARKET_DATA with live values for Seksi 2 and 3.
--   - Tool 6 fills Seksi 6 (market outlook) with real GDP/inflation figures
--     instead of relying on LLM training data (potentially outdated).
--   - Tool 7 selects the most appropriate historical precedent for Seksi 2
--     (the reassurance narrative) based on current drop magnitude -- not hardcoded.
--
-- Prerequisites:
--   1. All 4 internal tools already created (09_PAF_AGENT_ALERT_TOOLS.sql)
--   2. External API credentials registered in Oracle Wallet (see Section 0)
--   3. Network ACL grants for outbound HTTPS from ADB (see Section 0)
--
-- Run as ADMIN (schema owner).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- SECTION 0 - Prerequisites: Credentials + Network ACL
--
-- Note: CRED_IDX_API and CRED_BI_API may already exist if
--       13_PAF_AGENT_COPILOT_EXT_TOOLS.sql was executed first.
--       All credential blocks below are safe to re-run (skip-if-exists logic).
-- =============================================================================

-- 0a. CRED_IDX_API - IDX (Bursa Efek Indonesia) Market Data API
--     Used by both TOOL_ALERT_LIVE_MARKET_HTTP and TOOL_ALERT_CRASH_HISTORY_HTTP.
--     Replace <IDX_API_KEY> with key from idx.co.id developer portal.
--     Skip if already created by 13_PAF_AGENT_COPILOT_EXT_TOOLS.sql.
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_IDX_API',
    username        => 'deny.nursidiq@oracle.com',
    password        => 'R(nwyBI{nC(vq;aVKW4b'
  );
  DBMS_OUTPUT.PUT_LINE('[0a] CRED_IDX_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0a] CRED_IDX_API already exists -- skipped (reusing from COPILOT tools).');
    ELSE RAISE;
    END IF;
END;
/

-- 0b. CRED_BPS_API - Badan Pusat Statistik (Statistics Indonesia) API
--     Used by TOOL_ALERT_MACRO_HTTP for GDP growth and inflation data.
--     Register at webapi.bps.go.id to obtain an API key.
--     Replace <BPS_API_KEY> with the actual key.
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_BPS_API',
    username        => 'api_key',
    password        => '<BPS_API_KEY>'
  );
  DBMS_OUTPUT.PUT_LINE('[0b] CRED_BPS_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0b] CRED_BPS_API already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0c. CRED_BI_API - Bank Indonesia Open Data API
--     Used by TOOL_ALERT_MACRO_HTTP for BI Rate direction / monetary policy statement.
--     Skip if already created by 13_PAF_AGENT_COPILOT_EXT_TOOLS.sql.
BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'CRED_BI_API',
    username        => 'api_key',
    password        => '<BI_API_KEY>'
  );
  DBMS_OUTPUT.PUT_LINE('[0c] CRED_BI_API created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' THEN
      DBMS_OUTPUT.PUT_LINE('[0c] CRED_BI_API already exists -- skipped (reusing from COPILOT tools).');
    ELSE RAISE;
    END IF;
END;
/

-- 0d. Network ACL - IDX API (api.idx.co.id)
--     Skip if already granted by 13_PAF_AGENT_COPILOT_EXT_TOOLS.sql.
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host       => 'api.idx.co.id',
    lower_port => 443,
    upper_port => 443,
    ace        => xs$ace_type(
                    privilege_list => xs$name_list('connect'),
                    principal_name => 'DBN',
                    principal_type => xs_acl.ptype_db
                  )
  );
  DBMS_OUTPUT.PUT_LINE('[0d] ACL granted: api.idx.co.id:443');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' OR SQLERRM LIKE '%duplicate%' THEN
      DBMS_OUTPUT.PUT_LINE('[0d] ACL api.idx.co.id already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0e. Network ACL - BPS API (webapi.bps.go.id)
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host       => 'webapi.bps.go.id',
    lower_port => 443,
    upper_port => 443,
    ace        => xs$ace_type(
                    privilege_list => xs$name_list('connect'),
                    principal_name => 'DBN',
                    principal_type => xs_acl.ptype_db
                  )
  );
  DBMS_OUTPUT.PUT_LINE('[0e] ACL granted: webapi.bps.go.id:443');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' OR SQLERRM LIKE '%duplicate%' THEN
      DBMS_OUTPUT.PUT_LINE('[0e] ACL webapi.bps.go.id already exists -- skipped.');
    ELSE RAISE;
    END IF;
END;
/

-- 0f. Network ACL - Bank Indonesia API (apimgt.bi.go.id)
--     Skip if already granted by 13_PAF_AGENT_COPILOT_EXT_TOOLS.sql.
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host       => 'apimgt.bi.go.id',
    lower_port => 443,
    upper_port => 443,
    ace        => xs$ace_type(
                    privilege_list => xs$name_list('connect'),
                    principal_name => 'DBN',
                    principal_type => xs_acl.ptype_db
                  )
  );
  DBMS_OUTPUT.PUT_LINE('[0f] ACL granted: apimgt.bi.go.id:443');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already exists%' OR SQLERRM LIKE '%duplicate%' THEN
      DBMS_OUTPUT.PUT_LINE('[0f] ACL apimgt.bi.go.id already exists -- skipped (reusing from COPILOT tools).');
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 0 complete. Credentials and ACLs registered.');
  DBMS_OUTPUT.PUT_LINE('Proceeding to create 3 HTTP tools for PAF_AGENT_ALERT...');
END;
/


-- =============================================================================
-- TOOL 5 - TOOL_ALERT_LIVE_MARKET_HTTP
-- Type   : HTTP (REST API)
-- Source : IDX (Bursa Efek Indonesia) Market Data API
--          Base URL: https://api.idx.co.id/v1/market
-- Purpose: CRITICAL - Replaces stale MARKET_DATA snapshot with real-time IHSG
--          level, change%, sector performance breakdown, and USD/IDR rate.
--
-- Why needed for ALERT specifically:
--   MARKET_DATA table (used by TOOL_ALERT_ACTIVE_SQL) stores FETCHED_AT
--   timestamp -- data may be days old. When RM calls a customer about a
--   portfolio_loss and cites an incorrect IHSG figure, credibility is destroyed.
--   This tool provides the live figure to use in Seksi 2 and Seksi 5 call scripts.
--
--   Also provides SECTOR breakdown (Keuangan, Energi, Teknologi, Konsumer, dll.)
--   enabling the agent to explain WHY a reksa dana saham dropped MORE than the
--   overall IHSG: "Fund ini overweight di sektor teknologi (-24%) vs IHSG (-10%)."
--
-- Fills: Seksi 2 (WHY DID THIS HAPPEN), Seksi 3 (portfolio snapshot market line),
--        Seksi 5 (call script -- RM can confidently state today's IHSG level).
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_LIVE_MARKET_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_LIVE_MARKET_HTTP dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk data pasar REAL-TIME dari IDX (Bursa Efek Indonesia). ' ||
    'TUJUAN UTAMA: menggantikan angka IHSG dan USD/IDR yang stale di MARKET_DATA table ' ||
    'dengan nilai live saat analisis alert dijalankan. ' ||
    'Data yang tersedia: (1) IHSG level saat ini + change% hari ini + change% 30 hari, ' ||
    '(2) performa 10 sektor IDX dalam 1 bulan terakhir (Keuangan, Energi, Teknologi, ' ||
    'Konsumer, Properti, Infrastruktur, Pertambangan, Agrikultur, Industri, Kesehatan), ' ||
    '(3) kurs USD/IDR terkini. ' ||
    'Gunakan sektor breakdown untuk menjelaskan mengapa reksa dana saham nasabah turun ' ||
    'LEBIH DALAM dari IHSG secara keseluruhan -- perbedaan ini menentukan narasi Seksi 2. ' ||
    'PHASE 1b -- panggil setelah TOOL_ALERT_ACTIVE_SQL, sebelum generate narrative.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_LIVE_MARKET_HTTP',
    attributes  => JSON_OBJECT(
      'tool_type'   VALUE 'HTTP',
      'tool_params' VALUE JSON_OBJECT(
        'base_url'        VALUE 'https://api.idx.co.id/v1/market',
        'method'          VALUE 'GET',
        'credential_name' VALUE 'CRED_IDX_API',
        'headers'         VALUE JSON_OBJECT(
          'Authorization' VALUE 'Bearer {credential}',
          'Accept'        VALUE 'application/json',
          'X-Source'      VALUE 'PAF_AGENT_ALERT'
        )
      ),
      'tool_inputs' VALUE JSON_ARRAY(
        JSON_OBJECT(
          'name'        VALUE 'data_type',
          'description' VALUE 'Jenis data yang diambil: "composite" (IHSG level + change%), "sectors" (kinerja 10 sektor IDX 30 hari terakhir), "currencies" (kurs USD/IDR terkini), "full" (semua dalam satu call). Default: "full" untuk analisis alert portfolio_loss.',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        ),
        JSON_OBJECT(
          'name'        VALUE 'period',
          'description' VALUE 'Periode perbandingan historis: "1D" (hari ini), "1W" (7 hari), "1M" (30 hari -- PALING RELEVAN untuk portfolio_loss alert yang menggunakan return_30d), "3M" (90 hari), "YTD" (tahun berjalan). Default: "1M".',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        ),
        JSON_OBJECT(
          'name'        VALUE 'sector_codes',
          'description' VALUE 'Kode sektor spesifik yang ingin difokuskan, pisahkan koma: "FINANCE,TECH,MINING". Gunakan jika fund nasabah diketahui terkonsentrasi di sektor tertentu. Kosongkan untuk ambil semua 10 sektor.',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        )
      )
    ),
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[5/7] TOOL_ALERT_LIVE_MARKET_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('      Source   : IDX API -- api.idx.co.id/v1/market');
  DBMS_OUTPUT.PUT_LINE('      Fills    : Seksi 2 (WHY), Seksi 3 (numbers), Seksi 5 (call script)');
  DBMS_OUTPUT.PUT_LINE('      Key value: live IHSG + sektor breakdown -- bukan dari MARKET_DATA stale');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/7] ERROR creating TOOL_ALERT_LIVE_MARKET_HTTP: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 6 - TOOL_ALERT_MACRO_HTTP
-- Type   : HTTP (REST API)
-- Source : BPS (webapi.bps.go.id) + Bank Indonesia (apimgt.bi.go.id)
--          Base URL: https://webapi.bps.go.id/v1/api
-- Purpose: Macro-economic indicators for Seksi 6 "WHAT THE MARKET IS EXPECTED
--          TO DO" -- the forward-looking reassurance section.
--
-- Why needed for ALERT specifically:
--   Seksi 6 output template requires: "Indonesia GDP growth X%",
--   "Bank Indonesia may reduce interest rates later this year."
--   Without this tool, the LLM must generate these figures from training data
--   which may be months or years outdated. A figure like "GDP 5.1%" that is
--   off by even 0.3% will undermine the RM's credibility in a professional call.
--
--   This tool fetches: latest GDP growth (BPS quarterly release), CPI/inflation
--   rate (BPS monthly), and BI Rate monetary policy direction from BI statements.
--
-- Fills: Seksi 6 (WHAT THE MARKET IS EXPECTED TO DO) -- economic fundamentals,
--        BI Rate trajectory, analyst consensus on market recovery.
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_MACRO_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_MACRO_HTTP dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk indikator makroekonomi Indonesia yang akurat dan terkini. ' ||
    'TUJUAN UTAMA: mengisi Seksi 6 (WHAT THE MARKET IS EXPECTED TO DO) dengan data ' ||
    'real yang dapat dipertanggungjawabkan -- bukan angka dari training data LLM. ' ||
    'Data BPS (bps.go.id): PDB/GDP growth Indonesia (rilis kuartalan), ' ||
    'inflasi CPI bulanan (YoY%), konsumsi rumah tangga, pertumbuhan ekspor. ' ||
    'Data Bank Indonesia: BI Rate terkini dan arah kebijakan moneter ' ||
    '(hawkish/dovish -- apakah BI berpotensi turunkan atau naikkan rate), ' ||
    'pernyataan resmi Dewan Gubernur BI terbaru tentang outlook ekonomi. ' ||
    'Output digunakan langsung sebagai argumen reassurance kepada nasabah: ' ||
    '"Fundamental ekonomi Indonesia masih kuat: PDB tumbuh X%, inflasi terkendali di Y%." ' ||
    'PHASE 4 -- panggil di akhir sebelum generate Seksi 6.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_MACRO_HTTP',
    attributes  => JSON_OBJECT(
      'tool_type'   VALUE 'HTTP',
      'tool_params' VALUE JSON_OBJECT(
        'base_url'        VALUE 'https://webapi.bps.go.id/v1/api',
        'method'          VALUE 'GET',
        'credential_name' VALUE 'CRED_BPS_API',
        'headers'         VALUE JSON_OBJECT(
          'key'    VALUE '{credential}',
          'Accept' VALUE 'application/json'
        )
      ),
      'tool_inputs' VALUE JSON_ARRAY(
        JSON_OBJECT(
          'name'        VALUE 'indicator',
          'description' VALUE 'Indikator yang diambil: "gdp_growth" (pertumbuhan PDB kuartal terbaru + forecast 2 kuartal ke depan), "inflation" (CPI YoY% bulan terbaru), "bi_rate_direction" (arah kebijakan BI Rate: apakah berpotensi naik/turun/stabil berdasarkan pernyataan BI terbaru), "full_outlook" (semua indikator + ringkasan outlook ekonomi Indonesia). Default: "full_outlook" untuk konteks Seksi 6.',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        ),
        JSON_OBJECT(
          'name'        VALUE 'period',
          'description' VALUE 'Periode data: "latest" (rilis terbaru -- default), "Q1_2026", "Q4_2025", "annual_2025". Gunakan "latest" kecuali perlu data historis untuk perbandingan.',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        ),
        JSON_OBJECT(
          'name'        VALUE 'include_bi_statement',
          'description' VALUE 'true/false -- apakah sertakan kutipan pernyataan resmi Bank Indonesia tentang arah suku bunga dan outlook pasar. Berguna untuk argumen "Bank Indonesia may reduce rates later this year". Default: true.',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        )
      )
    ),
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[6/7] TOOL_ALERT_MACRO_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('      Source   : BPS API (webapi.bps.go.id) + BI API (apimgt.bi.go.id)');
  DBMS_OUTPUT.PUT_LINE('      Fills    : Seksi 6 (market outlook, GDP, BI Rate direction)');
  DBMS_OUTPUT.PUT_LINE('      Key value: angka GDP/inflasi aktual -- bukan dari LLM training data');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[6/7] ERROR creating TOOL_ALERT_MACRO_HTTP: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- TOOL 7 - TOOL_ALERT_CRASH_HISTORY_HTTP
-- Type   : HTTP (REST API)
-- Source : IDX Historical Market Data API
--          Base URL: https://api.idx.co.id/v1/history/crashes
-- Purpose: Retrieves historical IHSG crash & recovery episodes to automatically
--          select the MOST RELEVANT historical precedent based on current
--          portfolio drop magnitude -- replacing the hardcoded March 2020 example
--          in the preamble.
--
-- Why needed for ALERT specifically:
--   Seksi 2 output template explicitly requires:
--     "A very similar drop happened in [year] -- market fell X% in Y days
--      due to [cause]. Within Z months, it had fully recovered."
--   The current preamble hardcodes one example (March 2020, -19%, COVID, 5 months).
--   This is suboptimal because:
--     - A customer with a -8% drop should NOT be compared to -19% COVID crash
--       (unnecessarily alarming, or feels dismissive)
--     - The most reassuring precedent is one where the MAGNITUDE is similar to
--       the customer's current loss -- matching severity builds credibility
--   This tool returns the 5 largest IHSG correction episodes with matched recovery
--   data, allowing the agent to select the most appropriate comparison.
--
-- Fills: Seksi 2 checkmark (historical precedent, reassurance narrative),
--        Seksi 5 (call script -- RM mentions specific historical year and data).
-- =============================================================================

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ALERT_CRASH_HISTORY_HTTP');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ALERT_CRASH_HISTORY_HTTP dropped.');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'HTTP tool untuk data historis koreksi dan pemulihan IHSG. ' ||
    'TUJUAN UTAMA: memilih preseden historis yang PALING RELEVAN berdasarkan ' ||
    'magnitude penurunan portofolio nasabah saat ini -- bukan hardcoded satu contoh. ' ||
    'Data mencakup 5 episode koreksi besar IHSG: ' ||
    '(1) COVID-19 2020: IHSG turun 38% dalam 33 hari, pulih dalam 8 bulan; ' ||
    '(2) Perang Dagang AS-China 2018: IHSG turun 18% dalam 90 hari, pulih 9 bulan; ' ||
    '(3) Taper Tantrum 2013: IHSG turun 24% dalam 60 hari, pulih 12 bulan; ' ||
    '(4) Krisis Keuangan Global 2008-2009: IHSG turun 53% dalam 18 bulan, pulih 24 bulan; ' ||
    '(5) Krisis Mata Uang 2015: IHSG turun 21% dalam 6 bulan, pulih 8 bulan. ' ||
    'Gunakan parameter drop_magnitude (% penurunan reksa dana nasabah) agar tool ' ||
    'otomatis merekomendasikan preseden yang paling dekat magnitudenya. ' ||
    'Strategi pemilihan: drop < 12% -> 2018 episode; 12-25% -> 2013 atau 2015; ' ||
    'lebih dari 25% -> 2020 COVID. Output berupa narasi siap pakai untuk Seksi 2. ' ||
    'PHASE 3b -- panggil bersamaan dengan TOOL_ALERT_NOTES_RAG.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ALERT_CRASH_HISTORY_HTTP',
    attributes  => JSON_OBJECT(
      'tool_type'   VALUE 'HTTP',
      'tool_params' VALUE JSON_OBJECT(
        'base_url'        VALUE 'https://api.idx.co.id/v1/history/crashes',
        'method'          VALUE 'GET',
        'credential_name' VALUE 'CRED_IDX_API',
        'headers'         VALUE JSON_OBJECT(
          'Authorization' VALUE 'Bearer {credential}',
          'Accept'        VALUE 'application/json',
          'X-Source'      VALUE 'PAF_AGENT_ALERT'
        )
      ),
      'tool_inputs' VALUE JSON_ARRAY(
        JSON_OBJECT(
          'name'        VALUE 'drop_magnitude',
          'description' VALUE 'Persentase penurunan portofolio nasabah saat ini (angka positif, contoh: 18.3 untuk turun 18.3%). Tool akan otomatis memilih episode historis IHSG yang paling dekat magnitudenya. Jika tidak diisi, tool mengembalikan semua 5 episode koreksi besar.',
          'type'        VALUE 'number',
          'required'    VALUE FALSE
        ),
        JSON_OBJECT(
          'name'        VALUE 'episode',
          'description' VALUE 'Episode historis spesifik jika sudah diketahui: "covid_2020", "trade_war_2018", "taper_tantrum_2013", "gfc_2008", "currency_crisis_2015". Kosongkan untuk auto-select berdasarkan drop_magnitude.',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        ),
        JSON_OBJECT(
          'name'        VALUE 'output_format',
          'description' VALUE 'Format output: "data" (angka mentah: tanggal krisis, % turun, hari pemulihan), "narrative_id" (narasi siap pakai dalam Bahasa Indonesia untuk langsung dimasukkan ke Seksi 2), "both". Default: "narrative_id".',
          'type'        VALUE 'string',
          'required'    VALUE FALSE
        )
      )
    ),
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[7/7] TOOL_ALERT_CRASH_HISTORY_HTTP created.');
  DBMS_OUTPUT.PUT_LINE('      Source   : IDX Historical API -- api.idx.co.id/v1/history/crashes');
  DBMS_OUTPUT.PUT_LINE('      Fills    : Seksi 2 checkmark (preseden historis yang tepat)');
  DBMS_OUTPUT.PUT_LINE('      Key value: preseden historis dipilih per magnitude -- bukan hardcoded');
END;
/


-- =============================================================================
-- VERIFICATION
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('VERIFICATION - External Alert Tools');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

-- Confirm all 7 alert tools exist (4 internal + 3 new HTTP)
SELECT tool_name, status,
       SUBSTR(description, 1, 70) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_ALERT%'
ORDER  BY tool_name;
-- Expected: 7 rows
--   TOOL_ALERT_ACTIVE_SQL, TOOL_ALERT_MATURITY_SQL  (SQL -- from 09_)
--   TOOL_ALERT_PROFILE_RAG, TOOL_ALERT_NOTES_RAG    (RAG -- from 09_)
--   TOOL_ALERT_CRASH_HISTORY_HTTP                   (HTTP -- this file)
--   TOOL_ALERT_LIVE_MARKET_HTTP                     (HTTP -- this file)
--   TOOL_ALERT_MACRO_HTTP                           (HTTP -- this file)

-- Confirm credentials exist
SELECT credential_name, username, enabled
FROM   USER_CREDENTIALS
WHERE  credential_name IN ('CRED_IDX_API', 'CRED_BPS_API', 'CRED_BI_API')
ORDER  BY credential_name;
-- Expected: 3 rows (CRED_BI_API and CRED_IDX_API may be shared with COPILOT)

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('15_PAF_AGENT_ALERT_EXT_TOOLS complete!');
  DBMS_OUTPUT.PUT_LINE('  HTTP Tools : 3');
  DBMS_OUTPUT.PUT_LINE('    Tool 5   : TOOL_ALERT_LIVE_MARKET_HTTP  (IDX live IHSG + sektor)');
  DBMS_OUTPUT.PUT_LINE('    Tool 6   : TOOL_ALERT_MACRO_HTTP        (BPS/BI GDP + outlook)');
  DBMS_OUTPUT.PUT_LINE('    Tool 7   : TOOL_ALERT_CRASH_HISTORY_HTTP (IDX crash precedents)');
  DBMS_OUTPUT.PUT_LINE('  Total ALERT tools: 7 (4 internal + 3 HTTP)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Next step: run 10_CREATE_PAF_AGENT_ALERT.sql (updated for 7 tools)');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/


-- =============================================================================
-- OPTIONAL CONNECTIVITY TESTS
-- Uncomment to verify HTTPS connectivity from ADB to each external endpoint.
-- =============================================================================

-- -- Test A: IDX API connectivity (live market data)
-- DECLARE
--   v_req  DBMS_CLOUD_TYPES.wave_rest_request_t;
--   v_res  DBMS_CLOUD_TYPES.wave_rest_response_t;
-- BEGIN
--   v_req.url := 'https://api.idx.co.id/v1/market?data_type=composite&period=1D';
--   v_req.method := 'GET';
--   v_res := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_IDX_API',
--     uri             => v_req.url,
--     method          => v_req.method
--   );
--   DBMS_OUTPUT.PUT_LINE('Test A (IDX live): HTTP ' || v_res.status_code);
--   DBMS_OUTPUT.PUT_LINE(SUBSTR(DBMS_CLOUD.GET_RESPONSE_TEXT(v_res), 1, 500));
-- EXCEPTION WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('Test A FAILED: ' || SQLERRM);
-- END;
-- /

-- -- Test B: BPS API connectivity (GDP + inflation)
-- DECLARE
--   v_res  DBMS_CLOUD_TYPES.wave_rest_response_t;
-- BEGIN
--   v_res := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_BPS_API',
--     uri             => 'https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/id/104',
--     method          => 'GET'
--   );
--   DBMS_OUTPUT.PUT_LINE('Test B (BPS GDP): HTTP ' || v_res.status_code);
--   DBMS_OUTPUT.PUT_LINE(SUBSTR(DBMS_CLOUD.GET_RESPONSE_TEXT(v_res), 1, 500));
-- EXCEPTION WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('Test B FAILED: ' || SQLERRM);
-- END;
-- /

-- -- Test C: IDX Historical crash data
-- DECLARE
--   v_res  DBMS_CLOUD_TYPES.wave_rest_response_t;
-- BEGIN
--   v_res := DBMS_CLOUD.SEND_REQUEST(
--     credential_name => 'CRED_IDX_API',
--     uri             => 'https://api.idx.co.id/v1/history/crashes?episode=covid_2020',
--     method          => 'GET'
--   );
--   DBMS_OUTPUT.PUT_LINE('Test C (IDX history): HTTP ' || v_res.status_code);
--   DBMS_OUTPUT.PUT_LINE(SUBSTR(DBMS_CLOUD.GET_RESPONSE_TEXT(v_res), 1, 500));
-- EXCEPTION WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('Test C FAILED: ' || SQLERRM);
-- END;
-- /
