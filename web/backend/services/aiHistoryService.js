'use strict';
/**
 * aiHistoryService.js
 * CRUD for AI_ANALYSIS_HISTORY + async vector embedding into AI_HISTORY_EMBEDDINGS.
 *
 * Defensive design:
 *  - embeddingService is lazy-required (inside _embedAndStore) so a missing OCI
 *    package or unconfigured OCI never prevents the route from loading.
 *  - save() first tries the INSERT with RESULT_SNIPPET (migration 04); if Oracle
 *    returns ORA-00904 (column not yet in schema), it retries without that column.
 *    Either way the analysis is stored; the snippet just won't be pre-populated
 *    until migration 04 has been applied.
 */

const db       = require('../config/database');
const oracledb = require('oracledb');
const crypto   = require('crypto');

// ORA- error numbers we handle gracefully
const ORA_INVALID_COLUMN = 904;   // ORA-00904: invalid identifier (column doesn't exist yet)

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// Build the text content that will be embedded for vector search.
// Format: "[module]\nTitle\n---\nsnippet"
// ---------------------------------------------------------------------------
function _buildEmbedContent(module, title, snippet) {
  return [
    module ? `[${module}]` : '',
    title  || '',
    '---',
    snippet || '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Generate embedding and store in AI_HISTORY_EMBEDDINGS.
// embeddingService is lazy-required so the whole module loads even when OCI
// packages are absent or OCI credentials are not yet configured.
// ---------------------------------------------------------------------------
async function _embedAndStore(historyId, customerId, module, title, snippet) {
  let embedDocument;
  try {
    // Lazy require — only resolved when first called, NOT at module load time.
    embedDocument = require('./embeddingService').embedDocument;
  } catch (loadErr) {
    console.warn('[aiHistorySvc] embeddingService unavailable (OCI packages not installed):', loadErr.message);
    return;
  }

  const content = _buildEmbedContent(module, title, snippet);

  const vec    = await embedDocument(content);
  const vecStr = '[' + vec.join(',') + ']';
  const model  = process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0';

  await db.execute(
    `INSERT INTO AI_HISTORY_EMBEDDINGS
       (HISTORY_ID, CUSTOMER_ID, MODULE, CONTENT, EMBEDDING, MODEL_USED)
     VALUES (:1, :2, :3, :4, TO_VECTOR(:5, 1024, FLOAT32), :6)`,
    [historyId, customerId || null, module || null, content, vecStr, model],
    { autoCommit: true }
  );
}

// ---------------------------------------------------------------------------
// Save a new analysis result.
// Returns the new HISTORY_ID (string) or null on error.
// ---------------------------------------------------------------------------
async function save({ module, userId, customerId, entityId, title, result }) {
  if (!result || !result.trim()) return null;

  const historyId = newId().toUpperCase();
  const snippet   = result.slice(0, 800);

  // ── Try INSERT with RESULT_SNIPPET (requires migration 04) ────────────────
  let saved = false;
  try {
    await db.execute(
      `INSERT INTO AI_ANALYSIS_HISTORY
         (HISTORY_ID, MODULE, USER_ID, CUSTOMER_ID, ENTITY_ID, TITLE, RESULT, RESULT_SNIPPET)
       VALUES (:1, :2, :3, :4, :5, :6, :7, :8)`,
      [
        historyId,
        module        || 'unknown',
        userId        || null,
        customerId    || null,
        entityId      || null,
        (title || '').slice(0, 500),
        { val: result, type: oracledb.CLOB },
        snippet,
      ],
      { autoCommit: true }
    );
    saved = true;
  } catch (err) {
    if (err.errorNum === ORA_INVALID_COLUMN) {
      // Migration 04 not yet applied — RESULT_SNIPPET column doesn't exist.
      // Silently retry without it so saves still work.
    } else {
      console.error('[aiHistorySvc] save error:', err.message);
      return null;
    }
  }

  // ── Fallback INSERT without RESULT_SNIPPET (pre-migration 04) ─────────────
  if (!saved) {
    try {
      await db.execute(
        `INSERT INTO AI_ANALYSIS_HISTORY
           (HISTORY_ID, MODULE, USER_ID, CUSTOMER_ID, ENTITY_ID, TITLE, RESULT)
         VALUES (:1, :2, :3, :4, :5, :6, :7)`,
        [
          historyId,
          module        || 'unknown',
          userId        || null,
          customerId    || null,
          entityId      || null,
          (title || '').slice(0, 500),
          { val: result, type: oracledb.CLOB },
        ],
        { autoCommit: true }
      );
    } catch (err) {
      console.error('[aiHistorySvc] save fallback error:', err.message);
      return null;
    }
  }

  // ── Fire-and-forget embedding (OCI optional) ──────────────────────────────
  // A failed embed never crashes the analysis stream.
  _embedAndStore(historyId, customerId, module, title, snippet).catch(err =>
    console.warn('[aiHistorySvc] embed skipped:', err.message)
  );

  return historyId;
}

// ---------------------------------------------------------------------------
// List history for a user (optionally filtered by module / customerId).
// RESULT_SNIPPET is used when available; falls back to SUBSTR(RESULT,1,300)
// for rows saved before migration 04 was applied.
// ---------------------------------------------------------------------------
async function list({ userId, module, customerId, limit = 30 }) {
  try {
    const binds = [userId];
    let   where = 'WHERE USER_ID = :1';
    let   pIdx  = 2;

    if (module) {
      where += ` AND MODULE = :${pIdx}`;
      binds.push(module);
      pIdx++;
    }
    if (customerId) {
      where += ` AND CUSTOMER_ID = :${pIdx}`;
      binds.push(customerId);
      pIdx++;
    }
    binds.push(Math.min(limit, 100));

    // Use NVL so the query works whether or not migration 04 has been applied.
    // If RESULT_SNIPPET column doesn't exist, fall back to the SUBSTR variant.
    let sql;
    try {
      sql = `
        SELECT HISTORY_ID, MODULE, USER_ID, CUSTOMER_ID, ENTITY_ID, TITLE,
               NVL(RESULT_SNIPPET, SUBSTR(RESULT, 1, 300)) AS RESULT_PREVIEW,
               TO_CHAR(RUN_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS RUN_AT
          FROM AI_ANALYSIS_HISTORY
        ${where}
        ORDER BY RUN_AT DESC
        FETCH FIRST :${pIdx} ROWS ONLY
      `;
      const rs = await db.execute(sql, binds);
      return rs.rows || [];
    } catch (err) {
      if (err.errorNum === ORA_INVALID_COLUMN) {
        // RESULT_SNIPPET column not yet in schema — use plain SUBSTR
        sql = `
          SELECT HISTORY_ID, MODULE, USER_ID, CUSTOMER_ID, ENTITY_ID, TITLE,
                 SUBSTR(RESULT, 1, 300) AS RESULT_PREVIEW,
                 TO_CHAR(RUN_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS RUN_AT
            FROM AI_ANALYSIS_HISTORY
          ${where}
          ORDER BY RUN_AT DESC
          FETCH FIRST :${pIdx} ROWS ONLY
        `;
        const rs2 = await db.execute(sql, binds);
        return rs2.rows || [];
      }
      throw err;
    }
  } catch (err) {
    console.error('[aiHistorySvc] list error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get a single history record with full RESULT text.
// ---------------------------------------------------------------------------
async function getById(historyId, userId) {
  try {
    const rs = await db.execute(
      `SELECT HISTORY_ID, MODULE, USER_ID, CUSTOMER_ID, ENTITY_ID, TITLE, RESULT,
              TO_CHAR(RUN_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS RUN_AT
         FROM AI_ANALYSIS_HISTORY
        WHERE HISTORY_ID = :1 AND USER_ID = :2`,
      [historyId, userId]
    );
    return rs.rows?.[0] || null;
  } catch (err) {
    console.error('[aiHistorySvc] getById error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete a history record (only owner can delete).
// ON DELETE CASCADE on AI_HISTORY_EMBEDDINGS removes the embedding automatically.
// ---------------------------------------------------------------------------
async function remove(historyId, userId) {
  try {
    const rs = await db.execute(
      'DELETE FROM AI_ANALYSIS_HISTORY WHERE HISTORY_ID = :1 AND USER_ID = :2',
      [historyId, userId],
      { autoCommit: true }
    );
    return rs.rowsAffected === 1;
  } catch (err) {
    console.error('[aiHistorySvc] remove error:', err.message);
    return false;
  }
}

module.exports = { save, list, getById, remove };
