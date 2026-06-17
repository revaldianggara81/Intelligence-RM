-- Run order:
--   1. config-select-ai.sql  (this file, as ADMIN)
--   2. grant-paf-indb-access.sql  (as ADMIN, after profiles exist)
select credential_name,
       username,
       enabled
  from all_credentials;

-- =============================================================================
-- Credential for Grok via DIRECT xAI API  (Approach B)
-- XAI_CRED uses an xAI API key, NOT OCI IAM credentials.
-- Get your API key from: https://console.x.ai/
-- =============================================================================
begin
   dbms_cloud.drop_credential('OCI_CRED');
exception when others then null;
end;
/
--
declare
   jo          json_object_t;
   credential_name varchar2(100) := 'OCI_CRED';
   user_ocid   varchar2(100) := 'ocid1.user.oc1..aaaaaaaak4yqvq4vvm7puglyqi5cvfii6egc2sdeq5gkeikarht5m553jwoq';
   tenancy_ocid varchar2(100) := 'ocid1.tenancy.oc1..aaaaaaaag6vtdz6hyrcsnlkk2qupv7vqqgsx5exq4c6jcfat2jqqqzp4xg4a';
   fingerprint  varchar2(100) := '0e:6e:17:10:68:ae:de:8d:9c:05:c1:cb:78:e3:43:26';
   private_key  varchar2(4000) := '-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDaA9zyYEbq44eK
eQMZ9BGKKlNJksri9Uh2MiebPgHSPN9zjYLfAQ8C6g7GY/pf4tMtd9CT2oJvZVjf
+26Bwil5kq/7IE2+8m2GZljEBFBw+SePMb3L4mzWHG5vlwkC0lrnQaE/LGAa9y8O
3p22wcuSBuTIOFkVJoB9FzOIfa7ziGTQRjB5o+tu5EXKfDtE8SfW5vXXvWBCAa9r
xt/SwOmz4sg3pHdMyhJQEhOypTxiiweYHhjMv4ecXXAtkHlwLIiOpW8Vf1YF/Vwx
RJST2u8dZ51/RDHqRUM4YXWsBQ9uyAK4V31QBAHEhVyzab3slvslNrH5QKsvum05
yAfRbUZPAgMBAAECggEASpZWwY+Bw7u7M/tJvdfcJlZrrziq8/Hx7Aoltb2Flv1f
f2OTOiNdFOSp0GMFFkf+cshSkjsIM/9K5DpbqMYaNW8jiPmYz7KWGQyr4sgNE1GS
oLFmWzoofSo1+DSGjzITipnQBlJywNb/gQlVkOCFenykSgHJLGzDOci1x0UklUlb
eZXV1rri0yf5oSbPEJVxgFHef+1DcfPfnd4rskdmHX7L5IrdYdoHnVwPkdJkMigy
c0FGuGEaNfRq00NtNYrmetWLHAUgOg3eZXNvj77kBPl5mR0hqRmjr848dfcEdcUi
L/ArXCLwjIXezf1iyStnHkNuTk9RMpCuby6Ll2333QKBgQDswB2oQz6gYEjcN9I/
drtSt27G9u5AJhE6XlXpIgthn/nN7G7BuMAFbiUoVYLVlUya0qoXjE638OF4sKzG
eWIerzsqcoChmdvAkchSHdz/umqToHF5dTHnS3vFMJxw/IUA0jSvr3OGmmHJmauk
ZeU9nUesax5xQkhL42vCCr/zNQKBgQDrvcbWkKqdVm0X9VdnPCxX7+2R1Mt0xK0x
/n4JO6kNpd49oBLwFGQv4m0Dr0Xr60vVag11N/iIBhB9VCjyfHvk9pwW6gVuwXoS
dxviJrnHxOOJV2ELLN937X3n7HdTX0vIR3eO+DVQqEJC7AY3RivU0LhsALDfRG6q
PG/eJm4f8wKBgQCNz6X0HBNvTT1Xa7hse1pJecbJNzAPDL5VEBy1wMbAe2rOhkjx
kRC0L/3h4xaziPKR6o4n/MtKMudbu7hCSoMTjjMKgfu60MZo2un7BhhStf8Q3pIa
BrEVsok43J1YsGmazE7yzU2N2vuoHnxJxR9DgOplxOQ/Q0y66EarvHSt4QKBgQCk
q50Adm9nll6ANNXH/CVxi9xkWMOCHnxpBr9djboqGWojm/R+lY/iTwUdZMqv4F3J
hto9vkoyIiJUmXw83i3hI06nRvNiiW3PBjqI/8oYPHVAk7PrDX5QFKo1Xl1/9HpI
PXvLd6AuZkpa2uoApFirwNyCPP1QCEpRSgROpoOYdwKBgQCU7VRIs7SgSfBb0N/j
I0RU6ZOyc5+Ygp8blH4sK6dX3i2geFWufEJ+RYpYW9bJabpvQTmmHu7GUcb4zQV4
fBQZIaoE7FjTzfgiI7AWT/uy1msHZ36Az6C0TIEheytEUT4MzreAorAkcmfN1oGJ
of+ifVuzV6j3qtLPoARjrxGgwA==
-----END PRIVATE KEY-----';

begin
   begin
      dbms_cloud.drop_credential(credential_name);
      exception when others then 
         dbms_output.put_line('Error dropping credential ' || credential_name || ': ' || sqlerrm);
   end;
   begin
      dbms_cloud.create_credential(
         credential_name => credential_name,
         user_ocid       => user_ocid,
         tenancy_ocid    => tenancy_ocid,
         private_key     => private_key,
         fingerprint     => fingerprint
      );
   exception when others then 
      dbms_output.put_line('Error creating credential ' || credential_name || ': ' || sqlerrm);
   end;
end;
/

-- Create credential untuk DBMS_VECTOR (OCI GenAI)
declare
   jo          json_object_t;
   credential_name varchar2(100) := 'OCI_CRED_VEC';
   user_ocid   varchar2(100) := 'ocid1.user.oc1..aaaaaaaak4yqvq4vvm7puglyqi5cvfii6egc2sdeq5gkeikarht5m553jwoq';
   tenancy_ocid varchar2(100) := 'ocid1.tenancy.oc1..aaaaaaaag6vtdz6hyrcsnlkk2qupv7vqqgsx5exq4c6jcfat2jqqqzp4xg4a';
   fingerprint  varchar2(100) := '0e:6e:17:10:68:ae:de:8d:9c:05:c1:cb:78:e3:43:26';
   compartment_ocid varchar2(100) := 'ocid1.compartment.oc1..aaaaaaaa3iceukudgqtfk2msr2mofvbvd6zvbimem2enzurv7fhuosdeqgla';
   private_key  varchar2(4000) := '-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDaA9zyYEbq44eK
eQMZ9BGKKlNJksri9Uh2MiebPgHSPN9zjYLfAQ8C6g7GY/pf4tMtd9CT2oJvZVjf
+26Bwil5kq/7IE2+8m2GZljEBFBw+SePMb3L4mzWHG5vlwkC0lrnQaE/LGAa9y8O
3p22wcuSBuTIOFkVJoB9FzOIfa7ziGTQRjB5o+tu5EXKfDtE8SfW5vXXvWBCAa9r
xt/SwOmz4sg3pHdMyhJQEhOypTxiiweYHhjMv4ecXXAtkHlwLIiOpW8Vf1YF/Vwx
RJST2u8dZ51/RDHqRUM4YXWsBQ9uyAK4V31QBAHEhVyzab3slvslNrH5QKsvum05
yAfRbUZPAgMBAAECggEASpZWwY+Bw7u7M/tJvdfcJlZrrziq8/Hx7Aoltb2Flv1f
f2OTOiNdFOSp0GMFFkf+cshSkjsIM/9K5DpbqMYaNW8jiPmYz7KWGQyr4sgNE1GS
oLFmWzoofSo1+DSGjzITipnQBlJywNb/gQlVkOCFenykSgHJLGzDOci1x0UklUlb
eZXV1rri0yf5oSbPEJVxgFHef+1DcfPfnd4rskdmHX7L5IrdYdoHnVwPkdJkMigy
c0FGuGEaNfRq00NtNYrmetWLHAUgOg3eZXNvj77kBPl5mR0hqRmjr848dfcEdcUi
L/ArXCLwjIXezf1iyStnHkNuTk9RMpCuby6Ll2333QKBgQDswB2oQz6gYEjcN9I/
drtSt27G9u5AJhE6XlXpIgthn/nN7G7BuMAFbiUoVYLVlUya0qoXjE638OF4sKzG
eWIerzsqcoChmdvAkchSHdz/umqToHF5dTHnS3vFMJxw/IUA0jSvr3OGmmHJmauk
ZeU9nUesax5xQkhL42vCCr/zNQKBgQDrvcbWkKqdVm0X9VdnPCxX7+2R1Mt0xK0x
/n4JO6kNpd49oBLwFGQv4m0Dr0Xr60vVag11N/iIBhB9VCjyfHvk9pwW6gVuwXoS
dxviJrnHxOOJV2ELLN937X3n7HdTX0vIR3eO+DVQqEJC7AY3RivU0LhsALDfRG6q
PG/eJm4f8wKBgQCNz6X0HBNvTT1Xa7hse1pJecbJNzAPDL5VEBy1wMbAe2rOhkjx
kRC0L/3h4xaziPKR6o4n/MtKMudbu7hCSoMTjjMKgfu60MZo2un7BhhStf8Q3pIa
BrEVsok43J1YsGmazE7yzU2N2vuoHnxJxR9DgOplxOQ/Q0y66EarvHSt4QKBgQCk
q50Adm9nll6ANNXH/CVxi9xkWMOCHnxpBr9djboqGWojm/R+lY/iTwUdZMqv4F3J
hto9vkoyIiJUmXw83i3hI06nRvNiiW3PBjqI/8oYPHVAk7PrDX5QFKo1Xl1/9HpI
PXvLd6AuZkpa2uoApFirwNyCPP1QCEpRSgROpoOYdwKBgQCU7VRIs7SgSfBb0N/j
I0RU6ZOyc5+Ygp8blH4sK6dX3i2geFWufEJ+RYpYW9bJabpvQTmmHu7GUcb4zQV4
fBQZIaoE7FjTzfgiI7AWT/uy1msHZ36Az6C0TIEheytEUT4MzreAorAkcmfN1oGJ
of+ifVuzV6j3qtLPoARjrxGgwA==
-----END PRIVATE KEY-----';
begin
   jo := json_object_t();
   jo.put(
      'user_ocid',
      user_ocid
   );
   jo.put(
      'tenancy_ocid',
      tenancy_ocid
   );
   jo.put(
      'compartment_ocid',
      compartment_ocid
   );
   jo.put(
      'private_key',
      private_key
   );
   jo.put(
      'fingerprint',
      fingerprint
   );
   dbms_vector.create_credential(
      credential_name => credential_name,
      params          =>
              json(jo.to_string)
   );
end;
/
--Grant Network Access
--use admin user to execute this
begin
   dbms_network_acl_admin.append_host_ace(
      host => '*',
      ace  => xs$ace_type(
         privilege_list => xs$name_list('http', 'connect', 'resolve'),
         principal_name => 'DBN',
         principal_type => xs_acl.ptype_db
      )
   );
end;
/

-- Test xAI directly without going through Select AI
SET SERVEROUTPUT ON
DECLARE
  l_resp DBMS_CLOUD_TYPES.resp;
BEGIN
  l_resp := DBMS_CLOUD.SEND_REQUEST(
              credential_name => 'OCI_CRED',
              uri             => 'https://api.x.ai/v1/models',
              method          => 'GET'
            );

  DBMS_OUTPUT.PUT_LINE('Status: ' || DBMS_CLOUD.GET_RESPONSE_STATUS_CODE(l_resp));
  DBMS_OUTPUT.PUT_LINE(DBMS_CLOUD.GET_RESPONSE_TEXT(l_resp));
END;
/

-- Check what ACL exists for api.x.ai
SELECT principal,privilege, is_grant, invert, start_date, 
end_date, acl_owner
from   dba_network_acl_privileges;

SELECT principal, host, privilege, grant_type 
FROM dba_host_aces 
WHERE host LIKE '%x.ai%' OR host = '*';


select *
  from user_cloud_ai_profiles;

-- =============================================================================
-- Grok via OCI GenAI  (Approach A)
-- Grok is only available in US regions on OCI GenAI.
-- ROOT CAUSE of ORA-20404 "my$cloud_domain": ap-osaka-1 has no Grok endpoint.
-- Fix: change region to us-chicago-1.
--
-- Model options:
--   xai.grok-4.20-0309-reasoning     — complex logic, multi-step tasks
--   xai.grok-4.20-0309-non-reasoning — fast Q&A, high-throughput
-- =============================================================================
declare
   v_profile_name varchar2(100) := 'DANAMON_RM_PROFILE_GROK_OCI';
   provider          varchar2(100) := 'oci';
   model            varchar2(100) := 'xai.grok-3-fast'; 
   credential_name varchar2(100) := 'OCI_CRED';
   region           varchar2(100) := 'us-chicago-1';
   oci_compartment_id varchar2(100) := 'ocid1.compartment.oc1..aaaaaaaa3iceukudgqtfk2msr2mofvbvd6zvbimem2enzurv7fhuosdeqgla';
begin
   begin
      dbms_cloud_ai.drop_profile(v_profile_name);
      exception
         when others then
            dbms_output.put_line('Error dropping OCI GenAI profile: ' || sqlerrm);
   end;

   begin
      dbms_cloud_ai.create_profile(
         profile_name => v_profile_name,
         attributes   => '{
            "provider"        : "'||provider||
            '","credential_name" : "'||credential_name||
            '","model"           : "'||model||
            '","oci_compartment_id": "'||oci_compartment_id||
            '","region"          : "'||region||
            '","object_list": [
               {"owner": "DBN", "name": "CUSTOMERS"},
               {"owner": "DBN", "name": "CUSTOMER_PRODUCTS"},
               {"owner": "DBN", "name": "PRODUCT_CATALOG"}
               ]
         }'
      );
   exception
      when others then
         dbms_output.put_line('Error creating OCI GenAI profile: ' || sqlerrm);
   end;
end;
/

-- =============================================================================
-- Grok via Direct xAI API  (Approach B)
-- Uses XAI_CRED (API key). No region restriction.
-- Requires: network ACL grant for api.x.ai (already done below).
-- =============================================================================
begin
   dbms_cloud_ai.create_profile(
      profile_name => 'DANAMON_RM_PROFILE_GROK_XAI',
      attributes   => '{
          "credential_name" : "XAI_CRED",
          "provider_endpoint": "https://api.x.ai",  
          "model"           : "grok-4-1-fast-reasoning",
          "object_list": [
            {"owner": "DBN", "name": "CUSTOMERS"},
            {"owner": "DBN", "name": "CUSTOMER_PRODUCTS"},
            {"owner": "DBN", "name": "PRODUCT_CATALOG"}
                        ]
        }'
   );
end;
/


begin
   dbms_cloud_ai.drop_profile('DANAMON_RAG_PROFILE');
exception
   when others then
      null;
end;
/

-- Quick test: embed string pendek langsung di SQL
select dbms_vector_chain.utl_to_embedding(
   'tes koneksi OCI GenAI',
   json(
         '{
  "provider": "ocigenai",
  "credential_name": "OCI_CRED_VEC",
  "url": "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/embedText",
  "model": "cohere.embed-v4.0"
}'
      )
) as test_vector
  from dual;

EXEC DBMS_CLOUD_AI.SET_PROFILE('DANAMON_RM_PROFILE_GROK_OCI');

-- Verifikasi profile aktif
select dbms_cloud_ai.get_profile() as active_profile from dual;

-- Uji koneksi model (chat sederhana)
SELECT AI  show all customers;
