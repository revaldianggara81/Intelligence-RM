SELECT team_name, start_date, end_date, state
FROM USER_AI_AGENT_TEAM_HISTORY
ORDER BY start_date DESC;

select * from USER_AI_AGENT_TEAM_HISTORY;

SELECT team_exec_id, TEAM_NAME, STATE, start_date, end_date
FROM USER_AI_AGENT_TEAM_HISTORY 
where team_name = 'PAF_AGENT_RECOMMENDATION'
and start_date >= sysdate
ORDER BY start_date DESC;


SELECT *
FROM USER_AI_AGENT_TEAM_HISTORY 
where  trunc(start_date) = trunc(SYSDATE)
and team_name = 'PAF_AGENT_RECOMMENDATION'
and start_date >= sysdate
ORDER BY start_date DESC
;


select team_name, agent_name, task_name, state, start_date, end_date 
from USER_AI_AGENT_TASK_HISTORY 
where team_name = 'PAF_AGENT_RECOMMENDATION'
and team_exec_id = '535BAE82-CC1E-F91A-E063-7B18000A38EA'
and start_date >= sysdate
ORDER BY start_date DESC;

select * from USER_AI_AGENT_TASK_HISTORY 
where team_name = 'PAF_AGENT_RECOMMENDATION'
and start_date >= sysdate
ORDER BY start_date DESC;


select invocation_id, team_exec_id, tool_name, agent_name, 
task_name, start_date, end_date 
from USER_AI_AGENT_TOOL_HISTORY 
where agent_name = 'DANAMON_RM_AGENT'
and start_date >= sysdate
and team_exec_id = '535BAE82-CC1E-F91A-E063-7B18000A38EA'
ORDER BY start_date DESC;


select agent_name, task_name, tool_name, count(1) as total_tool_executed
from USER_AI_AGENT_TOOL_HISTORY 
where agent_name = 'DANAMON_RM_AGENT'
and start_date >= sysdate
and team_exec_id = '535BAE82-CC1E-F91A-E063-7B18000A38EA'
group by agent_name, task_name, tool_name;

select * from USER_AI_AGENT_TOOL_HISTORY 
where agent_name = 'DANAMON_RM_AGENT_TEST_01'
and start_date >= sysdate
and team_exec_id = '52EA3251-61DB-7D35-E063-8E1A000A9CC7'
ORDER BY start_date DESC;


-- See all PAF scheduler jobs (including failed/retrying ones)
SELECT job_name, state, failure_count,
       TO_CHAR(last_start_date,'DD-MON HH24:MI:SS') AS last_start,
       last_run_duration
FROM   user_scheduler_jobs
ORDER  BY state, last_start_date DESC;

-- See what tools currently exist
SELECT * FROM USER_AI_AGENT_TOOLS ORDER BY tool_name;


SELECT job_name, status, error#, actual_start_date, additional_info 
FROM user_scheduler_job_run_details 
where actual_start_date >= sysdate
ORDER BY log_date DESC;

--Verify Process Limits: If JOB_QUEUE_PROCESSES is set to 0, no jobs will execute
SELECT name, value FROM v$parameter WHERE name = 'job_queue_processes';
-- Recommended: Set to a value > 0 (e.g., 20 or 1000 depending on load)
ALTER SYSTEM SET job_queue_processes = 20;

-- Run in a second session to see what PAF is waiting on
SELECT s.sid,
       s.serial#,
       s.status,
       s.event,
       s.state,
       ROUND(s.wait_time_micro / 1e6, 1) AS wait_sec,
       s.p1text,
       s.p2text
FROM   v$session s
WHERE  s.username = SYS_CONTEXT('USERENV','SESSION_USER')
   AND s.sid != SYS_CONTEXT('USERENV','SID');

-- Check PAF background jobs
SELECT job_name, state, last_start_date, last_run_duration, failure_count
FROM   user_scheduler_jobs
WHERE  job_name LIKE '%PAF%' OR job_name LIKE '%AGENT%'
ORDER BY last_start_date DESC;


-- Find PAF jobs
SELECT job_name, state, last_start_date
FROM   user_scheduler_jobs
WHERE  state = 'RUNNING'
   OR  job_name LIKE '%PAF%'
   OR  job_name LIKE '%AGENT%'
   OR  job_name LIKE '%RECOMMENDATION%';


BEGIN
  DBMS_CLOUD_AI_AGENT.ENABLE_TASK (
    task_name  => 'RM_RECOMMENDATION_TASK'
  );
END;
/

    SELECT job_name FROM user_scheduler_jobs;


-- Stop them (force=TRUE kills immediately without waiting)
BEGIN
  FOR j IN (
    SELECT job_name FROM user_scheduler_jobs
    WHERE  state = 'RUNNING'
       AND (job_name LIKE '%PAF%' OR job_name LIKE '%AGENT%')
  ) LOOP
    BEGIN
      DBMS_SCHEDULER.STOP_JOB(job_name => j.job_name, force => TRUE);
      DBMS_OUTPUT.PUT_LINE('Stopped: ' || j.job_name);
    EXCEPTION
      WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Could not stop ' || j.job_name || ': ' || SQLERRM);
    END;
  END LOOP;
END;
/



-- Scan lebih lengkap: ASCII < 32 (control chars) + double-quote + backslash
SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  v_count  PLS_INTEGER := 0;

  PROCEDURE scan(p_label VARCHAR2, p_clob CLOB) IS
    v_char  VARCHAR2(4);
    v_code  PLS_INTEGER;
    v_len   PLS_INTEGER;
    v_hits  PLS_INTEGER := 0;
  BEGIN
    IF p_clob IS NULL THEN
      DBMS_OUTPUT.PUT_LINE(p_label || ': NULL'); RETURN;
    END IF;
    v_len := DBMS_LOB.GETLENGTH(p_clob);
    FOR i IN 1..LEAST(v_len, 10000) LOOP
      v_char := DBMS_LOB.SUBSTR(p_clob, 1, i);
      v_code := ASCII(v_char);
      -- JSON-breaking: control chars (0-31) OR double-quote(34) OR backslash(92)
      IF v_code < 32 OR v_code = 34 OR v_code = 92 OR v_code > 127 THEN
        v_hits := v_hits + 1;
        DBMS_OUTPUT.PUT_LINE(
          p_label ||
          '  pos=' || LPAD(i,5) ||
          '  ASCII=' || LPAD(v_code,3) ||
          '  name=' || CASE v_code
            WHEN 9  THEN 'TAB'
            WHEN 10 THEN 'NEWLINE(LF)'
            WHEN 13 THEN 'CARRIAGE-RETURN'
            WHEN 34 THEN 'DOUBLE-QUOTE'
            WHEN 92 THEN 'BACKSLASH'
            ELSE 'CTRL-' || v_code
          END ||
          '  ctx=[' || REPLACE(REPLACE(
            DBMS_LOB.SUBSTR(p_clob, 30, GREATEST(1,i-15)),
            CHR(10),'<LF>'), CHR(13),'<CR>') || ']'
        );
        IF v_hits >= 10 THEN
          DBMS_OUTPUT.PUT_LINE(p_label || '  ... stopped at 10 hits');
          RETURN;
        END IF;
      END IF;
    END LOOP;
    IF v_hits = 0 THEN
      DBMS_OUTPUT.PUT_LINE(p_label || ': CLEAN (len=' || v_len || ')');
    END IF;
  END;

BEGIN
  DBMS_OUTPUT.PUT_LINE('=== AGENT SCAN ===');
  FOR r IN (SELECT agent_name, preamble, TO_CLOB(description) desc_clob
            FROM USER_AI_AGENTS WHERE agent_name LIKE '%COPILOT%') LOOP
    scan('AGT[' || r.agent_name || '].preamble', r.preamble);
    scan('AGT[' || r.agent_name || '].desc',     r.desc_clob);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('=== TASK SCAN ===');
  FOR r IN (SELECT task_name, instruction, TO_CLOB(description) desc_clob
            FROM USER_AI_AGENT_TASKS WHERE task_name LIKE '%COPILOT%') LOOP
    scan('TSK[' || r.task_name || '].instruction', r.instruction);
    scan('TSK[' || r.task_name || '].desc',        r.desc_clob);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('=== TEAM SCAN ===');
  FOR r IN (SELECT team_name, TO_CLOB(description) desc_clob
            FROM USER_AI_AGENT_TEAMS WHERE team_name LIKE '%COPILOT%') LOOP
    scan('TM[' || r.team_name || '].desc', r.desc_clob);
  END LOOP;
END;
/

SELECT table_name, column_name, data_type
FROM   user_tab_columns
WHERE  table_name LIKE 'USER_AI%'
   OR  table_name LIKE 'USER_CLOUD_AI%'
ORDER  BY table_name, column_id;

SELECT view_name
FROM   user_views
WHERE  view_name LIKE '%AGENT%'
   OR  view_name LIKE '%AI_%'
ORDER  BY view_name;

-- Ini akan tampilkan semua kolom yang ada
SELECT *
FROM   user_ai_agents
WHERE  rownum <= 3;

desc user_ai_agents;


SELECT agent_name,
       status,
       SUBSTR(description, 1, 2000) AS description_preview
FROM   user_ai_agents
WHERE  agent_name LIKE '%COPILOT%';

SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  PROCEDURE scan(p_label VARCHAR2, p_val CLOB) IS
    v_char VARCHAR2(4);
    v_code PLS_INTEGER;
    v_hits PLS_INTEGER := 0;
  BEGIN
    IF p_val IS NULL THEN
      DBMS_OUTPUT.PUT_LINE(p_label || ': NULL'); RETURN;
    END IF;
    FOR i IN 1..LEAST(DBMS_LOB.GETLENGTH(p_val), 10000) LOOP
      v_char := DBMS_LOB.SUBSTR(p_val, 1, i);
      v_code := ASCII(v_char);
      -- Control chars (0-31) kecuali tab(9) + double-quote(34) + backslash(92) + non-ASCII(>127)
      IF (v_code < 9) OR (v_code BETWEEN 11 AND 31)
         OR v_code = 34 OR v_code = 92 OR v_code > 127 THEN
        v_hits := v_hits + 1;
        DBMS_OUTPUT.PUT_LINE(
          p_label || ' pos=' || LPAD(i,5) ||
          ' ASCII=' || LPAD(v_code,3) ||
          ' [' || CASE v_code
            WHEN 10 THEN 'LF'  WHEN 13 THEN 'CR'
            WHEN 34 THEN '"'   WHEN 92 THEN '\'
            ELSE 'CHR-'||v_code END || ']' ||
          ' ctx=' || REPLACE(REPLACE(
            DBMS_LOB.SUBSTR(p_val,40,GREATEST(1,i-20)),
            CHR(10),'<LF>'),CHR(13),'<CR>')
        );
        IF v_hits >= 8 THEN
          DBMS_OUTPUT.PUT_LINE(p_label || ': stopped at 8 hits');
          RETURN;
        END IF;
      END IF;
    END LOOP;
    IF v_hits = 0 THEN
      DBMS_OUTPUT.PUT_LINE(p_label || ': CLEAN (len='
        || DBMS_LOB.GETLENGTH(p_val) || ')');
    END IF;
  END;
BEGIN
  FOR r IN (SELECT agent_name, description
            FROM   user_ai_agents
            WHERE  agent_name LIKE '%COPILOT%') LOOP
    scan('AGENT[' || r.agent_name || ']', r.description);
  END LOOP;
END;
/

-- Oracle bisa cek apakah DESCRIPTION valid JSON
SELECT agent_name,
       CASE
         WHEN description IS NULL          THEN 'NULL'
         WHEN JSON_VALUE(description,'$')
              IS NOT NULL                  THEN 'VALID JSON (scalar)'
         WHEN JSON_EXISTS(description,'$') THEN 'VALID JSON (object/array)'
         ELSE                                   'INVALID JSON'
       END AS json_status,
       SUBSTR(description, 1, 200) AS preview
FROM   user_ai_agents
WHERE  agent_name LIKE '%COPILOT%';

SELECT agent_name,
       status,
       LENGTH(description)         AS len,
       SUBSTR(description, 1, 500) AS first_500,
       SUBSTR(description, -200)   AS last_200
FROM   user_ai_agents
WHERE  agent_name LIKE '%COPILOT%';

-- Ini akan tunjukkan error yang lebih detail
SET SERVEROUTPUT ON SIZE UNLIMITED;
DECLARE
  v_id NUMBER;
BEGIN
  BEGIN
    DBMS_CLOUD_AI_AGENT.DROP_TEAM('PAF_TEAM_COPILOT_TEST');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name   => 'PAF_TEAM_COPILOT_TEST',
    attributes  => '{"agents": [{"name": "PAF_AGENT_COPILOT", "task": "PAF_TASK_COPILOT"}],'
                   || '"process": "sequential"}',
    description => 'PAF_AGENT_RECOMMENDATION - DANAMON_RM_AGENT + RM_RECOMMENDATION_TASK'
  );

--  DBMS_CLOUD_AI_AGENT.DROP_TEAM('PAF_TEAM_COPILOT_TEST');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('ERROR: ' || SQLERRM);
    DBMS_OUTPUT.PUT_LINE('TRACE: ' || DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
END;
/

declare
  v_customer_id  VARCHAR2 := 'CUST001';
  v_response CLOB;
  v_team_name   VARCHAR2(100) := 'PAF_TEAM_COPILOT';
  v_conversation  VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
  v_response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
    team_name   => v_team_name,
    user_prompt =>
      'Buatkan rekomendasi produk investasi untuk nasabah customer_id = '''
      || v_customer_id || '''. '
      || 'Analisis profil risiko, portfolio saat ini, dan catatan rapat terakhir. '
      || 'Rekomendasikan 3 produk terbaik dengan alokasi portofolio optimal.',
    params => '{"conversation_id": "' || v_conversation || '"}'
  );
  DBMS_OUTPUT.PUT_LINE('=== Agent Response ===');
  DBMS_OUTPUT.PUT_LINE(v_response);
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error running PAF_AGENT_RECOMMENDATION: ' || SQLERRM);
END;
/

-- Example test run:
-- SET SERVEROUTPUT ON SIZE UNLIMITED;
 EXEC test_agent_copilot('CUST002');

 ORA-20050: Invalid value for conversation id
ORA-06512: at "C##CLOUD$SERVICE.DBMS_CLOUD$PDBCS_260529_0", line 2291
ORA-06512: at "C##CLOUD$SERVICE.DBMS_CLOUD_AI_AGENT", line 13745
ORA-06512: at line 1


SELECT * FROM C##CLOUD$SERVICE.DBMS_CLOUD_AI_CONVERSATION$
WHERE status != 'ACTIVE' 
OR updated_at < SYSDATE - 1;