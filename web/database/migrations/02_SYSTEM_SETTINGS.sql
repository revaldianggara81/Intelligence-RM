-- ═══════════════════════════════════════════════════════════════════
-- Migration 02: SYSTEM_SETTINGS — platform configuration store
-- Run once on Oracle ADB; safe to re-run (uses CREATE TABLE IF NOT EXISTS-style guard)
-- ═══════════════════════════════════════════════════════════════════

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE SYSTEM_SETTINGS (
      SETTING_KEY    VARCHAR2(100)   PRIMARY KEY,
      SETTING_VALUE  VARCHAR2(2000),
      DESCRIPTION    VARCHAR2(500),
      UPDATED_AT     TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      UPDATED_BY     VARCHAR2(50)
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF; -- ORA-00955: table already exists
END;
/

-- ── Default seed data (MERGE = idempotent) ────────────────────────────────

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'alert_equity_threshold' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('alert_equity_threshold', '15', 'Equity fund loss threshold (%) to trigger a portfolio alert', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'maturity_reminder_days' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('maturity_reminder_days', '14', 'Days before product maturity to send a reminder to RM', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'privilege_aum_threshold' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('privilege_aum_threshold', '500000000', 'Minimum AUM (IDR) required for Privilege tier classification', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'ai_model' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('ai_model', 'cohere.command-r-plus-08-2024', 'OCI Generative AI model identifier used by all AI features', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'rag_refresh_hours' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('rag_refresh_hours', '6', 'How often (hours) the RAG vector index is refreshed from live data', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'vector_search_type' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('vector_search_type', 'HNSW', 'Oracle DB 26ai vector similarity search index type (HNSW or IVF)', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'agent_pipeline_timeout' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('agent_pipeline_timeout', '30', 'PAF agent pipeline timeout per request (seconds)', 'system');

MERGE INTO SYSTEM_SETTINGS t USING (SELECT 'audit_log_retention_years' AS K FROM DUAL) s
  ON (t.SETTING_KEY = s.K)
  WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_BY)
    VALUES ('audit_log_retention_years', '7', 'Audit log retention period in years (OJK regulatory requirement)', 'system');

COMMIT;
