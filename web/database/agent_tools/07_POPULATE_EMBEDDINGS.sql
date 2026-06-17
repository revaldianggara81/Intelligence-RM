-- =============================================================================
-- 07_POPULATE_EMBEDDINGS.sql
-- Generates and stores VECTOR(1536, FLOAT32) embeddings for all three RAG tables.
--
-- Credential  : OCI_GENAI_CRED_VEC
-- Model       : cohere.embed-v4.0  (1536 dim, FLOAT32)
-- Region      : ap-osaka-1
--
-- APA YANG DI-EMBED:
--   CUSTOMER_EMBEDDINGS       <- CUSTOMERS
--     Teks: identitas, tier, profil risiko, pendapatan, AUM, catatan nasabah.
--     Dipakai TOOL_CUSTOMER_PROFILE_RAG (preferensi, tujuan, gaya investasi).
--     1 baris per nasabah (CONTENT_TYPE = 'profile').
--
--   MEETING_NOTES_EMBEDDINGS  <- MEETING_NOTES
--     Teks: SUMMARY + TOPICS + PRODUCTS_DISCUSSED + FOLLOW_UP.
--     Dipakai TOOL_MEETING_NOTES_RAG (keputusan, keberatan, tindak lanjut).
--     1 baris per NOTE_ID.
--
--   PRODUCT_EMBEDDINGS        <- PRODUCT_CATALOG
--     Teks: nama, kategori, deskripsi, fitur, risiko, bunga, tenor.
--     Dipakai TOOL_PRODUCT_CATALOG_RAG (cari produk relevan secara semantik).
--     1 baris per PRODUCT_ID.
--
-- Cara pakai:
--   SET SERVEROUTPUT ON SIZE UNLIMITED;
--   EXEC EMBED_CUSTOMER_PROFILES;     -- incremental (skip yg sudah ada)
--   EXEC EMBED_CUSTOMER_PROFILES(1);  -- refresh total (hapus + buat ulang)
--   EXEC RUN_ALL_EMBEDDINGS;          -- semua tabel, incremental
--   EXEC RUN_ALL_EMBEDDINGS(1);       -- semua tabel, refresh total
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

exec EMBED_CUSTOMER_PROFILES(1);
exec EMBED_MEETING_NOTES(1);
exec EMBED_PRODUCT_CATALOG(1);

-- =============================================================================
-- PROCEDURE 1: EMBED_CUSTOMER_PROFILES
-- =============================================================================
CREATE OR REPLACE PROCEDURE EMBED_CUSTOMER_PROFILES (
  p_refresh      IN NUMBER DEFAULT 0,
  p_batch_commit IN NUMBER DEFAULT 10
) AS
  C_PARAMS CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_GENAI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-v4.0"}';

  v_content    CLOB;
  v_embedding  VECTOR(1536, FLOAT32);
  v_exists     NUMBER;
  v_count_ok   NUMBER := 0;
  v_count_err  NUMBER := 0;
  v_t0         TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('EMBED_PROC', 'CUSTOMER_PROFILES');
  DBMS_OUTPUT.PUT_LINE('=== EMBED_CUSTOMER_PROFILES ===');
  DBMS_OUTPUT.PUT_LINE('Mode    : ' || CASE WHEN p_refresh = 1
                        THEN 'REFRESH' ELSE 'INCREMENTAL' END);
  DBMS_OUTPUT.PUT_LINE('Started : ' || TO_CHAR(v_t0, 'DD-MON-YYYY HH24:MI:SS'));

  IF p_refresh = 1 THEN
    DELETE FROM CUSTOMER_EMBEDDINGS WHERE CONTENT_TYPE = 'profile';
    DBMS_OUTPUT.PUT_LINE('Deleted : ' || SQL%ROWCOUNT || ' existing embeddings.');
    COMMIT;
  END IF;

  FOR r IN (SELECT CUSTOMER_ID, FULL_NAME, AGE, GENDER,
                   TIER, TIER_LABEL, RISK_PROFILE,
                   MONTHLY_INCOME, TOTAL_AUM, KYC_STATUS, NOTES
            FROM   CUSTOMERS)
  LOOP
    -- Skip jika sudah ada dan bukan mode refresh
    IF p_refresh = 0 THEN
      SELECT COUNT(*) INTO v_exists
      FROM   CUSTOMER_EMBEDDINGS
      WHERE  CUSTOMER_ID = r.CUSTOMER_ID AND CONTENT_TYPE = 'profile';
      IF v_exists > 0 THEN
        CONTINUE;
      END IF;
    END IF;

    SAVEPOINT sp_cust_row;
    BEGIN
      v_content :=
          'Nasabah: '            || r.FULL_NAME || CHR(10)
        || 'Usia: '              || NVL(TO_CHAR(r.AGE), 'tidak diketahui') || ' tahun. '
        || 'Jenis kelamin: '     || NVL(r.GENDER, '-')                     || CHR(10)
        || 'Tier nasabah: '      || NVL(r.TIER, '-')
          || CASE WHEN r.TIER_LABEL IS NOT NULL
                  THEN ' (' || r.TIER_LABEL || ')' ELSE '' END             || CHR(10)
        || 'Profil risiko: '     || NVL(r.RISK_PROFILE, '-')               || CHR(10)
        || 'Pendapatan bulanan: Rp '
          || TO_CHAR(NVL(r.MONTHLY_INCOME, 0), 'FM999,999,999,999')        || CHR(10)
        || 'Total AUM: Rp '
          || TO_CHAR(NVL(r.TOTAL_AUM, 0), 'FM999,999,999,999')            || CHR(10)
        || 'Status KYC: '        || NVL(r.KYC_STATUS, '-')                 || CHR(10)
        || CASE WHEN r.NOTES IS NOT NULL AND LENGTH(r.NOTES) > 0
                THEN 'Catatan nasabah: ' || SUBSTR(r.NOTES, 1, 3000) || CHR(10)
                ELSE '' END;

      v_embedding := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(v_content, json(C_PARAMS));

      DELETE FROM CUSTOMER_EMBEDDINGS
      WHERE  CUSTOMER_ID = r.CUSTOMER_ID AND CONTENT_TYPE = 'profile';

      INSERT INTO CUSTOMER_EMBEDDINGS
        (CUSTOMER_ID, CONTENT_TYPE, CONTENT, EMBEDDING, MODEL_USED)
      VALUES
        (r.CUSTOMER_ID, 'profile', v_content, v_embedding, 'cohere.embed-v4.0');

      v_count_ok := v_count_ok + 1;

      IF MOD(v_count_ok, p_batch_commit) = 0 THEN
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('  Progress: ' || v_count_ok || ' committed...');
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_count_err := v_count_err + 1;
        DBMS_OUTPUT.PUT_LINE('  ERROR customer ' || r.CUSTOMER_ID || ': ' || SQLERRM);
        ROLLBACK TO SAVEPOINT sp_cust_row;
    END;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Selesai - OK: ' || v_count_ok || ', Error: ' || v_count_err);
  DBMS_OUTPUT.PUT_LINE('Elapsed : ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0))) || ' detik');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    DBMS_OUTPUT.PUT_LINE('FATAL: ' || SQLERRM);
    RAISE;
END EMBED_CUSTOMER_PROFILES;
/


-- =============================================================================
-- PROCEDURE 2: EMBED_MEETING_NOTES
-- =============================================================================
CREATE OR REPLACE PROCEDURE EMBED_MEETING_NOTES (
  p_refresh      IN NUMBER DEFAULT 0,
  p_batch_commit IN NUMBER DEFAULT 10
) AS
  C_PARAMS CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_GENAI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-v4.0"}';

  v_content    CLOB;
  v_embedding  VECTOR(1536, FLOAT32);
  v_exists     NUMBER;
  v_count_ok   NUMBER := 0;
  v_count_err  NUMBER := 0;
  v_t0         TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('EMBED_PROC', 'MEETING_NOTES');
  DBMS_OUTPUT.PUT_LINE('=== EMBED_MEETING_NOTES ===');
  DBMS_OUTPUT.PUT_LINE('Mode    : ' || CASE WHEN p_refresh = 1
                        THEN 'REFRESH' ELSE 'INCREMENTAL' END);
  DBMS_OUTPUT.PUT_LINE('Started : ' || TO_CHAR(v_t0, 'DD-MON-YYYY HH24:MI:SS'));

  IF p_refresh = 1 THEN
    DELETE FROM MEETING_NOTES_EMBEDDINGS;
    DBMS_OUTPUT.PUT_LINE('Deleted : ' || SQL%ROWCOUNT || ' existing embeddings.');
    COMMIT;
  END IF;

  FOR r IN (SELECT NOTE_ID, CUSTOMER_ID,
                   TO_CHAR(MEETING_DATE, 'DD-MON-YYYY') AS MEETING_DATE_STR,
                   NOTE_TYPE, SUMMARY, TOPICS, PRODUCTS_DISCUSSED, FOLLOW_UP
            FROM   MEETING_NOTES)
  LOOP
    IF p_refresh = 0 THEN
      SELECT COUNT(*) INTO v_exists
      FROM   MEETING_NOTES_EMBEDDINGS
      WHERE  NOTE_ID = r.NOTE_ID;
      IF v_exists > 0 THEN
        CONTINUE;
      END IF;
    END IF;

    SAVEPOINT sp_note_row;
    BEGIN
      v_content :=
          'Catatan pertemuan ' || NVL(r.NOTE_TYPE, 'rapat')
        || ' tanggal '         || NVL(r.MEETING_DATE_STR, 'tidak diketahui') || '.' || CHR(10)
        || CASE WHEN r.SUMMARY IS NOT NULL AND LENGTH(r.SUMMARY) > 0
                THEN 'Ringkasan: ' || SUBSTR(r.SUMMARY, 1, 2000) || CHR(10)
                ELSE '' END
        || CASE WHEN r.TOPICS IS NOT NULL AND LENGTH(r.TOPICS) > 0
                THEN 'Topik yang dibahas: ' || SUBSTR(r.TOPICS, 1, 1000) || CHR(10)
                ELSE '' END
        || CASE WHEN r.PRODUCTS_DISCUSSED IS NOT NULL AND LENGTH(r.PRODUCTS_DISCUSSED) > 0
                THEN 'Produk yang dibahas: ' || SUBSTR(r.PRODUCTS_DISCUSSED, 1, 1000) || CHR(10)
                ELSE '' END
        || CASE WHEN r.FOLLOW_UP IS NOT NULL AND LENGTH(r.FOLLOW_UP) > 0
                THEN 'Tindak lanjut: ' || SUBSTR(r.FOLLOW_UP, 1, 1000) || CHR(10)
                ELSE '' END;

      IF LENGTH(TRIM(v_content)) < 10 THEN
        DBMS_OUTPUT.PUT_LINE('  SKIP note_id=' || r.NOTE_ID || ' (konten kosong)');
      ELSE
        v_embedding := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(v_content, json(C_PARAMS));

        DELETE FROM MEETING_NOTES_EMBEDDINGS WHERE NOTE_ID = r.NOTE_ID;

        INSERT INTO MEETING_NOTES_EMBEDDINGS
          (NOTE_ID, CUSTOMER_ID, CONTENT, EMBEDDING, MODEL_USED)
        VALUES
          (r.NOTE_ID, r.CUSTOMER_ID, v_content, v_embedding, 'cohere.embed-v4.0');

        v_count_ok := v_count_ok + 1;

        IF MOD(v_count_ok, p_batch_commit) = 0 THEN
          COMMIT;
          DBMS_OUTPUT.PUT_LINE('  Progress: ' || v_count_ok || ' committed...');
        END IF;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_count_err := v_count_err + 1;
        DBMS_OUTPUT.PUT_LINE('  ERROR note_id=' || r.NOTE_ID || ': ' || SQLERRM);
        ROLLBACK TO SAVEPOINT sp_note_row;
    END;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Selesai - OK: ' || v_count_ok || ', Error: ' || v_count_err);
  DBMS_OUTPUT.PUT_LINE('Elapsed : ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0))) || ' detik');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    DBMS_OUTPUT.PUT_LINE('FATAL: ' || SQLERRM);
    RAISE;
END EMBED_MEETING_NOTES;
/


-- =============================================================================
-- PROCEDURE 3: EMBED_PRODUCT_CATALOG
-- =============================================================================
CREATE OR REPLACE PROCEDURE EMBED_PRODUCT_CATALOG (
  p_refresh      IN NUMBER DEFAULT 0,
  p_active_only  IN NUMBER DEFAULT 0,
  p_batch_commit IN NUMBER DEFAULT 10
) AS
  C_PARAMS CONSTANT VARCHAR2(500) :=
    '{"provider":"ocigenai"'
    || ',"credential_name":"OCI_GENAI_CRED_VEC"'
    || ',"url":"https://inference.generativeai.ap-osaka-1.oci.oraclecloud.com/20231130/actions/embedText"'
    || ',"model":"cohere.embed-v4.0"}';

  v_content    CLOB;
  v_embedding  VECTOR(1536, FLOAT32);
  v_exists     NUMBER;
  v_count_ok   NUMBER := 0;
  v_count_err  NUMBER := 0;
  v_t0         TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('EMBED_PROC', 'PRODUCT_CATALOG');
  DBMS_OUTPUT.PUT_LINE('=== EMBED_PRODUCT_CATALOG ===');
  DBMS_OUTPUT.PUT_LINE('Mode    : ' || CASE WHEN p_refresh = 1
                        THEN 'REFRESH' ELSE 'INCREMENTAL' END);
  DBMS_OUTPUT.PUT_LINE('Filter  : ' || CASE WHEN p_active_only = 1
                        THEN 'Hanya produk aktif' ELSE 'Semua produk' END);
  DBMS_OUTPUT.PUT_LINE('Started : ' || TO_CHAR(v_t0, 'DD-MON-YYYY HH24:MI:SS'));

  IF p_refresh = 1 THEN
    DELETE FROM PRODUCT_EMBEDDINGS;
    DBMS_OUTPUT.PUT_LINE('Deleted : ' || SQL%ROWCOUNT || ' existing embeddings.');
    COMMIT;
  END IF;

  FOR r IN (SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION,
                   INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT,
                   TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, FEATURES
            FROM   PRODUCT_CATALOG
            WHERE  p_active_only = 0 OR IS_ACTIVE = 1)
  LOOP
    IF p_refresh = 0 THEN
      SELECT COUNT(*) INTO v_exists
      FROM   PRODUCT_EMBEDDINGS
      WHERE  PRODUCT_ID = r.PRODUCT_ID;
      IF v_exists > 0 THEN
        CONTINUE;
      END IF;
    END IF;

    SAVEPOINT sp_prod_row;
    BEGIN
      v_content :=
          'Produk: '         || r.PRODUCT_NAME                               || CHR(10)
        || 'Kategori: '      || NVL(r.CATEGORY, '-')                         || CHR(10)
        || 'Status: '        || CASE WHEN r.IS_ACTIVE = 1
                                     THEN 'Aktif' ELSE 'Tidak aktif' END     || CHR(10)
        || CASE WHEN r.DESCRIPTION IS NOT NULL AND LENGTH(r.DESCRIPTION) > 0
                THEN 'Deskripsi: ' || SUBSTR(r.DESCRIPTION, 1, 2000) || CHR(10)
                ELSE '' END
        || CASE WHEN r.INTEREST_RATE IS NOT NULL
                THEN 'Suku bunga: ' || TO_CHAR(r.INTEREST_RATE, 'FM990.99')
                     || '% per tahun.' || CHR(10)
                ELSE '' END
        || 'Minimum investasi: Rp '
          || TO_CHAR(NVL(r.MIN_AMOUNT, 0), 'FM999,999,999,999')             || CHR(10)
        || CASE WHEN r.MAX_AMOUNT IS NOT NULL
                THEN 'Maksimum investasi: Rp '
                     || TO_CHAR(r.MAX_AMOUNT, 'FM999,999,999,999') || CHR(10)
                ELSE '' END
        || CASE WHEN r.TENURE_MONTHS IS NOT NULL
                THEN 'Tenor: ' || TO_CHAR(r.TENURE_MONTHS) || ' bulan.' || CHR(10)
                ELSE '' END
        || 'Profil risiko: ' || NVL(r.RISK_LEVEL, '-')                      || CHR(10)
        || CASE WHEN r.FEATURES IS NOT NULL AND LENGTH(r.FEATURES) > 0
                THEN 'Fitur: ' || SUBSTR(r.FEATURES, 1, 1000) || CHR(10)
                ELSE '' END;

      v_embedding := DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(v_content, json(C_PARAMS));

      DELETE FROM PRODUCT_EMBEDDINGS WHERE PRODUCT_ID = r.PRODUCT_ID;

      INSERT INTO PRODUCT_EMBEDDINGS
        (PRODUCT_ID, CONTENT, EMBEDDING, MODEL_USED)
      VALUES
        (r.PRODUCT_ID, v_content, v_embedding, 'cohere.embed-v4.0');

      v_count_ok := v_count_ok + 1;

      IF MOD(v_count_ok, p_batch_commit) = 0 THEN
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('  Progress: ' || v_count_ok || ' committed...');
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_count_err := v_count_err + 1;
        DBMS_OUTPUT.PUT_LINE('  ERROR product_id=' || r.PRODUCT_ID || ': ' || SQLERRM);
        ROLLBACK TO SAVEPOINT sp_prod_row;
    END;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Selesai - OK: ' || v_count_ok || ', Error: ' || v_count_err);
  DBMS_OUTPUT.PUT_LINE('Elapsed : ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0))) || ' detik');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    DBMS_OUTPUT.PUT_LINE('FATAL: ' || SQLERRM);
    RAISE;
END EMBED_PRODUCT_CATALOG;
/


-- =============================================================================
-- PROCEDURE 4: RUN_ALL_EMBEDDINGS  (orchestrator)
-- =============================================================================
CREATE OR REPLACE PROCEDURE RUN_ALL_EMBEDDINGS (
  p_refresh IN NUMBER DEFAULT 0
) AS
  v_t0 TIMESTAMP := SYSTIMESTAMP;
BEGIN
  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('RUN_ALL_EMBEDDINGS - cohere.embed-v4.0');
  DBMS_OUTPUT.PUT_LINE('========================================');

  DBMS_OUTPUT.PUT_LINE('[1/3] Customer profiles...');
  EMBED_CUSTOMER_PROFILES(p_refresh => p_refresh);

  DBMS_OUTPUT.PUT_LINE('[2/3] Meeting notes...');
  EMBED_MEETING_NOTES(p_refresh => p_refresh);

  DBMS_OUTPUT.PUT_LINE('[3/3] Product catalog...');
  EMBED_PRODUCT_CATALOG(p_refresh => p_refresh);

  DBMS_OUTPUT.PUT_LINE('========================================');
  DBMS_OUTPUT.PUT_LINE('SELESAI - total elapsed: ' ||
    ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_t0))) || ' detik');
  DBMS_OUTPUT.PUT_LINE('========================================');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('FATAL in RUN_ALL_EMBEDDINGS: ' || SQLERRM);
    RAISE;
END RUN_ALL_EMBEDDINGS;
/


-- =============================================================================
-- VERIFIKASI - jalankan setelah RUN_ALL_EMBEDDINGS selesai
-- =============================================================================
SELECT
  'CUSTOMER_EMBEDDINGS'       AS tabel,
  COUNT(*)                    AS total_rows,
  COUNT(EMBEDDING)            AS rows_with_vector,
  COUNT(DISTINCT CUSTOMER_ID) AS distinct_keys
FROM CUSTOMER_EMBEDDINGS
UNION ALL
SELECT
  'MEETING_NOTES_EMBEDDINGS',
  COUNT(*),
  COUNT(EMBEDDING),
  COUNT(DISTINCT NOTE_ID)
FROM MEETING_NOTES_EMBEDDINGS
UNION ALL
SELECT
  'PRODUCT_EMBEDDINGS',
  COUNT(*),
  COUNT(EMBEDDING),
  COUNT(DISTINCT PRODUCT_ID)
FROM PRODUCT_EMBEDDINGS
ORDER BY tabel;
