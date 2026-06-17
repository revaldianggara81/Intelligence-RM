-- =============================================================================
-- 01_AI_ANALYSIS_HISTORY.sql
-- Migration: Create AI_ANALYSIS_HISTORY table for storing AI analysis results
-- and copilot conversations across all modules.
--
-- Modules: maturity | recommendation | campaign_scan | campaign_pitch | alert | copilot
-- =============================================================================

-- Drop if exists (idempotent migration)
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE AI_ANALYSIS_HISTORY CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE AI_ANALYSIS_HISTORY (
  HISTORY_ID    VARCHAR2(50)    DEFAULT SYS_GUID()  PRIMARY KEY,
  MODULE        VARCHAR2(50)    NOT NULL,       -- maturity | recommendation | campaign_scan | campaign_pitch | alert | copilot
  USER_ID       VARCHAR2(50)    REFERENCES RM_USERS(USER_ID) ON DELETE SET NULL,
  CUSTOMER_ID   VARCHAR2(100),                  -- customer context (if applicable)
  ENTITY_ID     VARCHAR2(100),                  -- alertId, campaignId, etc.
  TITLE         VARCHAR2(500),                  -- auto-generated label for the analysis run
  RESULT        CLOB,                           -- full AI-generated text response
  MODEL_USED    VARCHAR2(200)   DEFAULT 'cohere.command-r-plus-08-2024',
  RUN_AT        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT CHK_MODULE CHECK (
    MODULE IN ('maturity','recommendation','campaign_scan','campaign_pitch','alert','copilot')
  )
);

-- Indexes for fast retrieval by RM
CREATE INDEX IDX_AIH_USER_MODULE ON AI_ANALYSIS_HISTORY(USER_ID, MODULE, RUN_AT DESC);
CREATE INDEX IDX_AIH_CUSTOMER    ON AI_ANALYSIS_HISTORY(CUSTOMER_ID, RUN_AT DESC);
CREATE INDEX IDX_AIH_RUN_AT      ON AI_ANALYSIS_HISTORY(RUN_AT DESC);

COMMENT ON TABLE  AI_ANALYSIS_HISTORY              IS 'Stores AI analysis results and copilot conversations per RM session.';
COMMENT ON COLUMN AI_ANALYSIS_HISTORY.MODULE        IS 'Module: maturity, recommendation, campaign_scan, campaign_pitch, alert, copilot';
COMMENT ON COLUMN AI_ANALYSIS_HISTORY.USER_ID       IS 'RM user who triggered the analysis';
COMMENT ON COLUMN AI_ANALYSIS_HISTORY.CUSTOMER_ID   IS 'Customer the analysis was about (NULL for copilot free-form)';
COMMENT ON COLUMN AI_ANALYSIS_HISTORY.ENTITY_ID     IS 'Additional entity: alertId for alert module, campaignId for campaign module';
COMMENT ON COLUMN AI_ANALYSIS_HISTORY.TITLE         IS 'Human-readable label e.g. "Maturity Analysis — DAN-0041872"';
COMMENT ON COLUMN AI_ANALYSIS_HISTORY.RESULT        IS 'Full AI-generated text response (plain text with markdown)';

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================
SELECT table_name, num_rows
FROM   user_tables
WHERE  table_name = 'AI_ANALYSIS_HISTORY';

SELECT column_name, data_type, data_length, nullable
FROM   user_tab_columns
WHERE  table_name = 'AI_ANALYSIS_HISTORY'
ORDER  BY column_id;
/
