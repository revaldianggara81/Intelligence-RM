'use strict';
/**
 * PAF Alert MCP Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes alert analysis through PAF AI Studio, which uses Oracle Database as an
 * MCP (Model Context Protocol) server.
 *
 * When PAF_MCP_ENABLED=true the service:
 *   1. Sends a minimal prompt (with alert_id) to the PAF AI Studio agent
 *   2. The PAF agent autonomously queries Oracle DB via MCP tools:
 *        MCP_V_ALERT_DETAIL, MCP_V_CUSTOMER_PORTFOLIO, MCP_V_PRODUCT_PERFORMANCE
 *   3. Streams the structured analysis back to the client as SSE
 *
 * Falls back gracefully to direct LLM analysis if the endpoint is unavailable.
 *
 * Environment variables (add to .env):
 *   PAF_MCP_ENABLED         — 'true' to activate (default: false)
 *   PAF_MCP_AGENT_ENDPOINT  — Base URL of PAF AI Studio (e.g. https://host:8080)
 *   PAF_MCP_AGENT_ID        — Agent ID from PAF Studio > My Agents
 *   PAF_AUTH_USER           — PAF Studio username (shared with PAF_AUTH_USER)
 *   PAF_AUTH_PASS           — PAF Studio password (shared with PAF_AUTH_PASS)
 */

const https = require('https');
const http  = require('http');
const paf   = require('./pafService');
const db    = require('../config/database');

/* ── Stage labels visible in the UI timeline ─────────────────────────────── */
const STAGE_ENGINE  = 'PAF MCP Intelligence Engine';
const STAGE_DB      = 'Oracle DB MCP Tools';

/**
 * Analyze a portfolio alert using PAF AI Studio MCP agent.
 *
 * @param {string|number} alertId
 * @param {object}        res   — Express SSE response (already flushed with SSE headers)
 * @param {object}        opts  — { alertType, severity, customerName, rmUserId }
 * @returns {Promise<boolean>}  — true if handled, false to fall back to direct LLM
 */
async function analyzeWithMCP(alertId, res, opts = {}) {
  const baseUrl  = process.env.PAF_MCP_AGENT_ENDPOINT || '';
  const agentId  = process.env.PAF_MCP_AGENT_ID       || '';
  const authUser = process.env.PAF_AUTH_USER           || '';
  const authPass = process.env.PAF_AUTH_PASS           || '';

  if (!baseUrl || !agentId) {
    console.warn('[PAF-MCP] PAF_MCP_AGENT_ENDPOINT or PAF_MCP_AGENT_ID not configured — falling back');
    return false;
  }

  const t0 = Date.now();

  try {
    /* ── Stage 1: Notify client we're calling the MCP agent ─────────────── */
    paf.emitStage(res, STAGE_ENGINE, 'active',
      'Menghubungi Oracle AI Agent (MCP mode)...');

    const basicB64 = Buffer.from(`${authUser}:${authPass}`).toString('base64');
    const prompt   = _buildMCPPrompt(alertId, opts);

    const url  = `${baseUrl.replace(/\/$/, '')}/agentFactory/v1/agentBuilder/run/${agentId}`;
    const body = JSON.stringify({
      message: prompt,
      roomId:  `alert_mcp_${alertId}_${Date.now()}`,
      context: {
        alert_id:      String(alertId),
        alert_type:    opts.alertType    || '',
        severity:      opts.severity     || '',
        customer_name: opts.customerName || '',
        task:          'alert_intervention_analysis',
        version:       '2.0-mcp',
      },
    });

    /* ── Stage 2: PAF agent queries Oracle DB via MCP ────────────────────── */
    paf.emitStage(res, STAGE_DB, 'active',
      'Agent mengambil data nasabah & portofolio dari Oracle Database...');

    const data = await _callEndpoint(url, basicB64, body);
    const text = _extractText(data);

    if (!text || text.trim().length < 50) {
      console.warn('[PAF-MCP] Response too short or empty — falling back');
      return false;
    }

    /* ── Stage 3: Stream response to client ──────────────────────────────── */
    paf.emitStage(res, STAGE_DB,     'done', 'Data Oracle DB berhasil diambil via MCP');
    paf.emitStage(res, STAGE_ENGINE, 'done', 'Analisis AI selesai diproses');

    await _streamText(res, text);
    paf.emitDone(res);

    /* ── Audit: log to MCP_ANALYSIS_LOG (best-effort) ────────────────────── */
    _logAnalysis(alertId, opts.rmUserId, text, Date.now() - t0).catch(() => {});

    return true;

  } catch (err) {
    console.warn('[PAF-MCP] analyzeWithMCP error:', err.message, '— falling back to direct LLM');
    paf.emitStage(res, STAGE_ENGINE, 'error',
      `MCP tidak tersedia (${err.message.slice(0, 80)}) — beralih ke mode LLM langsung`);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PRIVATE HELPERS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Build the prompt sent to PAF AI Studio.
 * The agent is instructed to fetch its own context from Oracle DB via MCP views.
 */
function _buildMCPPrompt(alertId, opts = {}) {
  const severityMap = { high: 'KRITIS', medium: 'MENENGAH', low: 'RENDAH' };
  const sevLabel    = severityMap[opts.severity?.toLowerCase()] || opts.severity?.toUpperCase() || '—';

  return `Kamu adalah AI Advisor Senior Bank Danamon. Lakukan analisis lengkap untuk Portfolio Alert #${alertId}.

=== KONTEKS AWAL ===
Alert ID   : ${alertId}
Tipe Alert : ${opts.alertType    || '(ambil dari DB)'}
Severity   : ${sevLabel}
Nasabah    : ${opts.customerName || '(ambil dari DB)'}

=== INSTRUKSI PENGAMBILAN DATA (MCP Oracle DB Tools) ===
Sebelum membuat analisis, gunakan Oracle Database MCP tools untuk mengambil:

1. TOOL: query_sql
   SQL: SELECT * FROM MCP_V_ALERT_DETAIL WHERE ALERT_ID = ${alertId}
   → Untuk: detail alert lengkap, metrik yang dilanggar, profil nasabah

2. TOOL: query_sql
   SQL: SELECT * FROM MCP_V_CUSTOMER_PORTFOLIO WHERE CUSTOMER_ID = [CUSTOMER_ID dari langkah 1]
   → Untuk: semua holding aktif, return, nominal, hari ke jatuh tempo

3. TOOL: query_sql (opsional)
   SQL: SELECT * FROM MCP_V_PRODUCT_PERFORMANCE WHERE PRODUCT_ID IN
        (SELECT DISTINCT PRODUCT_ID FROM MCP_V_CUSTOMER_PORTFOLIO WHERE CUSTOMER_ID = [CUSTOMER_ID])
   → Untuk: performa vs benchmark produk yang dipegang nasabah

=== FORMAT OUTPUT WAJIB ===
Buat analisis dengan PERSIS format berikut (gunakan header markdown):

### 🚨 DASAR TRIGGER ALERT
Jelaskan MENGAPA alert ini ter-trigger:
- Metrik yang dilanggar: [nilai aktual] vs threshold [nilai threshold] — selisih [X]%
- Produk terdampak dan nilai exposure dalam Rupiah
- Justifikasi severity ${sevLabel}: mengapa ini dikategorikan demikian

### 📉 PENILAIAN DAMPAK
- **Dampak finansial:** Rp [X] ([Y]% dari total AUM)
- **Skala urgensi:** [KRITIS/TINGGI/SEDANG] — [alasan data-driven]
- **Risiko jika tidak ditindaklanjuti dalam 48 jam:** [proyeksi spesifik dengan angka]

### ✅ TINDAKAN SEGERA (0–48 Jam)
Urutan langkah konkret:
1. [Langkah 1 — kapan, via apa, pesan apa]
2. [Langkah 2]
3. [Langkah 3]

### 💡 REKOMENDASI PENYESUAIAN PORTOFOLIO
**[Nama Tindakan]** (Stop-loss / Rebalancing / Switch produk)
- **Mengapa:** [kaitkan ke data alert dan profil risiko nasabah]
- **Dari → Ke:** [produk/posisi saat ini → yang direkomendasikan]
- **Nominal:** Rp [X]
- **Proyeksi dampak:**
  - Skenario Terbaik: [outcome]
  - Skenario Dasar: [outcome]
  - Skenario Terburuk: [outcome jika tidak ditindaklanjuti]
- **Tingkat Kepercayaan:** [TINGGI/SEDANG/RENDAH] — [alasan]

### 📞 SCRIPT KOMUNIKASI RM
- **Pembukaan (empatik):** "..."
- **Penyampaian fakta (jelas, data-driven):** "..."
- **Transisi ke solusi (proaktif):** "..."
- **Penutup & CTA:** "..."

### 📅 FOLLOW-UP PLAN
| Waktu | Checkpoint | Tindakan jika kondisi memburuk |
|-------|-----------|-------------------------------|
| 24 jam | ... | ... |
| 3 hari | ... | ... |
| 1 minggu | ... | ... |
| 1 bulan | ... | ... |

### 📌 SUMBER DATA
[Sebutkan data apa saja yang berhasil diambil dari Oracle DB via MCP tools]

PENTING: Hanya gunakan angka dari data Oracle Database. Jangan mengarang nilai.`;
}

/**
 * Call the PAF AI Studio endpoint.
 * Uses the native https/http module to support self-signed certificates.
 */
function _callEndpoint(url, basicB64, body) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch (e) { return reject(new Error(`Invalid URL: ${url}`)); }

    const isHttps   = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyBuf   = Buffer.from(body, 'utf8');

    const options = {
      hostname:           parsedUrl.hostname,
      port:               parsedUrl.port || (isHttps ? 443 : 80),
      path:               parsedUrl.pathname + parsedUrl.search,
      method:             'POST',
      rejectUnauthorized: false,   // PAF Studio dev may use self-signed cert
      headers: {
        'Authorization':  `Basic ${basicB64}`,
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'Content-Length': bodyBuf.length,
      },
    };

    let raw = '';

    const req = transport.request(options, (httpRes) => {
      httpRes.setEncoding('utf8');
      httpRes.on('data',  chunk => { raw += chunk; });
      httpRes.on('end',  () => {
        if (httpRes.statusCode < 200 || httpRes.statusCode >= 300) {
          return reject(new Error(`HTTP ${httpRes.statusCode}: ${raw.slice(0, 300)}`));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          // Some PAF versions return plain text
          resolve({ message: raw });
        }
      });
      httpRes.on('error', reject);
    });

    // 2-minute timeout (MCP agent may take time querying multiple tables)
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error('PAF MCP request timeout after 120 s'));
    });

    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

/**
 * Extract the response text from various PAF response envelope formats.
 */
function _extractText(data) {
  if (typeof data === 'string') return data;
  return data?.message
    || data?.result
    || data?.answer
    || data?.output?.text
    || data?.text
    || data?.content
    || data?.response
    || '';
}

/**
 * Stream text to SSE response in word-level chunks for typewriter UX.
 * Paragraphs are emitted with a '\n' token between them.
 */
async function _streamText(res, text, chunkWords = 8) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].split(' ');
    let buf = '';
    for (const word of words) {
      buf += (buf ? ' ' : '') + word;
      if (buf.split(' ').length >= chunkWords) {
        paf.emitToken(res, buf);
        buf = '';
        await _delay(12);
      }
    }
    if (buf) paf.emitToken(res, buf);
    // Preserve line breaks
    paf.emitToken(res, '\n');
    await _delay(8);
  }
}

/** Async delay helper */
function _delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Persist analysis to MCP_ANALYSIS_LOG via the stored procedure.
 * Best-effort — never throws.
 */
async function _logAnalysis(alertId, rmUserId, analysisText, durationMs) {
  try {
    await db.execute(
      `BEGIN MCP_SP_LOG_ANALYSIS(:1, :2, :3, 'PAF_MCP', :4); END;`,
      [Number(alertId), rmUserId || null, analysisText, durationMs],
      { autoCommit: true }
    );
  } catch (err) {
    console.warn('[PAF-MCP] _logAnalysis failed (non-critical):', err.message);
  }
}

module.exports = { analyzeWithMCP };
