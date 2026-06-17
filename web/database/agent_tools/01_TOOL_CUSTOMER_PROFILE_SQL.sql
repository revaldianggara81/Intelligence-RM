-- =============================================================================
-- 01_TOOL_CUSTOMER_PROFILE_SQL.sql
-- Type   : SQL (Select AI NL2SQL)
-- Purpose: Retrieves full customer profile + portfolio breakdown with
--          concentration analysis and annual yield per holding.
--          Provides the structured data foundation for the narrative output
--          matching docs/Product Recommendation AI Analysis.pdf format.
-- Profile: DANAMON_RM_PROFILE_GROK_OCI
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CUSTOMER_PROFILE_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CUSTOMER_PROFILE_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil profil lengkap nasabah beserta analisis portofolio. ' ||
    'Output mencakup: usia, penghasilan bulanan (Rp), total AUM, tier, profil risiko, ' ||
    'catatan RM (termasuk info anak/keluarga, tujuan keuangan, horizon investasi), ' ||
    'KYC status, dan breakdown setiap produk yang dimiliki dengan yield tahunan (Rp) ' ||
    'dan persentase konsentrasi per kategori terhadap total AUM. ' ||
    'Input wajib: customer_id. ' ||
    'Gunakan sebagai PHASE 1 -- kumpulkan semua data terstruktur sebelum tool lainnya.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CUSTOMER_PROFILE_SQL',
    attributes  =>
      '{"tool_type": "SQL",' ||
      ' "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"},' ||
      ' "tool_inputs": [' ||
      '   {"name": "CUSTOMERS",' ||
      '    "description": "Profil nasabah Bank Danamon. Kolom: CUSTOMER_ID (PK VARCHAR2), FULL_NAME, AGE, GENDER, TIER (prioritas/privilege/regular), TIER_LABEL, RISK_PROFILE (Conservative/Moderate/Aggressive), MONTHLY_INCOME (total Rp/bulan), TOTAL_AUM (total aset Rp), RM_USER_ID, KYC_STATUS, KYC_EXPIRY, NOTES (catatan RM: info anak/keluarga, tujuan keuangan, horizon investasi, sumber pendapatan detail), EMAIL, PHONE."},' ||
      '   {"name": "CUSTOMER_PRODUCTS",' ||
      '    "description": "Produk/portofolio nasabah. Kolom: HOLDING_ID (PK), CUSTOMER_ID (FK), PRODUCT_NAME, CATEGORY (Deposito/Reksa Dana/Obligasi/Asuransi/Tabungan), AMOUNT (nominal Rp), INTEREST_RATE (% p.a.), PURCHASE_DATE, START_DATE, MATURITY_DATE, STATUS (Active/Matured/Redeemed), RETURN_PCT. Gunakan STATUS=Active untuk portofolio berjalan."}'  ||
      ' ]}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[DONE] TOOL_CUSTOMER_PROFILE_SQL created.');
  DBMS_OUTPUT.PUT_LINE('       Tables : CUSTOMERS, CUSTOMER_PRODUCTS');
  DBMS_OUTPUT.PUT_LINE('       Profile: DANAMON_RM_PROFILE_GROK_OCI');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_CUSTOMER_PROFILE_SQL: ' || SQLERRM);
    RAISE;
END;
/


DECLARE
  v_desc  CLOB;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TOOL('TOOL_CUSTOMER_PROFILE_SQL');
    DBMS_OUTPUT.PUT_LINE('[DROP] TOOL_CUSTOMER_PROFILE_SQL dropped (re-creating).');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_desc :=
    'SQL tool untuk mengambil profil lengkap nasabah beserta analisis portofolio. ' ||
    'Output mencakup: usia, penghasilan bulanan (Rp), total AUM, tier, profil risiko, ' ||
    'catatan RM (termasuk info anak/keluarga, tujuan keuangan, horizon investasi), ' ||
    'KYC status, dan breakdown setiap produk yang dimiliki dengan yield tahunan (Rp) ' ||
    'dan persentase konsentrasi per kategori terhadap total AUM. ' ||
    'Input wajib: customer_id. ' ||
    'Gunakan sebagai PHASE 1 -- kumpulkan semua data terstruktur sebelum tool lainnya.';

  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name   => 'TOOL_CUSTOMER_PROFILE_SQL',
    attributes  =>
      '{"tool_type": "SQL",
       "tool_params": {"profile_name": "DANAMON_RM_PROFILE_GROK_OCI"}}',
    description => v_desc
  );

  DBMS_OUTPUT.PUT_LINE('[DONE] TOOL_CUSTOMER_PROFILE_SQL created.');
  DBMS_OUTPUT.PUT_LINE('       Tables : CUSTOMERS, CUSTOMER_PRODUCTS');
  DBMS_OUTPUT.PUT_LINE('       Profile: DANAMON_RM_PROFILE_GROK_OCI');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR creating TOOL_CUSTOMER_PROFILE_SQL: ' || SQLERRM);
    RAISE;
END;
/


-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT tool_name, status,
       SUBSTR(description, 1, 80) AS desc_preview
FROM   USER_AI_AGENT_TOOLS
WHERE  tool_name = 'TOOL_CUSTOMER_PROFILE_SQL';

-- Direct SQL sanity check -- data the tool must be able to return
SELECT
  c.CUSTOMER_ID,
  c.FULL_NAME,
  c.AGE,
  c.RISK_PROFILE,
  c.TIER_LABEL,
  c.MONTHLY_INCOME,
  c.TOTAL_AUM,
  c.NOTES,
  c.KYC_STATUS,
  -- Active portfolio summary
  cp.PRODUCT_NAME,
  cp.CATEGORY,
  cp.AMOUNT,
  cp.INTEREST_RATE,
  -- Annual yield in Rp
  ROUND(cp.AMOUNT * cp.INTEREST_RATE / 100)                    AS ANNUAL_YIELD_RP,
  -- Concentration % vs total AUM
  ROUND(cp.AMOUNT / NULLIF(c.TOTAL_AUM, 0) * 100, 1)          AS PCT_OF_AUM,
  cp.STATUS,
  cp.MATURITY_DATE,
  ROUND(cp.MATURITY_DATE - SYSDATE)                            AS DAYS_TO_MATURITY,
  cp.RETURN_PCT
FROM   CUSTOMERS c
LEFT JOIN CUSTOMER_PRODUCTS cp
  ON  cp.CUSTOMER_ID = c.CUSTOMER_ID
  AND cp.STATUS      = 'Active'
WHERE  c.CUSTOMER_ID = 'CUST002'
ORDER BY cp.AMOUNT DESC NULLS LAST;
