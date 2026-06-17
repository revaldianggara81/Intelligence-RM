-- ═══════════════════════════════════════════════════════════════════
-- Migration 04: AI_HISTORY_EMBEDDINGS — vector search on saved AI results
--
-- Depends on: 01_AI_ANALYSIS_HISTORY.sql (AI_ANALYSIS_HISTORY must exist)
--
-- What this does:
--   1. Adds RESULT_SNIPPET VARCHAR2(1000) to AI_ANALYSIS_HISTORY so list
--      queries never need to read the RESULT CLOB for preview rendering.
--   2. Creates AI_HISTORY_EMBEDDINGS: one embedding row per saved analysis,
--      storing a VECTOR(1024, FLOAT32) of (module + title + snippet).
--   3. Creates an HNSW vector index (cosine) for fast similarity search.
--   4. Creates a B-tree pre-filter index on (CUSTOMER_ID, MODULE) so the
--      Oracle planner can narrow the vector scan to one customer's history.
--
-- Idempotent — safe to re-run; existing rows / indexes are preserved.
-- ═══════════════════════════════════════════════════════════════════

-- ── Step 1: Add RESULT_SNIPPET to AI_ANALYSIS_HISTORY ────────────────────
-- ORA-01430 = column already exists → safe to swallow
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE AI_ANALYSIS_HISTORY ADD RESULT_SNIPPET VARCHAR2(1000)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -1430 THEN NULL; ELSE RAISE; END IF;
END;
/

COMMENT ON COLUMN AI_ANALYSIS_HISTORY.RESULT_SNIPPET
  IS 'First ~800 chars of RESULT for fast list-view preview; populated on insert by aiHistoryService';

-- ── Step 2: Create AI_HISTORY_EMBEDDINGS ─────────────────────────────────
BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE AI_HISTORY_EMBEDDINGS (
      EMBED_ID    NUMBER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      HISTORY_ID  VARCHAR2(50)  NOT NULL
                    REFERENCES AI_ANALYSIS_HISTORY(HISTORY_ID) ON DELETE CASCADE,
      CUSTOMER_ID VARCHAR2(100),          -- denormalised for pre-filtered vector scan
      MODULE      VARCHAR2(50),           -- denormalised for module-scoped search
      CONTENT     CLOB          NOT NULL, -- text used to generate the embedding
      EMBEDDING   VECTOR(1024, FLOAT32)   NOT NULL,
      MODEL_USED  VARCHAR2(200),
      CREATED_AT  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT  UQ_AIH_EMBED_HIST UNIQUE (HISTORY_ID)  -- one embedding per history row
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;  -- ORA-00955: already exists
END;
/

COMMENT ON TABLE  AI_HISTORY_EMBEDDINGS IS
  'Vector embeddings of AI analysis history for semantic search via Oracle 26ai VECTOR_DISTANCE.';
COMMENT ON COLUMN AI_HISTORY_EMBEDDINGS.CONTENT IS
  'Text used for the embedding: [module]\nTitle\n---\nresult_snippet';
COMMENT ON COLUMN AI_HISTORY_EMBEDDINGS.EMBEDDING IS
  'Cohere Embed v4.0 (SEARCH_DOCUMENT) — 1024 dimensions, FLOAT32';

-- ── Step 3: HNSW vector index (cosine) ───────────────────────────────────
-- Nearest-neighbour search on the full embedding space.
BEGIN
  EXECUTE IMMEDIATE '
    CREATE VECTOR INDEX IDX_AIH_EMBED_VEC ON AI_HISTORY_EMBEDDINGS(EMBEDDING)
      ORGANIZATION NEIGHBOR PARTITIONS
      WITH DISTANCE COSINE
      WITH TARGET ACCURACY 95
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;    -- index already exists
    ELSIF SQLCODE = -1 THEN NULL;   -- some editions raise ORA-00001 on duplicate index name
    ELSE RAISE; END IF;
END;
/

-- ── Step 4: B-tree pre-filter index ──────────────────────────────────────
-- Used by Oracle to narrow the vector scan to a single customer + module
-- before applying VECTOR_DISTANCE (partition pruning for HNSW).
BEGIN
  EXECUTE IMMEDIATE '
    CREATE INDEX IDX_AIH_EMBED_CUST_MOD ON AI_HISTORY_EMBEDDINGS(CUSTOMER_ID, MODULE)
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────────
SELECT table_name, num_rows
FROM   user_tables
WHERE  table_name IN ('AI_ANALYSIS_HISTORY', 'AI_HISTORY_EMBEDDINGS')
ORDER  BY table_name;

SELECT column_name, data_type, data_length, nullable
FROM   user_tab_columns
WHERE  table_name = 'AI_HISTORY_EMBEDDINGS'
ORDER  BY column_id;

SELECT index_name, index_type, uniqueness
FROM   user_indexes
WHERE  table_name = 'AI_HISTORY_EMBEDDINGS'
ORDER  BY index_name;
/
