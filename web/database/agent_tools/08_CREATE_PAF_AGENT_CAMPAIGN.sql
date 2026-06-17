-- =============================================================================
-- 08_CREATE_PAF_AGENT_CAMPAIGN.sql
-- Assembles PAF_AGENT_CAMPAIGN by attaching all 5 campaign tools.
-- Run AFTER 07_PAF_AGENT_CAMPAIGN_TOOLS.sql completes successfully.
--
-- Agent: PAF_AGENT_CAMPAIGN
-- Tools : TOOL_CAMPAIGN_TARGET_SQL, TOOL_CAMPAIGN_ALERTS_SQL,
--         TOOL_CAMPAIGN_PROFILE_RAG, TOOL_CAMPAIGN_PRODUCT_RAG,
--         TOOL_CAMPAIGN_NOTES_RAG
-- Profile: DANAMON_CAMPAIGN_PROFILE (LLM = xai.grok-3-fast via OCI GenAI)
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  v_agent_id  NUMBER;
  v_preamble  CLOB;
BEGIN

  -- Drop existing agent (idempotent)
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'PAF_AGENT_CAMPAIGN');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_CAMPAIGN dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- -----------------------------------------------------------------------
  -- Agent system preamble
  -- -----------------------------------------------------------------------
  v_preamble :=
    'Anda adalah AI Campaign Manager untuk Relationship Manager (RM) di Bank Danamon Indonesia. '
    || 'Anda memiliki keahlian dalam manajemen kampanye produk, segmentasi nasabah, '
    || 'dan strategi pendekatan personal berbasis data. '
    || CHR(10) || CHR(10)
    || 'Selalu berikan respons dalam Bahasa Indonesia yang profesional, konkret, dan actionable. '
    || 'Fokus pada membantu RM mengeksekusi kampanye secara efektif dan tepat sasaran. '
    || 'Berikan strategi pendekatan yang spesifik per nasabah berdasarkan profil dan histori interaksi. '
    || 'Jangan memberikan informasi yang tidak akurat atau spekulatif. '
    || CHR(10) || CHR(10)
    || 'Panduan penggunaan tools (panggil SEKALI setiap tool, jangan diulang):'
    || CHR(10) || '1. TOOL_CAMPAIGN_TARGET_SQL  - data eligibilitas: daftar nasabah target, AUM, rules.'
    || CHR(10) || '2. TOOL_CAMPAIGN_ALERTS_SQL  - alert aktif: jatuh tempo, KYC expiry, risiko portofolio.'
    || CHR(10) || '3. TOOL_CAMPAIGN_PROFILE_RAG - profil semantik: preferensi, gaya keputusan, tujuan.'
    || CHR(10) || '4. TOOL_CAMPAIGN_PRODUCT_RAG - produk relevan: keunggulan dan kesesuaian kampanye.'
    || CHR(10) || '5. TOOL_CAMPAIGN_NOTES_RAG   - histori interaksi: respons sebelumnya, keberatan.'
    || CHR(10) || 'Panggil hanya tool yang dibutuhkan. Hindari memanggil tool yang sama dua kali.'
    || CHR(10) || CHR(10)
    || 'Format output rekomendasi kampanye:'
    || CHR(10) || '- Ringkasan kampanye dan jumlah nasabah eligible'
    || CHR(10) || '- Tabel prioritas nasabah (Prioritas Tinggi / Sedang / Rendah)'
    || CHR(10) || '- Per nasabah: produk yang direkomendasikan + skrip pendekatan singkat'
    || CHR(10) || '- Alert kritis yang perlu ditindaklanjuti segera'
    || CHR(10) || '- Langkah tindak lanjut untuk RM (urutan kontak yang disarankan)';

  -- -----------------------------------------------------------------------
  -- Create agent and attach all 5 campaign tools
  -- -----------------------------------------------------------------------
  v_agent_id := DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name        => 'PAF_AGENT_CAMPAIGN',
    agent_description =>
      'AI Campaign Manager RM Bank Danamon untuk eksekusi kampanye produk investasi. '
      || 'Menggunakan 5 tools: 2 SQL tools (eligibilitas kampanye + alert nasabah) dan '
      || '3 RAG tools (profil nasabah + katalog produk + catatan pertemuan) untuk '
      || 'menghasilkan strategi pendekatan kampanye yang dipersonalisasi per nasabah.',
    profile_name      => 'DANAMON_CAMPAIGN_PROFILE',
    preamble          => v_preamble,
    tool_list         => JSON_ARRAY(
      'TOOL_CAMPAIGN_TARGET_SQL',
      'TOOL_CAMPAIGN_ALERTS_SQL',
      'TOOL_CAMPAIGN_PROFILE_RAG',
      'TOOL_CAMPAIGN_PRODUCT_RAG',
      'TOOL_CAMPAIGN_NOTES_RAG'
    ),
    tool_choice       => 'AUTO',        -- Agent decides which tools to call
    max_iterations    => 6,             -- Max tool call rounds per query
    attributes        => JSON_OBJECT(
      'temperature'  VALUE 0.4,         -- Slightly higher for creative campaign scripts
      'max_tokens'   VALUE 1500,
      'language'     VALUE 'id'         -- Indonesian
    )
  );

  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('PAF_AGENT_CAMPAIGN assembled!');
  DBMS_OUTPUT.PUT_LINE('Agent ID   : ' || v_agent_id);
  DBMS_OUTPUT.PUT_LINE('Agent Name : PAF_AGENT_CAMPAIGN');
  DBMS_OUTPUT.PUT_LINE('Tools      : 5 (2 SQL + 3 RAG)');
  DBMS_OUTPUT.PUT_LINE('Profile    : DANAMON_CAMPAIGN_PROFILE');
  DBMS_OUTPUT.PUT_LINE('Tool Choice: AUTO');
  DBMS_OUTPUT.PUT_LINE('Iterations : 6 (max)');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Test: EXEC test_agent_campaign(''CAMP001'', NULL);');
  DBMS_OUTPUT.PUT_LINE('Or via PAF Studio > Agent Builder > FLOW_CAMPAIGN_ENGINE');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating PAF_AGENT_CAMPAIGN: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Quick test procedure - validates end-to-end agent execution
--
-- Parameters:
--   p_campaign_id : CAMPAIGN_ID to analyse (e.g. 'CAMP001') - required
--   p_rm_user_id  : filter by RM (e.g. 'rm001') - pass NULL for all RMs
-- =============================================================================

CREATE OR REPLACE PROCEDURE test_agent_campaign(
  p_campaign_id  IN VARCHAR2,
  p_rm_user_id   IN VARCHAR2 DEFAULT NULL
) AS
  v_response  CLOB;
  v_prompt    VARCHAR2(1000);
BEGIN
  IF p_rm_user_id IS NOT NULL THEN
    v_prompt :=
      'Saya RM ' || p_rm_user_id || '. '
      || 'Jalankan kampanye dengan campaign_id = ''' || p_campaign_id || '''. '
      || 'Tampilkan daftar nasabah saya yang eligible beserta prioritas pendekatan, '
      || 'produk yang direkomendasikan, dan skrip percakapan singkat per nasabah. '
      || 'Sertakan alert kritis yang perlu ditindaklanjuti segera.';
  ELSE
    v_prompt :=
      'Jalankan kampanye dengan campaign_id = ''' || p_campaign_id || '''. '
      || 'Tampilkan semua nasabah eligible, prioritas pendekatan per segmen, '
      || 'produk yang direkomendasikan, dan skrip percakapan singkat. '
      || 'Urutkan berdasarkan potensi konversi tertinggi.';
  END IF;

  v_response := DBMS_CLOUD_AI_AGENT.RUN_AGENT(
    agent_name => 'PAF_AGENT_CAMPAIGN',
    query      => v_prompt
  );

  DBMS_OUTPUT.PUT_LINE('=== PAF_AGENT_CAMPAIGN Response ===');
  DBMS_OUTPUT.PUT_LINE('Campaign : ' || p_campaign_id);
  DBMS_OUTPUT.PUT_LINE('RM Filter: ' || NVL(p_rm_user_id, '(semua RM)'));
  DBMS_OUTPUT.PUT_LINE('-----------------------------------');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error running PAF_AGENT_CAMPAIGN: ' || SQLERRM);
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

-- 1. Confirm PAF_AGENT_CAMPAIGN exists
SELECT agent_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENTS
WHERE  agent_name = 'PAF_AGENT_CAMPAIGN';

-- 2. Confirm all 5 campaign tools exist and are active
SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name LIKE 'TOOL_CAMPAIGN%'
ORDER BY tool_name;

-- 3. Confirm DANAMON_CAMPAIGN_PROFILE is active
SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_CAMPAIGN_PROFILE';

-- 4. Confirm at least 1 active campaign exists for testing
SELECT CAMPAIGN_ID, NAME, TYPE, STATUS,
       START_DATE, END_DATE
FROM   CAMPAIGNS
WHERE  UPPER(STATUS) = 'ACTIVE'
ORDER BY START_DATE;

-- 5. Confirm eligible customers exist
SELECT ce.CAMPAIGN_ID,
       COUNT(*) AS eligible_count
FROM   CAMPAIGN_ELIGIBILITY ce
WHERE  ce.IS_ELIGIBLE = 1
GROUP BY ce.CAMPAIGN_ID
ORDER BY ce.CAMPAIGN_ID;
/

-- =============================================================================
-- Example test runs (uncomment and replace IDs as needed):
-- =============================================================================

-- SET SERVEROUTPUT ON SIZE UNLIMITED;

-- Test 1: All eligible customers for a campaign
-- EXEC test_agent_campaign('CAMP001', NULL);

-- Test 2: Filter by specific RM
-- EXEC test_agent_campaign('CAMP001', 'rm001');

-- Test 3: Different campaign
-- EXEC test_agent_campaign('CAMP002', 'rm002');
