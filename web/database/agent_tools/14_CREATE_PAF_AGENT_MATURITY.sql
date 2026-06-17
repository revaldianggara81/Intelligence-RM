-- =============================================================================
-- 14_CREATE_PAF_AGENT_MATURITY.sql
-- Assembles PAF_AGENT_MATURITY in-database agent
-- Run AFTER 13_PAF_AGENT_MATURITY_TOOLS.sql completes successfully.
--
-- Architecture  : In-Database Agent (DBMS_CLOUD_AI_AGENT)
-- Agent Name    : PAF_AGENT_MATURITY
-- LLM           : xai.grok-3-fast via OCI GenAI (DANAMON_MATURITY_PROFILE)
-- Tools (5)     : TOOL_MATURITY_HOLDINGS_SQL   (SQL - deposits + alerts)
--                 TOOL_MATURITY_PROFILE_SQL     (SQL - full profile + income)
--                 TOOL_MATURITY_PRODUCTS_SQL    (SQL - reinvestment catalog)
--                 TOOL_MATURITY_CONTEXT_RAG     (RAG - product/market context)
--                 TOOL_MATURITY_NOTES_RAG       (RAG - meeting notes + history)
--
-- Output format : Narrative maturity reminder (see docs/Maturity Reminder AI Analysis.pdf)
-- Language      : Bahasa Indonesia
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;


-- =============================================================================
-- Step 1 - Create PAF_AGENT_MATURITY
-- =============================================================================

DECLARE
  v_agent_id  NUMBER;
  v_preamble  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'PAF_AGENT_MATURITY');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_MATURITY dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- =========================================================================
  -- AGENT PREAMBLE
  -- Instructs the agent to produce a narrative maturity reminder matching
  -- docs/Maturity Reminder AI Analysis.pdf format.
  --
  -- Key design decisions:
  -- 1. Output immediately in final form - no meta-commentary or section labels
  --    like "## Ringkasan" -- use the exact section headers from the PDF.
  -- 2. All Rp figures must be computed: annual yield, per-option income,
  --    cost of delay per month, etc.
  -- 3. Three reinvestment options must be concrete: named products, exact
  --    split amounts, computed Rp income per year.
  -- 4. Talking points must reference the customer's ACTUAL history from notes.
  -- 5. Action plan must follow the Today / Before / At / After structure.
  -- =========================================================================

  v_preamble :=
    'Anda adalah AI Maturity Advisor untuk Relationship Manager (RM) di Bank Danamon Indonesia. '
    || 'Tugas Anda adalah menghasilkan ANALISIS JATUH TEMPO yang lengkap dan siap pakai '
    || 'dalam format laporan profesional -- langsung berikan hasil akhir tanpa pembukaan, '
    || 'tanpa pernyataan "Saya akan menganalisis...", tanpa ringkasan proses. '
    || CHR(10) || CHR(10)
    || '======================================================='
    || CHR(10)
    || 'FORMAT OUTPUT WAJIB -- ikuti persis urutan dan heading berikut:'
    || CHR(10)
    || '======================================================='
    || CHR(10) || CHR(10)
    || '[NAMA NASABAH] -- Maturity Analysis'
    || CHR(10)
    || '[Hari, DD Month YYYY HH:MM]'
    || CHR(10) || CHR(10)
    || 'SITUATION SUMMARY'
    || CHR(10)
    || '! [Satu kalimat urgensi: nama nasabah, nominal Rp, produk, hari tersisa, tanggal jatuh tempo.'
    || '   Jika tidak ada tindakan sebelum tanggal itu, jelaskan konsekuensinya -- dana idle / auto-rollover rate rendah.]'
    || CHR(10)
    || '-> [Satu fakta paling relevan dari catatan pertemuan/service centre -- produk yang ditanyakan,'
    || '    diskusi terakhir -- yang membuat momen ini tepat untuk dihubungi.]'
    || CHR(10)
    || '! [Alert sekunder jika ada: CC missed payment, KYC expiry, portfolio loss.'
    || '   Jika tidak ada alert lain, lewati baris ini.]'
    || CHR(10) || CHR(10)
    || 'ABOUT THIS CUSTOMER'
    || CHR(10)
    || '-> [Usia, sumber pendapatan spesifik dengan angka Rp per bulan tiap sumber, total penghasilan bulanan.'
    || '    Gambarkan situasi finansialnya: apakah bergantung pada gaji/pensiun/bisnis/properti.]'
    || CHR(10)
    || '-> [Total AUM di Danamon dalam Rp, tier nasabah, profil risiko.'
    || '    Jelaskan apa arti profil risikonya dalam konteks produk yang cocok.]'
    || CHR(10)
    || 'checkmark [Konfirmasi preferensi investasi dari histori -- bukan asumsi.'
    || '    Sebutkan sumber konfirmasinya: pertemuan tanggal X, service centre, catatan RM.]'
    || CHR(10) || CHR(10)
    || 'SUGGESTED TALKING POINTS FOR THE MEETING'
    || CHR(10)
    || 'star [Skrip pembuka dalam Bahasa Indonesia -- langsung ke poin, sebutkan produk yang jatuh tempo,'
    || '      tawarkan untuk menjelaskan pilihan. Gunakan sapaan yang sesuai: Bapak/Ibu + nama depan.]'
    || CHR(10)
    || '-> [Argumen urgensi: hitung biaya keterlambatan.'
    || '    Contoh: pada Rp X dengan bunga Y%, setiap bulan tanpa penempatan = Rp Z yang hilang.]'
    || CHR(10)
    || '-> [Referensi histori nasabah: "Bapak/Ibu pernah tanya soal [produk] -- kebetulan..."'
    || '    Ini membangun kepercayaan dan menunjukkan RM memperhatikan.]'
    || CHR(10)
    || 'star [Cara membahas isu sekunder (CC/KYC/dll) jika ada: singkat, helpful, bukan konfrontatif.'
    || '      Jika tidak ada isu sekunder, lewati baris ini.]'
    || CHR(10) || CHR(10)
    || 'THREE REINVESTMENT OPTIONS -- WHAT HAPPENS TO ALL Rp [NOMINAL DEPOSITO]'
    || CHR(10) || CHR(10)
    || 'Option 1 [Recommended . deskriptor singkat]'
    || CHR(10)
    || 'Rp [X] -> [Nama Produk 1] @ [rate]% p.a.'
    || CHR(10)
    || 'Rp [Y] -> [Nama Produk 2] @ [rate]% p.a.'
    || CHR(10)
    || 'Total income/year  Rp [total]'
    || CHR(10)
    || 'Rp [X] yield       Rp [X*rate] ([nama produk 1])'
    || CHR(10)
    || 'Rp [Y] yield       Rp [Y*rate] ([nama produk 2])'
    || CHR(10)
    || '[Penjelasan 2-3 kalimat: mengapa split ini? Apa keunggulan masing-masing bagian?'
    || ' Mengapa ini cocok untuk profil risiko nasabah ini?]'
    || CHR(10)
    || 'clock [Catatan time-sensitive jika ada: "Subscription window [produk] ditutup [tanggal] -- '
    || '       harus bertindak sebelum jatuh tempo." Lewati jika tidak ada.]'
    || CHR(10) || CHR(10)
    || 'Option 2 [deskriptor singkat]'
    || CHR(10)
    || 'Rp [TOTAL] -> [Nama Produk] @ [rate]% p.a.'
    || CHR(10)
    || 'Total income/year  Rp [total]'
    || CHR(10)
    || 'Difference vs Option 1  Rp [+/-X] per year'
    || CHR(10)
    || '[Penjelasan: kapan nasabah memilih opsi ini? Apa trade-offnya vs Option 1?]'
    || CHR(10) || CHR(10)
    || 'Option 3 [deskriptor singkat]'
    || CHR(10)
    || 'Rp [X] -> [Nama Produk 1] @ [rate]% p.a.'
    || CHR(10)
    || 'Rp [Y] -> [Nama Produk 2] @ ~[rate]% p.a.'
    || CHR(10)
    || 'Total income/year  ~Rp [total]'
    || CHR(10)
    || '[Penjelasan: apa perbedaannya dari Option 1? Dalam kondisi apa nasabah memilih ini?]'
    || CHR(10) || CHR(10)
    || '[NAMA SEKSI ISU SEKUNDER jika ada -- misal: CREDIT CARD -- HOW TO RAISE IT]'
    || CHR(10)
    || '-> [Kontekstualisasi isu: seberapa signifikan dibanding total aset? Ini kemungkinan oversight bukan kesulitan.]'
    || CHR(10)
    || 'checkmark [Solusi konkret yang bisa RM tawarkan: auto-debet, reminder, dll. Berapa lama proses?]'
    || CHR(10) || CHR(10)
    || 'YOUR ACTION PLAN'
    || CHR(10)
    || '! Today: [Tindakan spesifik hari ini -- telepon/WA, konfirmasi jadwal meeting, deadline 3 hari.]'
    || CHR(10)
    || 'star Before the meeting: [Persiapan konkret -- cetak/siapkan perbandingan 3 opsi dalam Rp, bukan %.]'
    || CHR(10)
    || '-> At the meeting: [Apa yang harus dilakukan saat meeting -- presentasi 3 opsi, biarkan nasabah memilih.]'
    || CHR(10)
    || 'checkmark At the meeting: [Tindakan sekunder saat meeting -- setup auto-payment, dokumentasi preferensi.]'
    || CHR(10)
    || 'checkmark After the meeting: [Follow-up dalam 24 jam: update sistem, set reminder 90 hari sebelum maturity berikutnya.]'
    || CHR(10) || CHR(10)
    || '======================================================='
    || CHR(10)
    || 'ATURAN KALKULASI (WAJIB DIIKUTI):'
    || CHR(10)
    || '- Annual yield = AMOUNT * INTEREST_RATE / 100'
    || CHR(10)
    || '- Split option: jika ada produk dengan MAX_AMOUNT (misal obligasi negara max Rp 500M),'
    || '  alokasikan sampai batas max ke produk tersebut, sisa ke produk lain.'
    || CHR(10)
    || '- Cost of delay per month = AMOUNT * INTEREST_RATE / 100 / 12'
    || CHR(10)
    || '- Semua angka dalam format Rp X,XXX,XXX,XXX (titik sebagai pemisah ribuan).'
    || CHR(10) || CHR(10)
    || 'ATURAN PENGGUNAAN TOOLS:'
    || CHR(10)
    || '1. TOOL_MATURITY_HOLDINGS_SQL  - panggil pertama, ambil deposito + alert aktif.'
    || CHR(10)
    || '2. TOOL_MATURITY_PROFILE_SQL   - panggil dengan customer_id untuk detail lengkap.'
    || CHR(10)
    || '3. TOOL_MATURITY_NOTES_RAG     - query: "[nama nasabah] investasi preferensi produk"'
    || CHR(10)
    || '4. TOOL_MATURITY_PRODUCTS_SQL  - ambil katalog produk alternatif.'
    || CHR(10)
    || '5. TOOL_MATURITY_CONTEXT_RAG   - cari detail produk yang akan direkomendasikan.'
    || CHR(10)
    || 'Panggil setiap tool SATU KALI. Jangan ulangi tool yang sama.';

  v_agent_id := DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name        => 'PAF_AGENT_MATURITY',
    agent_description =>
      'AI Maturity Advisor untuk RM Bank Danamon. Menghasilkan laporan jatuh tempo deposito '
      || 'dalam format narasi profesional: situasi, profil nasabah, 3 opsi reinvestasi '
      || 'dengan kalkulasi Rp, talking points personal, dan action plan berurutan.',
    profile_name      => 'DANAMON_MATURITY_PROFILE',
    preamble          => v_preamble,
    tool_list         => JSON_ARRAY(
      'TOOL_MATURITY_HOLDINGS_SQL',
      'TOOL_MATURITY_PROFILE_SQL',
      'TOOL_MATURITY_PRODUCTS_SQL',
      'TOOL_MATURITY_CONTEXT_RAG',
      'TOOL_MATURITY_NOTES_RAG'
    ),
    tool_choice       => 'AUTO',
    max_iterations    => 7,
    attributes        => JSON_OBJECT(
      'temperature' VALUE 0.4,
      'max_tokens'  VALUE 3000,
      'language'    VALUE 'id'
    )
  );

  DBMS_OUTPUT.PUT_LINE('[1/2] PAF_AGENT_MATURITY created. agent_id = ' || v_agent_id);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/2] ERROR creating PAF_AGENT_MATURITY: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Step 2 - Enable the agent
-- =============================================================================

BEGIN
  DBMS_CLOUD_AI_AGENT.ENABLE_AGENT(agent_name => 'PAF_AGENT_MATURITY');
  DBMS_OUTPUT.PUT_LINE('[2/2] PAF_AGENT_MATURITY enabled.');
  DBMS_OUTPUT.PUT_LINE('==========================================');
  DBMS_OUTPUT.PUT_LINE('Setup complete!');
  DBMS_OUTPUT.PUT_LINE('  Agent   : PAF_AGENT_MATURITY');
  DBMS_OUTPUT.PUT_LINE('  LLM     : xai.grok-3-fast (DANAMON_MATURITY_PROFILE)');
  DBMS_OUTPUT.PUT_LINE('  Tools   : 5 (3 SQL + 2 RAG)');
  DBMS_OUTPUT.PUT_LINE('  Format  : Narrative maturity reminder (PDF format)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Test:');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_maturity_single(''CUST001'');');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_maturity_all;');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/2] ERROR enabling PAF_AGENT_MATURITY: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Test Procedures
-- =============================================================================

-- ---------------------------------------------------------------------------
-- test_maturity_single -- full narrative for ONE customer
-- This is the primary test -- matches the PDF output format exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_maturity_single(
  p_customer_id IN VARCHAR2
) AS
  v_response     CLOB;
  v_conv_id      VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_AGENT(
    agent_name  => 'PAF_AGENT_MATURITY',
    user_prompt =>
      'Buat laporan analisis jatuh tempo untuk nasabah customer_id = '''
      || p_customer_id || '''. '
      || 'Tampilkan LANGSUNG hasil akhir laporan dalam format: '
      || 'SITUATION SUMMARY, ABOUT THIS CUSTOMER, SUGGESTED TALKING POINTS, '
      || 'THREE REINVESTMENT OPTIONS (dengan kalkulasi Rp per tahun per opsi), '
      || 'dan YOUR ACTION PLAN. '
      || 'Sertakan semua alert aktif nasabah sebagai konteks isu sekunder. '
      || 'Gunakan catatan pertemuan untuk personalisiasi talking points.',
    params => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_MATURITY: ' || p_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------------------
-- test_maturity_all -- generate reports for ALL customers maturing <= 60 days
-- Output: one narrative block per customer, separated by dividers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_maturity_all AS
  v_response     CLOB;
  v_conv_id      VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_AGENT(
    agent_name  => 'PAF_AGENT_MATURITY',
    user_prompt =>
      'Buat laporan analisis jatuh tempo untuk SEMUA nasabah yang memiliki deposito '
      || 'jatuh tempo dalam 60 hari ke depan. '
      || 'Untuk setiap nasabah, tampilkan laporan lengkap dalam format: '
      || 'SITUATION SUMMARY, ABOUT THIS CUSTOMER, SUGGESTED TALKING POINTS, '
      || 'THREE REINVESTMENT OPTIONS (dengan kalkulasi Rp per tahun), '
      || 'dan YOUR ACTION PLAN. '
      || 'Urutkan dari deposito yang paling segera jatuh tempo (hari tersedikit). '
      || 'Pisahkan setiap nasabah dengan garis: ================================================',
    params => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_MATURITY: ALL CUSTOMERS ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------------------
-- test_maturity_urgent -- URGENT: deposits maturing within 7 days
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_maturity_urgent AS
  v_response     CLOB;
  v_conv_id      VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_AGENT(
    agent_name  => 'PAF_AGENT_MATURITY',
    user_prompt =>
      'Identifikasi nasabah dengan deposito KRITIS yang jatuh tempo dalam 7 hari ke depan. '
      || 'Untuk setiap nasabah, buat laporan dengan format SITUATION SUMMARY, '
      || 'SUGGESTED TALKING POINTS, THREE REINVESTMENT OPTIONS, dan YOUR ACTION PLAN. '
      || 'Tekankan urgensi: RM harus menghubungi hari ini juga.',
    params => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_MATURITY: URGENT (<=7 days) ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/


-- =============================================================================
-- Verification
-- =============================================================================

SELECT agent_name, status,
       SUBSTR(description, 1, 100) AS desc_preview
FROM   user_ai_agents
WHERE  agent_name = 'PAF_AGENT_MATURITY';

SELECT tool_name, tool_type, status
FROM   user_cloud_ai_agent_tools
WHERE  tool_name LIKE 'TOOL_MATURITY%'
ORDER  BY tool_name;


-- =============================================================================
-- Quick test (uncomment to run):
-- =============================================================================
-- SET SERVEROUTPUT ON SIZE UNLIMITED;
-- EXEC test_maturity_single('CUST001');
-- EXEC test_maturity_single('CUST002');
-- EXEC test_maturity_all;
-- EXEC test_maturity_urgent;
