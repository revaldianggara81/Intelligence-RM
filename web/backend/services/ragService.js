'use strict';
/**
 * RAG Service — Retrieval-Augmented Generation pipeline
 * 1. Embed the query with Cohere Embed v4.0 (SEARCH_QUERY input type)
 * 2. Run Oracle VECTOR_DISTANCE cosine similarity search
 * 3. Return top-k text chunks as RAG context
 *
 * Sources (retrieveForCopilot):
 *   1. Customer profile embeddings         (CUSTOMER_EMBEDDINGS)
 *   2. Meeting notes embeddings            (MEETING_NOTES_EMBEDDINGS)
 *   3. Product catalog embeddings          (PRODUCT_EMBEDDINGS)
 *   4. Prior AI analysis history           (AI_HISTORY_EMBEDDINGS)
 *   5. Call center transcripts             (CALL_CENTER_TRANSCRIPT_EMBEDDINGS)
 */
const db      = require('../config/database');
const { embedQuery } = require('./embeddingService');

/**
 * Search customer embeddings for a given query.
 * @param {string} query
 * @param {string} customerId   — restrict to one customer
 * @param {number} topK
 * @returns {Promise<string[]>} — array of relevant text chunks
 */
async function searchCustomerContext(query, customerId, topK = 5) {
  try {
    const vec    = await embedQuery(query);
    const vecStr = '[' + vec.join(',') + ']';

    const result = await db.execute(
      `SELECT CONTENT, CONTENT_TYPE,
              VECTOR_DISTANCE(EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
         FROM CUSTOMER_EMBEDDINGS
        WHERE CUSTOMER_ID = :2 AND EMBEDDING IS NOT NULL
        ORDER BY DIST ASC
        FETCH FIRST :3 ROWS ONLY`,
      [vecStr, customerId, topK]
    );
    return (result.rows || []).map(r => `[${r.CONTENT_TYPE}] ${r.CONTENT}`);
  } catch (err) {
    console.warn('[RAG] searchCustomerContext failed:', err.message);
    return [];
  }
}

/**
 * Search meeting notes embeddings.
 * @param {string} query
 * @param {string} customerId
 * @param {number} topK
 * @returns {Promise<string[]>}
 */
async function searchMeetingNotes(query, customerId, topK = 3) {
  try {
    const vec    = await embedQuery(query);
    const vecStr = '[' + vec.join(',') + ']';

    const result = await db.execute(
      `SELECT e.CONTENT,
              VECTOR_DISTANCE(e.EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
         FROM MEETING_NOTES_EMBEDDINGS e
        WHERE e.CUSTOMER_ID = :2
        ORDER BY DIST ASC
        FETCH FIRST :3 ROWS ONLY`,
      [vecStr, customerId, topK]
    );
    return (result.rows || []).map(r => `[Meeting Note] ${r.CONTENT}`);
  } catch (err) {
    console.warn('[RAG] searchMeetingNotes failed:', err.message);
    return [];
  }
}

/**
 * Search product catalog embeddings for relevant products.
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<string[]>}
 */
async function searchProducts(query, topK = 5) {
  try {
    const vec    = await embedQuery(query);
    const vecStr = '[' + vec.join(',') + ']';

    const result = await db.execute(
      `SELECT e.CONTENT, p.PRODUCT_NAME, p.CATEGORY,
              VECTOR_DISTANCE(e.EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
         FROM PRODUCT_EMBEDDINGS e
         JOIN PRODUCT_CATALOG p ON e.PRODUCT_ID = p.PRODUCT_ID
        WHERE p.IS_ACTIVE = 1
        ORDER BY DIST ASC
        FETCH FIRST :2 ROWS ONLY`,
      [vecStr, topK]
    );
    return (result.rows || []).map(r => `[Product: ${r.PRODUCT_NAME}] ${r.CONTENT}`);
  } catch (err) {
    console.warn('[RAG] searchProducts failed:', err.message);
    return [];
  }
}

/**
 * Search market context embeddings (for portfolio alerts scenario).
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<string[]>}
 */
async function searchMarketContext(query, topK = 3) {
  try {
    const vec    = await embedQuery(query);
    const vecStr = '[' + vec.join(',') + ']';

    const result = await db.execute(
      `SELECT TITLE, CONTENT,
              VECTOR_DISTANCE(EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
         FROM MARKET_CONTEXT_EMBEDDINGS
        ORDER BY DIST ASC
        FETCH FIRST :2 ROWS ONLY`,
      [vecStr, topK]
    );
    return (result.rows || []).map(r => `[Market Context: ${r.TITLE}] ${r.CONTENT}`);
  } catch (err) {
    console.warn('[RAG] searchMarketContext failed:', err.message);
    return [];
  }
}

/**
 * Search AI analysis history embeddings.
 *
 * Returns the most semantically similar past analysis results for a customer.
 * Used by the copilot so it can recall prior session insights.
 *
 * The pre-filter on CUSTOMER_ID lets Oracle's HNSW planner narrow the scan
 * to only that customer's rows before computing VECTOR_DISTANCE.
 *
 * @param {string}  query      — natural-language question from the RM
 * @param {string}  customerId — restrict recall to one customer
 * @param {number}  topK       — how many past analyses to inject (default 2)
 * @param {string}  [module]   — optional: restrict to one module (e.g. 'maturity')
 * @returns {Promise<string[]>}
 */
async function searchAnalysisHistory(query, customerId, topK = 2, module = null) {
  try {
    const vec    = await embedQuery(query);
    const vecStr = '[' + vec.join(',') + ']';

    const binds = [vecStr, customerId];
    let   filter = 'WHERE e.CUSTOMER_ID = :2';

    if (module) {
      filter += ' AND e.MODULE = :3';
      binds.push(module);
    }
    binds.push(topK);
    const topKBind = module ? ':4' : ':3';

    const sql = `
      SELECT e.CONTENT,
             e.MODULE,
             TO_CHAR(h.RUN_AT, 'DD Mon YYYY') AS RUN_DATE,
             VECTOR_DISTANCE(e.EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
        FROM AI_HISTORY_EMBEDDINGS e
        JOIN AI_ANALYSIS_HISTORY  h ON e.HISTORY_ID = h.HISTORY_ID
      ${filter}
      ORDER BY DIST ASC
      FETCH FIRST ${topKBind} ROWS ONLY
    `;
    const result = await db.execute(sql, binds);
    return (result.rows || []).map(r =>
      `[Prior AI Analysis — ${r.MODULE} — ${r.RUN_DATE}]\n${r.CONTENT}`
    );
  } catch (err) {
    console.warn('[RAG] searchAnalysisHistory failed:', err.message);
    return [];
  }
}

// ─── Internal non-catching query executors (used only by retrieveForCopilot) ──

async function _execCustomerContext(query, customerId, topK) {
  const vec    = await embedQuery(query);
  const vecStr = '[' + vec.join(',') + ']';
  const result = await db.execute(
    `SELECT CONTENT, CONTENT_TYPE,
            VECTOR_DISTANCE(EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
       FROM CUSTOMER_EMBEDDINGS
      WHERE CUSTOMER_ID = :2
      ORDER BY DIST ASC
      FETCH FIRST :3 ROWS ONLY`,
    [vecStr, customerId, topK]
  );
  return (result.rows || []).map(r => `[${r.CONTENT_TYPE}] ${r.CONTENT}`);
}

async function _execMeetingNotes(query, customerId, topK) {
  const vec    = await embedQuery(query);
  const vecStr = '[' + vec.join(',') + ']';
  const result = await db.execute(
    `SELECT e.CONTENT,
            VECTOR_DISTANCE(e.EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
       FROM MEETING_NOTES_EMBEDDINGS e
      WHERE e.CUSTOMER_ID = :2
      ORDER BY DIST ASC
      FETCH FIRST :3 ROWS ONLY`,
    [vecStr, customerId, topK]
  );
  return (result.rows || []).map(r => `[Meeting Note] ${r.CONTENT}`);
}

async function _execProducts(query, topK) {
  const vec    = await embedQuery(query);
  const vecStr = '[' + vec.join(',') + ']';
  const result = await db.execute(
    `SELECT e.CONTENT, p.PRODUCT_NAME, p.CATEGORY,
            VECTOR_DISTANCE(e.EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
       FROM PRODUCT_EMBEDDINGS e
       JOIN PRODUCT_CATALOG p ON e.PRODUCT_ID = p.PRODUCT_ID
      WHERE p.IS_ACTIVE = 1
      ORDER BY DIST ASC
      FETCH FIRST :2 ROWS ONLY`,
    [vecStr, topK]
  );
  return (result.rows || []).map(r => `[Product: ${r.PRODUCT_NAME}] ${r.CONTENT}`);
}

async function _execAnalysisHistory(query, customerId, topK) {
  const countCheck = await db.execute(
    'SELECT COUNT(*) AS CNT FROM AI_HISTORY_EMBEDDINGS WHERE CUSTOMER_ID = :1 AND EMBEDDING IS NOT NULL',
    [customerId]
  );
  if ((countCheck.rows?.[0]?.CNT || 0) === 0) return [];

  const vec    = await embedQuery(query);
  const vecStr = '[' + vec.join(',') + ']';
  const result = await db.execute(
    `SELECT e.CONTENT, e.MODULE,
            TO_CHAR(h.RUN_AT, 'DD Mon YYYY') AS RUN_DATE,
            VECTOR_DISTANCE(e.EMBEDDING, TO_VECTOR(:1, 1536, FLOAT32), COSINE) AS DIST
       FROM AI_HISTORY_EMBEDDINGS e
       JOIN AI_ANALYSIS_HISTORY  h ON e.HISTORY_ID = h.HISTORY_ID
      WHERE e.CUSTOMER_ID = :2
      ORDER BY DIST ASC
      FETCH FIRST :3 ROWS ONLY`,
    [vecStr, customerId, topK]
  );
  return (result.rows || []).map(r =>
    `[Prior AI Analysis — ${r.MODULE} — ${r.RUN_DATE}]\n${r.CONTENT}`
  );
}

/** Wraps a source search: returns { label, docs, count, status } even on error */
async function _safeSource(label, fn) {
  try {
    const docs = await fn();
    return { label, docs, count: docs.length, status: docs.length > 0 ? 'ok' : 'empty' };
  } catch (err) {
    console.warn(`[RAG] ${label} failed:`, err.message);
    return { label, docs: [], count: 0, status: 'error' };
  }
}

const _skipped = (label) => ({ label, docs: [], count: 0, status: 'skipped' });

/**
 * Full RAG retrieval for a customer chat / copilot query.
 *
 * Context sources (in priority order for the LLM):
 *   1. Customer profile embeddings         (4 chunks)
 *   2. Meeting notes embeddings            (2 chunks)
 *   3. Product catalog embeddings          (3 chunks)
 *   4. Prior AI analysis history           (2 chunks)
 *
 * Total: up to 11 context chunks injected into the prompt.
 *
 * @param {string} query
 * @param {string} customerId
 * @returns {Promise<{ docs: string[], sources: object, totalDocs: number, failCount: number }>}
 */
async function retrieveForCopilot(query, customerId) {
  const [profile, notes, products, history] = await Promise.all([
    customerId
      ? _safeSource('Profil Nasabah',    () => _execCustomerContext(query, customerId, 4))
      : _skipped('Profil Nasabah'),
    customerId
      ? _safeSource('Catatan Meeting',   () => _execMeetingNotes(query, customerId, 2))
      : _skipped('Catatan Meeting'),
    _safeSource('Katalog Produk',        () => _execProducts(query, 3)),
    customerId
      ? _safeSource('Historis Analisis', () => _execAnalysisHistory(query, customerId, 5))
      : _skipped('Historis Analisis'),
  ]);

  const docs      = [...profile.docs, ...notes.docs, ...products.docs, ...history.docs];
  const sources   = { profile, notes, products, history };
  const failCount = [profile, notes, products, history].filter(s => s.status === 'error').length;

  return { docs, sources, totalDocs: docs.length, failCount };
}

module.exports = {
  searchCustomerContext,
  searchMeetingNotes,
  searchProducts,
  searchMarketContext,
  searchAnalysisHistory,
  retrieveForCopilot,
};
