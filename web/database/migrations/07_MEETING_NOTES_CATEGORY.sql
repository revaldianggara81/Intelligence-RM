-- ═══════════════════════════════════════════════════════════════════
-- Migration 07 · Meeting Notes — Note Category Column
-- Adds NOTE_CATEGORY VARCHAR2(20) to MEETING_NOTES so RM can
-- distinguish between customer-facing meeting notes ('MEETING')
-- and internal personal assessment notes ('PERSONAL').
-- Default = 'MEETING' to preserve backward compatibility.
-- Idempotent: ORA-01430 (column already exists) is silently ignored.
-- ═══════════════════════════════════════════════════════════════════

BEGIN
  EXECUTE IMMEDIATE
    'ALTER TABLE MEETING_NOTES ADD (NOTE_CATEGORY VARCHAR2(20) DEFAULT ''MEETING'' NOT NULL)';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -01430 THEN RAISE; END IF;
END;
/
