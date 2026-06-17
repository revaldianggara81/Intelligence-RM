-- =============================================================================
-- 12_CREATE_PAF_AGENT_COPILOT.sql
-- Assembles PAF_AGENT_COPILOT by attaching all 10 copilot tools:
--   6 internal (SQL + RAG) + 4 external HTTP tools.
-- Run AFTER 11_PAF_AGENT_COPILOT_TOOLS.sql AND
--           13_PAF_AGENT_COPILOT_EXT_TOOLS.sql complete successfully.
--
-- Agent: PAF_AGENT_COPILOT
-- Internal Tools (SQL/RAG):
--   TOOL_COPILOT_CUSTOMER_SQL, TOOL_COPILOT_SITUATION_SQL,
--   TOOL_COPILOT_PRODUCT_SQL,
--   TOOL_COPILOT_PROFILE_RAG, TOOL_COPILOT_NOTES_RAG,
--   TOOL_COPILOT_PRODUCT_RAG
-- External Tools (HTTP):
--   TOOL_COPILOT_BIRATE_HTTP   (Bank Indonesia: BI Rate + Kurs Tengah)
--   TOOL_COPILOT_IDX_HTTP      (IDX: IHSG + LQ45 + sektor)
--   TOOL_COPILOT_COREBANK_HTTP (Core Banking: saldo + transaksi real-time)
--   TOOL_COPILOT_ECONEWS_HTTP  (Reuters/News: headline ekonomi + regulasi)
-- Profile: DANAMON_COPILOT_PROFILE_GROK_OCI (LLM = xai.grok-3-fast via OCI GenAI)
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  v_agent_id  NUMBER;
  v_preamble  CLOB;
BEGIN

  -- Drop existing agent (idempotent)
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'PAF_AGENT_COPILOT');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_COPILOT dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- -----------------------------------------------------------------------
  -- Agent system preamble
  -- -----------------------------------------------------------------------
  v_preamble :=
    'Anda adalah AI Copilot untuk Relationship Manager (RM) di Bank Danamon Indonesia - '
    || 'asisten cerdas yang bisa menjawab pertanyaan APA PUN tentang nasabah, portofolio, '
    || 'produk, alert, kampanye, dan riwayat interaksi. '
    || 'Anda adalah kolega berpengetahuan luas yang selalu siap memberikan insight berbasis data '
    || 'kapan pun RM membutuhkan informasi. '
    || CHR(10) || CHR(10)
    || 'Selalu berikan respons dalam Bahasa Indonesia yang profesional, jelas, dan actionable. '
    || 'Prioritaskan akurasi data di atas kecepatan - gunakan tools untuk memverifikasi fakta '
    || 'sebelum menjawab. Jangan berasumsi atau berspekulasi jika data tidak tersedia. '
    || CHR(10) || CHR(10)
    || 'Panduan penggunaan tools (gunakan HANYA yang diperlukan, panggil SEKALI per tool):'
    || CHR(10) || 'DATA INTERNAL (Oracle DB):'
    || CHR(10) || '1. TOOL_COPILOT_CUSTOMER_SQL  - data nasabah dan portofolio: AUM, holdings, jatuh tempo, return.'
    || CHR(10) || '2. TOOL_COPILOT_SITUATION_SQL - situasi 360 derajat: alert aktif, kampanye, histori pertemuan.'
    || CHR(10) || '3. TOOL_COPILOT_PRODUCT_SQL   - katalog produk: rates, minimum, tenor, perbandingan.'
    || CHR(10) || '4. TOOL_COPILOT_PROFILE_RAG   - profil naratif: gaya investasi, tujuan, latar belakang.'
    || CHR(10) || '5. TOOL_COPILOT_NOTES_RAG     - isi percakapan: apa yang dibahas, keberatan, keputusan.'
    || CHR(10) || '6. TOOL_COPILOT_PRODUCT_RAG   - produk semantik: cocok untuk kebutuhan tertentu.'
    || CHR(10) || 'DATA EKSTERNAL (HTTP API real-time):'
    || CHR(10) || '7. TOOL_COPILOT_BIRATE_HTTP   - BI Rate terkini + kurs tengah BI (USD/IDR, SGD/IDR, EUR/IDR).'
    || CHR(10) || '8. TOOL_COPILOT_IDX_HTTP      - data pasar IDX: level IHSG, LQ45, return YTD, kinerja sektor.'
    || CHR(10) || '9. TOOL_COPILOT_COREBANK_HTTP - saldo + transaksi real-time dari core banking (Finnacle).'
    || CHR(10) || '10. TOOL_COPILOT_ECONEWS_HTTP - headline ekonomi + kebijakan BI/OJK 24-72 jam terakhir.'
    || CHR(10) || CHR(10)
    || 'Strategi pemilihan tools:'
    || CHR(10) || '- Pertanyaan tentang nasabah spesifik      -> CUSTOMER_SQL + PROFILE_RAG'
    || CHR(10) || '- Pertanyaan tentang situasi/alert/meeting -> SITUATION_SQL + NOTES_RAG'
    || CHR(10) || '- Pertanyaan tentang produk                -> PRODUCT_SQL + PRODUCT_RAG'
    || CHR(10) || '- Pertanyaan suku bunga pasar / BI Rate    -> BIRATE_HTTP (+ PRODUCT_SQL untuk komparasi)'
    || CHR(10) || '- Pertanyaan kurs mata uang asing          -> BIRATE_HTTP'
    || CHR(10) || '- Pertanyaan performa IHSG / reksa dana saham -> IDX_HTTP (+ CUSTOMER_SQL untuk return nasabah)'
    || CHR(10) || '- Pertanyaan saldo / transaksi terkini     -> COREBANK_HTTP'
    || CHR(10) || '- Briefing pasar sebelum kunjungan nasabah -> ECONEWS_HTTP + BIRATE_HTTP'
    || CHR(10) || '- Brief nasabah komprehensif               -> semua tools yang relevan (internal + eksternal)'
    || CHR(10) || CHR(10)
    || 'Format respons disesuaikan dengan jenis pertanyaan:'
    || CHR(10) || '- Pertanyaan data singkat      -> jawaban ringkas dengan angka/fakta utama'
    || CHR(10) || '- Brief nasabah lengkap        -> ringkasan eksekutif + portofolio + situasi + insight pasar'
    || CHR(10) || '- Perbandingan produk          -> tabel terstruktur dengan poin kunci'
    || CHR(10) || '- Pertanyaan strategis         -> analisis + rekomendasi + langkah tindak lanjut'
    || CHR(10) || '- Kondisi pasar / berita       -> ringkasan poin kunci + implikasi untuk portofolio nasabah';

  -- -----------------------------------------------------------------------
  -- Create agent and attach all 6 copilot tools
  -- -----------------------------------------------------------------------
  v_agent_id := DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name        => 'PAF_AGENT_COPILOT',
    agent_description =>
      'Universal AI Copilot RM Bank Danamon - asisten Q&A serba bisa untuk pertanyaan '
      || 'tentang nasabah, portofolio, produk, alert, kampanye, histori interaksi, dan data pasar. '
      || 'Menggunakan 10 tools: 3 SQL (portofolio nasabah + situasi 360 + katalog produk), '
      || '3 RAG (profil naratif + isi pertemuan + produk semantik), dan '
      || '4 HTTP (BI Rate + IDX pasar + core banking real-time + berita ekonomi) untuk '
      || 'menjawab pertanyaan bebas RM dengan konteks data internal dan eksternal yang lengkap.',
    profile_name      => 'DANAMON_COPILOT_PROFILE_GROK_OCI',
    preamble          => v_preamble,
    tool_list         => JSON_ARRAY(
      -- Internal tools (SQL + RAG)
      'TOOL_COPILOT_CUSTOMER_SQL',
      'TOOL_COPILOT_SITUATION_SQL',
      'TOOL_COPILOT_PRODUCT_SQL',
      'TOOL_COPILOT_PROFILE_RAG',
      'TOOL_COPILOT_NOTES_RAG',
      'TOOL_COPILOT_PRODUCT_RAG',
      -- External tools (HTTP)
      'TOOL_COPILOT_BIRATE_HTTP',
      'TOOL_COPILOT_IDX_HTTP',
      'TOOL_COPILOT_COREBANK_HTTP',
      'TOOL_COPILOT_ECONEWS_HTTP'
    ),
    tool_choice       => 'AUTO',        -- Agent selects only relevant tools per query
    max_iterations    => 12,            -- Increased: 10 tools + 2 synthesis iterations
    attributes        => JSON_OBJECT(
      'temperature'  VALUE 0.5,         -- Conversational but fact-grounded
      'max_tokens'   VALUE 2000,        -- Longer responses for comprehensive briefs
      'language'     VALUE 'id'         -- Indonesian
    )
  );

  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('PAF_AGENT_COPILOT assembled!');
  DBMS_OUTPUT.PUT_LINE('Agent ID   : ' || v_agent_id);
  DBMS_OUTPUT.PUT_LINE('Agent Name : PAF_AGENT_COPILOT');
  DBMS_OUTPUT.PUT_LINE('Tools      : 10 (3 SQL + 3 RAG + 4 HTTP)');
  DBMS_OUTPUT.PUT_LINE('  Internal : CUSTOMER_SQL, SITUATION_SQL, PRODUCT_SQL,');
  DBMS_OUTPUT.PUT_LINE('             PROFILE_RAG, NOTES_RAG, PRODUCT_RAG');
  DBMS_OUTPUT.PUT_LINE('  External : BIRATE_HTTP, IDX_HTTP, COREBANK_HTTP, ECONEWS_HTTP');
  DBMS_OUTPUT.PUT_LINE('Profile    : DANAMON_COPILOT_PROFILE_GROK_OCI');
  DBMS_OUTPUT.PUT_LINE('Tool Choice: AUTO');
  DBMS_OUTPUT.PUT_LINE('Iterations : 12 (max)');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Test examples:');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_agent_copilot(''Berikan brief lengkap untuk CUST001'');');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_agent_copilot(''Produk apa yang cocok untuk nasabah konservatif?'');');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_agent_copilot(''Siapa nasabah saya dengan AUM tertinggi?'');');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating PAF_AGENT_COPILOT: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Quick test procedure - validates end-to-end agent execution
--
-- Parameter:
--   p_question : Any free-form question in Indonesian (mandatory)
-- =============================================================================

CREATE OR REPLACE PROCEDURE test_agent_copilot(
  p_question  IN VARCHAR2
) AS
  v_response  CLOB;
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_AGENT(
    agent_name => 'PAF_AGENT_COPILOT',
    query      => p_question
  );

  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_COPILOT Response ===');
  DBMS_OUTPUT.PUT_LINE('Query: ' || SUBSTR(p_question, 1, 100));
  DBMS_OUTPUT.PUT_LINE('-----------------------------------');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error running PAF_AGENT_COPILOT: ' || SQLERRM);
END;
/


-- =============================================================================
-- VERIFICATION - confirm agent and tools registered correctly
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('VERIFICATION');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/


BEGIN
     DBMS_CLOUD_AI_AGENT.DISABLE_TEAM(
         team_name    => 'PAF_TEAM_COPILOT'
     );
END;
/ 

select * from user_ai_agents where agent_name like '%COPILOT%';


begin
  DBMS_CLOUD_AI_AGENT.DROP_AGENT(
    agent_name =>'PAF_AGENT_COPILOT',
      force => TRUE
  );
  dbms_output.put_line('[DROP] PAF_AGENT_COPILOT dropped');
end;  

select agent_team_id, agent_Team_name, status, created, last_modified 
from user_ai_agent_teams
 where agent_team_name in ('PAF_TEAM_COPILOT','PAF_TEAM_COPILOT2');

select *from user_ai_agent_teams;

begin
  DBMS_CLOUD_AI_AGENT.DROP_TEAM(
      team_name =>'PAF_TEAM_COPILOT',
      force => TRUE
  );
  dbms_output.put_line('[DROP] PAF_TEAM_COPILOT dropped');
end;  


-- 1. Confirm PAF_AGENT_COPILOT exists
SELECT agent_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENTS
WHERE  agent_name = 'PAF_AGENT_COPILOT';

-- 2. Confirm all 10 copilot tools exist and are active (6 internal + 4 HTTP)
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_COPILOT%'
ORDER BY tool_name;
-- Expected: 10 rows (CUSTOMER_SQL, SITUATION_SQL, PRODUCT_SQL, PROFILE_RAG,
--           NOTES_RAG, PRODUCT_RAG, BIRATE_HTTP, IDX_HTTP, COREBANK_HTTP, ECONEWS_HTTP)

-- 3. Confirm DANAMON_COPILOT_PROFILE is active
SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_COPILOT_PROFILE_GROK_OCI';

-- 4. Summary of all agents now in the system
SELECT agent_name, status
FROM   USER_AI_AGENTS
WHERE  agent_name LIKE 'PAF_AGENT%'
ORDER BY agent_name;

-- 5. Summary of all tools now in the system
SELECT tool_name, status
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_%'
ORDER BY tool_name;
/

-- =============================================================================
-- Example test runs (uncomment as needed):
-- =============================================================================

-- SET SERVEROUTPUT ON SIZE UNLIMITED;

-- Test 1: Customer brief
-- EXEC test_agent_copilot('Berikan brief lengkap untuk nasabah CUST001: profil, portofolio, alert aktif, dan pertemuan terakhir.');

-- Test 2: Portfolio query
-- EXEC test_agent_copilot('Siapa 3 nasabah saya dengan total AUM tertinggi? Tampilkan distribusi portofolio masing-masing.');

-- Test 3: Product question
-- EXEC test_agent_copilot('Produk deposito apa yang tersedia saat ini? Bandingkan suku bunga dan minimum investasinya.');

-- Test 4: Meeting history
-- EXEC test_agent_copilot('Apa yang dibahas dalam pertemuan terakhir dengan CUST001? Ada janji tindak lanjut yang belum diselesaikan?');

-- Test 5: Situation check
-- EXEC test_agent_copilot('Nasabah mana yang memiliki alert high severity yang belum ditangani? Apa tindakan yang perlu saya ambil?');

-- Test 6: Product recommendation
-- EXEC test_agent_copilot('Produk apa yang paling cocok untuk nasabah berusia 55 tahun yang akan pensiun dalam 5 tahun?');
