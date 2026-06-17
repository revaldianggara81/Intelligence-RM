-- =============================================================================
-- 06_CREATE_AGENT.sql
-- Assembles PAF_AGENT_RECOMMENDATION using the correct Oracle PAF architecture:
--
--   Step 1 - CREATE_AGENT : LLM profile + persona role
--   Step 2 - CREATE_TASK  : task instruction + tool list
--   Step 3 - CREATE_TEAM  : binds agent to task, produces callable team
--
-- Invoke with:
--   DBMS_CLOUD_AI_AGENT.RUN_TEAM(team_name, user_prompt)
--
-- Run as ADMIN after 00_RUN_ALL_TOOLS.sql succeeds.
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

-- ---------------------------------------------------------------------------
-- Step 1 - AGENT (LLM profile + persona)
-- ---------------------------------------------------------------------------

DECLARE
  v_role CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'DANAMON_RM_AGENT_TEST_01 ');
    DBMS_OUTPUT.PUT_LINE('[DROP] DANAMON_RM_AGENT_TEST_01  dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_role :=
    'Anda adalah AI Co-Pilot untuk Relationship Manager (RM) di Bank Danamon Indonesia. '
    || 'Anda memiliki keahlian mendalam dalam wealth management, produk investasi perbankan, '
    || 'dan manajemen hubungan nasabah. '
    || 'Selalu berikan respons dalam Bahasa Indonesia yang profesional, konkret, dan actionable. '
    || 'Fokus pada kepentingan terbaik nasabah sesuai profil risiko dan tujuan keuangan mereka. '
    || 'Berikan rekomendasi yang spesifik dengan angka, persentase alokasi, dan timeline yang jelas. '
    || 'Jangan memberikan informasi yang tidak akurat atau spekulatif.';

  DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name  => 'DANAMON_RM_AGENT_TEST_01 ',
    attributes  => '{"profile_name": "DANAMON_RM_PROFILE_GROK_OCI",' ||
                   '"role": "' || REPLACE(v_role, '"', '\"') || '"}',
    description => 'RM Co-Pilot agent - profile: DANAMON_RM_PROFILE_GROK_OCI'
  );

  DBMS_OUTPUT.PUT_LINE('[1/3] DANAMON_RM_AGENT_TEST_01  created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[1/3] ERROR creating DANAMON_RM_AGENT_TEST_01 : ' || SQLERRM);
    RAISE;
END;
/

-- ---------------------------------------------------------------------------
-- Step 2 - TASK (instruction with {query} placeholder + tool list)
-- ---------------------------------------------------------------------------

DECLARE
  v_instr CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TASK(task_name => 'RM_RECOMMENDATION_TASK_TEST_01');
    DBMS_OUTPUT.PUT_LINE('[DROP] RM_RECOMMENDATION_TASK dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_instr :=
    'Jawab pertanyaan RM berikut tentang nasabah atau produk Bank Danamon: {query} '
    || 'Panduan penggunaan tool (gunakan hanya yang relevan): '
    || '- Jika ada customer_id/nama nasabah: gunakan TOOL_CUSTOMER_PROFILE_SQL untuk data numerik '
    ||   'dan TOOL_CUSTOMER_PROFILE_RAG untuk preferensi nasabah. '
    || 'Format output jika ada data nasabah: '
    || '- Ringkasan profil nasabah (2-3 kalimat). '
    || 'Format output jika hanya pertanyaan produk: jawab langsung dan ringkas.';

  DBMS_CLOUD_AI_AGENT.CREATE_TASK(
    task_name   => 'RM_RECOMMENDATION_TASK_TEST_01',
    attributes  => '{"instruction": "' || REPLACE(v_instr, '"', '\"') || '",' ||
                   '"tools": ['
                   || '"TOOL_CUSTOMER_PROFILE_SQL",'
                   || '"TOOL_CUSTOMER_PROFILE_RAG"'
                   || ']}',
    description => 'RM investment recommendation task - 2 tools (1 SQL + 1 RAG)'
  );

  DBMS_OUTPUT.PUT_LINE('[2/3] RM_RECOMMENDATION_TASK_TEST_01 created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/3] ERROR creating RM_RECOMMENDATION_TASK_TEST_01: ' || SQLERRM);
    RAISE;
END;
/



-- ---------------------------------------------------------------------------
-- Step 3 - TEAM (binds agent to task - this is the callable unit)
-- ---------------------------------------------------------------------------
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TEAM(team_name => 'PAF_AGENT_RECOMMENDATION_TEST_01');
    DBMS_OUTPUT.PUT_LINE('[DROP] PAF_AGENT_RECOMMENDATION dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION_TEST_01',
    attributes  => '{"agents": [{"name": "DANAMON_RM_AGENT_TEST_01", "task": "RM_RECOMMENDATION_TASK_TEST_01"}],'
                   || '"process": "sequential"}',
    description => 'PAF_AGENT_RECOMMENDATION_TEST_01 - DANAMON_RM_AGENT_TEST_01 + RM_RECOMMENDATION_TASK_TEST_01'
  );

  DBMS_OUTPUT.PUT_LINE('[3/3] PAF_AGENT_RECOMMENDATION_TEST_01 team created.');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('Setup complete!');
  DBMS_OUTPUT.PUT_LINE('  Team  : PAF_AGENT_RECOMMENDATION_TEST_01');
  DBMS_OUTPUT.PUT_LINE('  Agent : DANAMON_RM_AGENT_TEST_01  (profile: DANAMON_RM_PROFILE)');
  DBMS_OUTPUT.PUT_LINE('  Task  : DANAMON_RM_AGENT_TEST_01  (2 tools)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Test:');
  DBMS_OUTPUT.PUT_LINE('  SET SERVEROUTPUT ON SIZE UNLIMITED;');
  DBMS_OUTPUT.PUT_LINE('  EXEC test_agent_recommendation(''CUST001'');');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/3] ERROR creating PAF_AGENT_RECOMMENDATION: ' || SQLERRM);
    RAISE;
END;
/



-- ---------------------------------------------------------------------------
-- Quick test procedure
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE test_agent_recommendation_test_01(
  p_customer_id IN VARCHAR2
) AS
  v_response      CLOB;
  v_conversation  VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  DBMS_OUTPUT.PUT_LINE('conversation_id: ' || v_conversation);
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name       => 'PAF_AGENT_RECOMMENDATION_TEST_01',
    user_prompt     =>
      'Jelaskan profile dari untuk nasabah customer_id = '''
      || p_customer_id || '''. ',
    params => '{"conversation_id": "' || v_conversation || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== Agent Response ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error running PAF_AGENT_RECOMMENDATION_TEST_01: ' || SQLERRM);
END;
/

-- Example test run:
 SET SERVEROUTPUT ON SIZE UNLIMITED;
 EXEC test_agent_recommendation_test_01('CUST002');

