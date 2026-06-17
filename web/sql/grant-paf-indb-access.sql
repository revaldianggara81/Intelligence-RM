-- ═══════════════════════════════════════════════════════════════════
-- Grant DANAMON user access to use in-database tools in PAF
-- Run as: ADMIN (or any DBA-privileged user)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Basic session & resource privileges (skip if already granted)

GRANT CONNECT, RESOURCE, CREATE TABLE, CREATE SYNONYM, CREATE DATABASE LINK, 
CREATE ANY INDEX, INSERT ANY TABLE, CREATE SEQUENCE, CREATE TRIGGER, CREATE USER, DROP USER TO DBN;
GRANT CREATE SESSION TO DBN WITH ADMIN OPTION;
GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO DBN;
GRANT SELECT ON V$PARAMETER TO DBN;


-- 2. Allow DBN to call DBMS_CLOUD_AI packages
--    (covers AI_GENERATE, CHAT, SET_PROFILE, and related subprograms)
GRANT EXECUTE ON DBMS_CLOUD_AI     TO DBN;
GRANT EXECUTE ON DBMS_VECTOR_CHAIN TO DBN;
GRANT EXECUTE ON DBMS_CLOUD_AI_AGENT TO DBN;
GRANT EXECUTE on DBMS_CLOUD_PIPELINE to DBN;
GRANT EXECUTE ON DBMS_CLOUD     TO DBN;
GRANT DB_DEVELOPER_ROLE                TO DBN;
GRANT EXECUTE ON DBMS_VECTOR TO DBN;
GRANT CREATE CREDENTIAL TO DBN;


-- 3. Enable both Select AI profiles for DBN
--    (profiles were created by ADMIN in config-select-ai.sql)
BEGIN
  DBMS_CLOUD_AI.ENABLE_PROFILE(
    profile_name => 'DANAMON_RM_PROFILE',
    user_name    => 'DBN'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI.ENABLE_PROFILE(
    profile_name => 'DANAMON_RAG_PROFILE',
    user_name    => 'DBN'
  );
END;
/

-- 4. Network ACL — allow DANAMON to reach OCI GenAI endpoints
--    Adjust the host pattern if your tenancy uses a different region.
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '*',
    ace  => xs$ace_type(
      privilege_list => xs$name_list('connect', 'resolve', 'http'),
      principal_name => 'DBN',
      principal_type => xs_acl.ptype_db
    )
  );
END;
/

-- Also allow the generic OCI API gateway host used by DBMS_CLOUD internals
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '*.oraclecloud.com',
    ace  => xs$ace_type(
      privilege_list => xs$name_list('connect', 'resolve', 'http'),
      principal_name => 'DBN',
      principal_type => xs_acl.ptype_db
    )
  );
END;
/



-- 6. Allow DBN to write AI cache and audit entries
GRANT INSERT, UPDATE ON ADMIN.AI_ANALYSIS_CACHE TO DBN;
GRANT INSERT         ON ADMIN.AUDIT_LOG         TO DBN;

-- 7. Set DANAMON_RM_PROFILE as the default profile for the DBN session
--    (optional — PAF agents can also pass profile_name explicitly)
ALTER SESSION SET CURRENT_SCHEMA = DBN;

BEGIN
  DBMS_CLOUD_AI.SET_PROFILE(
    profile_name => 'DANAMON_RM_PROFILE'
  );
END;
/

select 1 from dual;