-- ═══════════════════════════════════════════════════════════════════
-- Migration 06 · Product Management — Manager Notes Column
-- Adds MANAGER_NOTES VARCHAR2(2000) to PRODUCT_CHANGE_REQUESTS so
-- Branch Managers can record their approval/rejection rationale.
-- Idempotent: ORA-01430 (column already exists) is silently ignored.
-- ═══════════════════════════════════════════════════════════════════

BEGIN
  EXECUTE IMMEDIATE
    'ALTER TABLE PRODUCT_CHANGE_REQUESTS ADD (MANAGER_NOTES VARCHAR2(2000))';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -01430 THEN RAISE; END IF; -- ORA-01430 = column already exists
END;
/
