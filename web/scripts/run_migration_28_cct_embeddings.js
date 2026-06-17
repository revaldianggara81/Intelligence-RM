'use strict';
/**
 * Migration 28 — CALL_CENTER_TRANSCRIPT_EMBEDDINGS
 *
 * Creates:
 *   CALL_CENTER_TRANSCRIPT_EMBEDDINGS   — Vector table (1024 FLOAT32)
 *   IDX_CCT_EMBED_VEC                   — HNSW vector index (cosine, 95% accuracy)
 *   CCT_EMBEDDINGS_V                    — View joining embeddings + transcript metadata
 *   SP_POPULATE_CCT_EMBEDDINGS          — Procedure to embed new/un-embedded transcripts
 *   SP_EMBED_CCT_SINGLE                 — Procedure to embed a single transcript by ID
 *
 * The actual OCI GenAI embedding calls are made by the Node.js backend
 * (ragService.populateTranscriptEmbeddings).  The stored procedures serve
 * as orchestration hooks callable from PAF agents or Oracle Scheduler.
 *
 * Usage:  node scripts/run_migration_28_cct_embeddings.js
 */
require('dotenv').config();
const db = require('../backend/config/database');

async function run() {
  await db.initialize();
  console.log('Migration 28 — CALL_CENTER_TRANSCRIPT_EMBEDDINGS\n');

  const exec = async (label, sql) => {
    try {
      await db.execute(sql);
      console.log(`✅  ${label}`);
    } catch (e) {
      if (/ORA-00955|ORA-01430|ORA-04068|ORA-00942/.test(e.message))
        console.log(`⏭   ${label} (already exists)`);
      else { console.error(`❌  ${label}: ${e.message.split('\n')[0]}`); throw e; }
    }
  };

  /* ── 1. Embeddings table ─────────────────────────────────────────── */
  await exec('CREATE TABLE CALL_CENTER_TRANSCRIPT_EMBEDDINGS', `
    CREATE TABLE CALL_CENTER_TRANSCRIPT_EMBEDDINGS (
      EMBED_ID        NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      TRANSCRIPT_ID   NUMBER         NOT NULL
                        REFERENCES CALL_CENTER_TRANSCRIPTS(TRANSCRIPT_ID) ON DELETE CASCADE,
      CUSTOMER_ID     VARCHAR2(50)   NOT NULL
                        REFERENCES CUSTOMERS(CUSTOMER_ID),
      CONTENT_TYPE    VARCHAR2(50)   DEFAULT 'full_transcript',
      -- Values: full_transcript | summary | chunk_N (for long transcripts split into parts)
      CHUNK_INDEX     NUMBER         DEFAULT 0,
      -- 0 for full; 1,2,3... for chunked long transcripts
      CONTENT         CLOB           NOT NULL,
      EMBEDDING       VECTOR(1024, FLOAT32) NOT NULL,
      MODEL_USED      VARCHAR2(200),
      CREATED_AT      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* ── 2. Scalar indexes ───────────────────────────────────────────── */
  await exec('INDEX IDX_CCT_EMBED_CUST',
    `CREATE INDEX IDX_CCT_EMBED_CUST ON CALL_CENTER_TRANSCRIPT_EMBEDDINGS(CUSTOMER_ID)`);
  await exec('INDEX IDX_CCT_EMBED_TID',
    `CREATE INDEX IDX_CCT_EMBED_TID  ON CALL_CENTER_TRANSCRIPT_EMBEDDINGS(TRANSCRIPT_ID)`);

  /* ── 3. Vector index ─────────────────────────────────────────────── */
  await exec('VECTOR INDEX IDX_CCT_EMBED_VEC',
    `CREATE VECTOR INDEX IDX_CCT_EMBED_VEC
       ON CALL_CENTER_TRANSCRIPT_EMBEDDINGS(EMBEDDING)
       ORGANIZATION NEIGHBOR PARTITIONS
       WITH DISTANCE COSINE
       WITH TARGET ACCURACY 95`
  );

  /* ── 4. CCT_EMBEDDINGS_V — enriched view for PAF Agent RAG tool ─── */
  await exec('VIEW CCT_EMBEDDINGS_V',
    `CREATE OR REPLACE VIEW CCT_EMBEDDINGS_V AS
       SELECT
         e.EMBED_ID,
         e.TRANSCRIPT_ID,
         e.CUSTOMER_ID,
         e.CONTENT_TYPE,
         e.CHUNK_INDEX,
         e.CONTENT,
         e.EMBEDDING,
         e.MODEL_USED,
         e.CREATED_AT     AS EMBED_CREATED_AT,
         t.CALL_DATE,
         t.CALL_DURATION,
         t.AGENT_NAME,
         t.CALL_TYPE,
         t.TOPIC,
         t.SENTIMENT,
         t.RESOLUTION,
         c.FULL_NAME       AS CUSTOMER_NAME,
         c.TIER,
         c.RM_USER_ID
       FROM CALL_CENTER_TRANSCRIPT_EMBEDDINGS e
       JOIN CALL_CENTER_TRANSCRIPTS t ON e.TRANSCRIPT_ID = t.TRANSCRIPT_ID
       JOIN CUSTOMERS               c ON e.CUSTOMER_ID   = c.CUSTOMER_ID`
  );

  /* ── 5. SP_EMBED_CCT_SINGLE  (single-transcript hook for PAF agents) */
  await exec('SP_EMBED_CCT_SINGLE',
    `CREATE OR REPLACE PROCEDURE SP_EMBED_CCT_SINGLE(
       p_transcript_id IN NUMBER,
       p_status_out    OUT VARCHAR2
     ) AS
       v_count NUMBER;
     BEGIN
       -- Check if embedding already exists
       SELECT COUNT(*) INTO v_count
         FROM CALL_CENTER_TRANSCRIPT_EMBEDDINGS
        WHERE TRANSCRIPT_ID = p_transcript_id;

       IF v_count > 0 THEN
         p_status_out := 'ALREADY_EMBEDDED';
       ELSE
         -- Flag transcript as pending embedding (Node.js picks this up)
         -- Actual embedding via OCI GenAI is handled by Node.js ragService
         INSERT INTO SCHEDULER_LOG (JOB_NAME, STATUS, RUN_BY, ALERTS_CREATED)
         VALUES ('EMBED_CCT_' || p_transcript_id, 'PENDING', 'SP_EMBED_CCT_SINGLE', 0);
         COMMIT;
         p_status_out := 'QUEUED';
       END IF;
     EXCEPTION WHEN OTHERS THEN
       p_status_out := 'ERROR: ' || SQLERRM;
     END;`
  );

  /* ── 6. SP_POPULATE_CCT_EMBEDDINGS (batch — lists un-embedded IDs) ─*/
  await exec('SP_POPULATE_CCT_EMBEDDINGS',
    `CREATE OR REPLACE PROCEDURE SP_POPULATE_CCT_EMBEDDINGS(
       p_limit    IN  NUMBER  DEFAULT 50,
       p_count    OUT NUMBER
     ) AS
     BEGIN
       -- Returns count of transcripts that have no embedding yet
       -- Actual embedding is performed by Node.js backend via OCI GenAI
       SELECT COUNT(*) INTO p_count
         FROM CALL_CENTER_TRANSCRIPTS t
        WHERE NOT EXISTS (
          SELECT 1 FROM CALL_CENTER_TRANSCRIPT_EMBEDDINGS e
           WHERE e.TRANSCRIPT_ID = t.TRANSCRIPT_ID
        )
          AND ROWNUM <= p_limit;
     EXCEPTION WHEN OTHERS THEN
       p_count := -1;
     END;`
  );

  /* ── 7. Metadata comments ────────────────────────────────────────── */
  const cmts = [
    [`COMMENT ON TABLE CALL_CENTER_TRANSCRIPT_EMBEDDINGS IS`,
      `Vector embeddings untuk transkrip percakapan call center Bank Danamon. Memungkinkan PAF_AGENT_COPILOT mencari isi percakapan nasabah secara semantik (topik, keluhan, preferensi, keputusan) menggunakan Oracle VECTOR_DISTANCE.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.EMBED_ID IS`,         `Primary key auto-increment.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.TRANSCRIPT_ID IS`,    `FK ke CALL_CENTER_TRANSCRIPTS.TRANSCRIPT_ID. Transkrip yang di-embed.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.CUSTOMER_ID IS`,      `FK ke CUSTOMERS.CUSTOMER_ID. Nasabah terkait. Digunakan untuk filter per nasabah.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.CONTENT_TYPE IS`,     `Jenis konten: full_transcript (seluruh teks), summary (ringkasan), chunk_N (bagian ke-N untuk transkrip panjang).`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.CHUNK_INDEX IS`,      `Index urutan chunk: 0 = full transkrip, 1/2/3... = bagian dari transkrip panjang.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.CONTENT IS`,          `Teks konten yang di-embed (CLOB). Termasuk metadata: tanggal, topik, sentiment, resolusi + teks percakapan.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.EMBEDDING IS`,        `Vector FLOAT32 dimensi 1024 dari OCI GenAI Cohere Embed. Digunakan dalam VECTOR_DISTANCE similarity search.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.MODEL_USED IS`,       `Model embedding yang digunakan. Default: cohere.embed-multilingual-v3.0.`],
    [`COMMENT ON COLUMN CALL_CENTER_TRANSCRIPT_EMBEDDINGS.CREATED_AT IS`,       `Timestamp embedding dibuat.`],
    [`COMMENT ON TABLE CCT_EMBEDDINGS_V IS`,
      `View yang menggabungkan CALL_CENTER_TRANSCRIPT_EMBEDDINGS dengan metadata dari CALL_CENTER_TRANSCRIPTS dan CUSTOMERS. Digunakan oleh TOOL_COPILOT_TRANSCRIPT_RAG sebagai source RAG.`],
  ];
  for (const [stmt, text] of cmts) {
    try {
      await db.execute(`${stmt} '${text.replace(/'/g,"''")}'`);
      console.log(`✅  ${stmt.split(' ').slice(-1)[0]} comment`);
    } catch(e) { /* skip */ }
  }

  /* ── 8. Sanity check ─────────────────────────────────────────────── */
  const cct = await db.execute(`SELECT COUNT(*) AS C FROM CALL_CENTER_TRANSCRIPTS`);
  console.log(`\n📊 CALL_CENTER_TRANSCRIPTS rows:           ${cct.rows[0].C}`);
  const emb = await db.execute(`SELECT COUNT(*) AS C FROM CALL_CENTER_TRANSCRIPT_EMBEDDINGS`);
  console.log(`📊 CALL_CENTER_TRANSCRIPT_EMBEDDINGS rows: ${emb.rows[0].C}`);
  console.log('\n⚠   Embeddings table is empty — run populateTranscriptEmbeddings() from ragService');
  console.log('    or call: GET /api/admin/embed-transcripts\n');
  console.log('✅  Migration 28 complete');
  await db.close();
}

run().catch(err => {
  console.error('Migration 28 FAILED:', err.message || err);
  process.exit(1);
});
