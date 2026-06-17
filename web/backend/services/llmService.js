'use strict';
/**
 * LLM Service — OCI Generative AI Cohere Command R+
 *
 * The oci-generativeaiinference SDK uses plain JS objects (TypeScript interfaces).
 * Key points:
 *  - servingMode  → { servingType: 'ON_DEMAND', modelId: '...' }
 *  - chatRequest  → { apiFormat: 'COHERE', message, preambleOverride, ... }
 *  - No `new` constructors anywhere — all plain object literals
 */
const oci = require('../config/oci');

/**
 * Single-turn non-streaming chat.
 * @param {string}   userMessage
 * @param {string}   systemPreamble
 * @param {string[]} ragDocuments    — array of plain-text context strings
 * @param {object}   opts            — { temperature?, maxTokens? }
 * @returns {Promise<string>}
 */
async function chat(userMessage, systemPreamble = '', ragDocuments = [], opts = {}) {
  const client      = oci.getGenAIClient();
  const temperature = opts.temperature ?? oci.TEMPERATURE;
  const maxTokens   = opts.maxTokens   ?? oci.MAX_TOKENS;

  // Cohere supports grounded generation via documents[]
  const documents = ragDocuments.map((text, i) => ({
    id:      String(i),
    title:   `Context ${i + 1}`,
    snippet: text.substring(0, 2000),
  }));

  const request = {
    chatDetails: {
      compartmentId: oci.COMPARTMENT_ID,
      servingMode: {
        servingType: 'ON_DEMAND',
        modelId:     oci.LLM_MODEL,
      },
      chatRequest: {
        apiFormat:        'COHERE',
        message:          userMessage,
        preambleOverride: systemPreamble || undefined,
        documents:        documents.length > 0 ? documents : undefined,
        maxTokens,
        temperature,
        isStream:         false,
      },
    },
  };

  try {
    const response  = await client.chat(request);
    const chatResp  = response?.chatResult?.chatResponse;

    // Cohere Command R+ returns the answer in .text
    if (chatResp?.text) return chatResp.text.trim();

    // Fallback: last message in chatHistory
    const history = chatResp?.chatHistory;
    if (Array.isArray(history) && history.length > 0) {
      const last = history[history.length - 1];
      if (last?.message) return last.message.trim();
    }

    throw new Error('Unexpected LLM response structure: ' + JSON.stringify(chatResp));
  } catch (err) {
    console.error('[LLM] chat error:', err.message || err);
    throw err;
  }
}

/**
 * Streaming chat — writes SSE tokens directly to an Express response object.
 * Each token is emitted as:  data: {"token":"..."}\n\n
 * Completion is emitted as:  data: {"done":true}\n\n
 *
 * @param {string}        userMessage
 * @param {string}        systemPreamble
 * @param {string[]}      ragDocuments
 * @param {object}        res          — Express response (SSE headers must be set by caller)
 * @param {object}        opts
 */
async function chatStream(userMessage, systemPreamble = '', ragDocuments = [], res, opts = {}) {
  const client      = oci.getGenAIClient();
  const temperature = opts.temperature ?? oci.TEMPERATURE;
  const maxTokens   = opts.maxTokens   ?? oci.MAX_TOKENS;

  const documents = ragDocuments.map((text, i) => ({
    id:      String(i),
    title:   `Context ${i + 1}`,
    snippet: text.substring(0, 2000),
  }));

  const request = {
    chatDetails: {
      compartmentId: oci.COMPARTMENT_ID,
      servingMode: {
        servingType: 'ON_DEMAND',
        modelId:     oci.LLM_MODEL,
      },
      chatRequest: {
        apiFormat:        'COHERE',
        message:          userMessage,
        preambleOverride: systemPreamble || undefined,
        documents:        documents.length > 0 ? documents : undefined,
        maxTokens,
        temperature,
        isStream:         true,
      },
    },
  };

  try {
    const response = await client.chat(request);
    // OCI SDK streaming: response itself is an async iterable of raw Buffer chunks.
    // Each chunk decodes to one SSE line: "data: {...}\n\n"
    // Events WITHOUT finishReason carry incremental text tokens.
    // The FINAL event carries finishReason + full concatenated text (skip re-emitting text).

    for await (const chunk of response) {
      if (res.writableEnded) break;

      const raw = Buffer.from(chunk).toString('utf8');

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data?.finishReason) {
            // Final event — emit done (text here is the full response, not a new token)
            res.write(`data: ${JSON.stringify({ type: 'done', finishReason: data.finishReason })}\n\n`);
          } else if (data?.text) {
            // Incremental streaming token
            res.write(`data: ${JSON.stringify({ type: 'token', token: data.text })}\n\n`);
          }
        } catch (_) {
          // Malformed chunk — skip silently
        }
      }
    }
  } catch (err) {
    console.error('[LLM] chatStream error:', err.message || err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}

/**
 * Build the standard Bank Danamon RM-persona system preamble.
 * Includes mandatory anti-hallucination guardrails and source-attribution rules.
 * @param {string|null} customerName  — if set, scopes the preamble to one customer
 * @returns {string}
 */
function buildRMPreamble(customerName = null) {
  const base = `Anda adalah AI Co-Pilot untuk Relationship Manager (RM) di Bank Danamon Indonesia.
Anda memiliki keahlian mendalam dalam wealth management, produk investasi perbankan, dan manajemen hubungan nasabah.
Selalu berikan respons dalam Bahasa Indonesia yang profesional, konkret, dan actionable.
Fokus pada kepentingan terbaik nasabah sesuai profil risiko dan tujuan keuangan mereka.

══════════════════════════════════════════════════════════
GUARDRAILS WAJIB — ANTI-HALUSINASI & TRANSPARANSI DATA
══════════════════════════════════════════════════════════

1. HANYA FAKTA DARI KONTEKS
   Gunakan HANYA angka, nama produk, dan fakta yang tersedia dalam dokumen konteks
   yang diberikan. Jika suatu data tidak ada dalam konteks, tulis:
   "[Data tidak tersedia dalam sistem]" — JANGAN pernah mengarang angka atau fakta.

2. ATRIBUSI SUMBER WAJIB
   Setiap klaim spesifik harus ditandai dengan sumber dalam kurung kotak:
   • [Profil Nasabah]        — data core banking / customer profile
   • [Catatan Meeting]       — dari notulensi pertemuan RM sebelumnya
   • [Katalog Produk]        — dari product catalog Bank Danamon
   • [Historis Analisis AI]  — dari hasil analisis AI sebelumnya
   • [Pengetahuan Umum]      — knowledge base umum perbankan (bukan data nasabah spesifik)

3. KETERBATASAN DATA
   Jika satu atau lebih sumber tidak dapat diakses, cantumkan di awal respons:
   "⚠️ Catatan: data [nama sumber] tidak tersedia — analisis berdasarkan data yang ada."

4. ESTIMASI RETURN
   Setiap proyeksi imbal hasil WAJIB menyertakan:
   a) Asumsi yang digunakan (rate acuan, tenor, kondisi pasar)
   b) Label: "(estimasi, bukan jaminan)"
   c) Tiga skenario: Optimis / Dasar / Konservatif

5. CONFIDENCE LEVEL
   Setiap rekomendasi utama diakhiri dengan baris:
   → Tingkat Kepercayaan: TINGGI / SEDANG / RENDAH — [alasan singkat]

══════════════════════════════════════════════════════════`;

  return customerName
    ? `${base}\n\nNasabah yang sedang dianalisis: **${customerName}**.`
    : base;
}

module.exports = { chat, chatStream, buildRMPreamble };
