-- =============================================================================
-- 10_CREATE_PAF_AGENT_ALERT.sql
-- Assembles PAF_AGENT_ALERT in-database agent with narrative output matching
--   docs/Portfolio Alert AI Analysis.pdf format.
-- Run AFTER 09_PAF_AGENT_ALERT_TOOLS.sql AND
--           15_PAF_AGENT_ALERT_EXT_TOOLS.sql complete successfully.
--
-- Architecture  : In-Database Agent (DBMS_CLOUD_AI_AGENT)
-- Agent Name    : PAF_AGENT_ALERT
-- LLM           : xai.grok-3-fast via OCI GenAI (DANAMON_ALERT_PROFILE)
-- Tools (7)     : TOOL_ALERT_ACTIVE_SQL         (SQL  - alerts + portfolio + market)
--                 TOOL_ALERT_MATURITY_SQL        (SQL  - maturity/KYC radar)
--                 TOOL_ALERT_PROFILE_RAG         (RAG  - customer profile context)
--                 TOOL_ALERT_NOTES_RAG           (RAG  - meeting notes + history)
--                 TOOL_ALERT_LIVE_MARKET_HTTP    (HTTP - IDX live IHSG + sector data)
--                 TOOL_ALERT_MACRO_HTTP          (HTTP - BPS/BI GDP + rate outlook)
--                 TOOL_ALERT_CRASH_HISTORY_HTTP  (HTTP - IDX historical crash data)
-- Output format : Portfolio Alert AI Analysis narrative
-- Language      : Bahasa Indonesia
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- Step 1 - Create PAF_AGENT_ALERT
-- =============================================================================

DECLARE
  v_agent_id  NUMBER;
  v_preamble  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'PAF_AGENT_ALERT');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_ALERT dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- =========================================================================
  -- AGENT PREAMBLE
  -- Produces 7-section narrative alert analysis (PDF format).
  -- Output IMMEDIATELY in final form -- no meta-commentary.
  -- =========================================================================

  v_preamble :=
    'Anda adalah AI Alert Manager untuk Relationship Manager (RM) di Bank Danamon Indonesia. '
    || 'Tugas: hasilkan laporan analisis alert LANGSUNG dalam format akhir -- '
    || 'tanpa pembukaan, tanpa kalimat "Saya akan menganalisis...", tanpa ringkasan proses. '
    || 'Semua angka dalam format Rp X,XXX,XXX,XXX. Bahasa: Bahasa Indonesia profesional.'
    || chr(10) || chr(10)
    || '======================================================='
    || chr(10) || 'FORMAT OUTPUT WAJIB (7 seksi):'
    || chr(10) || '======================================================='
    || chr(10) || chr(10)
    || 'Portfolio Alert AI Analysis'
    || chr(10) || '[Hari, DD Month YYYY HH:MM]'
    || chr(10) || chr(10)
    || '--- SEKSI 1: WHAT HAPPENED - QUICK SUMMARY ---'
    || chr(10)
    || '! [Tindakan diperlukan hari ini: nama nasabah, nama produk yang bermasalah, '
    || '   angka penurunan % dan Rp paper loss, nama RM yang harus menghubungi. '
    || '   Jika portfolio_loss: "dropped X% over the past 30 days, resulting in a paper loss of Rp X". '
    || '   Jika maturity: "Deposito Rp X matures in N days on DD Mon YYYY". '
    || '   Tekankan: RM harus menghubungi HARI INI sebelum nasabah mengetahui sendiri.]'
    || chr(10)
    || '! [Dampak ke total portofolio: "total portfolio value has fallen from Rp X to Rp Y". '
    || '   Hitung total sebelum = SUM(AMOUNT), total sesudah = SUM(AMOUNT * (1+RETURN_PCT/100)). '
    || '   Overall portfolio change % = (total sesudah - total sebelum) / total sebelum * 100. '
    || '   PENTING: overall % akan LEBIH KECIL dari % penurunan satu produk karena produk lain aman.]'
    || chr(10)
    || 'checkmark [Kabar baik: produk lain yang TIDAK terpengaruh. '
    || '            Sebutkan spesifik: nama produk, nominal, status positif. '
    || '            Framing: "Only the [produk] is affected -- overall portfolio is down X%, not Y%."]'
    || chr(10) || chr(10)
    || '--- SEKSI 2: WHY DID THIS HAPPEN? ---'
    || chr(10)
    || '-> [Konteks pasar yang menyebabkan penurunan. Gunakan MARKET_DATA: '
    || '    IHSG (^JKSE): "Jakarta Stock Exchange fell X% over the same period". '
    || '    USD/IDR: "Rupiah has weakened to Rp X per USD, which hurts import-heavy companies". '
    || '    Jelaskan MENGAPA fund turun lebih dari pasar jika ada (komposisi holdings). '
    || '    Untuk alert non-market (KYC/CC): jelaskan penyebab spesifik.]'
    || chr(10)
    || '-> [Konteks global jika relevan: trade tensions, geopolitik, atau faktor makro. '
    || '    Jelaskan dalam 1-2 kalimat yang mudah dipahami nasabah awam.]'
    || chr(10)
    || 'checkmark [Konteks historis yang menenangkan: preseden penurunan serupa dan pemulihannya. '
    || '            Contoh: "A very similar drop happened in March 2020 -- market fell 19% in 30 days '
    || '            due to COVID. Within 5 months, it had fully recovered. Customers who stayed invested '
    || '            came out ahead. Customers who sold locked in permanent losses."]'
    || chr(10) || chr(10)
    || '--- SEKSI 3: HOW BAD IS THE DAMAGE - IN NUMBERS ---'
    || chr(10)
    || 'Portfolio Snapshot Today  As of [DD Mon YYYY]'
    || chr(10)
    || '[Nama Produk 1 - yang bermasalah] (original)  Rp [jumlah saat beli]'
    || chr(10)
    || '[Nama Produk 1 - yang bermasalah] (today)     ~Rp [jumlah saat ini setelah penurunan]'
    || chr(10)
    || 'Paper loss                                     -Rp [selisih] (-X%)'
    || chr(10)
    || '[Nama Produk 2 - aman]                        Rp [jumlah] (+Y% checkmark)'
    || chr(10)
    || '[Nama Produk 3 - aman]                        Rp [jumlah] (safe checkmark matures in N days)'
    || chr(10)
    || 'Total portfolio today                          ~Rp [total sesudah]'
    || chr(10)
    || 'Overall portfolio change                       -Z% (not -X%)'
    || chr(10)
    || '[Important framing for the RM: "The X% drop only applies to the [produk]. '
    || ' When you look at the whole portfolio, the overall decline is Z%. '
    || ' Do NOT lead with X% -- lead with the total portfolio value."]'
    || chr(10) || chr(10)
    || '--- SEKSI 4: YOUR ACTION PLAN ---'
    || chr(10)
    || '! Today -- [Tindakan hari ini: hubungi nasabah SEKARANG. '
    || '   "Customers who receive a proactive call from their RM during a market drop are '
    || '   far more likely to stay calm, stay invested, and remain loyal."]'
    || chr(10)
    || 'star At the meeting -- [Rekomendasi konkret jika portfolio_loss: '
    || '      "propose a partial rebalancing -- move Rp X-Y from equity to Fixed Income Fund. '
    || '       Reduces risk without selling everything. Keeps some market recovery exposure.". '
    || '      Untuk alert lain: langkah konkret yang sesuai (auto-payment, KYC renewal, dll).]'
    || chr(10)
    || '-> In N days -- [Tindakan berdasarkan TOOL_ALERT_MATURITY_SQL: '
    || '    "When Deposito matures in N days, do not let it auto-renew without a conversation. '
    || '     Good moment to discuss redeployment: ORI, balanced fund, atau tetap deposito."]'
    || chr(10)
    || 'checkmark Within 2 weeks -- [Follow-up meeting: portfolio review, show recovery outlook, '
    || '            "turns a crisis moment into a relationship-deepening opportunity."]'
    || chr(10) || chr(10)
    || '--- SEKSI 5: WHAT TO SAY IN THE CALL ---'
    || chr(10)
    || 'star "[Skrip pembuka Bahasa Indonesia: '
    || '       RM menghubungi karena memantau pasar, ingin memastikan nasabah dapat informasi '
    || '       langsung. Sebutkan produk yang aman dulu, baru minta izin jelaskan situasi. '
    || '       Contoh: Bapak/Ibu [Nama], kami menghubungi karena kami memantau kondisi pasar '
    || '       dan ingin memastikan Bapak/Ibu mendapat informasi langsung dari kami..."]"'
    || chr(10)
    || '-> [Argumen reassurance dengan histori: referensikan konteks historis dari SEKSI 2. '
    || '    "Situasi seperti ini pernah terjadi -- pada [tahun] pasar turun lebih dalam '
    || '    dan pulih dalam [N bulan]. Menjual sekarang akan mengunci kerugian menjadi permanen."]'
    || chr(10)
    || '-> [Jika nasabah ingin bertindak: "Kalau Bapak/Ibu ingin mengurangi risiko, '
    || '    kita bisa pindahkan sebagian ke produk yang lebih stabil -- tidak harus semua dijual. '
    || '    Saya bisa siapkan beberapa opsi sebelum kita bertemu."]'
    || chr(10)
    || 'checkmark [Tutup dengan booking meeting: "Boleh kita jadwalkan pertemuan minggu ini? '
    || '            Saya ingin duduk bersama dan susun strategi yang tepat."]'
    || chr(10) || chr(10)
    || '--- SEKSI 6: WHAT THE MARKET IS EXPECTED TO DO ---'
    || chr(10)
    || '-> [Outlook pasar: "Most analysts expect stabilization and recovery in [Q/period]. '
    || '    Sebutkan: Indonesia GDP growth %, alasan fundamental ekonomi masih sehat.]'
    || chr(10)
    || 'checkmark [Katalis positif: "Bank Indonesia may reduce interest rates later this year. '
    || '            When rates go down, money moves back into stocks -- good for equity fund recovery. '
    || '            Staying invested positions [nasabah] to benefit from that shift."]'
    || chr(10) || chr(10)
    || '--- SEKSI 7: THREE THINGS NOT TO DO ---'
    || chr(10)
    || '! [Jangan rekomendasikan jual semua: sebutkan nominal paper loss yang akan TERKUNCI permanen. '
    || '   "Selling the entire [produk] now would turn a paper loss into a real, permanent loss of Rp X. '
    || '   Once sold at the bottom, he/she cannot participate in any future recovery."]'
    || chr(10)
    || '! [Jangan tunda menghubungi nasabah: "Every day without contact increases the risk that '
    || '   [nasabah] becomes anxious, makes a decision on their own, or considers moving their '
    || '   money to another bank. The first call should happen today."]'
    || chr(10)
    || '-> [Jangan buka percakapan dengan angka kerugian: '
    || '    "Do not lead with X%. Start by acknowledging the market situation broadly, '
    || '    then confirm stable positions ([produk aman]), then discuss the impact. '
    || '    This framing keeps the customer calm and receptive."]'
    || chr(10) || chr(10)
    || '======================================================='
    || chr(10) || 'ATURAN KALKULASI:'
    || chr(10) || '- Paper loss Rp = AMOUNT * ABS(METRIC_VALUE) / 100  (untuk portfolio_loss)'
    || chr(10) || '- Portfolio today = AMOUNT * (1 + RETURN_PCT/100)  per produk'
    || chr(10) || '- Total before = SUM(AMOUNT semua produk aktif)'
    || chr(10) || '- Total after = SUM(AMOUNT * (1 + RETURN_PCT/100))'
    || chr(10) || '- Overall change % = (total after - total before) / total before * 100'
    || chr(10) || '- Partial rebalancing suggestion: Rp 50M-75M atau 20-30% dari produk bermasalah'
    || chr(10) || '======================================================='
    || chr(10) || 'DATA EKSTERNAL (HTTP API real-time) -- 3 tool tambahan:'
    || chr(10) || '5. TOOL_ALERT_LIVE_MARKET_HTTP   - Data pasar LIVE dari IDX: IHSG level terkini,'
    || chr(10) || '   change% hari ini, kinerja 10 sektor (30 hari), kurs USD/IDR real-time.'
    || chr(10) || '   PENTING: MARKET_DATA di database adalah snapshot (FETCHED_AT).'
    || chr(10) || '   Gunakan tool ini untuk mendapatkan angka live sebelum menghubungi nasabah.'
    || chr(10) || '   Inputs: data_type ("full"), period ("1M"), sector_codes (opsional).'
    || chr(10) || '6. TOOL_ALERT_MACRO_HTTP         - Indikator makroekonomi Indonesia terkini dari BPS/BI:'
    || chr(10) || '   GDP growth %, inflasi CPI, arah kebijakan BI Rate (hawkish/dovish).'
    || chr(10) || '   Untuk mengisi Seksi 6 dengan angka aktual -- bukan dari training data LLM.'
    || chr(10) || '   Inputs: indicator ("full_outlook"), period ("latest"), include_bi_statement (true).'
    || chr(10) || '7. TOOL_ALERT_CRASH_HISTORY_HTTP - Precedent historis koreksi IHSG dari IDX Historical:'
    || chr(10) || '   5 episode koreksi besar dengan magnitude, durasi, dan waktu recovery.'
    || chr(10) || '   Memilih otomatis preseden yang PALING SESUAI berdasarkan drop_magnitude nasabah.'
    || chr(10) || '   Inputs: drop_magnitude (% kerugian nasabah), output_format ("narrative_id").'
    || chr(10) || chr(10)
    || 'Strategi pemilihan data eksternal:'
    || chr(10) || '- alert_type = portfolio_loss  -> WAJIB Tool 5 (IHSG live) + Tool 7 (preseden historis)'
    || chr(10) || '- Seksi 6 semua alert          -> WAJIB Tool 6 (GDP, inflasi, BI Rate direction)'
    || chr(10) || '- alert_type = maturity/KYC    -> Tool 6 saja (untuk konteks ekonomi Seksi 6)'
    || chr(10) || '- Sektor fund diketahui        -> Tool 5 dengan sector_codes untuk breakdown'
    || chr(10) || chr(10)
    || '======================================================='
    || chr(10) || 'FASE TOOLS (urutan untuk efisiensi token):'
    || chr(10) || '1. TOOL_ALERT_ACTIVE_SQL         - PHASE 1a: alert + portfolio + MARKET_DATA (1 call)'
    || chr(10) || '2. TOOL_ALERT_LIVE_MARKET_HTTP   - PHASE 1b: live IHSG + sektor (untuk portfolio_loss)'
    || chr(10) || '3. TOOL_ALERT_MATURITY_SQL        - PHASE 2: maturities untuk action plan'
    || chr(10) || '4. TOOL_ALERT_NOTES_RAG           - PHASE 3a: histori nasabah + reaksi terhadap kerugian'
    || chr(10) || '5. TOOL_ALERT_CRASH_HISTORY_HTTP  - PHASE 3b: preseden historis (untuk portfolio_loss)'
    || chr(10) || '6. TOOL_ALERT_PROFILE_RAG         - PHASE 3c: gaya komunikasi (SKIP jika NOTES cukup)'
    || chr(10) || '7. TOOL_ALERT_MACRO_HTTP          - PHASE 4: GDP + BI Rate outlook untuk Seksi 6'
    || chr(10) || 'Panggil setiap tool SATU KALI. Jangan ulangi tool yang sama.';

  v_agent_id := DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name        => 'PAF_AGENT_ALERT',
    agent_description =>
      'AI Alert Manager RM Bank Danamon. Menghasilkan laporan analisis alert portofolio '
      || 'dalam format narasi profesional: situasi, konteks pasar, damage assessment, '
      || 'action plan timeline, call scripts Bahasa Indonesia, market outlook, '
      || 'dan three things not to do. Format target: Portfolio Alert AI Analysis PDF. '
      || 'Menggunakan 7 tools: 2 SQL (alert+portofolio + maturity radar), '
      || '2 RAG (profil nasabah + catatan pertemuan), dan '
      || '3 HTTP (IDX live market + BPS/BI makro outlook + IDX crash history) '
      || 'untuk analisis berbasis data real-time -- bukan snapshot MARKET_DATA stale.',
    profile_name      => 'DANAMON_ALERT_PROFILE',
    preamble          => v_preamble,
    tool_list         => JSON_ARRAY(
      -- Internal tools (SQL + RAG)
      'TOOL_ALERT_ACTIVE_SQL',
      'TOOL_ALERT_MATURITY_SQL',
      'TOOL_ALERT_PROFILE_RAG',
      'TOOL_ALERT_NOTES_RAG',
      -- External tools (HTTP)
      'TOOL_ALERT_LIVE_MARKET_HTTP',
      'TOOL_ALERT_MACRO_HTTP',
      'TOOL_ALERT_CRASH_HISTORY_HTTP'
    ),
    tool_choice       => 'AUTO',
    max_iterations    => 9,            -- Increased: 7 tools + 2 synthesis iterations
    attributes        => JSON_OBJECT(
      'temperature' VALUE 0.4,
      'max_tokens'  VALUE 3000,
      'language'    VALUE 'id'
    )
  );

  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('PAF_AGENT_ALERT assembled!');
  DBMS_OUTPUT.PUT_LINE('Agent ID   : ' || v_agent_id);
  DBMS_OUTPUT.PUT_LINE('Agent Name : PAF_AGENT_ALERT');
  DBMS_OUTPUT.PUT_LINE('Tools      : 7 (2 SQL + 2 RAG + 3 HTTP)');
  DBMS_OUTPUT.PUT_LINE('  Internal : ACTIVE_SQL, MATURITY_SQL, PROFILE_RAG, NOTES_RAG');
  DBMS_OUTPUT.PUT_LINE('  External : LIVE_MARKET_HTTP, MACRO_HTTP, CRASH_HISTORY_HTTP');
  DBMS_OUTPUT.PUT_LINE('Profile    : DANAMON_ALERT_PROFILE');
  DBMS_OUTPUT.PUT_LINE('Iterations : 9 (max)');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('[1/2] PAF_AGENT_ALERT created. agent_id = ' || v_agent_id);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/2] ERROR creating PAF_AGENT_ALERT: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Step 2 - Enable the agent
-- =============================================================================

BEGIN
  DBMS_CLOUD_AI_AGENT.ENABLE_AGENT(agent_name => 'PAF_AGENT_ALERT');
  DBMS_OUTPUT.PUT_LINE('[2/2] PAF_AGENT_ALERT enabled.');
  DBMS_OUTPUT.PUT_LINE('==========================================');
  DBMS_OUTPUT.PUT_LINE('Setup complete!');
  DBMS_OUTPUT.PUT_LINE('  Agent   : PAF_AGENT_ALERT');
  DBMS_OUTPUT.PUT_LINE('  LLM     : xai.grok-3-fast (DANAMON_ALERT_PROFILE)');
  DBMS_OUTPUT.PUT_LINE('  Tools   : 7 (2 SQL + 2 RAG + 3 HTTP)');
  DBMS_OUTPUT.PUT_LINE('  Format  : Narrative Portfolio Alert AI Analysis');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Test:');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_agent_alert(''CUST003'', NULL);');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_alert_quick(''CUST003'');');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/2] ERROR enabling PAF_AGENT_ALERT: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Step 3 - Create PAF_TEAM_ALERT
-- =============================================================================

BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TEAM(team_name => 'PAF_TEAM_ALERT');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name   => 'PAF_TEAM_ALERT',
    attributes  => '{"agents": [{"name": "PAF_AGENT_ALERT"}],"process": "sequential"}',
    description => 'Alert analysis team wrapping PAF_AGENT_ALERT'
  );
  DBMS_OUTPUT.PUT_LINE('[3/3] PAF_TEAM_ALERT created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/3] ERROR creating PAF_TEAM_ALERT: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Test Procedures
-- =============================================================================

-- ---------------------------------------------------------------------------
-- test_agent_alert -- full narrative for ONE customer
-- Primary test -- output should match PDF format exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_agent_alert(
  p_customer_id  IN VARCHAR2 DEFAULT NULL,
  p_rm_user_id   IN VARCHAR2 DEFAULT NULL
) AS
  v_response  CLOB;
  v_prompt    VARCHAR2(4000);
  v_hex       VARCHAR2(32) := RAWTOHEX(SYS_GUID());
  v_conv_id   VARCHAR2(36);
BEGIN
  v_conv_id := LOWER(SUBSTR(v_hex,1,8)||'-'||SUBSTR(v_hex,9,4)||'-'||SUBSTR(v_hex,13,4)||'-'||SUBSTR(v_hex,17,4)||'-'||SUBSTR(v_hex,21,12));
  IF p_customer_id IS NOT NULL THEN
    v_prompt :=
      'Buat laporan analisis alert untuk nasabah customer_id = ''' || p_customer_id || '''. '
      || 'Tampilkan LANGSUNG laporan akhir dengan format: '
      || 'WHAT HAPPENED QUICK SUMMARY, WHY DID THIS HAPPEN, '
      || 'HOW BAD IS THE DAMAGE IN NUMBERS (portfolio table dengan Rp calculations), '
      || 'YOUR ACTION PLAN (Today / At meeting / In N days / Within 2 weeks), '
      || 'WHAT TO SAY IN THE CALL (skrip Bahasa Indonesia), '
      || 'WHAT THE MARKET IS EXPECTED TO DO, '
      || 'dan THREE THINGS NOT TO DO.';
  ELSIF p_rm_user_id IS NOT NULL THEN
    v_prompt :=
      'Buat ringkasan semua alert aktif untuk RM ' || p_rm_user_id || '. '
      || 'Untuk setiap nasabah dengan alert, tampilkan: '
      || 'WHAT HAPPENED (1 paragraf), damage in numbers, action plan singkat, '
      || 'dan skrip pembuka telepon dalam Bahasa Indonesia. '
      || 'Urutkan dari severity tertinggi.';
  ELSE
    v_prompt :=
      'Buat ringkasan semua alert aktif yang perlu ditangani hari ini. '
      || 'Untuk setiap alert high severity, tampilkan laporan lengkap dengan format: '
      || 'WHAT HAPPENED, HOW BAD IN NUMBERS (Rp), YOUR ACTION PLAN, '
      || 'WHAT TO SAY IN THE CALL, THREE THINGS NOT TO DO. '
      || 'Untuk alert medium/low: ringkasan singkat + action plan. '
      || 'Sertakan radar jatuh tempo produk dalam 30 hari ke depan.';
  END IF;

  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_TEAM_ALERT',
    user_prompt => v_prompt,
    params      => '{"conversation_id": "' || v_conv_id || '"}'
  );

  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_ALERT Response ===');
  DBMS_OUTPUT.PUT_LINE('Customer : ' || NVL(p_customer_id, '(all)'));
  DBMS_OUTPUT.PUT_LINE('RM       : ' || NVL(p_rm_user_id,  '(all)'));
  DBMS_OUTPUT.PUT_LINE('---');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------------------
-- test_alert_quick -- lightweight test (WHAT HAPPENED + call script only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_alert_quick(
  p_customer_id IN VARCHAR2
) AS
  v_response  CLOB;
  v_hex       VARCHAR2(32) := RAWTOHEX(SYS_GUID());
  v_conv_id   VARCHAR2(36);
BEGIN
  v_conv_id := LOWER(SUBSTR(v_hex,1,8)||'-'||SUBSTR(v_hex,9,4)||'-'||SUBSTR(v_hex,13,4)||'-'||SUBSTR(v_hex,17,4)||'-'||SUBSTR(v_hex,21,12));
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_TEAM_ALERT',
    user_prompt =>
      'Untuk nasabah customer_id = ''' || p_customer_id || ''': '
      || '(1) Ringkasan alert aktif dalam 2-3 kalimat dengan angka Rp. '
      || '(2) Damage table: setiap produk, nominal Rp, status. '
      || '(3) Skrip pembuka telepon dalam Bahasa Indonesia.',
    params      => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== QUICK ALERT: ' || p_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/

DECLARE
  v_customer_id  VARCHAR2(50) := 'CUST003';
  v_response     CLOB;
  v_conversation  VARCHAR2(4000) ;
BEGIN
  
  v_conversation := DBMS_CLOUD_AI.create_conversation();
  DBMS_OUTPUT.PUT_LINE('conversation_id: ' || v_conversation);

  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_TEAM_ALERT',
    user_prompt =>
      'Untuk nasabah customer_id = ''' || v_customer_id || ''': '
      || '(1) Ringkasan alert aktif dalam 2-3 kalimat dengan angka Rp. '
      || '(2) Damage table: setiap produk, nominal Rp, status. '
      || '(3) Skrip pembuka telepon dalam Bahasa Indonesia.',
  params => '{"conversation_id": "' || v_conversation || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== QUICK ALERT: ' || v_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/
-- =============================================================================
-- Verification
-- =============================================================================
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'PAF_AGENT_ALERT');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_ALERT dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

    BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'PAG_AGENT_ALERT');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_ALERT dropped (re-creating).');
    EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TEAM(team_name => 'PAF_TEAM_ALERT');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_TEAM_ALERT dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

SELECT agent_name, status,
       SUBSTR(description,1,80) AS desc_preview
FROM   USER_AI_AGENTS
WHERE  agent_name = 'PAG_AGENT_ALERT';

select * from user_ai_agents;

SELECT * FROM USER_AI_AGENT_TEAMS;

SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_ALERT%'
ORDER  BY tool_name;

SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_ALERT_PROFILE';


-- =============================================================================
-- Example test runs (uncomment to execute):
-- =============================================================================
 SET SERVEROUTPUT ON SIZE UNLIMITED;
 EXEC test_alert_quick('CUST003');  -- Hendra (Aggressive, may have portfolio_loss)
-- EXEC test_agent_alert('CUST001', NULL);  -- Budi (Conservative)
-- EXEC test_agent_alert(NULL, 'rm001');    -- All alerts for RM anisa
-- EXEC test_agent_alert(NULL, NULL);       -- All active alerts today
-- EXEC test_alert_quick('CUST003');        -- Faster: summary + call script only
