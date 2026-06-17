-- =============================================================================
-- 03_TOOL_MEETING_NOTES_RAG.sql
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Retrieves relevant meeting note fragments from
--          MEETING_NOTES_EMBEDDINGS using semantic similarity search.
--          Covers: previous RM-customer conversations, concerns raised,
--          product decisions made, follow-up commitments, objections logged.
-- Profile: DANAMON_RAG_PROFILE  (embedding = Cohere Embed v4.0)
-- =============================================================================

-- Prerequisites:
--   1. DANAMON_RAG_PROFILE already created (embedding model configured)
--   2. MEETING_NOTES_EMBEDDINGS populated with VECTOR(1536, FLOAT32) embeddings
--   3. Vector index IDX_NOTES_EMBED_VEC created on MEETING_NOTES_EMBEDDINGS.EMBEDDING

DECLARE
  v_desc      CLOB;
  v_metadata  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MEETING_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_MEETING_NOTES_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  v_desc := 'RAG tool untuk mencari catatan pertemuan RM-nasabah yang relevan secara semantik. '
    || 'Mengambil fragmen catatan rapat yang berisi: keputusan produk sebelumnya, keberatan nasabah, '
    || 'toleransi risiko yang diungkapkan, janji tindak lanjut RM, dan preferensi investasi historis. '
    || 'Input wajib: query (VARCHAR2), customer_id (VARCHAR2). '
    || 'Gunakan tool ini untuk memahami konteks historis hubungan RM-nasabah.';

    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_MEETING_NOTES_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"},
                    "tool_inputs":  [
                        {
                          "name"       : "MEETING_NOTES_EMBEDDINGS",
                          "description": "Embedding catatan pertemuan RM dengan nasabah. Setiap baris adalah satu fragmen catatan rapat. Berisi: diskusi produk, keberatan nasabah, keputusan investasi, janji tindak lanjut, preferensi yang diungkapkan nasabah dalam percakapan."
                        }
                      ]
                    }',
    description => v_desc
  );


  DBMS_OUTPUT.PUT_LINE('=== TOOL_MEETING_NOTES_RAG created ===');
  DBMS_OUTPUT.PUT_LINE('Tool    : TOOL_MEETING_NOTES_RAG');
  DBMS_OUTPUT.PUT_LINE('Type    : RAG (Vector Search via DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('Table   : MEETING_NOTES_EMBEDDINGS (VECTOR 1536 FLOAT32)');
  DBMS_OUTPUT.PUT_LINE('Filter  : CUSTOMER_ID');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_MEETING_NOTES_RAG: ' || SQLERRM);
    RAISE;
END;
/


DECLARE
  v_desc      CLOB;
  v_metadata  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_MEETING_NOTES_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_MEETING_NOTES_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  v_desc := 'RAG tool untuk mencari catatan pertemuan RM-nasabah yang relevan secara semantik. '
    || 'Mengambil fragmen catatan rapat yang berisi: keputusan produk sebelumnya, keberatan nasabah, '
    || 'toleransi risiko yang diungkapkan, janji tindak lanjut RM, dan preferensi investasi historis. '
    || 'Input wajib: query (VARCHAR2), customer_id (VARCHAR2). '
    || 'Gunakan tool ini untuk memahami konteks historis hubungan RM-nasabah.';

    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_MEETING_NOTES_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('=== TOOL_MEETING_NOTES_RAG created ===');
  DBMS_OUTPUT.PUT_LINE('Tool    : TOOL_MEETING_NOTES_RAG');
  DBMS_OUTPUT.PUT_LINE('Type    : RAG (Vector Search via DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('Table   : MEETING_NOTES_EMBEDDINGS (VECTOR 1536 FLOAT32)');
  DBMS_OUTPUT.PUT_LINE('Filter  : CUSTOMER_ID');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_MEETING_NOTES_RAG: ' || SQLERRM);
    RAISE;
END;
/
-- =============================================================================
-- TEST BLOCK - verify TOOL_MEETING_NOTES_RAG
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Test 1: Confirm the tool is registered in the catalog
-- ---------------------------------------------------------------------------
SELECT tool_name,
       substr(description, 1, 3)  AS tool_type,
       status,
       SUBSTR(description, 5, 80) AS description_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_MEETING_NOTES_RAG';

-- ---------------------------------------------------------------------------
-- Test 2: Confirm DANAMON_RAG_PROFILE is active (required by this tool)
-- ---------------------------------------------------------------------------
SELECT profile_name, status
FROM   user_cloud_ai_profiles
WHERE  profile_name = 'DANAMON_RM_PROFILE_GROK_OCI';

-- ---------------------------------------------------------------------------
-- Test 3: Check MEETING_NOTES_EMBEDDINGS - row count, populated vs null
-- ---------------------------------------------------------------------------
SELECT COUNT(*)                          AS total_rows,
       COUNT(EMBEDDING)                  AS populated_embeddings,
       COUNT(*) - COUNT(EMBEDDING)       AS null_embeddings,
       COUNT(DISTINCT CUSTOMER_ID)       AS distinct_customers,
       COUNT(DISTINCT NOTE_ID)           AS distinct_notes,
       MIN(CREATED_AT)                   AS earliest_embed,
       MAX(CREATED_AT)                   AS latest_embed
FROM   MEETING_NOTES_EMBEDDINGS;

-- Sample rows (confirm content and embedding dimension)
SELECT NOTE_ID,
       CUSTOMER_ID,
       SUBSTR(CONTENT, 1, 150)           AS content_preview,
       VECTOR_DIMENSION(EMBEDDING)       AS embed_dim,
       MODEL_USED
FROM   MEETING_NOTES_EMBEDDINGS
FETCH FIRST 3 ROWS ONLY;

-- ---------------------------------------------------------------------------
-- Test 4: Source table sanity - confirm MEETING_NOTES has data
-- ---------------------------------------------------------------------------
SELECT COUNT(*)                          AS total_notes,
       COUNT(DISTINCT CUSTOMER_ID)       AS distinct_customers,
       MIN(NOTE_DATE)                    AS earliest_note,
       MAX(NOTE_DATE)                    AS latest_note
FROM   MEETING_NOTES;

-- ---------------------------------------------------------------------------
-- Test 5: Vector index check
-- ---------------------------------------------------------------------------
SELECT index_name, index_type, status
FROM   user_indexes
WHERE  table_name = 'MEETING_NOTES_EMBEDDINGS'
  AND  index_name = 'IDX_NOTES_EMBED_VEC';

-- ---------------------------------------------------------------------------
-- Test 6: RAG semantic search via DANAMON_RM_PROFILE_GROK_OCI (action => 'chat')
--   NOTE: use 'chat' - NOT 'narrate'/'query'. Those trigger NL2SQL on the
--   embedding table columns and fail. Only 'chat' activates embedding_model
--   for vector retrieval.
--   Replace 'CUST001' with a real CUSTOMER_ID from Test 3 above.
-- ---------------------------------------------------------------------------
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_result  CLOB;
  v_t0      TIMESTAMP := SYSTIMESTAMP;
  v_elapsed NUMBER;
BEGIN
  v_result := DBMS_CLOUD_AI.GENERATE(
    prompt       => 'Apa yang dibahas dalam pertemuan terakhir dengan nasabah CUST001? '
                 || 'Sebutkan produk yang didiskusikan dan tindak lanjut yang dijanjikan.',
    profile_name => 'DANAMON_RM_PROFILE_GROK_OCI',
    action       => 'chat'
  );
  v_elapsed := ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1);
  DBMS_OUTPUT.PUT_LINE('[TEST-6] DANAMON_RM_PROFILE_GROK_OCI (chat/RAG) - ' || v_elapsed || 's');
  DBMS_OUTPUT.PUT_LINE(SUBSTR(v_result, 1, 2000));
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[TEST-6] FAILED: ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------------------
-- Test 7: Direct vector similarity search (pure Oracle VECTOR, no LLM)
--         Embeds the query string and finds top-5 nearest meeting note chunks.
-- ---------------------------------------------------------------------------
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  C_PARAMS  CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_GENAI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-v4.0"}';
  v_qvec    VECTOR(1536, FLOAT32);
  v_t0      TIMESTAMP := SYSTIMESTAMP;
  v_elapsed NUMBER;
BEGIN
  -- Embed the search query
  v_qvec := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
               'produk yang didiskusikan dan tindak lanjut pertemuan',
               json(C_PARAMS));

  DBMS_OUTPUT.PUT_LINE('[TEST-7] Query embedded in ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
          EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1) || 's');

  -- Print top-5 nearest meeting note chunks
  FOR r IN (
    SELECT NOTE_ID,
           CUSTOMER_ID,
           ROUND(VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE), 4) AS cosine_dist,
           SUBSTR(CONTENT, 1, 150)                               AS content_preview
    FROM   MEETING_NOTES_EMBEDDINGS
    ORDER BY VECTOR_DISTANCE(EMBEDDING, v_qvec, COSINE)
    FETCH FIRST 5 ROWS ONLY
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(
      'NOTE_ID=' || r.NOTE_ID
      || ' CUST=' || r.CUSTOMER_ID
      || ' dist=' || r.cosine_dist
      || CHR(10) || '  ' || r.content_preview);
  END LOOP;

  v_elapsed := ROUND(
    EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0)) +
    EXTRACT(MINUTE FROM (SYSTIMESTAMP - v_t0)) * 60, 1);
  DBMS_OUTPUT.PUT_LINE('[TEST-7] Total: ' || v_elapsed || 's');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('[TEST-7] FAILED: ' || SQLERRM);
END;
/
