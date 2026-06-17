'use strict';
/**
 * callTranscriptService.js
 * CRUD + AI-summary helpers for CALL_CENTER_TRANSCRIPTS.
 */
const db       = require('../config/database');
const oracledb = require('oracledb');

const SENTIMENT_LABEL = { POSITIVE: '😊 Positif', NEUTRAL: '😐 Netral', NEGATIVE: '😟 Negatif' };
const CALL_TYPE_LABEL  = { INBOUND: '📞 Inbound', OUTBOUND: '📤 Outbound' };

// ---------------------------------------------------------------------------
// List transcripts for a customer (newest first)
// ---------------------------------------------------------------------------
async function getTranscripts(customerId, { limit = 20 } = {}) {
  const rs = await db.execute(
    `SELECT TRANSCRIPT_ID, CUSTOMER_ID,
            TO_CHAR(CALL_DATE,  'DD Mon YYYY') AS CALL_DATE_FMT,
            TO_CHAR(CREATED_AT, 'DD Mon YYYY HH24:MI') AS CREATED_AT_FMT,
            CALL_DURATION, AGENT_NAME, CALL_TYPE, TOPIC,
            TRANSCRIPT_TEXT, SENTIMENT, RESOLUTION
       FROM CALL_CENTER_TRANSCRIPTS
      WHERE CUSTOMER_ID = :1
      ORDER BY CALL_DATE DESC, TRANSCRIPT_ID DESC
      FETCH FIRST :2 ROWS ONLY`,
    [customerId, Math.min(limit, 50)]
  );
  return (rs.rows || []).map(r => ({
    ...r,
    SENTIMENT_LABEL: SENTIMENT_LABEL[r.SENTIMENT] || r.SENTIMENT || '—',
    CALL_TYPE_LABEL: CALL_TYPE_LABEL[r.CALL_TYPE]  || r.CALL_TYPE  || '—',
    DURATION_FMT:    r.CALL_DURATION
      ? `${Math.floor(r.CALL_DURATION / 60)}m ${r.CALL_DURATION % 60}s`
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Add a new transcript
// ---------------------------------------------------------------------------
async function addTranscript({ customerId, callDate, duration, agentName,
                               callType, topic, transcriptText, sentiment, resolution }) {
  await db.execute(
    `INSERT INTO CALL_CENTER_TRANSCRIPTS
       (CUSTOMER_ID, CALL_DATE, CALL_DURATION, AGENT_NAME, CALL_TYPE, TOPIC,
        TRANSCRIPT_TEXT, SENTIMENT, RESOLUTION)
     VALUES (:1, TO_DATE(:2,'YYYY-MM-DD'), :3, :4, :5, :6, :7, :8, :9)`,
    [
      customerId,
      callDate || new Date().toISOString().slice(0, 10),
      duration  || null,
      agentName || null,
      (callType || 'INBOUND').toUpperCase(),
      topic     || null,
      transcriptText,
      (sentiment || 'NEUTRAL').toUpperCase(),
      resolution || null,
    ],
    { autoCommit: true }
  );
}

// ---------------------------------------------------------------------------
// Build AI summary prompt from the N most-recent transcripts
// ---------------------------------------------------------------------------
async function buildSummaryPrompt(customerId, limit = 5) {
  const transcripts = await getTranscripts(customerId, { limit });
  if (!transcripts.length) return null;

  const blocks = transcripts.map((t, i) => `
--- Transcript ${i + 1} | ${t.CALL_DATE_FMT} | ${t.CALL_TYPE_LABEL} | Agen: ${t.AGENT_NAME || '—'} | Topik: ${t.TOPIC || '—'} | Sentimen: ${t.SENTIMENT_LABEL} ---
${t.TRANSCRIPT_TEXT}
Resolusi: ${t.RESOLUTION || '—'}
`).join('\n');

  return `Anda adalah AI asisten RM di Bank Danamon. Berikut adalah ${transcripts.length} transcript percakapan terbaru antara call center dengan nasabah ${customerId}.

${blocks}

Buatkan ringkasan komprehensif yang mencakup:

## 📋 Ringkasan Interaksi
Gambaran umum pola interaksi nasabah dengan call center (frekuensi, topik dominan, tren sentimen).

## ⚠️ Isu & Keluhan Utama
Daftar masalah atau keluhan yang diangkat nasabah beserta status resolusinya.

## 💡 Insight untuk RM
Poin-poin penting yang perlu diperhatikan RM dalam interaksi berikutnya dengan nasabah.

## ✅ Tindak Lanjut yang Disarankan
Rekomendasi konkret untuk RM berdasarkan riwayat percakapan call center.

Gunakan bahasa Indonesia yang profesional dan ringkas.`;
}

module.exports = { getTranscripts, addTranscript, buildSummaryPrompt };
