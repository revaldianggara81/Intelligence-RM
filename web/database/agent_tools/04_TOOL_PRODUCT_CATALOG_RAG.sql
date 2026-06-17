-- =============================================================================
-- TOOL_PRODUCT_CATALOG_RAG
-- Type   : RAG (Vector Similarity Search)
-- Purpose: Retrieves relevant product descriptions and selling-point narratives
--          from PRODUCT_EMBEDDINGS joined to PRODUCT_CATALOG.
--          Covers: product benefit descriptions, risk explanations, target
--          investor profiles, and feature comparisons in natural language.
-- Profile: DANAMON_RAG_PROFILE  (embedding = Cohere Embed v4.0 SEARCH_QUERY)
-- =============================================================================

-- Prerequisites:
--   1. DANAMON_RAG_PROFILE already created
--   2. PRODUCT_EMBEDDINGS populated (linked to PRODUCT_CATALOG via PRODUCT_ID)
--   3. Only IS_ACTIVE = 1 products should have been embedded

DECLARE
  v_desc      CLOB;
  v_metadata  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_PRODUCT_CATALOG_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_PRODUCT_CATALOG_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  v_desc := 'RAG tool untuk mencari produk investasi Bank Danamon yang relevan secara semantik. '
    || 'Mengambil deskripsi produk yang paling sesuai berdasarkan: profil risiko nasabah, '
    || 'tujuan investasi, kebutuhan likuiditas, atau pertanyaan tentang kategori produk tertentu. '
    || 'Mencakup produk: deposito berjangka, reksa dana (saham/pendapatan tetap/pasar uang), '
    || 'obligasi, dan instrumen kas. Input wajib: query (VARCHAR2). '
    || 'Gunakan tool ini untuk menemukan produk yang tepat sebelum membuat rekomendasi.';

     DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_PRODUCT_CATALOG_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"},
                    "tool_inputs":  [
                        {
                          "name"       : "PRODUCT_EMBEDDINGS_V",
                          "description": "Embedding deskripsi produk Bank Danamon yang aktif. Setiap baris adalah satu deskripsi naratif produk termasuk keunggulan, risiko, target nasabah, dan cara kerjanya."
                        }
                      ]
                    }',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('=== TOOL_PRODUCT_CATALOG_RAG created ===');
  DBMS_OUTPUT.PUT_LINE('Tool    : TOOL_PRODUCT_CATALOG_RAG');
  DBMS_OUTPUT.PUT_LINE('Type    : RAG (Vector Search via DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('Table   : PRODUCT_EMBEDDINGS_V (JOIN PRODUCT_EMBEDDINGS + PRODUCT_CATALOG)');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_PRODUCT_CATALOG_RAG: ' || SQLERRM);
    RAISE;
END;
/


DECLARE
  v_desc      CLOB;
  v_metadata  CLOB;
BEGIN

  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_PRODUCT_CATALOG_RAG');
    DBMS_OUTPUT.PUT_LINE('  [DROP] TOOL_PRODUCT_CATALOG_RAG dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  v_desc := 'RAG tool untuk mencari produk investasi Bank Danamon yang relevan secara semantik. '
    || 'Mengambil deskripsi produk yang paling sesuai berdasarkan: profil risiko nasabah, '
    || 'tujuan investasi, kebutuhan likuiditas, atau pertanyaan tentang kategori produk tertentu. '
    || 'Mencakup produk: deposito berjangka, reksa dana (saham/pendapatan tetap/pasar uang), '
    || 'obligasi, dan instrumen kas. Input wajib: query (VARCHAR2). '
    || 'Gunakan tool ini untuk menemukan produk yang tepat sebelum membuat rekomendasi.';

     DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_PRODUCT_CATALOG_RAG',
    attributes => '{"tool_type": "RAG",
                    "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('=== TOOL_PRODUCT_CATALOG_RAG created ===');
  DBMS_OUTPUT.PUT_LINE('Tool    : TOOL_PRODUCT_CATALOG_RAG');
  DBMS_OUTPUT.PUT_LINE('Type    : RAG (Vector Search via DANAMON_RM_PROFILE_GROK_OCI)');
  DBMS_OUTPUT.PUT_LINE('Table   : PRODUCT_EMBEDDINGS_V (JOIN PRODUCT_EMBEDDINGS + PRODUCT_CATALOG)');

EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_PRODUCT_CATALOG_RAG: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- Supporting View: PRODUCT_EMBEDDINGS_V
-- Joins PRODUCT_EMBEDDINGS with PRODUCT_CATALOG so RAG metadata includes
-- product name, category, risk level, rates, and minimum amount.
-- Run this BEFORE executing the tool creation block above.
-- =============================================================================

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

COMMENT ON TABLE PRODUCT_EMBEDDINGS_V IS
  'View gabungan PRODUCT_EMBEDDINGS + PRODUCT_CATALOG untuk RAG tool. Hanya produk aktif (IS_ACTIVE=1) yang disertakan.';
/
