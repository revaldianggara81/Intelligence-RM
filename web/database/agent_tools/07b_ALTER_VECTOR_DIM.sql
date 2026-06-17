-- =============================================================================
-- 07b_ALTER_VECTOR_DIM.sql
-- Mengubah dimensi kolom EMBEDDING dari 1024 -> 1536 di semua tabel embedding.
--
-- Oracle tidak mendukung MODIFY langsung pada kolom VECTOR (ORA-51859).
-- Solusi: TRUNCATE -> DROP kolom lama -> ADD kolom baru dengan dimensi benar.
-- Data lama dibuang karena dimensinya salah dan harus di-embed ulang.
--
-- Jalankan SEBELUM EXEC RUN_ALL_EMBEDDINGS(p_refresh=>1).
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED;

-- ---------------------------------------------------------------------------
-- Step 1: Drop vector indexes (harus drop sebelum bisa drop kolom)
-- ---------------------------------------------------------------------------
DECLARE
  PROCEDURE drop_index_if_exists(p_name VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE 'DROP INDEX ' || p_name;
    DBMS_OUTPUT.PUT_LINE('[DROP INDEX] ' || p_name);
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('[SKIP INDEX] ' || p_name || ' tidak ditemukan.');
  END;
BEGIN
  drop_index_if_exists('IDX_CUST_EMBED_VEC');
  drop_index_if_exists('IDX_NOTES_EMBED_VEC');
  drop_index_if_exists('IDX_PROD_EMBED_VEC');
  drop_index_if_exists('IDX_MKT_EMBED_VEC');
END;
/

-- ---------------------------------------------------------------------------
-- Step 2: Truncate (data lama berdimensi 1024, tidak bisa dipakai lagi)
-- ---------------------------------------------------------------------------

BEGIN
  DBMS_OUTPUT.PUT_LINE('[TRUNCATE] Semua embedding table dikosongkan.');
END;
/

-- ---------------------------------------------------------------------------
-- Step 3: Drop kolom EMBEDDING lama (VECTOR 1024)
-- ---------------------------------------------------------------------------
ALTER TABLE CUSTOMER_EMBEDDINGS       DROP COLUMN EMBEDDING;
ALTER TABLE MEETING_NOTES_EMBEDDINGS  DROP COLUMN EMBEDDING;
ALTER TABLE PRODUCT_EMBEDDINGS        DROP COLUMN EMBEDDING;
ALTER TABLE MARKET_CONTEXT_EMBEDDINGS DROP COLUMN EMBEDDING;

BEGIN
  DBMS_OUTPUT.PUT_LINE('[DROP COLUMN] Kolom EMBEDDING (1024-dim) berhasil dihapus.');
END;
/

-- ---------------------------------------------------------------------------
-- Step 4: Add kolom EMBEDDING baru (VECTOR 1536) - NOT NULL diabaikan dulu
--         karena tabel kosong, NOT NULL akan ditambahkan kembali via constraint
-- ---------------------------------------------------------------------------
ALTER TABLE CUSTOMER_EMBEDDINGS       ADD EMBEDDING VECTOR(1536, FLOAT32)  NULL;
ALTER TABLE MEETING_NOTES_EMBEDDINGS  ADD EMBEDDING VECTOR(1536, FLOAT32)  NULL;
ALTER TABLE PRODUCT_EMBEDDINGS        ADD EMBEDDING VECTOR(1536, FLOAT32)  NULL;
ALTER TABLE MARKET_CONTEXT_EMBEDDINGS ADD EMBEDDING VECTOR(1536, FLOAT32)  NULL;

BEGIN
  DBMS_OUTPUT.PUT_LINE('[ADD COLUMN] Kolom EMBEDDING (1536-dim) berhasil ditambahkan.');
END;
/

-- ---------------------------------------------------------------------------
-- Step 5: Recreate vector indexes
-- ---------------------------------------------------------------------------
CREATE VECTOR INDEX IDX_CUST_EMBED_VEC ON CUSTOMER_EMBEDDINGS(EMBEDDING)
  ORGANIZATION NEIGHBOR PARTITIONS
  WITH DISTANCE COSINE
  WITH TARGET ACCURACY 95;

CREATE VECTOR INDEX IDX_NOTES_EMBED_VEC ON MEETING_NOTES_EMBEDDINGS(EMBEDDING)
  ORGANIZATION NEIGHBOR PARTITIONS
  WITH DISTANCE COSINE
  WITH TARGET ACCURACY 95;

CREATE VECTOR INDEX IDX_PROD_EMBED_VEC ON PRODUCT_EMBEDDINGS(EMBEDDING)
  ORGANIZATION NEIGHBOR PARTITIONS
  WITH DISTANCE COSINE
  WITH TARGET ACCURACY 95;

CREATE VECTOR INDEX IDX_MKT_EMBED_VEC ON MARKET_CONTEXT_EMBEDDINGS(EMBEDDING)
  ORGANIZATION NEIGHBOR PARTITIONS
  WITH DISTANCE COSINE
  WITH TARGET ACCURACY 95;

BEGIN
  DBMS_OUTPUT.PUT_LINE('[INDEX] Semua vector index berhasil dibuat ulang (1536-dim).');
END;
/

-- ---------------------------------------------------------------------------
-- Verifikasi: pastikan kolom sudah terdaftar ulang
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, NULLABLE
FROM   USER_TAB_COLUMNS
WHERE  COLUMN_NAME = 'EMBEDDING'
AND    TABLE_NAME IN (
         'CUSTOMER_EMBEDDINGS',
         'MEETING_NOTES_EMBEDDINGS',
         'PRODUCT_EMBEDDINGS',
         'MARKET_CONTEXT_EMBEDDINGS'
       )
ORDER BY TABLE_NAME;

-- ---------------------------------------------------------------------------
-- Selesai - langkah berikutnya:
--   SET SERVEROUTPUT ON SIZE UNLIMITED;
--   EXEC RUN_ALL_EMBEDDINGS(p_refresh => 1);
-- ---------------------------------------------------------------------------
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Schema selesai diupdate ke VECTOR(1536, FLOAT32).');
  DBMS_OUTPUT.PUT_LINE('Jalankan: EXEC RUN_ALL_EMBEDDINGS(p_refresh => 1);');
END;
/
