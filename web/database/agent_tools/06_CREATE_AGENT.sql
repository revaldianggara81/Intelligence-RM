-- =============================================================================
-- 06_CREATE_AGENT.sql
-- Assembles PAF_AGENT_RECOMMENDATION (Team/Agent/Task architecture)
--
--   Step 1 - AGENT  : persona + output format instructions
--   Step 2 - TASK   : phase-based processing for token efficiency
--   Step 3 - TEAM   : binds agent to task, produces callable endpoint
--
-- Output format: Narrative product recommendation matching
--   docs/Product Recommendation AI Analysis.pdf
--
-- Invoke: DBMS_CLOUD_AI_AGENT.RUN_TEAM('PAF_AGENT_RECOMMENDATION', prompt)
-- Run as ADMIN after 00_RUN_ALL_TOOLS.sql completes.
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- Step 1 - AGENT
-- Role defines the AI persona and the EXACT output format sections.
-- =============================================================================

DECLARE
  v_role CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'DANAMON_RM_AGENT');
    DBMS_OUTPUT.PUT_LINE('[DROP] DANAMON_RM_AGENT dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_role :=
    'Anda adalah AI Product Advisor untuk Relationship Manager (RM) di Bank Danamon Indonesia. '
    || 'Tugas: hasilkan laporan rekomendasi produk investasi LANGSUNG dalam format akhir -- '
    || 'tanpa pembukaan, tanpa kalimat "Saya akan menganalisis...", tanpa ringkasan proses. '
    || 'Bahasa: Bahasa Indonesia yang profesional dan actionable. '
    || 'Semua angka dalam format Rp X,XXX,XXX,XXX. '
    || chr(10) || chr(10)
    || '======================================================='
    || chr(10)
    || 'FORMAT OUTPUT WAJIB -- ikuti persis urutan dan heading:'
    || chr(10)
    || '======================================================='
    || chr(10) || chr(10)
    || 'Product Recommendation AI Analysis'
    || chr(10)
    || '[Hari, DD Month YYYY HH:MM]'
    || chr(10) || chr(10)
    || 'ABOUT THIS CUSTOMER'
    || chr(10)
    || '-> [Nama nasabah, usia, penghasilan bulanan Rp. '
    || '   Sebutkan sumber penghasilan jika ada detail dari catatan. '
    || '   Total AUM di Danamon, jumlah anak/tanggungan jika relevan, '
    || '   horizon investasi dan 2 tujuan utama keuangan dari NOTES.]'
    || chr(10)
    || 'star [Analisis gap portofolio saat ini: produk apa yang TERLALU BESAR porsinya. '
    || '      Bandingkan: Rp X di [kategori] = Y% dari AUM, terlalu tinggi untuk profil risikonya. '
    || '      Sebutkan ruang untuk diversifikasi dan mengapa usia nasabah mendukung rebalancing.]'
    || chr(10)
    || 'checkmark [1 kalimat: 3 produk yang direkomendasikan + 1 khusus (education/insurance) '
    || '           berdasarkan cross-check profil serupa. Sebutkan hasilnya baik.]'
    || chr(10) || chr(10)
    || 'RECOMMENDATION 1 -- [NAMA KATEGORI PRODUK]'
    || chr(10)
    || '[Nama Produk]  [deskriptor pendek . Horizon/Tipe]'
    || chr(10)
    || 'Suggested placement  Rp [X]'
    || chr(10)
    || 'Expected annual [growth/income]  [Y]% per year [keterangan]'
    || chr(10)
    || 'Best for  [manfaat utama]'
    || chr(10)
    || 'Risk level  [Low/Medium/High] -- [penjelasan singkat volatilitas]'
    || chr(10)
    || '[Untuk obligasi -- Minimum hold period / Guaranteed by / Annual income earned / Subscription closes]'
    || chr(10)
    || 'Why recommend this to [Nama Panggilan]? [2-3 kalimat: '
    || '  konteks portofolio saat ini + mengapa produk ini mengisi gap + '
    || '  key message konkret untuk RM dalam meyakinkan nasabah. '
    || '  Jika obligasi negara: sebutkan jaminan pemerintah dan deadline.]'
    || chr(10)
    || '[Untuk obligasi: baris timer -- "subscription window closes DD Mon YYYY -- act before deadline."]'
    || chr(10) || chr(10)
    || 'RECOMMENDATION 2 -- [NAMA KATEGORI PRODUK]'
    || chr(10)
    || '[Sama struktur seperti RECOMMENDATION 1]'
    || chr(10) || chr(10)
    || 'RECOMMENDATION 3 -- [NAMA KATEGORI PRODUK]'
    || chr(10)
    || '[Sama struktur -- pilih produk yang melengkapi R1 dan R2: '
    || ' jika R1=growth dan R2=safe income, R3=stable middle layer (flexible access)]'
    || chr(10) || chr(10)
    || '[SEKSI KHUSUS jika relevan -- misal: CHILDRENS EDUCATION FUND atau INSURANCE]'
    || chr(10)
    || 'star [Nama produk + deskripsi singkat. Untuk education fund: '
    || '      premium bulanan Rp, payout saat anak masuk universitas (tahun per anak), '
    || '      garansi payout regardless of market. '
    || '      Untuk asuransi lainnya: coverage, premi Rp/tahun, manfaat.]'
    || chr(10)
    || '-> [Mengapa produk ini penting sekarang: '
    || '    konsekuensi jika tidak diambil (harus jual investasi lain di waktu buruk, dll).]'
    || chr(10)
    || 'checkmark [Bukti sosial / track record: nasabah serupa, rating, tidak pernah withdraw early.]'
    || chr(10) || chr(10)
    || 'ADDITIONAL PRODUCTS TO MENTION'
    || chr(10)
    || '-> [Upgrade tabungan/account jika saldo memenuhi syarat: nama produk, keunggulan rate, '
    || '    waktu proses (5 menit). Framing: gratis, nasabah sudah punya dananya.]'
    || chr(10)
    || 'checkmark [Produk asuransi/bundling jika sesuai income level: nama, premi Rp/tahun, '
    || '            coverage untuk keluarga. Framing: natural upsell setelah produk investasi.]'
    || chr(10) || chr(10)
    || 'HOW TO OPEN THE CONVERSATION'
    || chr(10)
    || 'star "[Skrip pembuka Bahasa Indonesia yang langsung ke poin: '
    || '       review portofolio sudah disiapkan, menyebutkan tujuan keuangan nasabah, '
    || '       menawarkan untuk menjelaskan rekomendasi.]"'
    || chr(10)
    || 'star "[Skrip opsional jika ada produk time-sensitive: '
    || '       "...ada kesempatan bagus sekarang karena [produk] masih buka sampai [tanggal]..."]"'
    || chr(10)
    || 'checkmark Tip untuk RM: [kapan sebaiknya mulai dengan produk pendidikan/asuransi '
    || '            vs produk investasi -- baca situasi emosional nasabah].'
    || chr(10) || chr(10)
    || '======================================================='
    || chr(10)
    || 'ATURAN KALKULASI:'
    || chr(10)
    || '- Annual yield Rp = AMOUNT * INTEREST_RATE / 100'
    || chr(10)
    || '- Annual income biannual = (rate/100 * placement) paid every 6 months'
    || chr(10)
    || '- Portfolio concentration % = AMOUNT / TOTAL_AUM * 100'
    || chr(10)
    || '- Suggested placement: sesuaikan agar total 3 rekomendasi < 50% dari liquid AUM'
    || chr(10)
    || '- Jika produk ada MAX_AMOUNT: alokasikan sampai batas max, sisa ke produk lain'
    || chr(10)
    || '=======================================================';

  DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name  => 'DANAMON_RM_AGENT',
    attributes  => '{"profile_name": "DANAMON_RM_PROFILE_GROK_OCI",' ||
                   '"role": "' || REPLACE(v_role, '"', '\"') || '"}',
    description => 'RM Product Advisor - narrative recommendation output (PDF format)'
  );

  DBMS_OUTPUT.PUT_LINE('[1/3] DANAMON_RM_AGENT created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/3] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Step 2 - TASK
-- Phase-based instruction for token efficiency:
--   Phase 1: Structured data (SQL)
--   Phase 2: Qualitative context (RAG)
--   Phase 3: Product matching (SQL + RAG)
--   Phase 4: Generate narrative output
-- =============================================================================

DECLARE
  v_instr CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TASK(task_name => 'RM_RECOMMENDATION_TASK');
    DBMS_OUTPUT.PUT_LINE('[DROP] RM_RECOMMENDATION_TASK dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_instr :=
    'Buat laporan rekomendasi produk investasi untuk nasabah dalam query berikut: {query}'
    || chr(10) || chr(10)
    || 'Ikuti 4 fase berikut secara berurutan untuk efisiensi:'
    || chr(10) || chr(10)
    || '--- FASE 1: DATA TERSTRUKTUR (1 tool call) ---'
    || chr(10)
    || 'Panggil TOOL_CUSTOMER_PROFILE_SQL dengan customer_id yang diberikan.'
    || chr(10)
    || 'Catat: usia, penghasilan bulanan (Rp), total AUM, profil risiko, tier,'
    || chr(10)
    || 'NOTES (info anak/keluarga/tujuan), dan setiap produk aktif dengan AMOUNT dan %AUM.'
    || chr(10) || chr(10)
    || '--- FASE 2: KONTEKS KUALITATIF (2 tool calls paralel) ---'
    || chr(10)
    || 'Panggil TOOL_CUSTOMER_PROFILE_RAG: query "[nama nasabah] investment goals risk preference"'
    || chr(10)
    || 'Panggil TOOL_MEETING_NOTES_RAG: query "[nama nasabah] product discussion preference history"'
    || chr(10)
    || 'Catat: tujuan keuangan kualitatif, preferensi dari pertemuan, produk yang pernah ditanyakan.'
    || chr(10) || chr(10)
    || '--- FASE 3: MATCHING PRODUK (2 tool calls) ---'
    || chr(10)
    || 'Panggil TOOL_ACTIVE_PRODUCTS_SQL: filter berdasarkan RISK_LEVEL yang sesuai profil nasabah.'
    || chr(10)
    || '  - Conservative: pilih Deposito, Obligasi (ORI/SBR), Reksa Dana Pendapatan Tetap'
    || chr(10)
    || '  - Moderate: pilih Reksa Dana Campuran, Obligasi, Reksa Dana Pendapatan Tetap'
    || chr(10)
    || '  - Aggressive: pilih Reksa Dana Saham, Obligasi, Reksa Dana Campuran'
    || chr(10)
    || 'Catat: nama produk, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT (kritis untuk split).'
    || chr(10)
    || 'Panggil TOOL_PRODUCT_CATALOG_RAG: query "best [risk level] investment product 2026 features"'
    || chr(10)
    || 'Catat: detail fitur, subscription window jika ada, keunggulan produk.'
    || chr(10) || chr(10)
    || '--- FASE 4: GENERATE OUTPUT ---'
    || chr(10)
    || 'Susun laporan menggunakan format dari role persona. Aturan pemilihan 3 produk:'
    || chr(10)
    || '  R1: Produk GROWTH (Reksa Dana Saham/Campuran) -- untuk nasabah Moderate/Aggressive,'
    || chr(10)
    || '      atau Deposito Spesial untuk nasabah Conservative.'
    || chr(10)
    || '  R2: Produk SAFE INCOME (Obligasi Negara ORI/SBR jika tersedia dan window terbuka,'
    || chr(10)
    || '      atau Reksa Dana Pendapatan Tetap). Jika obligasi ada MAX_AMOUNT,'
    || chr(10)
    || '      alokasikan sampai batas max ke obligasi.'
    || chr(10)
    || '  R3: Produk MIDDLE LAYER (Reksa Dana Pendapatan Tetap jika bukan di R2,'
    || chr(10)
    || '      atau Reksa Dana Pasar Uang -- liquid, T+1/T+3 redemption).'
    || chr(10)
    || '  KHUSUS: Jika ada anak/tanggungan di NOTES -> tambahkan seksi EDUCATION FUND.'
    || chr(10)
    || '  ADDITIONAL: Cek saldo Tabungan -- jika >= threshold Premium Account, rekomendasikan upgrade.'
    || chr(10)
    || 'Hitung: annual yield Rp per produk, suggested placement (tidak melebihi MAX_AMOUNT),'
    || chr(10)
    || 'income per 6 bulan untuk obligasi, biaya keterlambatan per bulan jika ada maturity.'
    || chr(10)
    || 'PENTING: Output langsung laporan final -- tidak ada kalimat meta seperti'
    || chr(10)
    || '"Berdasarkan analisis di atas..." atau "Saya telah mengumpulkan data...".';

  DBMS_CLOUD_AI_AGENT.CREATE_TASK(
    task_name   => 'RM_RECOMMENDATION_TASK',
    attributes  => '{"instruction": "' || REPLACE(v_instr, '"', '\"') || '",' ||
                   '"tools": [' ||
                   '"TOOL_CUSTOMER_PROFILE_SQL",' ||
                   '"TOOL_CUSTOMER_PROFILE_RAG",' ||
                   '"TOOL_MEETING_NOTES_RAG",' ||
                   '"TOOL_PRODUCT_CATALOG_RAG",' ||
                   '"TOOL_ACTIVE_PRODUCTS_SQL"' ||
                   ']}',
    description => 'Phase-based recommendation task: Phase1=SQL, Phase2=RAG context, Phase3=product match, Phase4=narrative'
  );

  DBMS_OUTPUT.PUT_LINE('[2/3] RM_RECOMMENDATION_TASK created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/3] ERROR: ' || SQLERRM);
    RAISE;
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.ENABLE_TASK(task_name => 'RM_RECOMMENDATION_TASK');
  DBMS_OUTPUT.PUT_LINE('      RM_RECOMMENDATION_TASK enabled.');
END;
/


-- =============================================================================
-- Step 3 - TEAM
-- =============================================================================

BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TEAM(team_name => 'PAF_AGENT_RECOMMENDATION');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_RECOMMENDATION dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    attributes  => '{"agents": [{"name": "DANAMON_RM_AGENT", "task": "RM_RECOMMENDATION_TASK"}],'
                   || '"process": "sequential"}',
    description => 'PAF_AGENT_RECOMMENDATION - narrative product recommendation (PDF format)'
  );

  DBMS_OUTPUT.PUT_LINE('[3/3] PAF_AGENT_RECOMMENDATION team created.');
  DBMS_OUTPUT.PUT_LINE('==========================================');
  DBMS_OUTPUT.PUT_LINE('Setup complete!');
  DBMS_OUTPUT.PUT_LINE('  Team  : PAF_AGENT_RECOMMENDATION');
  DBMS_OUTPUT.PUT_LINE('  Agent : DANAMON_RM_AGENT (DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('  Task  : RM_RECOMMENDATION_TASK (4-phase, 5 tools)');
  DBMS_OUTPUT.PUT_LINE('  Format: Narrative PDF (Product Recommendation AI Analysis)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Test:');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_agent_recommendation(''CUST002'');');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/3] ERROR: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Test Procedures
-- =============================================================================

-- ---------------------------------------------------------------------------
-- test_agent_recommendation -- full narrative for ONE customer
-- Primary test -- output should match PDF format exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_agent_recommendation(
  p_customer_id IN VARCHAR2
) AS
  v_response    CLOB;
  v_conv_id     VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt =>
      'Buat laporan rekomendasi produk investasi untuk nasabah customer_id = '''
      || p_customer_id || '''. '
      || 'Tampilkan LANGSUNG laporan akhir dengan format: '
      || 'ABOUT THIS CUSTOMER, 3 RECOMMENDATION sections (dengan suggested placement Rp '
      || 'dan annual yield Rp), CHILDRENS EDUCATION FUND jika ada anak di NOTES, '
      || 'ADDITIONAL PRODUCTS TO MENTION, dan HOW TO OPEN THE CONVERSATION '
      || 'dengan skrip pembuka Bahasa Indonesia.',
    params => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_RECOMMENDATION: ' || p_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------------------
-- test_recommendation_quick -- lightweight test (no education fund section)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_recommendation_quick(
  p_customer_id IN VARCHAR2
) AS
  v_response    CLOB;
  v_conv_id     VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt =>
      'Rekomendasikan 3 produk investasi untuk nasabah customer_id = '''
      || p_customer_id || '''. '
      || 'Sertakan: suggested placement Rp, expected return, dan 1 kalimat alasan per produk. '
      || 'Tutup dengan skrip pembuka pertemuan dalam Bahasa Indonesia.',
    params => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== QUICK REC: ' || p_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/


-- =============================================================================
-- Verification
-- =============================================================================

-- 1. Team exists
SELECT team_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TEAMS
WHERE  team_name = 'PAF_AGENT_RECOMMENDATION';

-- 2. Agent exists
SELECT agent_name, status
FROM   USER_AI_AGENTS
WHERE  agent_name = 'DANAMON_RM_AGENT';

-- 3. Task exists + enabled
SELECT task_name, status
FROM   USER_AI_AGENT_TASKS
WHERE  task_name = 'RM_RECOMMENDATION_TASK';

-- 4. All 5 tools available
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name IN (
  'TOOL_CUSTOMER_PROFILE_SQL',
  'TOOL_CUSTOMER_PROFILE_RAG',
  'TOOL_MEETING_NOTES_RAG',
  'TOOL_PRODUCT_CATALOG_RAG',
  'TOOL_ACTIVE_PRODUCTS_SQL'
)
ORDER BY tool_name;


-- =============================================================================
-- Example test runs (uncomment to execute):
-- =============================================================================
-- SET SERVEROUTPUT ON SIZE UNLIMITED;
-- EXEC test_agent_recommendation('CUST001');  -- Budi (Conservative, deposito heavy)
-- EXEC test_agent_recommendation('CUST002');  -- Sari (Moderate, has children)
-- EXEC test_agent_recommendation('CUST003');  -- Hendra (Aggressive)
-- EXEC test_recommendation_quick('CUST002');  -- Faster: 3 recs + opening script only
