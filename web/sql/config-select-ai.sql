-- Run order:
--   1. config-select-ai.sql  (this file, as ADMIN)
--   2. grant-paf-indb-access.sql  (as ADMIN, after profiles exist)

-- 1. Create credential for OCI GenAI
begin
   dbms_cloud.create_credential(
      credential_name => 'OCI_GENAI_CRED',
      user_ocid       => 'ocid1.user.oc1..aaaaaaaaggejlfzdsrf3qty7zdhe536cbqrsv2jifnn45aguaxkzclxnbdpq',
      tenancy_ocid    => 'ocid1.tenancy.oc1..aaaaaaaabdr7twueab7jscfixeih7cniosnnlrxdyj57pp7ab5frrw4y3a3q',
      private_key     => '-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCb/r8eqgOb9sKm
QO2+N8o1gcOxGBcF8kv4cKbXjIZT4muXLJPDU+7CpwDmQ5GDVlu7q8wd98E0p+Hy
m3zyVcIawSmIXf2qO5klCcE6qGdqRf0vGc2R5gaDBm8fpVMqOQuMoTF1r2dK+1gS
2VeE3VjkRyjPNsJS8wMCU5Iuih1o/V8mTAnvpRLOPewUPqAv5fT5iWmF77bPONie
81yRpKAdUcnSQXtg8v94CDKaMSjGp5qFgWg8QyRNaerkOG8S1Ngzlm+zFAzwYlHH
hkO1W5bxvvQwAUDxaj/2vfSNcyc8D53KeSW0wPygdYaRNFCsGBkc3AHYu/jvCElQ
ll5GWbDJAgMBAAECggEABMrjjJNgF4Lrnk4SqWKo53jUYVgFkw6Ld3dGJPHbPNYE
UXyfQ71YvnaBIFHom7UD2sTvks2GP2VXm37CUxnZfaPVsEV+kgpeAHjBGaZ+9BFw
5ekzlKn3i4x5AWs9aufRDngmuLOG52z7Gt8koXKBQeHB/Vwn309tSWPCzLbvduBJ
Nv9GM54A9Q8dEGnDZC0Ay7GvgFCP9s3/VEKx5WHyypmQPCwUwdI7X/3pm15yv0gx
CG4oOK6FGQq5baqOGJCR1/ry4r/DdlmrACis+xcWXkJFU+m3W8zPOavQfQu5X9d/
8mjqBsBa1EVw8NhHM+EMehjpq5rttwLNWAcE6tyKpQKBgQDPOn6nFwMD6Zcr8g1O
Uf5mcwUjFKphp+QlZVbyRlZQ5WPn6nWo1/fixl+Yyc5PHofX+HlsNjd/vwf6GSpz
EJNX3H6OMz8q0WxkQ1X2Td0g+7ATQEBE/qO+FrwgPuUc2wuDJwcK2UNw/vfrdfTR
d0V2WIIaeJGnLTrp1DAWEvFDbQKBgQDAtXFfGLaiK35vr4EibI/WMoozYibNLSIx
nmvRz+SzJfTovCbQ+i3wUt+l/ZECFcGYMjZ7LSTGjaEuDyYylvGLj42OzfZVa6ty
OHHxNz8cGHim+STuGaXPDFGHZuUoXtUZmduKp2oLOu00sWW/r939NKjdbJzpnStr
53xXo39tTQKBgQC3/auuF1RqCOBb+FGwFETYGY+aEiMlCbgbK9sCyUiiEsmdhCJr
gzVod9ExCxzOSsE6FDdayNiF58rhV67E8xafj/odr4qKLd8bNl4Ajimju1QeA5IM
sDoZ8H2f87fg4utZyzEJhNXIYdklilmQEWHvLa52ak6ILDR+oBMBxlfIEQKBgCGz
WWk9BCtmGc1kTtv7Skg2PG7x+kElZHZy8v4VMjSWLbdJuCwRpFkD1TLNHj/UGDAK
j/aIlYbXm9lXMuHj/cffSe0wXaTgmHH4Jwz9EV9TdD4XEftFpvaHe/aG6wpdUz0P
6BHeZzAhlPwDDf0wv0yZmfJnHSXJo59SMy+MWyt9AoGBAKq4e3krup0Qvaxecy30
wuRqkL+v0rigreL486L8kQRGsaOCeWHamr8M4LN/Jt5254Q+Whn5PVgLIONL9FZ9
m76AfVblTRCPipaC5gKdLCs805YBoSZtpZzQ5sVbi0TQRjbDn37JZ7tDHIc2y8vL
MjK64sHDONli1n7Q2fTCezX+
-----END PRIVATE KEY-----',
      fingerprint     => '68:20:a6:0a:29:b4:e2:a5:02:ea:7c:b5:27:50:45:e2'
   );
end;
/

/

-- Create credential untuk DBMS_VECTOR (OCI GenAI)
declare
   jo               json_object_t;
   user_ocid        varchar2(100) := 'ocid1.user.oc1..aaaaaaaaggejlfzdsrf3qty7zdhe536cbqrsv2jifnn45aguaxkzclxnbdpq';
   tenancy_ocid     varchar2(100) := 'ocid1.tenancy.oc1..aaaaaaaabdr7twueab7jscfixeih7cniosnnlrxdyj57pp7ab5frrw4y3a3q';
   compartment_ocid varchar2(100) := 'ocid1.compartment.oc1..aaaaaaaa5y5wxpyoantp4iesb3uj3j7v7lwv6whhbtpc235un2a6ebzeo2zq';
   fingerprint      varchar2(100) := '68:20:a6:0a:29:b4:e2:a5:02:ea:7c:b5:27:50:45:e2';
   private_key      varchar2(4000) := '-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCb/r8eqgOb9sKm
QO2+N8o1gcOxGBcF8kv4cKbXjIZT4muXLJPDU+7CpwDmQ5GDVlu7q8wd98E0p+Hy
m3zyVcIawSmIXf2qO5klCcE6qGdqRf0vGc2R5gaDBm8fpVMqOQuMoTF1r2dK+1gS
2VeE3VjkRyjPNsJS8wMCU5Iuih1o/V8mTAnvpRLOPewUPqAv5fT5iWmF77bPONie
81yRpKAdUcnSQXtg8v94CDKaMSjGp5qFgWg8QyRNaerkOG8S1Ngzlm+zFAzwYlHH
hkO1W5bxvvQwAUDxaj/2vfSNcyc8D53KeSW0wPygdYaRNFCsGBkc3AHYu/jvCElQ
ll5GWbDJAgMBAAECggEABMrjjJNgF4Lrnk4SqWKo53jUYVgFkw6Ld3dGJPHbPNYE
UXyfQ71YvnaBIFHom7UD2sTvks2GP2VXm37CUxnZfaPVsEV+kgpeAHjBGaZ+9BFw
5ekzlKn3i4x5AWs9aufRDngmuLOG52z7Gt8koXKBQeHB/Vwn309tSWPCzLbvduBJ
Nv9GM54A9Q8dEGnDZC0Ay7GvgFCP9s3/VEKx5WHyypmQPCwUwdI7X/3pm15yv0gx
CG4oOK6FGQq5baqOGJCR1/ry4r/DdlmrACis+xcWXkJFU+m3W8zPOavQfQu5X9d/
8mjqBsBa1EVw8NhHM+EMehjpq5rttwLNWAcE6tyKpQKBgQDPOn6nFwMD6Zcr8g1O
Uf5mcwUjFKphp+QlZVbyRlZQ5WPn6nWo1/fixl+Yyc5PHofX+HlsNjd/vwf6GSpz
EJNX3H6OMz8q0WxkQ1X2Td0g+7ATQEBE/qO+FrwgPuUc2wuDJwcK2UNw/vfrdfTR
d0V2WIIaeJGnLTrp1DAWEvFDbQKBgQDAtXFfGLaiK35vr4EibI/WMoozYibNLSIx
nmvRz+SzJfTovCbQ+i3wUt+l/ZECFcGYMjZ7LSTGjaEuDyYylvGLj42OzfZVa6ty
OHHxNz8cGHim+STuGaXPDFGHZuUoXtUZmduKp2oLOu00sWW/r939NKjdbJzpnStr
53xXo39tTQKBgQC3/auuF1RqCOBb+FGwFETYGY+aEiMlCbgbK9sCyUiiEsmdhCJr
gzVod9ExCxzOSsE6FDdayNiF58rhV67E8xafj/odr4qKLd8bNl4Ajimju1QeA5IM
sDoZ8H2f87fg4utZyzEJhNXIYdklilmQEWHvLa52ak6ILDR+oBMBxlfIEQKBgCGz
WWk9BCtmGc1kTtv7Skg2PG7x+kElZHZy8v4VMjSWLbdJuCwRpFkD1TLNHj/UGDAK
j/aIlYbXm9lXMuHj/cffSe0wXaTgmHH4Jwz9EV9TdD4XEftFpvaHe/aG6wpdUz0P
6BHeZzAhlPwDDf0wv0yZmfJnHSXJo59SMy+MWyt9AoGBAKq4e3krup0Qvaxecy30
wuRqkL+v0rigreL486L8kQRGsaOCeWHamr8M4LN/Jt5254Q+Whn5PVgLIONL9FZ9
m76AfVblTRCPipaC5gKdLCs805YBoSZtpZzQ5sVbi0TQRjbDn37JZ7tDHIc2y8vL
MjK64sHDONli1n7Q2fTCezX+
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
      credential_name => 'OCI_GENAI_CRED_VEC',
      params          =>
              json(jo.to_string)
   );
end;
/
--Grant Network Access
--use admin user to execute this
begin
   dbms_network_acl_admin.append_host_ace(
      host => 'api.x.ai',
      ace  => xs$ace_type(
         privilege_list => xs$name_list('http', 'connect', 'resolve'),
         principal_name => 'DBN',
         principal_type => xs_acl.ptype_db
      )
   );
end;
/

-- Check what ACL exists for api.x.ai
SELECT principal,privilege, is_grant, invert, start_date, 
end_date, acl_owner
from   dba_network_acl_privileges;

SELECT principal, host, privilege, grant_type 
FROM dba_host_aces 
WHERE host LIKE '%x.ai%' OR host = '*';

begin
   dbms_vector.drop_credential('OCI_GENAI_CRED_VEC');
exception
   when others then
      null;
end;
/
select *
  from user_cloud_ai_profiles;

begin
   dbms_cloud_ai.drop_profile('DANAMON_RM_PROFILE');
exception
   when others then
      null;
end;
/

-- 2. Create a Select AI LLM profile (used by PAF In-Database nodes)
begin
   dbms_cloud_ai.create_profile(
      profile_name => 'DANAMON_RM_PROFILE',
      attributes   => '{
  "provider": "oci",
  "credential_name": "OCI_GENAI_CRED",
  "model": "cohere.command-r-plus-08-2024",
  "region": "ap-osaka-1",
  "object_list": [
    {
      "owner": "DBN",
      "name": "CUSTOMERS"
    },
    {
      "owner": "DBN",
      "name": "CUSTOMER_PRODUCTS"
    },
    {
      "owner": "DBN",
      "name": "PRODUCT_CATALOG"
    }
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
  "credential_name": "OCI_GENAI_CRED_VEC",
  "url": "https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText",
  "model": "cohere.embed-v4.0"
}'
      )
) as test_vector
  from dual;

-- 3. Create a RAG profile pointing to the embedding tables
begin
   dbms_cloud_ai.create_profile(
      profile_name => 'DANAMON_RAG_PROFILE',
      attributes   => '{
  "provider": "oci",
  "credential_name": "OCI_GENAI_CRED",
  "region": "ap-osaka-1",
  "model": "cohere.command-r-plus-08-2024",
  "embedding_model": "cohere.embed-v4.0",
  "object_list": [
    {
      "owner": "DBN",
      "name": "CUSTOMER_EMBEDDINGS"
    },
    {
      "owner": "DBN",
      "name": "MEETING_NOTES_EMBEDDINGS"
    },
    {
      "owner": "DBN",
      "name": "PRODUCT_EMBEDDINGS"
    }
  ]
}'
   );
end;
/

EXEC DBMS_CLOUD_AI.SET_PROFILE('DANAMON_RM_PROFILE');

-- Verifikasi profile aktif
select dbms_cloud_ai.get_profile() as active_profile
  from dual;

-- Uji koneksi model (chat sederhana)
SELECT AI  show all customers;
