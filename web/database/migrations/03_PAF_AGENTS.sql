-- ═══════════════════════════════════════════════════════════════════
-- Migration 03: PAF_AGENTS — Private Agent Factory agent registry
-- Run once on Oracle ADB; safe to re-run
-- ═══════════════════════════════════════════════════════════════════

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE PAF_AGENTS (
      AGENT_ID      VARCHAR2(50)    PRIMARY KEY,
      AGENT_NAME    VARCHAR2(200)   NOT NULL,
      ICON          VARCHAR2(10),
      DESCRIPTION   VARCHAR2(1000),
      STATUS        VARCHAR2(20)    DEFAULT ''Running'',
      AGENT_TYPE    VARCHAR2(50),
      CREATED_AT    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      LAST_RUN_AT   TIMESTAMP
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ── Seed agents (MERGE = idempotent) ─────────────────────────────────────

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_SCHEDULING' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_SCHEDULING', 'PAF Scheduling Agent', '📅',
          'Monitors deposit maturity dates, triggers maturity reminder workflows, schedules RM outreach.',
          'Running', 'Scheduler', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_KYC' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_KYC', 'PAF KYC Agent', '🔍',
          'Validates customer identity, checks KYC expiry, flags compliance risks in real-time.',
          'Running', 'Compliance', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_PROMOTION' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_PROMOTION', 'PAF Promotion Agent', '🎯',
          'Matches customers to active campaigns and promotions based on profile and eligibility.',
          'Running', 'Campaign', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_MARKET_MONITOR' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_MARKET_MONITOR', 'PAF Market Monitor', '📡',
          'Ingests live market feeds (JCI, USD/IDR, sector data) and evaluates portfolio exposure.',
          'Running', 'Monitor', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_ALERT_TRIGGER' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_ALERT_TRIGGER', 'PAF Alert Trigger', '🚨',
          'Fires portfolio alerts when thresholds are breached. Configurable rules per product type.',
          'Running', 'Alert', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_PROFILE_AGENT' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_PROFILE_AGENT', 'PAF Profile Agent', '👤',
          'Builds customer financial persona from transaction history, goals, and risk questionnaire.',
          'Running', 'Profiling', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_PRODUCT_CATALOG' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_PRODUCT_CATALOG', 'Product Catalog Agent', '📦',
          'Maintains real-time product catalog with rates, terms, and eligibility criteria.',
          'Running', 'Catalog', CURRENT_TIMESTAMP);

MERGE INTO PAF_AGENTS t USING (SELECT 'PAF_CAMPAIGN_ELIG' AS K FROM DUAL) s ON (t.AGENT_ID = s.K)
  WHEN NOT MATCHED THEN INSERT (AGENT_ID, AGENT_NAME, ICON, DESCRIPTION, STATUS, AGENT_TYPE, LAST_RUN_AT)
  VALUES ('PAF_CAMPAIGN_ELIG', 'Campaign Eligibility', '🏆',
          'Applies campaign rule engine against full RM portfolio to identify qualifying customers.',
          'Running', 'Campaign', CURRENT_TIMESTAMP);

COMMIT;
