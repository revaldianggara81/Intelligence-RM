-- =============================================================================
-- 00_DIAGNOSE_PACKAGE.sql
-- Run this FIRST (as ADMIN) to print the real parameter names and types
-- for every DBMS_CLOUD_AI_AGENT subprogram on this ADB instance.
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;
SET LINESIZE 200;
COL overload     FORMAT 99     HEADING 'OVL'
COL position     FORMAT 99     HEADING 'POS'
COL argument_name FORMAT A30   HEADING 'PARAM_NAME'
COL data_type    FORMAT A20    HEADING 'TYPE'
COL in_out       FORMAT A5     HEADING 'I/O'
COL defaulted    FORMAT A3     HEADING 'DEF'

PROMPT === DBMS_CLOUD_AI_AGENT - CREATE_TOOL signature ===
SELECT
  NVL(overload, 0)  AS overload,
  position,
  argument_name,
  data_type,
  in_out,
  defaulted
FROM all_arguments
WHERE package_name = 'DBMS_CLOUD_AI_AGENT'
  AND object_name  = 'CREATE_TOOL'
ORDER BY overload, position;

PROMPT
PROMPT === DBMS_CLOUD_AI_AGENT - CREATE_AGENT signature ===
SELECT
  NVL(overload, 0)  AS overload,
  position,
  argument_name,
  data_type,
  in_out,
  defaulted
FROM all_arguments
WHERE package_name = 'DBMS_CLOUD_AI_AGENT'
  AND object_name  = 'CREATE_AGENT'
ORDER BY overload, position;

PROMPT
PROMPT === DBMS_CLOUD_AI_AGENT - DROP_TOOL signature ===
SELECT
  NVL(overload, 0)  AS overload,
  position,
  argument_name,
  data_type,
  in_out,
  defaulted
FROM all_arguments
WHERE package_name = 'DBMS_CLOUD_AI_AGENT'
  AND object_name  = 'DROP_TOOL'
ORDER BY overload, position;

PROMPT
PROMPT === All subprograms in DBMS_CLOUD_AI_AGENT ===
SELECT DISTINCT object_name
FROM all_arguments
WHERE package_name = 'DBMS_CLOUD_AI_AGENT'
ORDER BY object_name;
