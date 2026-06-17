-- ═══════════════════════════════════════════════════════════════════
-- Migration 11 · Product Catalog – Goal Tag & Return Type
-- Adds GOAL_TAG and RETURN_TYPE columns to PRODUCT_CATALOG
-- Idempotent: safe to re-run
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add GOAL_TAG column ─────────────────────────────────────────
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE PRODUCT_CATALOG ADD (GOAL_TAG VARCHAR2(300))';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

-- ── 2. Add RETURN_TYPE column ──────────────────────────────────────
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE PRODUCT_CATALOG ADD (RETURN_TYPE VARCHAR2(20) DEFAULT ''fixed'')';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

-- ── 3. Populate GOAL_TAG ───────────────────────────────────────────
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Dana Darurat|Likuiditas',         RETURN_TYPE = 'fixed'    WHERE PRODUCT_ID = 'PROD001';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Dana Darurat|Pendapatan Tetap',   RETURN_TYPE = 'fixed'    WHERE PRODUCT_ID = 'PROD002';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Dana Pensiun|Pertumbuhan Stabil', RETURN_TYPE = 'target'   WHERE PRODUCT_ID = 'PROD003';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Pertumbuhan Modal|Jangka Panjang',RETURN_TYPE = 'variable' WHERE PRODUCT_ID = 'PROD004';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Pendapatan Tetap|Dana Pensiun',   RETURN_TYPE = 'fixed'    WHERE PRODUCT_ID = 'PROD005';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Proteksi Jiwa|Dana Pendidikan',   RETURN_TYPE = 'target'   WHERE PRODUCT_ID = 'PROD006';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Dana Darurat|Likuiditas Harian',  RETURN_TYPE = 'fixed'    WHERE PRODUCT_ID = 'PROD007';
UPDATE PRODUCT_CATALOG SET GOAL_TAG = 'Dana Darurat|Jangka Pendek',      RETURN_TYPE = 'fixed'    WHERE PRODUCT_ID = 'PROD008';
COMMIT;
/
