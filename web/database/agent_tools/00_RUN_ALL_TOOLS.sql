-- =============================================================================
-- 00_RUN_ALL_TOOLS.sql
-- Master script: creates all 5 PAF Agent tools for PAF_AGENT_RECOMMENDATION
-- Run as the ADMIN schema (or whichever schema owns the tables).
--
-- Execution order:
--   0. Prerequisites check (profiles must exist)
--   1. Create PRODUCT_EMBEDDINGS_V view (needed by Tool 4)
--   2. Create TOOL_CUSTOMER_PROFILE_SQL    (SQL  - CUSTOMERS + CUSTOMER_PRODUCTS)
--   3. Create TOOL_CUSTOMER_PROFILE_RAG    (RAG  - CUSTOMER_EMBEDDINGS)
--   4. Create TOOL_MEETING_NOTES_RAG       (RAG  - MEETING_NOTES_EMBEDDINGS)
--   5. Create TOOL_PRODUCT_CATALOG_RAG     (RAG  - PRODUCT_EMBEDDINGS_V)
--   6. Create TOOL_ACTIVE_PRODUCTS_SQL     (SQL  - PRODUCT_CATALOG)
--   7. Verify: list all tools
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

-- ---------------------------------------------------------------------------
-- 0. Prerequisites check
-- ---------------------------------------------------------------------------
DECLARE
  v_rm_profile  NUMBER := 0;
  v_rag_profile NUMBER := 0;
BEGIN
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('PAF_AGENT_RECOMMENDATION - Tool Setup');
  DBMS_OUTPUT.PUT_LINE('Date   : ' || TO_CHAR(SYSDATE, 'DD-MON-YYYY HH24:MI'));
  DBMS_OUTPUT.PUT_LINE('Schema : ' || SYS_CONTEXT('USERENV','CURRENT_SCHEMA'));
  DBMS_OUTPUT.PUT_LINE('========================================');

  BEGIN
    EXECUTE IMMEDIATE
      'SELECT COUNT(*) FROM USER_CLOUD_AI_PROFILES WHERE PROFILE_NAME = ''DANAMON_RM_PROFILE'''
      INTO v_rm_profile;
  EXCEPTION WHEN OTHERS THEN v_rm_profile := 0;
  END;

  BEGIN
    EXECUTE IMMEDIATE
      'SELECT COUNT(*) FROM USER_CLOUD_AI_PROFILES WHERE PROFILE_NAME = ''DANAMON_RAG_PROFILE'''
      INTO v_rag_profile;
  EXCEPTION WHEN OTHERS THEN v_rag_profile := 0;
  END;

  DBMS_OUTPUT.PUT_LINE('DANAMON_RM_PROFILE  exists: ' || CASE WHEN v_rm_profile  > 0 THEN 'YES' ELSE 'NO - CREATE IT FIRST' END);
  DBMS_OUTPUT.PUT_LINE('DANAMON_RAG_PROFILE exists: ' || CASE WHEN v_rag_profile > 0 THEN 'YES' ELSE 'NO - CREATE IT FIRST' END);
  DBMS_OUTPUT.PUT_LINE('');
END;
/

-- ---------------------------------------------------------------------------
-- 0b. Pre-cleanup: stop orphaned PAF scheduler jobs + drop all existing tools
--     Run this BEFORE each CREATE_TOOL pass so duplicate jobs don't accumulate.
-- ---------------------------------------------------------------------------
DECLARE
  PROCEDURE stop_and_drop_job(p_name IN VARCHAR2) IS
  BEGIN
    DBMS_SCHEDULER.STOP_JOB(job_name => p_name, force => TRUE);
    DBMS_SCHEDULER.DROP_JOB(job_name => p_name, force => TRUE);
    DBMS_OUTPUT.PUT_LINE('  [KILL JOB] ' || p_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('[0b] Stopping orphaned PAF scheduler jobs...');
  -- Kill every non-disabled scheduler job (PAF jobs have dynamic names)
  FOR j IN (
    SELECT job_name
    FROM   user_scheduler_jobs
    WHERE  state IN ('RUNNING', 'SCHEDULED', 'RETRY SCHEDULED', 'FAILED', 'BROKEN')
  ) LOOP
    stop_and_drop_job(j.job_name);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('[0b] Dropping existing PAF tools...');
  -- Drop every tool registered in the catalog
  FOR t IN (
    SELECT tool_name FROM USER_AI_AGENT_TOOLS
  ) LOOP
    BEGIN
      DBMS_CLOUD_AI_AGENT.DROP_TOOL(t.tool_name);
      DBMS_OUTPUT.PUT_LINE('  [DROP TOOL] ' || t.tool_name);
    EXCEPTION WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('  [DROP TOOL WARN] ' || t.tool_name || ': ' || SQLERRM);
    END;
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('[0b] Pre-cleanup complete.');
END;
/

-- ---------------------------------------------------------------------------
-- 1. Supporting view for TOOL_PRODUCT_CATALOG_RAG
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW PRODUCT_EMBEDDINGS_V AS
SELECT
  e.PRODUCT_ID,
  e.CONTENT,
  e.EMBEDDING,
  p.PRODUCT_NAME,
  p.CATEGORY,
  p.RISK_LEVEL,
  p.INTEREST_RATE,
  p.MIN_AMOUNT
FROM PRODUCT_EMBEDDINGS e
JOIN PRODUCT_CATALOG p ON e.PRODUCT_ID = p.PRODUCT_ID
WHERE p.IS_ACTIVE = 1;
/

BEGIN
  DBMS_OUTPUT.PUT_LINE('[1/7] View PRODUCT_EMBEDDINGS_V created/replaced.');
END;
/

-- ---------------------------------------------------------------------------
-- 2. TOOL_CUSTOMER_PROFILE_SQL
-- ---------------------------------------------------------------------------
DECLARE
  v_desc  CLOB;
BEGIN
  v_desc :=
    'SQL tool untuk mengambil data profil nasabah dan portofolio investasi dari database Bank Danamon. '
    || 'Tabel: CUSTOMERS (CUSTOMER_ID, FULL_NAME, AGE, GENDER, TIER, RISK_PROFILE, MONTHLY_INCOME, TOTAL_AUM, RM_USER_ID). '
    || 'Tabel: CUSTOMER_PRODUCTS (HOLDING_ID, CUSTOMER_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, MATURITY_DATE, STATUS, RETURN_PCT). '
    || 'Selalu filter berdasarkan CUSTOMER_ID. Untuk portfolio aktif gunakan STATUS=Active. '
    || 'Input wajib: customer_id.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CUSTOMER_PROFILE_SQL',
    attributes => '{"tool_type": "SQL",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[2/7] TOOL_CUSTOMER_PROFILE_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[2/7] ERROR: TOOL_CUSTOMER_PROFILE_SQL - ' || SQLERRM);
    RAISE;
END;
/

-- ---------------------------------------------------------------------------
-- 3. TOOL_CUSTOMER_PROFILE_RAG
-- ---------------------------------------------------------------------------
DECLARE
  v_desc  CLOB;
  v_attr  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CUSTOMER_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_CUSTOMER_PROFILE_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari konteks profil nasabah secara semantik dari teks embedding. '
    || 'Tabel: CUSTOMER_EMBEDDINGS - kolom EMBEDDING (VECTOR 1024 FLOAT32), CONTENT (teks), CUSTOMER_ID, CONTENT_TYPE. '
    || 'Mengambil narasi tentang: preferensi risiko, tujuan keuangan, gaya investasi, latar belakang. '
    || 'Selalu filter berdasarkan CUSTOMER_ID. Input wajib: query, customer_id.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CUSTOMER_PROFILE_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RAG_PROFILE"}}',
    description => v_desc
  );
  DBMS_OUTPUT.PUT_LINE('[3/7] TOOL_CUSTOMER_PROFILE_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[3/7] ERROR: TOOL_CUSTOMER_PROFILE_RAG - ' || SQLERRM);
    RAISE;
END;
/

-- ---------------------------------------------------------------------------
-- 4. TOOL_MEETING_NOTES_RAG
-- ---------------------------------------------------------------------------
DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MEETING_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_MEETING_NOTES_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari catatan pertemuan RM-nasabah yang relevan secara semantik. '
    || 'Tabel: MEETING_NOTES_EMBEDDINGS - kolom EMBEDDING, CONTENT, CUSTOMER_ID, MEETING_ID, NOTE_DATE. '
    || 'Mengambil fragmen catatan: keputusan produk sebelumnya, keberatan, toleransi risiko, janji tindak lanjut. '
    || 'Selalu filter berdasarkan CUSTOMER_ID. Input wajib: query, customer_id.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_MEETING_NOTES_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RAG_PROFILE"}}',
    description => v_desc
  );


  DBMS_OUTPUT.PUT_LINE('[4/7] TOOL_MEETING_NOTES_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/7] ERROR: TOOL_MEETING_NOTES_RAG - ' || SQLERRM);
    RAISE;
END;
/

-- ---------------------------------------------------------------------------
-- 5. TOOL_PRODUCT_CATALOG_RAG
-- ---------------------------------------------------------------------------
DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_PRODUCT_CATALOG_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_PRODUCT_CATALOG_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'RAG tool untuk mencari produk investasi Bank Danamon yang relevan secara semantik. '
    || 'View: PRODUCT_EMBEDDINGS_V - kolom EMBEDDING, CONTENT, PRODUCT_ID, PRODUCT_NAME, CATEGORY, RISK_LEVEL, INTEREST_RATE, MIN_AMOUNT. '
    || 'Mencakup: deposito, reksa dana, obligasi, instrumen kas aktif (IS_ACTIVE=1). '
    || 'Tidak perlu filter CUSTOMER_ID - semua produk berlaku untuk semua nasabah. Input wajib: query.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_PRODUCT_CATALOG_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RAG_PROFILE"}}',
    description => v_desc
  );


  DBMS_OUTPUT.PUT_LINE('[5/7] TOOL_PRODUCT_CATALOG_RAG created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[5/7] ERROR: TOOL_PRODUCT_CATALOG_RAG - ' || SQLERRM);
    RAISE;
END;
/

-- ---------------------------------------------------------------------------
-- 6. TOOL_ACTIVE_PRODUCTS_SQL
-- ---------------------------------------------------------------------------
DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ACTIVE_PRODUCTS_SQL');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_ACTIVE_PRODUCTS_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil data terstruktur produk investasi aktif dari katalog Bank Danamon. '
    || 'Tabel: PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, RISK_LEVEL, MIN_AMOUNT, TENOR_MONTHS, IS_ACTIVE). '
    || 'Selalu sertakan WHERE IS_ACTIVE=1. '
    || 'Gunakan ORDER BY INTEREST_RATE DESC untuk perbandingan bunga. '
    || 'Input opsional: category, risk_level, min_interest_rate.';


  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ACTIVE_PRODUCTS_SQL',
    attributes => '{"tool_type": "SQL",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE"}}',
    description => v_desc
  );


  DBMS_OUTPUT.PUT_LINE('[6/7] TOOL_ACTIVE_PRODUCTS_SQL created.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[6/7] ERROR: TOOL_ACTIVE_PRODUCTS_SQL - ' || SQLERRM);
    RAISE;
END;
/

-- NOTE: USER_CLOUD_AI_TOOLS may not exist in every schema, so we skip the raw query
-- and rely on the guarded verification block below.
-- select * from USER_CLOUD_AI_TOOLS;

-- ---------------------------------------------------------------------------
-- 7. Verify: list all agent tools (dynamic SQL to survive missing view)
-- ---------------------------------------------------------------------------
DECLARE
  TYPE  t_cur IS REF CURSOR;
  v_cur     t_cur;
  v_id      NUMBER;
  v_name    VARCHAR2(200);
  v_type    VARCHAR2(50);
  v_created DATE;
  v_count   NUMBER := 0;
  v_sql     VARCHAR2(500);
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('[7/7] VERIFICATION - Registered Tools');
  DBMS_OUTPUT.PUT_LINE('========================================');

  -- Try known PAF catalogue views in preference order
  FOR v_view IN (
    SELECT column_value AS vname
    FROM   TABLE(SYS.ODCIVARCHAR2LIST(
             'DBMS_CLOUD_AI_AGENT_TOOLS',
             'USER_CLOUD_AI_AGENT_TOOLS',
             'ALL_CLOUD_AI_AGENT_TOOLS'
           ))
  ) LOOP
    BEGIN
      v_sql := 'SELECT TOOL_ID, TOOL_NAME, TOOL_TYPE, CREATED_AT FROM '
               || v_view.vname || ' ORDER BY TOOL_ID';
      OPEN v_cur FOR v_sql;
      LOOP
        FETCH v_cur INTO v_id, v_name, v_type, v_created;
        EXIT WHEN v_cur%NOTFOUND;
        v_count := v_count + 1;
        DBMS_OUTPUT.PUT_LINE(
          LPAD(v_id,6) || '  ' ||
          RPAD(v_name,35) || '  ' ||
          RPAD(v_type,5)  || '  ' ||
          TO_CHAR(v_created,'DD-MON-YYYY HH24:MI')
        );
      END LOOP;
      CLOSE v_cur;
      DBMS_OUTPUT.PUT_LINE('(source view: ' || v_view.vname || ')');
      EXIT;   -- found a working view - stop trying others
    EXCEPTION
      WHEN OTHERS THEN
        IF v_cur%ISOPEN THEN CLOSE v_cur; END IF;
        -- view doesn't exist or inaccessible - try next candidate
        NULL;
    END;
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('----------------------------------------');
  IF v_count = 0 THEN
    DBMS_OUTPUT.PUT_LINE('No tools found via catalogue views.');
    DBMS_OUTPUT.PUT_LINE('Verify in PAF Studio > Tools Library.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('Total tools registered: ' || v_count);
  END IF;
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Next step: run 06_CREATE_AGENT.sql to assemble PAF_AGENT_RECOMMENDATION');
END;
/
