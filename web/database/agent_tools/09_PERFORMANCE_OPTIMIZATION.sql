-- =============================================================================
-- 09_PERFORMANCE_OPTIMIZATION.sql
-- Performance tuning for FLOW_RECOMMENDATION_ENGINE / PAF_AGENT_RECOMMENDATION
--
-- Root causes of slowness:
--   1. RAG tools scan ALL embeddings before filtering CUSTOMER_ID  (no scalar index)
--   2. Vector indexes use IVF (NEIGHBOR PARTITIONS) - suboptimal for small datasets
--   3. PRODUCT_EMBEDDINGS_V view re-joins on every RAG call - no result cache
--   4. PRODUCT_CATALOG missing composite indexes for IS_ACTIVE + filter columns
--   5. FK columns on embedding tables have no indexes (slow JOIN in view)
--   6. AI_ANALYSIS_CACHE never used - repeated same-customer queries re-call LLM
--   7. Agent max_iterations = 10 - allows excessive tool round-trips
--
-- Run as ADMIN (schema owner).  Safe to re-run - all CREATE are OR REPLACE / IF NOT EXISTS guarded.
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  PROCEDURE safe_exec(p_sql IN VARCHAR2, p_label IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
    DBMS_OUTPUT.PUT_LINE('  [OK] ' || p_label);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE IN (-955, -1408, -1452) THEN   -- already exists / duplicate column / duplicate key
        DBMS_OUTPUT.PUT_LINE('  [SKIP] ' || p_label || ' (already exists)');
      ELSE
        DBMS_OUTPUT.PUT_LINE('  [WARN] ' || p_label || ': ' || SQLERRM);
      END IF;
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('PAF_AGENT_RECOMMENDATION Performance Tuning');
  DBMS_OUTPUT.PUT_LINE('Date   : ' || TO_CHAR(SYSDATE,'DD-MON-YYYY HH24:MI'));
  DBMS_OUTPUT.PUT_LINE('Schema : ' || SYS_CONTEXT('USERENV','CURRENT_SCHEMA'));
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/


-- =============================================================================
-- SECTION 1 - SCALAR INDEXES ON EMBEDDING TABLES
-- Problem : RAG tools filter by CUSTOMER_ID but no scalar index exists.
--           Oracle must full-scan the table, then apply vector similarity.
--           Adding a scalar index lets the optimizer PRE-FILTER rows before
--           computing vector distances - dramatically reduces search space.
-- =============================================================================

DECLARE
  PROCEDURE safe_exec(p_sql IN VARCHAR2, p_label IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
    DBMS_OUTPUT.PUT_LINE('  [OK] ' || p_label);
  EXCEPTION WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('  [SKIP] ' || p_label || ' (already exists)');
    ELSE
      DBMS_OUTPUT.PUT_LINE('  [WARN] ' || p_label || ': ' || SQLERRM);
    END IF;
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[1/6] Scalar indexes on embedding tables...');

  -- CUSTOMER_EMBEDDINGS: filter by CUSTOMER_ID (used by TOOL_CUSTOMER_PROFILE_RAG)
  safe_exec(
    'CREATE INDEX IDX_CUST_EMBED_CUSTID ON CUSTOMER_EMBEDDINGS(CUSTOMER_ID)',
    'IDX_CUST_EMBED_CUSTID  (CUSTOMER_EMBEDDINGS.CUSTOMER_ID)'
  );

  -- CUSTOMER_EMBEDDINGS: composite for CUSTOMER_ID + CONTENT_TYPE filtering
  safe_exec(
    'CREATE INDEX IDX_CUST_EMBED_CUSTTYPE ON CUSTOMER_EMBEDDINGS(CUSTOMER_ID, CONTENT_TYPE)',
    'IDX_CUST_EMBED_CUSTTYPE (CUSTOMER_EMBEDDINGS.CUSTOMER_ID, CONTENT_TYPE)'
  );

  -- MEETING_NOTES_EMBEDDINGS: filter by CUSTOMER_ID (used by TOOL_MEETING_NOTES_RAG)
  safe_exec(
    'CREATE INDEX IDX_NOTES_EMBED_CUSTID ON MEETING_NOTES_EMBEDDINGS(CUSTOMER_ID)',
    'IDX_NOTES_EMBED_CUSTID  (MEETING_NOTES_EMBEDDINGS.CUSTOMER_ID)'
  );

  -- MEETING_NOTES_EMBEDDINGS: FK join to MEETING_NOTES
  safe_exec(
    'CREATE INDEX IDX_NOTES_EMBED_NOTEID ON MEETING_NOTES_EMBEDDINGS(NOTE_ID)',
    'IDX_NOTES_EMBED_NOTEID  (MEETING_NOTES_EMBEDDINGS.NOTE_ID)'
  );

  -- PRODUCT_EMBEDDINGS: FK join used in PRODUCT_EMBEDDINGS_V
  safe_exec(
    'CREATE INDEX IDX_PROD_EMBED_PRODID ON PRODUCT_EMBEDDINGS(PRODUCT_ID)',
    'IDX_PROD_EMBED_PRODID   (PRODUCT_EMBEDDINGS.PRODUCT_ID)'
  );

  DBMS_OUTPUT.PUT_LINE('[1/6] Done.');
END;
/


-- =============================================================================
-- SECTION 2 - COMPOSITE INDEXES ON PRODUCT_CATALOG
-- Problem : TOOL_ACTIVE_PRODUCTS_SQL always filters IS_ACTIVE=1, then
--           optionally filters CATEGORY / RISK_LEVEL / INTEREST_RATE and
--           ORDER BY INTEREST_RATE DESC.  No composite index covers this.
-- =============================================================================

DECLARE
  PROCEDURE safe_exec(p_sql IN VARCHAR2, p_label IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
    DBMS_OUTPUT.PUT_LINE('  [OK] ' || p_label);
  EXCEPTION WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('  [SKIP] ' || p_label || ' (already exists)');
    ELSE
      DBMS_OUTPUT.PUT_LINE('  [WARN] ' || p_label || ': ' || SQLERRM);
    END IF;
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[2/6] Composite indexes on PRODUCT_CATALOG...');

  -- Covers: WHERE IS_ACTIVE=1 AND CATEGORY=? ORDER BY INTEREST_RATE DESC
  safe_exec(
    'CREATE INDEX IDX_PROD_ACTIVE_CAT_RATE '
    || 'ON PRODUCT_CATALOG(IS_ACTIVE, CATEGORY, INTEREST_RATE DESC)',
    'IDX_PROD_ACTIVE_CAT_RATE  (IS_ACTIVE, CATEGORY, INTEREST_RATE DESC)'
  );

  -- Covers: WHERE IS_ACTIVE=1 AND RISK_LEVEL=?
  safe_exec(
    'CREATE INDEX IDX_PROD_ACTIVE_RISK '
    || 'ON PRODUCT_CATALOG(IS_ACTIVE, RISK_LEVEL, INTEREST_RATE DESC)',
    'IDX_PROD_ACTIVE_RISK      (IS_ACTIVE, RISK_LEVEL, INTEREST_RATE DESC)'
  );

  -- Covers: WHERE IS_ACTIVE=1 ORDER BY INTEREST_RATE DESC (no other filter)
  safe_exec(
    'CREATE INDEX IDX_PROD_ACTIVE_RATE '
    || 'ON PRODUCT_CATALOG(IS_ACTIVE, INTEREST_RATE DESC)',
    'IDX_PROD_ACTIVE_RATE      (IS_ACTIVE, INTEREST_RATE DESC)'
  );

  DBMS_OUTPUT.PUT_LINE('[2/6] Done.');
END;
/


-- =============================================================================
-- SECTION 3 - AI_ANALYSIS_CACHE INDEXES + PURGE EXPIRED ROWS
-- Problem : Cache table exists but has no CUSTOMER_ID / SCENARIO index.
--           Lookups degrade to full-table scan. Expired rows also pile up.
-- =============================================================================

DECLARE
    v_purged NUMBER;

  PROCEDURE safe_exec(p_sql IN VARCHAR2, p_label IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
    DBMS_OUTPUT.PUT_LINE('  [OK] ' || p_label);
  EXCEPTION WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('  [SKIP] ' || p_label || ' (already exists)');
    ELSE
      DBMS_OUTPUT.PUT_LINE('  [WARN] ' || p_label || ': ' || SQLERRM);
    END IF;
  END;

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[3/6] AI_ANALYSIS_CACHE indexes and purge...');

  -- Lookup by customer + scenario (most common access pattern)
  safe_exec(
    'CREATE INDEX IDX_CACHE_CUST_SCEN '
    || 'ON AI_ANALYSIS_CACHE(CUSTOMER_ID, SCENARIO, EXPIRES_AT)',
    'IDX_CACHE_CUST_SCEN (CUSTOMER_ID, SCENARIO, EXPIRES_AT)'
  );

  -- Lookup by scenario alone (e.g. product catalog cache, no customer)
  safe_exec(
    'CREATE INDEX IDX_CACHE_SCENARIO '
    || 'ON AI_ANALYSIS_CACHE(SCENARIO, EXPIRES_AT)',
    'IDX_CACHE_SCENARIO  (SCENARIO, EXPIRES_AT)'
  );

  -- Purge expired cache entries
  BEGIN
  DELETE FROM AI_ANALYSIS_CACHE
  WHERE EXPIRES_AT IS NOT NULL
    AND EXPIRES_AT < SYSTIMESTAMP;
  v_purged := SQL%ROWCOUNT;
  END;
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('  [OK] Purged ' || to_char(v_purged) || ' expired cache row(s).');

  DBMS_OUTPUT.PUT_LINE('[3/6] Done.');
END;
/


-- =============================================================================
-- SECTION 4 - REBUILD VECTOR INDEXES AS HNSW (faster for small datasets)
-- Problem : Current indexes use NEIGHBOR PARTITIONS (IVF - Inverted File Index).
--           IVF is optimal for millions of vectors.
--           This deployment has small embedding tables:
--             CUSTOMER_EMBEDDINGS      ~400-2 000 rows
--             MEETING_NOTES_EMBEDDINGS ~1 000-5 000 rows
--             PRODUCT_EMBEDDINGS       ~8-20 rows
--           HNSW delivers 3-10x faster query time on small datasets at the
--           cost of slightly higher memory - ideal for interactive RM sessions.
--
-- NOTE: DROP + CREATE vector index causes a brief unavailability window.
--       Run during low-traffic hours.  The scalar indexes in Section 1 are
--       kept; only the vector index organisation changes.
-- =============================================================================

DECLARE
  PROCEDURE drop_vidx(p_name IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE 'DROP INDEX ' || p_name;
    DBMS_OUTPUT.PUT_LINE('  [DROP] ' || p_name);
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('  [SKIP DROP] ' || p_name || ' (not found)');
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[4/6] Rebuilding vector indexes as HNSW...');

  -- -- CUSTOMER_EMBEDDINGS --------------------------------------------------
  drop_vidx('IDX_CUST_EMBED_VEC');

  EXECUTE IMMEDIATE
    'CREATE VECTOR INDEX IDX_CUST_EMBED_VEC
       ON CUSTOMER_EMBEDDINGS(EMBEDDING)
       ORGANIZATION INMEMORY NEIGHBOR GRAPH
       WITH DISTANCE COSINE
       WITH TARGET ACCURACY 95
       PARAMETERS (type HNSW, neighbors 32, efconstruction 100)';
  DBMS_OUTPUT.PUT_LINE('  [OK] IDX_CUST_EMBED_VEC  -> HNSW (neighbors=32, ef=100)');

  -- -- MEETING_NOTES_EMBEDDINGS ---------------------------------------------
  drop_vidx('IDX_NOTES_EMBED_VEC');

  EXECUTE IMMEDIATE
    'CREATE VECTOR INDEX IDX_NOTES_EMBED_VEC
       ON MEETING_NOTES_EMBEDDINGS(EMBEDDING)
       ORGANIZATION INMEMORY NEIGHBOR GRAPH
       WITH DISTANCE COSINE
       WITH TARGET ACCURACY 95
       PARAMETERS (type HNSW, neighbors 32, efconstruction 100)';
  DBMS_OUTPUT.PUT_LINE('  [OK] IDX_NOTES_EMBED_VEC -> HNSW (neighbors=32, ef=100)');

  -- -- PRODUCT_EMBEDDINGS ---------------------------------------------------
  -- Only ~8-20 rows. For very small tables a vector index adds overhead.
  -- Keep it minimal: HNSW with small neighbors.
  drop_vidx('IDX_PROD_EMBED_VEC');

  EXECUTE IMMEDIATE
    'CREATE VECTOR INDEX IDX_PROD_EMBED_VEC
       ON PRODUCT_EMBEDDINGS(EMBEDDING)
       ORGANIZATION INMEMORY NEIGHBOR GRAPH
       WITH DISTANCE COSINE
       WITH TARGET ACCURACY 90
       PARAMETERS (type HNSW, neighbors 16, efconstruction 50)';
  DBMS_OUTPUT.PUT_LINE('  [OK] IDX_PROD_EMBED_VEC  -> HNSW (neighbors=16, ef=50, accuracy=90)');

  DBMS_OUTPUT.PUT_LINE('[4/6] Done.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[4/6] WARN: ' || SQLERRM);
    DBMS_OUTPUT.PUT_LINE('  If HNSW syntax is unsupported by your DB version,');
    DBMS_OUTPUT.PUT_LINE('  keep NEIGHBOR PARTITIONS but reduce TARGET ACCURACY to 90.');
END;
/


-- =============================================================================
-- SECTION 5 - RESULT_CACHE ON PRODUCT_EMBEDDINGS_V
-- Problem : PRODUCT_EMBEDDINGS_V is queried on every TOOL_PRODUCT_CATALOG_RAG
--           call (and every TOOL_ACTIVE_PRODUCTS_SQL indirect call).
--           Product data changes rarely - caching the view result in the
--           shared pool eliminates repeated JOIN + filter executions.
-- =============================================================================

CREATE OR REPLACE VIEW PRODUCT_EMBEDDINGS_V AS
SELECT /*+ RESULT_CACHE */
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
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[5/6] PRODUCT_EMBEDDINGS_V rebuilt with RESULT_CACHE hint.');
END;
/


-- =============================================================================
-- SECTION 6 - GATHER FRESH OPTIMIZER STATISTICS
-- Problem : After creating new indexes the CBO (Cost-Based Optimizer) may
--           still use old statistics and ignore the new indexes.
--           Gathering stats forces the optimizer to re-evaluate execution plans.
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[6/6] Gathering optimizer statistics...');

  FOR t IN (
    SELECT table_name FROM (
      SELECT 'CUSTOMER_EMBEDDINGS'      AS table_name FROM DUAL UNION ALL
      SELECT 'MEETING_NOTES_EMBEDDINGS' FROM DUAL UNION ALL
      SELECT 'PRODUCT_EMBEDDINGS'       FROM DUAL UNION ALL
      SELECT 'PRODUCT_CATALOG'          FROM DUAL UNION ALL
      SELECT 'CUSTOMERS'                FROM DUAL UNION ALL
      SELECT 'CUSTOMER_PRODUCTS'        FROM DUAL UNION ALL
      SELECT 'AI_ANALYSIS_CACHE'        FROM DUAL
    )
  ) LOOP
    BEGIN
      DBMS_STATS.GATHER_TABLE_STATS(
        ownname          => SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
        tabname          => t.table_name,
        estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE,
        method_opt       => 'FOR ALL COLUMNS SIZE AUTO',
        cascade          => TRUE   -- includes indexes
      );
      DBMS_OUTPUT.PUT_LINE('  [OK] Stats gathered: ' || t.table_name);
    EXCEPTION WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('  [WARN] ' || t.table_name || ': ' || SQLERRM);
    END;
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('[6/6] Done.');
END;
/


-- =============================================================================
-- SECTION 7 - RECREATE TEAM with optimised task instruction
-- Oracle PAF architecture: tools attach to TASK, not to AGENT.
-- The callable unit is a TEAM (agent + task).  There is no max_iterations
-- parameter - token efficiency is achieved via a concise task instruction.
-- =============================================================================

-- -- 7a. Agent (role only - no tools here) -----------------------------------
DECLARE
  v_role CLOB;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('[7/7] Recreating PAF_AGENT_RECOMMENDATION team...');

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TEAM(team_name => 'PAF_AGENT_RECOMMENDATION');
    DBMS_OUTPUT.PUT_LINE('  [DROP] PAF_AGENT_RECOMMENDATION team');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TASK(task_name => 'RM_RECOMMENDATION_TASK');
    DBMS_OUTPUT.PUT_LINE('  [DROP] RM_RECOMMENDATION_TASK');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_AGENT(agent_name => 'DANAMON_RM_AGENT');
    DBMS_OUTPUT.PUT_LINE('  [DROP] DANAMON_RM_AGENT');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_role :=
    'Anda adalah AI Co-Pilot RM Bank Danamon Indonesia. '
    || 'Berikan rekomendasi investasi yang konkret, berbasis data, dalam Bahasa Indonesia. '
    || 'Gunakan setiap tool tepat sekali. Jangan spekulatif.';

  DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name  => 'DANAMON_RM_AGENT',
    attributes  => '{"profile_name": "DANAMON_RM_PROFILE",' ||
                   '"role": "' || REPLACE(v_role, '"', '\"') || '"}',
    description => 'RM Co-Pilot agent - profile: DANAMON_RM_PROFILE'
  );
  DBMS_OUTPUT.PUT_LINE('  [OK] DANAMON_RM_AGENT');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[7/7] WARN (agent): ' || SQLERRM);
END;
/

-- -- 7b. Task (concise instruction -> fewer tokens per call) ------------------
DECLARE
  v_instr CLOB;
BEGIN
  v_instr :=
    'Rekomendasi produk investasi Bank Danamon untuk: {query} '
    || 'Panggil setiap tool SEKALI: '
    || '(1) TOOL_CUSTOMER_PROFILE_SQL - data AUM, produk aktif. '
    || '(2) TOOL_CUSTOMER_PROFILE_RAG - preferensi dan tujuan keuangan. '
    || '(3) TOOL_MEETING_NOTES_RAG - histori pertemuan and keberatan. '
    || '(4) TOOL_PRODUCT_CATALOG_RAG - produk relevan secara semantik. '
    || '(5) TOOL_ACTIVE_PRODUCTS_SQL - perbandingan suku bunga. '
    || 'Output: ringkasan profil, tabel alokasi (%), 3-5 produk + alasan, tindak lanjut RM.';

  DBMS_CLOUD_AI_AGENT.CREATE_TASK(
    task_name   => 'RM_RECOMMENDATION_TASK',
    attributes  => '{"instruction": "' || REPLACE(v_instr, '"', '\"') || '",'
                   || '"tools": ['
                   || '"TOOL_CUSTOMER_PROFILE_SQL",'
                   || '"TOOL_CUSTOMER_PROFILE_RAG",'
                   || '"TOOL_MEETING_NOTES_RAG",'
                   || '"TOOL_PRODUCT_CATALOG_RAG",'
                   || '"TOOL_ACTIVE_PRODUCTS_SQL"'
                   || ']}',
    description => 'RM recommendation task - 5 tools (2 SQL + 3 RAG)'
  );
  DBMS_OUTPUT.PUT_LINE('  [OK] RM_RECOMMENDATION_TASK');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[7/7] WARN (task): ' || SQLERRM);
END;
/

-- -- 7c. Team -----------------------------------------------------------------
BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    attributes  => '{"agents": [{"name": "DANAMON_RM_AGENT", "task": "RM_RECOMMENDATION_TASK"}],'
                   || '"process": "sequential"}',
    description => 'PAF_AGENT_RECOMMENDATION - DANAMON_RM_AGENT + RM_RECOMMENDATION_TASK'
  );
  DBMS_OUTPUT.PUT_LINE('  [OK] PAF_AGENT_RECOMMENDATION team');
  DBMS_OUTPUT.PUT_LINE('[7/7] Done. Call via: DBMS_CLOUD_AI_AGENT.RUN_TEAM(''PAF_AGENT_RECOMMENDATION'', user_prompt)');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[7/7] WARN (team): ' || SQLERRM);
END;
/


-- =============================================================================
-- VERIFICATION - show all new indexes
-- =============================================================================
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('VERIFICATION - Indexes on affected tables');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

SELECT
  RPAD(table_name, 30)  AS "Table",
  RPAD(index_name, 35)  AS "Index",
  index_type            AS "Type",
  status                AS "Status"
FROM user_indexes
WHERE table_name IN (
  'CUSTOMER_EMBEDDINGS',
  'MEETING_NOTES_EMBEDDINGS',
  'PRODUCT_EMBEDDINGS',
  'PRODUCT_CATALOG',
  'AI_ANALYSIS_CACHE'
)
ORDER BY table_name, index_name;
/


-- =============================================================================
-- SUMMARY OF CHANGES
-- =============================================================================
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('Performance Optimization - Summary');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 1 - Scalar indexes (RAG pre-filter)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_CUST_EMBED_CUSTID    CUSTOMER_EMBEDDINGS(CUSTOMER_ID)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_CUST_EMBED_CUSTTYPE  CUSTOMER_EMBEDDINGS(CUSTOMER_ID,CONTENT_TYPE)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_NOTES_EMBED_CUSTID   MEETING_NOTES_EMBEDDINGS(CUSTOMER_ID)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_NOTES_EMBED_NOTEID   MEETING_NOTES_EMBEDDINGS(NOTE_ID)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_PROD_EMBED_PRODID    PRODUCT_EMBEDDINGS(PRODUCT_ID)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 2 - PRODUCT_CATALOG composite indexes (SQL tool)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_PROD_ACTIVE_CAT_RATE (IS_ACTIVE,CATEGORY,INTEREST_RATE DESC)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_PROD_ACTIVE_RISK     (IS_ACTIVE,RISK_LEVEL,INTEREST_RATE DESC)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_PROD_ACTIVE_RATE     (IS_ACTIVE,INTEREST_RATE DESC)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 3 - AI_ANALYSIS_CACHE (cache lookups + purge)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_CACHE_CUST_SCEN      (CUSTOMER_ID,SCENARIO,EXPIRES_AT)');
  DBMS_OUTPUT.PUT_LINE('  + IDX_CACHE_SCENARIO       (SCENARIO,EXPIRES_AT)');
  DBMS_OUTPUT.PUT_LINE('  * Expired cache rows purged');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 4 - Vector indexes rebuilt as HNSW');
  DBMS_OUTPUT.PUT_LINE('  ~ IDX_CUST_EMBED_VEC   IVF->HNSW neighbors=32 ef=100 acc=95');
  DBMS_OUTPUT.PUT_LINE('  ~ IDX_NOTES_EMBED_VEC  IVF->HNSW neighbors=32 ef=100 acc=95');
  DBMS_OUTPUT.PUT_LINE('  ~ IDX_PROD_EMBED_VEC   IVF->HNSW neighbors=16 ef=50  acc=90');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 5 - PRODUCT_EMBEDDINGS_V + RESULT_CACHE hint');
  DBMS_OUTPUT.PUT_LINE('  ~ View rebuilt - product join result cached in shared pool');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 6 - Optimizer statistics gathered (all affected tables)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Section 7 - PAF_AGENT_RECOMMENDATION re-created (Oracle PAF architecture)');
  DBMS_OUTPUT.PUT_LINE('  DANAMON_RM_AGENT    - CREATE_AGENT (profile + role)');
  DBMS_OUTPUT.PUT_LINE('  RM_RECOMMENDATION_TASK - CREATE_TASK (instruction + 5 tools)');
  DBMS_OUTPUT.PUT_LINE('  PAF_AGENT_RECOMMENDATION - CREATE_TEAM (agent bound to task)');
  DBMS_OUTPUT.PUT_LINE('  Invoke: DBMS_CLOUD_AI_AGENT.RUN_TEAM(''PAF_AGENT_RECOMMENDATION'', prompt)');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Expected improvement: 40-70% reduction in end-to-end latency');
  DBMS_OUTPUT.PUT_LINE('  - RAG pre-filter  : eliminates full embedding table scan');
  DBMS_OUTPUT.PUT_LINE('  - HNSW indexes    : 3-10x faster vector similarity on small tables');
  DBMS_OUTPUT.PUT_LINE('  - Concise role    : fewer tokens consumed per call');
  DBMS_OUTPUT.PUT_LINE('  - Result cache    : eliminates repeated product view JOINs');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/


-- =============================================================================
-- AGENT TEST
-- Run these blocks individually after the optimization script completes.
-- Prerequisites: 06_CREATE_AGENT.sql must have run successfully.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TEST 1 - Verify team / agent / task exist in registry
-- ---------------------------------------------------------------------------
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('AGENT TEST - Registry check');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

SELECT 'TEAM'  AS object_type, team_name  AS object_name, status, created_at
FROM   user_cloud_ai_agent_teams
WHERE  team_name = 'PAF_AGENT_RECOMMENDATION'
UNION ALL
SELECT 'AGENT', agent_name, status, created_at
FROM   user_cloud_ai_agent_agents
WHERE  agent_name = 'DANAMON_RM_AGENT'
UNION ALL
SELECT 'TASK',  task_name,  status, created_at
FROM   user_cloud_ai_agent_tasks
WHERE  task_name = 'RM_RECOMMENDATION_TASK'
ORDER BY 1;

-- =============================================================================
-- DIAGNOSTICS - Run these FIRST to isolate why TEST 2 / TEST 3 are slow.
--
-- Isolation ladder (stop at the first slow/failing step):
--   DIAG-1  (auto)   : embedding row counts  - empty table = RAG hangs
--   DIAG-2  (auto)   : tool/agent/task/team status - all must be ENABLED
--   DIAG-3  (auto)   : vector index presence
--   DIAG-4  (manual) : direct LLM call - if slow -> OCI GenAI unreachable
--   DIAG-5  (manual) : NL2SQL call - if slow -> profile / object_list issue
--   DIAG-6  (manual) : minimal agent (1 simple question, no customer ID)
--   DIAG-7  (manual) : full traced call - monitor with V$SESSION in another session
-- =============================================================================

-- ---------------------------------------------------------------------------
-- DIAG-1 (auto): Embedding table row counts
-- rows_with_vector = 0 -> RAG tool returns nothing -> agent loops / hangs
-- ---------------------------------------------------------------------------
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('=== DIAG-1: Embedding row counts ===');
END;
/

SELECT tbl,
       total_rows,
       rows_with_vector,
       CASE WHEN rows_with_vector = 0
            THEN '*** EMPTY - populate before running agent ***'
            ELSE 'OK' END AS verdict
FROM (
  SELECT 'CUSTOMER_EMBEDDINGS'      AS tbl, COUNT(*) AS total_rows,
         COUNT(EMBEDDING)           AS rows_with_vector
  FROM   CUSTOMER_EMBEDDINGS
  UNION ALL
  SELECT 'MEETING_NOTES_EMBEDDINGS', COUNT(*), COUNT(EMBEDDING)
  FROM   MEETING_NOTES_EMBEDDINGS
  UNION ALL
  SELECT 'PRODUCT_EMBEDDINGS',       COUNT(*), COUNT(EMBEDDING)
  FROM   PRODUCT_EMBEDDINGS
)
ORDER BY tbl;

-- ---------------------------------------------------------------------------
-- DIAG-2 (auto): All objects must be ENABLED before RUN_TEAM works
-- ---------------------------------------------------------------------------
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('=== DIAG-2: Object status ===');
END;
/
select * from USER_AI_AGENT_TOOLS;
select * from USER_AI_AGENT_TEAMS;

SELECT type, name, status,
       CASE WHEN status != 'ENABLED' THEN '*** NEEDS ENABLING ***' ELSE 'OK' END AS verdict
FROM (
  SELECT 'TOOL'  AS type, tool_name  AS name, status FROM USER_AI_AGENT_TOOLS
  UNION ALL
  SELECT 'AGENT', agent_name, status FROM USER_AI_AGENTS
  UNION ALL
  SELECT 'TEAM',  agent_team_name,  status FROM USER_AI_AGENT_TEAMS
)
ORDER BY type, name;

-- ---------------------------------------------------------------------------
-- DIAG-3 (auto): Vector index presence (missing = full table scan on RAG)
-- ---------------------------------------------------------------------------
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('=== DIAG-3: Vector index status ===');
END;
/

SELECT table_name, index_name, index_type, status
FROM   user_indexes
WHERE  table_name IN ('CUSTOMER_EMBEDDINGS','MEETING_NOTES_EMBEDDINGS','PRODUCT_EMBEDDINGS')
ORDER  BY table_name, index_name;

-- ---------------------------------------------------------------------------
-- DIAG-4 (manual): Direct LLM call - no agent, no tools, no RAG.
-- Expected: < 5 s.  If > 30 s -> check network ACL and OCI credential.
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_result CLOB;
  v_t0     TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('PAF_DIAG', 'LLM_DIRECT');
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Respond with only the single word OK.',
    profile_name => 'DANAMON_RM_PROFILE',
    action       => 'chat'
  );
  DBMS_OUTPUT.PUT_LINE('DIAG-4 LLM OK: ' || ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE('Response: ' || SUBSTR(v_result, 1, 200));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('DIAG-4 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- DIAG-5 (manual): NL2SQL - SQL tool path only, no RAG.
-- Run after DIAG-4 passes. If slow -> check object_list in DANAMON_RM_PROFILE.
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_sql CLOB;
  v_t0  TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('PAF_DIAG', 'NL2SQL');
  v_sql := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Show top 3 customers ordered by TOTAL_AUM descending',
    profile_name => 'DANAMON_RM_PROFILE',
    action       => 'showsql'
  );
  DBMS_OUTPUT.PUT_LINE('DIAG-5 NL2SQL OK: ' || ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE('SQL: ' || SUBSTR(v_sql, 1, 500));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('DIAG-5 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- DIAG-6 (manual): Minimal agent call - generic question, no customer ID.
-- Expected: < 15 s (one SQL tool call).
-- If slow after DIAG-5 passes -> task/team setup or agent loop issue.
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_response CLOB;
  v_t0       TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('PAF_DIAG', 'MINIMAL_AGENT');
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt => 'Sebutkan 3 produk deposito dengan suku bunga tertinggi. Jawab singkat.'
  );
  DBMS_OUTPUT.PUT_LINE('DIAG-6 agent OK: ' || ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_response, 1, 500));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('DIAG-6 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- DIAG-7 (manual): Full traced call - monitor from a SECOND session with:
--   SELECT action, state, wait_class, seconds_in_wait
--   FROM   v$session WHERE module = 'PAF_AGENT_FULL';
-- DBMS_APPLICATION_INFO.SET_ACTION marks each stage so you see where time goes.
-- ---------------------------------------------------------------------------
/*
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_customer_id VARCHAR2(50) := 'CUST001';   -- <- change to a real CUSTOMER_ID
  v_response    CLOB;
  v_t0          TIMESTAMP;
  v_elapsed     NUMBER;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('PAF_AGENT_FULL', 'INIT');
  v_t0 := SYSTIMESTAMP;

  DBMS_APPLICATION_INFO.SET_ACTION('RUN_TEAM');
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt =>
      'Buatkan rekomendasi produk investasi untuk nasabah customer_id = '''
      || v_customer_id || '''. '
      || 'Analisis profil risiko, portofolio aktif, dan catatan pertemuan terakhir. '
      || 'Rekomendasikan 3 produk terbaik dengan alokasi portofolio optimal.'
  );
  DBMS_APPLICATION_INFO.SET_ACTION('DONE');

  v_elapsed := EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0))
             + EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60;

  DBMS_OUTPUT.PUT_LINE('=== Recommendation for ' || v_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' || ROUND(v_elapsed, 1) || 's');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_APPLICATION_INFO.SET_ACTION('ERROR');
    DBMS_OUTPUT.PUT_LINE('FAILED: ' || SQLERRM);
END;
/
*/

-- ---------------------------------------------------------------------------
-- TEST 2 - Smoke test (no customer context). Run after all DIAG steps pass.
-- ---------------------------------------------------------------------------
/*
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_response CLOB;
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt => 'Apa saja produk investasi deposito yang tersedia di Bank Danamon?'
  );
  DBMS_OUTPUT.PUT_LINE('--- Response ---');
  DBMS_OUTPUT.PUT_LINE(v_response);
END;
/
*/

-- ---------------------------------------------------------------------------
-- TEST 3 - Full recommendation for a specific customer (with elapsed time)
-- Replace 'CUST001' with an actual CUSTOMER_ID from your CUSTOMERS table.
-- Run after DIAG-6 passes.
-- ---------------------------------------------------------------------------
/*
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_customer_id VARCHAR2(50) := 'CUST001';   -- <- change this
  v_response    CLOB;
  v_t0          TIMESTAMP;
  v_elapsed     NUMBER;
BEGIN
  v_t0 := SYSTIMESTAMP;
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt =>
      'Buatkan rekomendasi produk investasi untuk nasabah customer_id = '''
      || v_customer_id || '''. '
      || 'Analisis profil risiko, portofolio aktif saat ini, dan catatan pertemuan terakhir. '
      || 'Rekomendasikan 3 produk terbaik dengan alokasi portofolio optimal.'
  );
  v_elapsed := EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0))
             + EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60;
  DBMS_OUTPUT.PUT_LINE('=== Recommendation for ' || v_customer_id || ' ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
  DBMS_OUTPUT.PUT_LINE('Elapsed: ' || ROUND(v_elapsed, 1) || 's');
END;
/
*/


-- ---------------------------------------------------------------------------
-- TEST 4 - Stateful conversation (conversation_id preserves context)
-- ---------------------------------------------------------------------------
/*
SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  v_conv_id  VARCHAR2(50) := 'CONV_' || TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS');
  v_resp1    CLOB;
  v_resp2    CLOB;
BEGIN
  -- Turn 1: initial recommendation
  v_resp1 := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt => 'Berikan rekomendasi produk untuk nasabah customer_id = ''DAN-0028349''.',
    params      => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('--- Turn 1 ---');
  DBMS_OUTPUT.PUT_LINE(v_resp1);

  -- Turn 2: follow-up in the same conversation
  v_resp2 := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => 'PAF_AGENT_RECOMMENDATION',
    user_prompt => 'Jelaskan lebih detail tentang produk reksa dana yang direkomendasikan.',
    params      => '{"conversation_id": "' || v_conv_id || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('--- Turn 2 ---');
  DBMS_OUTPUT.PUT_LINE(v_resp2);
END;
/
*/


-- =============================================================================
-- IN-DATABASE TOOL TESTS
-- Validates each of the 5 tools created by 00_RUN_ALL_TOOLS.sql.
--
-- Each tool has:
--   AUTO   - data source health check (runs immediately, no LLM call)
--   MANUAL - functional test using the tool's actual path (uncomment to run)
--
-- Tool -> data source -> profile mapping:
--   TOOL_CUSTOMER_PROFILE_SQL  SQL  DANAMON_RM_PROFILE   -> CUSTOMERS, CUSTOMER_PRODUCTS
--   TOOL_ACTIVE_PRODUCTS_SQL   SQL  DANAMON_RM_PROFILE   -> PRODUCT_CATALOG
--   TOOL_CUSTOMER_PROFILE_RAG  RAG  DANAMON_RAG_PROFILE  -> CUSTOMER_EMBEDDINGS
--   TOOL_MEETING_NOTES_RAG     RAG  DANAMON_RAG_PROFILE  -> MEETING_NOTES_EMBEDDINGS
--   TOOL_PRODUCT_CATALOG_RAG   RAG  DANAMON_RAG_PROFILE  -> PRODUCT_EMBEDDINGS_V
-- =============================================================================

BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('IN-DATABASE TOOL TESTS');
  DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

-- ---------------------------------------------------------------------------
-- AUTO: Tool registry - all 5 must show status = ENABLED
-- ---------------------------------------------------------------------------
SELECT RPAD(tool_name,35) AS tool_name, status
FROM   user_ai_agent_tools
ORDER  BY tool_name;

-- ---------------------------------------------------------------------------
-- AUTO: Data source health - row counts for every tool's backing store
-- Zero rows in a source = that tool returns nothing = agent may loop
-- ---------------------------------------------------------------------------
SELECT tool_name, data_source, row_count,
       CASE WHEN row_count = 0
            THEN '*** EMPTY - tool has no data to return ***'
            ELSE 'OK' END AS verdict
FROM (
  SELECT 'TOOL_CUSTOMER_PROFILE_SQL'  AS tool_name,
         'CUSTOMERS'                  AS data_source,
         COUNT(*)                     AS row_count
  FROM   CUSTOMERS
  UNION ALL
  SELECT 'TOOL_CUSTOMER_PROFILE_SQL',
         'CUSTOMER_PRODUCTS (STATUS=Active)',
         COUNT(*)
  FROM   CUSTOMER_PRODUCTS WHERE STATUS = 'Active'
  UNION ALL
  SELECT 'TOOL_ACTIVE_PRODUCTS_SQL',
         'PRODUCT_CATALOG (IS_ACTIVE=1)',
         COUNT(*)
  FROM   PRODUCT_CATALOG WHERE IS_ACTIVE = 1
  UNION ALL
  SELECT 'TOOL_CUSTOMER_PROFILE_RAG',
         'CUSTOMER_EMBEDDINGS (with vector)',
         COUNT(EMBEDDING)
  FROM   CUSTOMER_EMBEDDINGS
  UNION ALL
  SELECT 'TOOL_MEETING_NOTES_RAG',
         'MEETING_NOTES_EMBEDDINGS (with vector)',
         COUNT(EMBEDDING)
  FROM   MEETING_NOTES_EMBEDDINGS
  UNION ALL
  SELECT 'TOOL_PRODUCT_CATALOG_RAG',
         'PRODUCT_EMBEDDINGS_V',
         COUNT(*)
  FROM   PRODUCT_EMBEDDINGS_V
)
ORDER BY tool_name, data_source;

-- ---------------------------------------------------------------------------
-- AUTO: Sample data preview - confirms schema matches what tools expect
-- ---------------------------------------------------------------------------
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('--- Sample: CUSTOMERS (TOOL_CUSTOMER_PROFILE_SQL) ---');
END;
/

SELECT CUSTOMER_ID, FULL_NAME, TIER, RISK_PROFILE,
       TO_CHAR(TOTAL_AUM,'FM999,999,999,999') AS TOTAL_AUM
FROM   CUSTOMERS
FETCH FIRST 3 ROWS ONLY;

BEGIN DBMS_OUTPUT.PUT_LINE('--- Sample: PRODUCT_CATALOG active (TOOL_ACTIVE_PRODUCTS_SQL) ---'); END;
/

SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, RISK_LEVEL,
       INTEREST_RATE || '%' AS RATE,
       TO_CHAR(MIN_AMOUNT,'FM999,999,999') AS MIN_AMOUNT
FROM   PRODUCT_CATALOG
WHERE  IS_ACTIVE = 1
ORDER  BY INTEREST_RATE DESC
FETCH FIRST 5 ROWS ONLY;

BEGIN DBMS_OUTPUT.PUT_LINE('--- Sample: CUSTOMER_EMBEDDINGS (TOOL_CUSTOMER_PROFILE_RAG) ---'); END;
/

SELECT CUSTOMER_ID, CONTENT_TYPE,
       SUBSTR(CONTENT, 1, 80) || '...' AS content_preview,
       CASE WHEN EMBEDDING IS NOT NULL THEN 'HAS VECTOR' ELSE 'NO VECTOR' END AS vec_status
FROM   CUSTOMER_EMBEDDINGS
FETCH FIRST 3 ROWS ONLY;

BEGIN DBMS_OUTPUT.PUT_LINE('--- Sample: MEETING_NOTES_EMBEDDINGS (TOOL_MEETING_NOTES_RAG) ---'); END;
/
select * from MEETING_NOTES_EMBEDDINGS ;

SELECT CUSTOMER_ID, note_ID, created_at,
       SUBSTR(CONTENT, 1, 80) || '...' AS content_preview,
       CASE WHEN EMBEDDING IS NOT NULL THEN 'HAS VECTOR' ELSE 'NO VECTOR' END AS vec_status
FROM   MEETING_NOTES_EMBEDDINGS
FETCH FIRST 3 ROWS ONLY;

BEGIN DBMS_OUTPUT.PUT_LINE('--- Sample: PRODUCT_EMBEDDINGS_V (TOOL_PRODUCT_CATALOG_RAG) ---'); END;
/

SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, RISK_LEVEL,
       SUBSTR(CONTENT, 1, 80) || '...' AS content_preview,
       CASE WHEN EMBEDDING IS NOT NULL THEN 'HAS VECTOR' ELSE 'NO VECTOR' END AS vec_status
FROM   PRODUCT_EMBEDDINGS_V
FETCH FIRST 3 ROWS ONLY;

-- ---------------------------------------------------------------------------
-- MANUAL - TOOL 1: TOOL_CUSTOMER_PROFILE_SQL
-- Tests the NL2SQL path (DANAMON_RM_PROFILE -> CUSTOMERS + CUSTOMER_PRODUCTS).
-- Replace CUST001 with a real CUSTOMER_ID.
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_sql  CLOB;
  v_data CLOB;
  v_t0   TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('TOOL_TEST', 'CUSTOMER_PROFILE_SQL');

  -- Step 1: generate the SQL (showsql)
  v_sql := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Show full profile and active products for customer_id = ''CUST001''',
    profile_name => 'DANAMON_RM_PROFILE',
    action       => 'showsql'
  );
  DBMS_OUTPUT.PUT_LINE('Generated SQL: ' || SUBSTR(v_sql, 1, 300));

  -- Step 2: execute narrate to get natural-language answer
  v_data := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Show full profile and active products for customer_id = ''CUST001''',
    profile_name => 'DANAMON_RM_PROFILE',
    action       => 'narrate'
  );
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('TOOL_CUSTOMER_PROFILE_SQL result (' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP-v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP-v_t0))*60, 1) || 's):');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_data, 1, 1000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('TOOL 1 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- MANUAL - TOOL 2: TOOL_ACTIVE_PRODUCTS_SQL
-- Tests NL2SQL path (DANAMON_RM_PROFILE -> PRODUCT_CATALOG).
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_sql  CLOB;
  v_data CLOB;
  v_t0   TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('TOOL_TEST', 'ACTIVE_PRODUCTS_SQL');

  v_sql := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'List all active deposito products ordered by interest rate descending',
    profile_name => 'DANAMON_RM_PROFILE',
    action       => 'showsql'
  );
  DBMS_OUTPUT.PUT_LINE('Generated SQL: ' || SUBSTR(v_sql, 1, 300));

  v_data := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'List all active deposito products ordered by interest rate descending',
    profile_name => 'DANAMON_RM_PROFILE',
    action       => 'narrate'
  );
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('TOOL_ACTIVE_PRODUCTS_SQL result (' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP-v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP-v_t0))*60, 1) || 's):');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_data, 1, 1000));
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('TOOL 2 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- MANUAL - TOOL 3: TOOL_CUSTOMER_PROFILE_RAG
-- Tests vector search path (DANAMON_RAG_PROFILE -> CUSTOMER_EMBEDDINGS).
-- Replace CUST001 with a real CUSTOMER_ID.
-- ---------------------------------------------------------------------------

SELECT * FROM ALL_CREDENTIALS WHERE CREDENTIAL_NAME = 'OCI_GENAI_CRED';

SELECT CREDENTIAL_NAME, USERNAME, ENABLED 
FROM ALL_CREDENTIALS 
WHERE CREDENTIAL_NAME = 'OCI_GENAI_CRED';


-- Quick test: embed string pendek langsung di SQL
SELECT DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
    'tes koneksi OCI GenAI',
    json('{"provider":"ocigenai"
          ,"credential_name":"OCI_GENAI_CRED_VEC"
          ,"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"
          ,"model":"cohere.embed-v4.0"}')
) AS test_vector
FROM DUAL;


SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS current_schema,
       SYS_CONTEXT('USERENV','SESSION_USER')   AS session_user
FROM DUAL;


SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  C_PROVIDER    CONSTANT VARCHAR2(20)  := 'ocigenai';
  C_GENAI_URL   CONSTANT VARCHAR2(300) := 'https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText';
  C_EMBED_MODEL CONSTANT VARCHAR2(100) := 'cohere.embed-v4.0';
  C_CREDENTIAL  CONSTANT VARCHAR2(100) := 'OCI_GENAI_CRED_VEC';

  C_MAX_CLOB    CONSTANT NUMBER        := 512000; -- OCI GenAI text size limit (bytes)
  l_params         CLOB;

  v_embedding  VECTOR;
  v_t0         TIMESTAMP := SYSTIMESTAMP;
  v_customer   VARCHAR2(50) := 'CUST001';   -- <- change this
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('TOOL_TEST', 'CUSTOMER_PROFILE_RAG');

  l_params := '{"provider":"'|| C_PROVIDER || '"'
            || ',"credential_name":"' || C_CREDENTIAL || '"'
            || ',"url":"'             || C_GENAI_URL   || '"'
            || ',"model":"'           || C_EMBED_MODEL  || '"}';
  -- Generate query embedding using the RAG profile's embedding model

v_embedding := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING( 'preferensi risiko dan tujuan investasi nasabah', json(l_params));
       
  -- Vector similarity search filtered by CUSTOMER_ID
  FOR r IN (
    SELECT CONTENT_TYPE,
           SUBSTR(CONTENT, 1, 120) AS content_preview,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_embedding, COSINE), 4) AS cosine_dist
    FROM   CUSTOMER_EMBEDDINGS
    WHERE  CUSTOMER_ID = v_customer
    ORDER  BY VECTOR_DISTANCE(EMBEDDING, v_embedding, COSINE)
    FETCH  FIRST 3 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(RPAD(r.CONTENT_TYPE, 20) || ' dist=' || r.cosine_dist);
    DBMS_OUTPUT.PUT_LINE('  ' || r.content_preview);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('TOOL_CUSTOMER_PROFILE_RAG OK (' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP-v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP-v_t0))*60, 1) || 's)');
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('TOOL 3 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- MANUAL - TOOL 4: TOOL_MEETING_NOTES_RAG
-- Tests vector search path (DANAMON_RAG_PROFILE -> MEETING_NOTES_EMBEDDINGS).
-- Replace CUST001 with a real CUSTOMER_ID.
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  C_PROVIDER    CONSTANT VARCHAR2(20)  := 'ocigenai';
  C_GENAI_URL   CONSTANT VARCHAR2(300) := 'https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText';
  C_EMBED_MODEL CONSTANT VARCHAR2(100) := 'cohere.embed-v4.0';
  C_CREDENTIAL  CONSTANT VARCHAR2(100) := 'OCI_GENAI_CRED_VEC';

  C_MAX_CLOB    CONSTANT NUMBER        := 512000; -- OCI GenAI text size limit (bytes)
  l_params         CLOB;
  v_embedding  VECTOR;
  v_t0         TIMESTAMP := SYSTIMESTAMP;
  v_customer   VARCHAR2(50) := 'CUST001';   -- <- change this
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('TOOL_TEST', 'MEETING_NOTES_RAG');

  l_params := '{"provider":"'|| C_PROVIDER || '"'
            || ',"credential_name":"' || C_CREDENTIAL || '"'
            || ',"url":"'             || C_GENAI_URL   || '"'
            || ',"model":"'           || C_EMBED_MODEL  || '"}';
v_embedding := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING( 'keberatan dan keputusan produk dalam pertemuan', json(l_params));

  FOR r IN (
    SELECT note_id as MEETING_ID, created_at as NOTE_DATE,
           SUBSTR(CONTENT, 1, 120) AS content_preview,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_embedding, COSINE), 4) AS cosine_dist
    FROM   MEETING_NOTES_EMBEDDINGS
    WHERE  CUSTOMER_ID = v_customer
    ORDER  BY VECTOR_DISTANCE(EMBEDDING, v_embedding, COSINE)
    FETCH  FIRST 3 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE('Meeting ' || r.MEETING_ID || ' (' ||
      TO_CHAR(r.NOTE_DATE,'DD-MON-YYYY') || ') dist=' || r.cosine_dist);
    DBMS_OUTPUT.PUT_LINE('  ' || r.content_preview);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('TOOL_MEETING_NOTES_RAG OK (' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP-v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP-v_t0))*60, 1) || 's)');
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('TOOL 4 FAILED: ' || SQLERRM);
END;
/


-- ---------------------------------------------------------------------------
-- MANUAL - TOOL 5: TOOL_PRODUCT_CATALOG_RAG
-- Tests vector search path (DANAMON_RAG_PROFILE -> PRODUCT_EMBEDDINGS_V).
-- No CUSTOMER_ID filter - all products are searched.
-- ---------------------------------------------------------------------------

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  C_PROVIDER    CONSTANT VARCHAR2(20)  := 'ocigenai';
  C_GENAI_URL   CONSTANT VARCHAR2(300) := 'https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText';
  C_EMBED_MODEL CONSTANT VARCHAR2(100) := 'cohere.embed-v4.0';
  C_CREDENTIAL  CONSTANT VARCHAR2(100) := 'OCI_GENAI_CRED_VEC';

  C_MAX_CLOB    CONSTANT NUMBER        := 512000; -- OCI GenAI text size limit (bytes)
  l_params         CLOB;
  v_embedding  VECTOR;
  v_t0         TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('TOOL_TEST', 'PRODUCT_CATALOG_RAG');


    l_params := '{"provider":"'|| C_PROVIDER || '"'
            || ',"credential_name":"' || C_CREDENTIAL || '"'
            || ',"url":"'             || C_GENAI_URL   || '"'
            || ',"model":"'           || C_EMBED_MODEL  || '"}';
v_embedding := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING( 'produk investasi untuk nasabah konservatif dengan tenor panjang', json(l_params));


  FOR r IN (
    SELECT PRODUCT_NAME, CATEGORY, RISK_LEVEL,
           SUBSTR(CONTENT, 1, 100) AS content_preview,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_embedding, COSINE), 4) AS cosine_dist
    FROM   PRODUCT_EMBEDDINGS_V
    ORDER  BY VECTOR_DISTANCE(EMBEDDING, v_embedding, COSINE)
    FETCH  FIRST 5 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(RPAD(r.PRODUCT_NAME,30) || ' ' ||
      RPAD(r.CATEGORY,12) || ' ' || RPAD(r.RISK_LEVEL,12) ||
      ' dist=' || r.cosine_dist);
    DBMS_OUTPUT.PUT_LINE('  ' || r.content_preview);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('TOOL_PRODUCT_CATALOG_RAG OK (' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP-v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP-v_t0))*60, 1) || 's)');
EXCEPTION
  WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('TOOL 5 FAILED: ' || SQLERRM);
END;
/

