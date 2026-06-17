'use strict';
/**
 * Portfolio Analysis Routes — /api/portfolio
 *
 * POST /:customerId/analysis          — SSE stream LLM analysis (auto-saves to DB)
 * GET  /:customerId/reports           — List saved analyses
 * GET  /:customerId/reports/:id       — Single report detail (analysis text)
 * GET  /:customerId/reports/:id/docx  — Generate + download DOCX
 * DELETE /:customerId/reports/:id     — Archive a report
 */
const express         = require('express');
const oracledb        = require('oracledb');
const { requireAuth }       = require('../middleware/auth');
const { asyncHandler }      = require('../middleware/errorHandler');
const db              = require('../config/database');
const llm             = require('../services/llmService');
const pmSvc           = require('../services/productManagementService');
const audit           = require('../services/auditService');
const reportSvc       = require('../services/portfolioReportService');

const router = express.Router();

/* ── helpers ─────────────────────────────────────────────────────────── */
const fmtRp = v => {
  v = Math.round(v || 0);
  if (v >= 1e12) return `Rp ${(v/1e12).toFixed(2)} Triliun`;
  if (v >= 1e9)  return `Rp ${(v/1e9).toFixed(2)} Miliar`;
  if (v >= 1e6)  return `Rp ${Math.round(v/1e6)} Juta`;
  if (v >= 1e3)  return `Rp ${Math.round(v/1e3)} Ribu`;
  return `Rp ${v.toLocaleString('id-ID')}`;
};
const pct = (part, total) =>
  total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '—';

/* ── SSE capture helper ──────────────────────────────────────────────── */
function captureStream(res, onComplete) {
  let acc = '';
  const origWrite = res.write.bind(res);
  const origEnd   = res.end.bind(res);
  res.write = function () {
    try {
      const s = Buffer.isBuffer(arguments[0])
        ? arguments[0].toString('utf8') : String(arguments[0] || '');
      for (const ln of s.split('\n')) {
        if (!ln.startsWith('data: ')) continue;
        try { const d = JSON.parse(ln.slice(6)); if (d.token) acc += d.token; } catch (_) {}
      }
    } catch (_) {}
    return origWrite.apply(null, arguments);
  };
  res.end = function () {
    if (acc.trim() && onComplete) onComplete(acc).catch(e => console.error('[PAI cap]', e.message));
    return origEnd.apply(null, arguments);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   POST /:customerId/analysis
   SSE stream — auto-saves result to PORTFOLIO_AI_REPORTS
═══════════════════════════════════════════════════════════════════════ */
router.post('/:customerId/analysis', requireAuth, (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { customerId } = req.params;
  const rmUserId = req.user.userId;

  audit.log(rmUserId, 'PORTFOLIO_AI_ANALYSIS', 'CUSTOMER', customerId, {}, req.ip).catch(() => {});

  (async () => {
    try {
      /* 1. Customer info */
      const custRow = await db.execute(
        `SELECT FULL_NAME, TIER, RISK_PROFILE FROM CUSTOMERS WHERE CUSTOMER_ID = :1`,
        [customerId]
      );
      const cust     = custRow.rows?.[0] || {};
      const custName = cust.FULL_NAME || customerId;

      /* 2. Forecast data */
      const forecast = await pmSvc.getPortfolioForecast(customerId);
      const { products = [], total = [], total_net = [], quarters = [] } = forecast;

      if (!products.length) {
        res.write(`data: ${JSON.stringify({ token: 'Tidak ada data produk aktif untuk dianalisis.' })}\n\n`);
        return res.end();
      }

      /* 3. Active alerts (for context + DOCX later) */
      const alertsResult = await db.execute(
        `SELECT ALERT_ID, ALERT_TYPE, TITLE, SEVERITY, DESCRIPTION, STATUS
           FROM ALERTS
          WHERE CUSTOMER_ID = :1 AND STATUS = 'active'
          ORDER BY SEVERITY DESC, CREATED_AT DESC
          FETCH FIRST 20 ROWS ONLY`,
        [customerId]
      ).catch(() => ({ rows: [] }));
      const alerts = alertsResult.rows || [];

      /* 4. Build prompt context */
      const totalFinal = total[total.length - 1]     || 0;
      const netFinal   = total_net[total_net.length - 1] || totalFinal;
      const totalPokok = products.reduce((s, p) => s + (p.amount || 0), 0);
      const overallReturn = totalPokok > 0
        ? (((netFinal - totalPokok) / totalPokok) * 100).toFixed(2) + '%' : '—';

      const prodTable = products.map(p => {
        const q4    = p.cumulative?.[3]     || 0;
        const q4net = p.net_cumulative?.[3] || q4;
        const hiVal = p.cumulative_high?.[3];
        const loVal = p.cumulative_low?.[3];
        const riskCategory = p.isEquity ? 'Tinggi (Saham)'
          : p.isBond     ? 'Sedang (Obligasi)'
          : p.isMF       ? 'Sedang (Reksa Dana)'
          : p.isDeposito ? 'Rendah (Deposito)'
          : 'Sedang';
        return [
          `Produk: ${p.name}`,
          `  Kategori: ${p.category||'Lainnya'} | Risiko: ${riskCategory}`,
          `  Pokok: ${fmtRp(p.amount)} | Rate: ${p.rate}% p.a.`,
          `  Nilai Akhir (${quarters[3]}): ${fmtRp(q4)}${q4net!==q4?` | Neto: ${fmtRp(q4net)}`:''}`,
          `  Kontribusi: ${pct(q4,totalFinal)}`,
          `  Pertumbuhan: ${fmtRp(p.cumulative?.[0]||0)} → ${fmtRp(q4)}`,
          hiVal ? `  Skenario: Optimis ${fmtRp(hiVal)} / Konservatif ${fmtRp(loVal)}` : '',
          p.maturityDate ? `  Jatuh Tempo: ${p.maturityDate}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n');

      const quarterlyTotal = quarters.map((q,i) =>
        `  ${q}: Bruto ${fmtRp(total[i])} | Neto ${fmtRp(total_net[i])}`
      ).join('\n');

      const alertSummary = alerts.length
        ? alerts.map(a => `  [${a.SEVERITY?.toUpperCase()}] ${a.ALERT_TYPE}: ${a.TITLE}`).join('\n')
        : '  Tidak ada alert aktif';

      const userPrompt =
`Analisis portofolio investasi berikut dan buat RINGKASAN EKSEKUTIF lengkap.

=== DATA NASABAH ===
Nama: ${custName}
Tier: ${cust.TIER || 'N/A'}
Profil Risiko: ${cust.RISK_PROFILE || 'Moderat'}
Jumlah Produk Aktif: ${products.length}

=== ALERT AKTIF ===
${alertSummary}

=== TOTAL POKOK INVESTASI ===
${fmtRp(totalPokok)}

=== DETAIL PRODUK ===
${prodTable}

=== TOTAL PER KUARTAL ===
${quarterlyTotal}
Total Akhir Bruto: ${fmtRp(totalFinal)}
Total Akhir Neto : ${fmtRp(netFinal)}
Return overall   : ${overallReturn}

=== CATATAN TEKNIS ===
- Reksa Dana: bunga majemuk bulanan${products.some(p=>p.isMF)?' ✓':' (tidak ada)'}
- Deposito: bunga sederhana + PPh 20%${products.some(p=>p.isDeposito)?' ✓':' (tidak ada)'}
- Skenario Bull/Bear: ${products.some(p=>p.cumulative_high)?'Ya':'Tidak'}

---

Buat ringkasan eksekutif PERSIS format berikut:

## Gambaran Umum
[3–4 kalimat: tujuan portofolio, karakteristik umum, total akumulasi neto, produk kontribusi terbesar/terkecil]

## Analisis Per Produk
| Produk | Nilai Akhir | Kontribusi | Risiko | Insight |
|--------|-------------|------------|--------|---------|
[satu baris per produk]

## Analisis Pertumbuhan
[3–4 kalimat: tren ${quarters[0]}→${quarters[3]}, instrumen pendorong utama]

## Diversifikasi Portofolio
[3–4 kalimat: tingkat diversifikasi, konsentrasi risiko, keseimbangan konservatif vs agresif]

## Insight Strategis
- [Kelebihan utama #1]
- [Kelebihan utama #2]
- [Risiko atau perhatian #1]
- [Risiko atau perhatian #2]
- [Rekomendasi untuk investor profil risiko moderat]

## Kesimpulan
[4–5 kalimat: ringkasan poin terpenting, kelebihan, risiko, rekomendasi utama untuk investor moderat]`;

      const systemPrompt = llm.buildRMPreamble(custName) + `

Anda membuat ringkasan eksekutif portofolio dari data Oracle yang akurat.
WAJIB: Gunakan angka persis dari data. Jangan mengarang angka.
WAJIB: Format markdown: ## heading, tabel pipe |, bullet -.
Bahasa Indonesia profesional, mudah dipahami investor awam maupun profesional.
Jangan tambahkan heading di luar yang diminta.`;

      /* 5. Auto-save after stream completes */
      const forecastSnap = JSON.stringify({ products, total, total_net, quarters });
      const alertsSnap   = JSON.stringify(alerts);
      const custSnap     = JSON.stringify(cust);
      const title        = `Analisis Portofolio — ${custName} — ${new Date().toLocaleDateString('id-ID')}`;

      captureStream(res, async (analysisText) => {
        try {
          const result = await db.execute(
            `BEGIN SP_SAVE_PORTFOLIO_ANALYSIS(
               :custId, :rmId, :title,
               :analysis, :forecast, :alertsJ, :custJ,
               :rid
             ); END;`,
            {
              custId:   customerId,
              rmId:     rmUserId,
              title:    title,
              analysis: { val: analysisText, type: oracledb.CLOB },
              forecast: { val: forecastSnap, type: oracledb.CLOB },
              alertsJ:  { val: alertsSnap,   type: oracledb.CLOB },
              custJ:    { val: custSnap,      type: oracledb.CLOB },
              rid:      { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
            }
          );
          const reportId = result.outBinds?.rid;
          console.log(`[PAI] saved report ${reportId} for ${customerId}`);
          // emit report_id to client via SSE (append before end)
        } catch (saveErr) {
          console.error('[PAI] save error:', saveErr.message);
        }
      });

      /* 6. Stream */
      await llm.chatStream(userPrompt, systemPrompt, [], res, { maxTokens: 2200 });

    } catch (err) {
      console.error('[PortfolioAnalysis] error:', err.message || err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Analisis gagal: ' + err.message })}\n\n`);
        res.end();
      }
    }
  })();
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /:customerId/reports
   List saved analyses for this customer (RM-scoped)
═══════════════════════════════════════════════════════════════════════ */
router.get('/:customerId/reports', requireAuth, asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const rmUserId = req.user.userId;
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  const result = await db.execute(
    `SELECT REPORT_ID, CUSTOMER_ID, RM_USER_ID,
            REPORT_TITLE, REPORT_STATUS, CREATED_FMT, CREATED_AT,
            CUSTOMER_NAME, TIER, RISK_PROFILE, RM_NAME
       FROM V_PORTFOLIO_REPORTS
      WHERE CUSTOMER_ID = :1
        AND RM_USER_ID  = :2
        AND REPORT_STATUS != 'ARCHIVED'
      ORDER BY CREATED_AT DESC
      FETCH FIRST :3 ROWS ONLY`,
    [customerId, rmUserId, limit]
  );

  res.json({ reports: result.rows || [], total: (result.rows || []).length });
}));

/* ═══════════════════════════════════════════════════════════════════════
   GET /:customerId/reports/:reportId
   Single report — includes analysis text
═══════════════════════════════════════════════════════════════════════ */
router.get('/:customerId/reports/:reportId', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, reportId } = req.params;
  const rmUserId = req.user.userId;

  const result = await db.execute(
    `SELECT r.REPORT_ID, r.CUSTOMER_ID, r.RM_USER_ID,
            r.REPORT_TITLE, r.ANALYSIS_TEXT, r.FORECAST_JSON,
            r.ALERTS_JSON, r.CUSTOMER_JSON,
            r.REPORT_STATUS,
            TO_CHAR(r.CREATED_AT,'DD Mon YYYY HH24:MI') AS CREATED_FMT
       FROM PORTFOLIO_AI_REPORTS r
      WHERE r.REPORT_ID   = :1
        AND r.CUSTOMER_ID = :2
        AND r.RM_USER_ID  = :3`,
    [Number(reportId), customerId, rmUserId],
    { fetchInfo: {
      ANALYSIS_TEXT: { type: oracledb.STRING },
      FORECAST_JSON: { type: oracledb.STRING },
      ALERTS_JSON:   { type: oracledb.STRING },
      CUSTOMER_JSON: { type: oracledb.STRING },
    }}
  );

  const row = result.rows?.[0];
  if (!row) return res.status(404).json({ error: 'Report tidak ditemukan' });

  res.json({ report: row });
}));

/* ═══════════════════════════════════════════════════════════════════════
   GET /:customerId/reports/:reportId/docx
   Generate DOCX on the fly and stream to client
═══════════════════════════════════════════════════════════════════════ */
router.get('/:customerId/reports/:reportId/docx', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, reportId } = req.params;
  const rmUserId = req.user.userId;

  /* Load report */
  const result = await db.execute(
    `SELECT r.REPORT_ID, r.REPORT_TITLE, r.ANALYSIS_TEXT,
            r.FORECAST_JSON, r.ALERTS_JSON, r.CUSTOMER_JSON,
            TO_CHAR(r.CREATED_AT,'YYYY-MM-DD') AS CREATED_DATE,
            u.FULL_NAME AS RM_NAME
       FROM PORTFOLIO_AI_REPORTS r
       LEFT JOIN RM_USERS u ON r.RM_USER_ID = u.USER_ID
      WHERE r.REPORT_ID   = :1
        AND r.CUSTOMER_ID = :2
        AND r.RM_USER_ID  = :3`,
    [Number(reportId), customerId, rmUserId],
    { fetchInfo: {
      ANALYSIS_TEXT: { type: oracledb.STRING },
      FORECAST_JSON: { type: oracledb.STRING },
      ALERTS_JSON:   { type: oracledb.STRING },
      CUSTOMER_JSON: { type: oracledb.STRING },
    }}
  );

  const row = result.rows?.[0];
  if (!row) return res.status(404).json({ error: 'Report tidak ditemukan' });

  /* Parse stored JSON snapshots */
  let forecast  = {};
  let alerts    = [];
  let customer  = {};
  try { forecast = JSON.parse(row.FORECAST_JSON || '{}'); } catch (_) {}
  try { alerts   = JSON.parse(row.ALERTS_JSON   || '[]'); } catch (_) {}
  try { customer = JSON.parse(row.CUSTOMER_JSON  || '{}'); } catch (_) {}

  /* Generate DOCX buffer */
  const buf = await reportSvc.generateDocx({
    customer,
    forecast,
    alerts,
    analysis: row.ANALYSIS_TEXT || '',
    rmName:   row.RM_NAME || rmUserId,
    reportId: row.REPORT_ID,
  });

  /* Update status → DOWNLOADED */
  db.execute(
    `BEGIN SP_UPDATE_REPORT_STATUS(:id, 'DOWNLOADED'); END;`,
    { id: Number(reportId) }
  ).catch(() => {});

  audit.log(rmUserId, 'DOWNLOAD_PORTFOLIO_REPORT', 'CUSTOMER', customerId,
    { reportId: row.REPORT_ID }, req.ip).catch(() => {});

  /* Filename */
  const custName = customer.FULL_NAME || customerId;
  const safeName = custName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 30);
  const dateStr  = (row.CREATED_DATE || new Date().toISOString().slice(0,10)).replace(/-/g,'');
  const filename = `Laporan_Portofolio_${safeName}_${dateStr}.docx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}));

/* ═══════════════════════════════════════════════════════════════════════
   DELETE /:customerId/reports/:reportId
   Archive (soft-delete) a report
═══════════════════════════════════════════════════════════════════════ */
router.delete('/:customerId/reports/:reportId', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, reportId } = req.params;
  const rmUserId = req.user.userId;

  await db.execute(
    `UPDATE PORTFOLIO_AI_REPORTS
        SET REPORT_STATUS = 'ARCHIVED'
      WHERE REPORT_ID = :1 AND CUSTOMER_ID = :2 AND RM_USER_ID = :3`,
    [Number(reportId), customerId, rmUserId],
    { autoCommit: true }
  );

  res.json({ ok: true });
}));

module.exports = router;
