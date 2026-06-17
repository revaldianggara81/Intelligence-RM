-- =============================================================================
-- 05_TOOL_ACTIVE_PRODUCTS_SQL.sql
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Retrieves active product catalog for recommendation matching.
--          Includes MAX_AMOUNT (critical for ORI/SBR allocation split),
--          FEATURES, and risk-level filtering for profile matching.
--          Used in PHASE 3 to find concrete products to recommend.
-- Profile: DANAMON_RM_PROFILE_GROK_OCI
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ACTIVE_PRODUCTS_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ACTIVE_PRODUCTS_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil katalog produk investasi aktif dari Bank Danamon. ' ||
    'Output mencakup: nama produk, kategori, suku bunga/return (% p.a.), ' ||
    'minimum investasi (Rp), MAKSIMUM investasi per nasabah (Rp -- kritis untuk obligasi ' ||
    'negara seperti ORI/SBR yang ada batas pembelian), tenor (bulan), risk level, ' ||
    'fitur utama produk, dan catatan produk. ' ||
    'Gunakan sebagai PHASE 3 -- setelah tahu profil nasabah, filter produk yang cocok. ' ||
    'Kunci: MAX_AMOUNT menentukan berapa alokasi maksimum ke obligasi negara, ' ||
    'sisa dana harus dialokasikan ke produk lain (split logic dalam rekomendasi).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ACTIVE_PRODUCTS_SQL',
    attributes  =>
      '{"tool_type": "SQL",' ||
      ' "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "PRODUCT_CATALOG",' ||
      '    "description": "Katalog produk investasi Bank Danamon. Kolom: PRODUCT_ID (PK), PRODUCT_NAME, CATEGORY (Deposito/Reksa Dana/Obligasi/Asuransi/Tabungan), DESCRIPTION, INTEREST_RATE (% p.a.), RISK_LEVEL (Low/Medium/High), MIN_AMOUNT (minimum investasi Rp), MAX_AMOUNT (maksimum investasi per nasabah Rp -- NULL jika tidak ada batas), TENURE_MONTHS (tenor dalam bulan), FEATURES (fitur utama: liquid/guaranteed/government-backed/quarterly-payout dll), IS_ACTIVE (1=aktif). Selalu filter IS_ACTIVE=1."}'  ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[DONE] TOOL_ACTIVE_PRODUCTS_SQL created.');
  DBMS_OUTPUT.PUT_LINE('       Tables : PRODUCT_CATALOG');
  DBMS_OUTPUT.PUT_LINE('       Profile: DANAMON_RM_PROFILE_GROK_OCI');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_ACTIVE_PRODUCTS_SQL: ' || SQLERRM);
    RAISE;
END;
/

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_ACTIVE_PRODUCTS_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_ACTIVE_PRODUCTS_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil katalog produk investasi aktif dari Bank Danamon. ' ||
    'Output mencakup: nama produk, kategori, suku bunga/return (% p.a.), ' ||
    'minimum investasi (Rp), MAKSIMUM investasi per nasabah (Rp -- kritis untuk obligasi ' ||
    'negara seperti ORI/SBR yang ada batas pembelian), tenor (bulan), risk level, ' ||
    'fitur utama produk, dan catatan produk. ' ||
    'Gunakan sebagai PHASE 3 -- setelah tahu profil nasabah, filter produk yang cocok. ' ||
    'Kunci: MAX_AMOUNT menentukan berapa alokasi maksimum ke obligasi negara, ' ||
    'sisa dana harus dialokasikan ke produk lain (split logic dalam rekomendasi).';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_ACTIVE_PRODUCTS_SQL',
    attributes  =>
      '{"tool_type": "SQL",
       "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[DONE] TOOL_ACTIVE_PRODUCTS_SQL created.');
  DBMS_OUTPUT.PUT_LINE('       Tables : PRODUCT_CATALOG');
  DBMS_OUTPUT.PUT_LINE('       Profile: DANAMON_RM_PROFILE_GROK_OCI');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_ACTIVE_PRODUCTS_SQL: ' || SQLERRM);
    RAISE;
END;
/
-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_ACTIVE_PRODUCTS_SQL';

-- Sanity check: products the agent should be able to match
SELECT
  PRODUCT_NAME,
  CATEGORY,
  INTEREST_RATE,
  RISK_LEVEL,
  TO_CHAR(MIN_AMOUNT,  '999,999,999,999') AS MIN_AMOUNT_FMT,
  TO_CHAR(MAX_AMOUNT,  '999,999,999,999') AS MAX_AMOUNT_FMT,
  TENURE_MONTHS,
  SUBSTR(FEATURES, 1, 60)                AS FEATURES_PREVIEW
FROM  PRODUCT_CATALOG
WHERE IS_ACTIVE = 1
ORDER BY
  CASE CATEGORY
    WHEN 'Obligasi'   THEN 1
    WHEN 'Deposito'   THEN 2
    WHEN 'Reksa Dana' THEN 3
    WHEN 'Asuransi'   THEN 4
    ELSE 5
  END,
  INTEREST_RATE DESC;
