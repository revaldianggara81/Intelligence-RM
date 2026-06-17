-- =============================================================================
-- 02_TOOL_CUSTOMER_PROFILE_RAG.sql
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Retrieves unstructured customer profile context from
--          CUSTOMER_EMBEDDINGS using cosine similarity (1536-dim Cohere).
--          Covers: risk preference narratives, life goals, investment style,
--          background notes, and other free-text profile segments.
-- Profile: DANAMON_RAG_PROFILE  (embedding = Cohere Embed v4.0)
-- =============================================================================

-- Prerequisites:
--   1. DANAMON_RAG_PROFILE already created (embedding model configured)
--   2. CUSTOMER_EMBEDDINGS populated with VECTOR(1536, FLOAT32) embeddings
--   3. Vector index IDX_CUST_EMBED_VEC created on CUSTOMER_EMBEDDINGS.EMBEDDING

DECLARE
  v_desc      CLOB;
  v_metadata  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CUSTOMER_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_CUSTOMER_PROFILE_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  v_desc := 'RAG tool untuk mencari konteks profil nasabah secara semantik dari teks embedding. '
    || 'Mengambil segmen teks yang relevan tentang: preferensi risiko nasabah, tujuan keuangan, '
    || 'gaya investasi, latar belakang, dan karakteristik perilaku keuangan. '
    || 'Input wajib: query (VARCHAR2), customer_id (VARCHAR2). '
    || 'Gunakan tool ini untuk memahami konteks kualitatif/naratif nasabah.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CUSTOMER_PROFILE_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"},
                    "tool_inputs":  [
                        {
                          "name"       : "CUSTOMER_EMBEDDINGS",
                          "description": "Embedding teks profil nasabah. CONTENT_TYPE dapat berupa: profile_summary, risk_preference, investment_goal, background, financial_behavior. Setiap baris adalah satu segmen teks profil nasabah."
                        }
                      ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('=== TOOL_CUSTOMER_PROFILE_RAG created ===');
  DBMS_OUTPUT.PUT_LINE('Tool    : TOOL_CUSTOMER_PROFILE_RAG');
  DBMS_OUTPUT.PUT_LINE('Type    : RAG (Vector Search via DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('Table   : CUSTOMER_EMBEDDINGS (VECTOR 1536 FLOAT32)');
  DBMS_OUTPUT.PUT_LINE('Filter  : CUSTOMER_ID');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_CUSTOMER_PROFILE_RAG: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc      CLOB;
  v_metadata  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CUSTOMER_PROFILE_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_CUSTOMER_PROFILE_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  v_desc := 'RAG tool untuk mencari konteks profil nasabah secara semantik dari teks embedding. '
    || 'Mengambil segmen teks yang relevan tentang: preferensi risiko nasabah, tujuan keuangan, '
    || 'gaya investasi, latar belakang, dan karakteristik perilaku keuangan. '
    || 'Input wajib: query (VARCHAR2), customer_id (VARCHAR2). '
    || 'Gunakan tool ini untuk memahami konteks kualitatif/naratif nasabah.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CUSTOMER_PROFILE_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"}}',                    
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('=== TOOL_CUSTOMER_PROFILE_RAG created ===');
  DBMS_OUTPUT.PUT_LINE('Tool    : TOOL_CUSTOMER_PROFILE_RAG');
  DBMS_OUTPUT.PUT_LINE('Type    : RAG (Vector Search via DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('Table   : CUSTOMER_EMBEDDINGS (VECTOR 1536 FLOAT32)');
  DBMS_OUTPUT.PUT_LINE('Filter  : CUSTOMER_ID');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_CUSTOMER_PROFILE_RAG: ' || SQLERRM);
    RAISE;
END;
/

-- =============================================================================
-- TEST BLOCK - verify TOOL_CUSTOMER_PROFILE_RAG
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Test 1: Confirm the tool is registered in the catalog
-- ---------------------------------------------------------------------------
SELECT tool_name,
       substr(description, 1, 3)  AS tool_type,
       status,
       SUBSTR(description, 5, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_CUSTOMER_PROFILE_RAG';

-- ---------------------------------------------------------------------------
-- Test 2: Confirm DANAMON_RAG_PROFILE is active (required by this tool)
-- ---------------------------------------------------------------------------
SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_RM_PROFILE_GROK_OCI';

-- ---------------------------------------------------------------------------
-- Test 3: Check CUSTOMER_EMBEDDINGS - row count, populated vs null embeddings
-- ---------------------------------------------------------------------------
SELECT COUNT(*)                                        AS total_rows,
       COUNT(EMBEDDING)                                AS populated_embeddings,
       COUNT(*) - COUNT(EMBEDDING)                     AS null_embeddings,
       COUNT(DISTINCT CUSTOMER_ID)                     AS distinct_customers,
       MIN(CREATED_AT)                                 AS earliest_embed,
       MAX(CREATED_AT)                                 AS latest_embed
FROM   CUSTOMER_EMBEDDINGS;

-- Content type breakdown
SELECT CONTENT_TYPE, COUNT(*) AS cnt
FROM   CUSTOMER_EMBEDDINGS
GROUP BY CONTENT_TYPE
ORDER BY cnt DESC;

-- Sample rows (confirm content and embedding dimension)
SELECT CUSTOMER_ID,
       CONTENT_TYPE,
       SUBSTR(CONTENT, 1, 120)                         AS content_preview,
       VECTOR_DIMENSION(EMBEDDING)                     AS embed_dim,
       MODEL_USED
FROM   CUSTOMER_EMBEDDINGS
FETCH FIRST 3 ROWS ONLY;

-- ---------------------------------------------------------------------------
-- Test 4: Vector index check
-- ---------------------------------------------------------------------------
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'CUSTOMER_EMBEDDINGS'
  AND  index_name = 'IDX_CUST_EMBED_VEC';

-- ---------------------------------------------------------------------------
-- Test 5: RAG semantic search via DANAMON_RAG_PROFILE
--   IMPORTANT: use action => 'chat' - NOT 'narrate' or 'query'.
--   'narrate'/'query' trigger NL2SQL on the embedding table columns,
--   which fails (no column "RISIKO"). Only 'chat' activates the
--   embedding_model for vector/semantic retrieval.
-- ---------------------------------------------------------------------------
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
  v_elapsed NUMBER;
BEGIN
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Apa preferensi risiko dan tujuan investasi nasabah CUST001?',
    profile_name => 'DANAMON_RM_PROFILE_GROK_OCI',
    action       => 'chat'
  );
  v_elapsed := ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1);
  DBMS_OUTPUT.PUT_LINE('[TEST-5] DANAMON_RAG_PROFILE (chat/RAG) - ' || v_elapsed || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 2000));
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[TEST-5] FAILED: ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------------------
-- Test 6: Direct vector similarity search (bypasses LLM, pure Oracle VECTOR)
--         Embeds the query string and finds top-5 nearest neighbors.
--         Replace 'CUST001' if you want to filter by a specific customer.
-- ---------------------------------------------------------------------------
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  C_PARAMS   CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_GENAI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-v4.0"}';
  v_qvec     VECTOR(1536, FLOAT32);
  v_t0       TIMESTAMP := SYSTIMESTAMP;
  v_elapsed  NUMBER;
BEGIN
  -- Embed the search query
  v_qvec := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
               'preferensi risiko dan tujuan investasi',
               json(C_PARAMS));

  DBMS_OUTPUT.PUT_LINE('[TEST-6] Query embedded in ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');

  -- Print top-5 nearest neighbors
  FOR r IN (
    SELECT CUSTOMER_ID,
           CONTENT_TYPE,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE), 4) AS cosine_dist,
           SUBSTR(CONTENT, 1, 150)                               AS content_preview
    FROM   CUSTOMER_EMBEDDINGS
    ORDER BY VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE)
    FETCH FIRST 5 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(
      r.CUSTOMER_ID || ' [' || r.CONTENT_TYPE || '] dist=' || r.cosine_dist
      || CHR(10) || '  ' || r.content_preview);
  END LOOP;

  v_elapsed := ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1);
  DBMS_OUTPUT.PUT_LINE('[TEST-6] Total: ' || v_elapsed || 's');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[TEST-6] FAILED: ' || SQLERRM);
END;
/
