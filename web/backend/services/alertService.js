'use strict';
/**
 * Alert Service — Scenario 3: Portfolio Alert System
 * Detects threshold breaches, calls LLM for intervention strategy,
 * streams analysis back to the client.
 *
 * Analysis routing:
 *   PAF_MCP_ENABLED=true  → PAF AI Studio agent with Oracle DB MCP tools
 *   PAF_MCP_ENABLED=false → Direct OCI GenAI (Cohere) with pre-fetched context
 */
const db     = require('../config/database');
const llm    = require('./llmService');
const rag    = require('./ragService');
const paf    = require('./pafService');
const mcpSvc = require('./pafAlertMCPService');

/** Get all open alerts for an RM's customers, filtered by subscription preferences */
async function getOpenAlerts(rmUserId) {
  const result = await db.execute(
    `WITH USER_SUBS AS (
       SELECT ALERT_TYPE, IS_ACTIVE, CUSTOMER_SEGMENTS, SEVERITY_FILTER
         FROM RM_ALERT_SUBSCRIPTIONS
        WHERE RM_USER_ID = :1
     )
     SELECT
       a.ALERT_ID, a.CUSTOMER_ID, a.ALERT_TYPE, a.SEVERITY,
       a.TITLE, a.MESSAGE, a.METRIC_KEY, a.METRIC_VALUE, a.THRESHOLD,
       a.STATUS, a.TRIGGERED_AT,
       c.FULL_NAME, c.INITIALS, c.AVATAR_COLOR, c.TIER, c.TIER_LABEL,
       c.RISK_PROFILE, c.TOTAL_AUM
     FROM ALERTS a
     JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
    WHERE c.RM_USER_ID = :2
      AND a.STATUS = 'Open'
      -- Subscription filter (opt-out model: no row = fully subscribed)
      AND (
        -- No subscription row for this alert type → show by default
        NOT EXISTS (SELECT 1 FROM USER_SUBS s WHERE s.ALERT_TYPE = a.ALERT_TYPE)
        OR
        -- Subscription row active, segment matches, severity passes
        EXISTS (
          SELECT 1 FROM USER_SUBS s
           WHERE s.ALERT_TYPE = a.ALERT_TYPE
             AND s.IS_ACTIVE  = 1
             AND (
                   s.CUSTOMER_SEGMENTS = 'ALL'
                OR c.TIER IS NULL
                OR INSTR(','||s.CUSTOMER_SEGMENTS||',', ','||UPPER(c.TIER)||',') > 0
             )
             AND (s.SEVERITY_FILTER IS NULL OR s.SEVERITY_FILTER = a.SEVERITY)
        )
      )
    ORDER BY
      CASE a.SEVERITY WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      a.TRIGGERED_AT DESC`,
    [rmUserId, rmUserId]
  );
  return result.rows || [];
}

/** Get total open alerts for RM (unfiltered — for suppressed count) */
async function getTotalOpenCount(rmUserId) {
  const r = await db.execute(
    `SELECT COUNT(*) AS CNT
       FROM ALERTS a
       JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
      WHERE c.RM_USER_ID = :1 AND a.STATUS = 'Open'`,
    [rmUserId]
  );
  return Number(r.rows?.[0]?.CNT || 0);
}

/** Get all subscription settings for an RM */
async function getSubscriptions(rmUserId) {
  const r = await db.execute(
    `SELECT ALERT_TYPE, IS_ACTIVE, CUSTOMER_SEGMENTS, SEVERITY_FILTER,
            TO_CHAR(UPDATED_AT,'DD Mon YYYY HH24:MI') AS UPDATED_FMT
       FROM RM_ALERT_SUBSCRIPTIONS
      WHERE RM_USER_ID = :1
      ORDER BY ALERT_TYPE`,
    [rmUserId]
  );
  return r.rows || [];
}

/**
 * Upsert a subscription preference for a single alert type.
 * @param {string} rmUserId
 * @param {string} alertType
 * @param {object} opts  { isActive, customerSegments, severityFilter }
 */
async function upsertSubscription(rmUserId, alertType, { isActive, customerSegments, severityFilter }) {
  const active   = isActive          != null ? Number(isActive)          : 1;
  const segments = customerSegments  || 'ALL';
  const sevFilter = severityFilter   || null;

  await db.execute(
    `MERGE INTO RM_ALERT_SUBSCRIPTIONS dst
     USING DUAL ON (dst.RM_USER_ID = :1 AND dst.ALERT_TYPE = :2)
     WHEN MATCHED THEN
       UPDATE SET IS_ACTIVE = :3, CUSTOMER_SEGMENTS = :4,
                  SEVERITY_FILTER = :5, UPDATED_AT = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (RM_USER_ID, ALERT_TYPE, IS_ACTIVE, CUSTOMER_SEGMENTS, SEVERITY_FILTER)
       VALUES (:6, :7, :8, :9, :10)`,
    [rmUserId, alertType, active, segments, sevFilter,
     rmUserId, alertType, active, segments, sevFilter],
    { autoCommit: true }
  );
}

/** Get alerts for a specific customer */
async function getByCustomer(customerId, statusFilter = null) {
  const params = [customerId];
  let statusClause = '';
  if (statusFilter) {
    statusClause = `AND a.STATUS = :2`;
    params.push(statusFilter);
  }
  const result = await db.execute(
    `SELECT a.*, c.FULL_NAME, c.RISK_PROFILE
       FROM ALERTS a
       JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
      WHERE a.CUSTOMER_ID = :1 ${statusClause}
      ORDER BY a.TRIGGERED_AT DESC`,
    params
  );
  return result.rows || [];
}

/** Acknowledge an alert */
async function acknowledge(alertId, rmUserId) {
  await db.execute(
    `UPDATE ALERTS SET STATUS = 'Acknowledged', RESOLVED_BY = :1
      WHERE ALERT_ID = :2`,
    [rmUserId, alertId]
  );
}

/** Resolve an alert */
async function resolve(alertId, rmUserId) {
  await db.execute(
    `UPDATE ALERTS
        SET STATUS = 'Resolved', RESOLVED_AT = CURRENT_TIMESTAMP, RESOLVED_BY = :1
      WHERE ALERT_ID = :2`,
    [rmUserId, alertId]
  );
}

/**
 * Analyze a portfolio alert and stream intervention recommendations.
 *
 * When PAF_MCP_ENABLED=true the call is routed to PAF AI Studio with Oracle
 * DB MCP tools.  On failure or when MCP is disabled it falls back to the
 * direct OCI GenAI (Cohere) path with pre-fetched context.
 *
 * @param {string|number} alertId
 * @param {object}        res     — Express SSE response (SSE headers already sent)
 * @param {string}        [rmUserId] — RM user ID for audit logging
 */
async function analyzeAndStream(alertId, res, rmUserId) {
  try {
    /* ── Route through PAF AI Studio MCP agent when enabled ─────────────── */
    if (process.env.PAF_MCP_ENABLED === 'true') {
      // Fetch minimal context to include in the MCP prompt
      const basicRes = await db.execute(
        `SELECT a.ALERT_TYPE, a.SEVERITY, c.FULL_NAME AS CUSTOMER_NAME
           FROM ALERTS a
           JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
          WHERE a.ALERT_ID = :1`,
        [alertId]
      );
      const basic = basicRes.rows?.[0];
      if (basic) {
        const handled = await mcpSvc.analyzeWithMCP(alertId, res, {
          alertType:    basic.ALERT_TYPE,
          severity:     basic.SEVERITY,
          customerName: basic.CUSTOMER_NAME,
          rmUserId:     rmUserId || null,
        });
        if (handled) return; // MCP agent handled successfully — done
        // MCP returned false (fallback signal) — continue with direct LLM below
      }
    }

    /* ── Direct OCI GenAI analysis (original implementation) ─────────────── */
    // Stage 1 — Load alert & customer
    paf.emitStage(res, 'Alert Triage Agent', 'active', 'Menganalisis alert dan data nasabah...');

    const alertResult = await db.execute(
      `SELECT a.*, c.FULL_NAME, c.INITIALS, c.AVATAR_COLOR,
              c.RISK_PROFILE, c.TIER, c.TIER_LABEL, c.TOTAL_AUM,
              c.MONTHLY_INCOME, c.EMAIL, c.PHONE, c.AGE, c.GENDER
         FROM ALERTS a
         JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE a.ALERT_ID = :1`,
      [alertId]
    );
    const alert = alertResult.rows?.[0];
    if (!alert) {
      paf.emitStage(res, 'Alert Triage Agent', 'error', 'Alert tidak ditemukan');
      paf.emitDone(res);
      return;
    }

    // Load holdings to understand full portfolio exposure
    const holdingsResult = await db.execute(
      `SELECT cp.*, ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_TO_MATURITY
         FROM CUSTOMER_PRODUCTS cp
        WHERE cp.CUSTOMER_ID = :1 AND cp.STATUS = 'ACTIVE'
        ORDER BY cp.AMOUNT DESC`,
      [alert.CUSTOMER_ID]
    );
    const holdings = holdingsResult.rows || [];
    paf.emitStage(res, 'Alert Triage Agent', 'done', `Severity: ${alert.SEVERITY?.toUpperCase()}`);

    // Stage 2 — Market context RAG
    paf.emitStage(res, 'Market Intelligence Agent', 'active', 'Mengambil konteks pasar terkini...');
    const marketQuery = buildMarketQuery(alert);
    const [marketDocs, profileDocs] = await Promise.all([
      rag.searchMarketContext(marketQuery, 3),
      rag.searchCustomerContext(marketQuery, alert.CUSTOMER_ID, 3),
    ]);
    paf.emitStage(res, 'Market Intelligence Agent', 'done', `${marketDocs.length} konteks pasar ditemukan`);

    // Stage 3 — Risk assessment
    paf.emitStage(res, 'Risk Assessment Agent', 'active', 'Menghitung eksposur risiko dan dampak...');
    const noteDocs = await rag.searchMeetingNotes(
      'preferensi risiko toleransi kerugian keputusan investasi', alert.CUSTOMER_ID, 2
    );
    paf.emitStage(res, 'Risk Assessment Agent', 'done', 'Profil risiko divalidasi');

    // Stage 4 — Intervention strategy
    paf.emitStage(res, 'Intervention Strategy Agent', 'active', 'Menyusun strategi intervensi...');

    const holdingsSummary = holdings.map(h => {
      const return_ = h.RETURN_PCT ? `${h.RETURN_PCT > 0 ? '+' : ''}${h.RETURN_PCT}%` : 'N/A';
      return `- ${h.PRODUCT_NAME} (${h.CATEGORY}): Rp ${Number(h.AMOUNT).toLocaleString('id-ID')}, return ${return_}${h.MATURITY_DATE ? `, jatuh tempo ${h.DAYS_TO_MATURITY} hari` : ''}`;
    }).join('\n');

    const prompt = `
Analisis alert portofolio berikut dan buat strategi intervensi yang terstruktur dan berbasis data.

## Detail Alert [Profil Nasabah]
- **Tipe:** ${alert.ALERT_TYPE}
- **Severity:** ${alert.SEVERITY?.toUpperCase()}
- **Judul:** ${alert.TITLE}
- **Pesan:** ${alert.MESSAGE}
- **Metrik yang Dilanggar:** ${alert.METRIC_KEY} = ${alert.METRIC_VALUE} (threshold: ${alert.THRESHOLD})

## Profil Nasabah [Profil Nasabah]
- Nama: ${alert.FULL_NAME} | Tier: ${alert.TIER_LABEL || alert.TIER}
- Profil Risiko: ${alert.RISK_PROFILE}
- Total AUM: Rp ${Number(alert.TOTAL_AUM || 0).toLocaleString('id-ID')}
- Usia: ${alert.AGE} tahun | Gender: ${alert.GENDER || '-'}

## Portofolio Saat Ini [Profil Nasabah]
${holdingsSummary || '[Data holding tidak tersedia dalam sistem]'}

════════════════════════════════
FORMAT OUTPUT WAJIB (ikuti persis):
════════════════════════════════

### 🚨 DASAR TRIGGER ALERT
Jelaskan MENGAPA nasabah ini mendapatkan alert ini:
- Metrik spesifik yang dilanggar: [nilai aktual] vs [threshold] — berapa persen melewati batas [Profil Nasabah]
- Produk yang terdampak dan nilai kerugian/risiko dalam Rupiah
- Konteks profil risiko: apakah kondisi ini sesuai atau bertentangan dengan toleransi risiko nasabah [Profil Nasabah]
- Severity justification: mengapa ini diklasifikasikan ${alert.SEVERITY?.toUpperCase()}

### 📉 PENILAIAN DAMPAK
- **Dampak finansial saat ini:** Rp [X] (kerugian / potensi kerugian) [Profil Nasabah]
- **Dampak terhadap total AUM:** [Y]% dari total portofolio
- **Skala urgensi:** KRITIS / TINGGI / SEDANG — [alasan berbasis data]
- **Risiko jika tidak ditindaklanjuti dalam 48 jam:** [proyeksi spesifik]

### ✅ TINDAKAN SEGERA (0–48 Jam)
Urutan langkah konkret yang harus dilakukan RM:
1. [Langkah 1 — jam berapa, via apa, pesan apa]
2. [Langkah 2]
3. [Langkah 3]

### 💡 REKOMENDASI PENYESUAIAN PORTOFOLIO
Untuk setiap saran tindakan gunakan format:

**[Tindakan]** (misal: Stop-loss / Rebalancing / Switch produk)
- **Mengapa tindakan ini:** [kaitkan langsung ke data alert dan profil nasabah] [Katalog Produk]
- **Dari:** [produk/posisi saat ini] → **Ke:** [produk/posisi yang disarankan]
- **Nominal:** Rp [X]
- **Proyeksi dampak:**
  - Skenario Terbaik: [outcome jika pasar recover] (estimasi, bukan jaminan)
  - Skenario Dasar: [outcome netral]
  - Skenario Terburuk: [worst case jika tidak ditindaklanjuti]
- → Tingkat Kepercayaan: [TINGGI/SEDANG/RENDAH] — [alasan]

### 📞 SCRIPT KOMUNIKASI RM
Panduan komunikasi empatik untuk menyampaikan situasi negatif:
- **Pembukaan** (empatik, tidak panik): "..."
- **Penyampaian fakta** (jelas, berbasis data): "..."
- **Transisi ke solusi** (proaktif): "..."
- **Penutup & CTA** (langkah selanjutnya yang jelas): "..."

### 📅 FOLLOW-UP PLAN
| Waktu | Checkpoint | Tindakan jika kondisi memburuk |
|-------|-----------|-------------------------------|
| 24 jam | ... | ... |
| 3 hari | ... | ... |
| 1 minggu | ... | ... |
| 1 bulan | ... | ... |

### 📌 DATA SUMBER YANG DIGUNAKAN
Sebutkan sumber yang berkontribusi: [Profil Nasabah] / [Catatan Meeting] / [Katalog Produk] / [Konteks Pasar] / [Pengetahuan Umum].
Jika ada sumber tidak tersedia, sebutkan di sini agar RM mengetahui keterbatasan analisis.
    `.trim();

    paf.emitStage(res, 'Intervention Strategy Agent', 'done', 'Strategi siap dieksekusi');

    // Route through PAF when enabled, otherwise direct LLM
    if (paf.PAF_ENABLED) {
      const pafPrompt = `Analisis alert ${alert.ALERT_TYPE} (severity: ${alert.SEVERITY}) untuk nasabah CUSTOMER_ID: ${alert.CUSTOMER_ID} (${alert.FULL_NAME}). Triase alert ini, cek portofolio dan profil nasabah, lalu susun strategi intervensi RM.`;
      await paf.callPAF('alert', pafPrompt, res, {
        customerName: alert.FULL_NAME,
      });
    } else {
      await llm.chatStream(
        prompt,
        llm.buildRMPreamble(alert.FULL_NAME),
        [...marketDocs, ...profileDocs, ...noteDocs],
        res,
        { maxTokens: 2000 }
      );
    }

  } catch (err) {
    console.error('[Alert] analyzeAndStream error:', err);
    paf.emitStage(res, 'Error', 'error', err.message);
    paf.emitDone(res);
  }
}

/** Build a market context search query based on alert type */
function buildMarketQuery(alert) {
  switch (alert.ALERT_TYPE) {
    case 'portfolio_loss':
      return `kerugian reksa dana saham strategi penanganan penurunan pasar`;
    case 'maturity':
      return `deposito jatuh tempo strategi retensi reinvestasi`;
    case 'kyc_expiry':
      return `pembaruan KYC dokumen nasabah prioritas`;
    case 'campaign':
      return `upgrade tier privilege layanan premium nasabah`;
    default:
      return `portofolio nasabah risiko strategi`;
  }
}

/** Auto-detect alerts for all RM customers (run on schedule or demand) */
async function detectAlerts(rmUserId) {
  const createdAlerts = [];

  // 1. Detect maturing deposits within 60 days
  const maturingResult = await db.execute(
    `SELECT cp.HOLDING_ID, cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.AMOUNT,
            ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_LEFT
       FROM CUSTOMER_PRODUCTS cp
       JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
      WHERE c.RM_USER_ID = :1
        AND cp.STATUS = 'ACTIVE'
        AND cp.MATURITY_DATE IS NOT NULL
        AND ROUND(cp.MATURITY_DATE - SYSDATE) BETWEEN 0 AND 60
        AND NOT EXISTS (
          SELECT 1 FROM ALERTS a
           WHERE a.CUSTOMER_ID = cp.CUSTOMER_ID
             AND a.ALERT_TYPE = 'maturity'
             AND a.STATUS = 'Open'
             AND a.METRIC_VALUE = TO_CHAR(cp.HOLDING_ID)
        )`,
    [rmUserId]
  );

  for (const m of (maturingResult.rows || [])) {
    const severity = m.DAYS_LEFT <= 14 ? 'high' : m.DAYS_LEFT <= 30 ? 'medium' : 'low';
    await db.execute(
      `INSERT INTO ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD)
       VALUES (:1,'maturity',:2,:3,:4,'days_to_maturity',:5,'60')`,
      [
        m.CUSTOMER_ID, severity,
        `Deposito Jatuh Tempo ${m.DAYS_LEFT} Hari`,
        `${m.PRODUCT_NAME} senilai Rp ${Number(m.AMOUNT).toLocaleString('id-ID')} akan jatuh tempo dalam ${m.DAYS_LEFT} hari.`,
        String(m.HOLDING_ID),   // matches NOT EXISTS check: a.METRIC_VALUE = TO_CHAR(cp.HOLDING_ID)
      ]
    );
    createdAlerts.push({ type: 'maturity', customerId: m.CUSTOMER_ID, daysLeft: m.DAYS_LEFT });
  }

  // 2. Detect portfolio losses > 7%
  const lossResult = await db.execute(
    `SELECT cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.AMOUNT, cp.RETURN_PCT
       FROM CUSTOMER_PRODUCTS cp
       JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
      WHERE c.RM_USER_ID = :1
        AND cp.STATUS = 'ACTIVE'
        AND cp.RETURN_PCT < -7
        AND NOT EXISTS (
          SELECT 1 FROM ALERTS a
           WHERE a.CUSTOMER_ID = cp.CUSTOMER_ID
             AND a.ALERT_TYPE = 'portfolio_loss'
             AND a.STATUS = 'Open'
        )`,
    [rmUserId]
  );

  for (const l of (lossResult.rows || [])) {
    const severity = Number(l.RETURN_PCT) < -12 ? 'high' : 'medium';
    await db.execute(
      `INSERT INTO ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD)
       VALUES (:1,'portfolio_loss',:2,:3,:4,'portfolio_loss_pct',:5,'-7.00')`,
      [
        l.CUSTOMER_ID, severity,
        `Kerugian ${l.PRODUCT_NAME} ${l.RETURN_PCT}%`,
        `${l.PRODUCT_NAME} mengalami kerugian unrealized ${l.RETURN_PCT}% dari pokok Rp ${Number(l.AMOUNT).toLocaleString('id-ID')}.`,
        String(l.RETURN_PCT),
      ]
    );
    createdAlerts.push({ type: 'portfolio_loss', customerId: l.CUSTOMER_ID, returnPct: l.RETURN_PCT });
  }

  // ── 3. Idle Money Detection ──────────────────────────────────────────────
  // Nasabah dengan > 40% AUM tidak diinvestasikan (hanya di deposito atau tanpa produk)
  // Min AUM Rp 100 juta agar relevan.
  try {
    const idleResult = await db.execute(
      `SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM,
              NVL(inv.TOTAL_INVESTED, 0) AS INVESTED,
              ROUND((c.TOTAL_AUM - NVL(inv.TOTAL_INVESTED, 0)) / c.TOTAL_AUM * 100, 1) AS IDLE_PCT
         FROM CUSTOMERS c
         LEFT JOIN (
           SELECT CUSTOMER_ID, SUM(AMOUNT) AS TOTAL_INVESTED
             FROM CUSTOMER_PRODUCTS
            WHERE STATUS = 'ACTIVE'
              AND CATEGORY IN ('reksa_dana','obligasi','saham','sbr','ori')
            GROUP BY CUSTOMER_ID
         ) inv ON c.CUSTOMER_ID = inv.CUSTOMER_ID
        WHERE c.RM_USER_ID = :1
          AND c.TOTAL_AUM >= 100000000
          AND (c.TOTAL_AUM - NVL(inv.TOTAL_INVESTED, 0)) / c.TOTAL_AUM > 0.40
          AND NOT EXISTS (
            SELECT 1 FROM ALERTS a
             WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
               AND a.ALERT_TYPE = 'idle_money'
               AND a.STATUS = 'Open'
          )`,
      [rmUserId]
    );
    for (const r of (idleResult.rows || [])) {
      const idlePct   = Number(r.IDLE_PCT);
      const idleAmt   = Number(r.TOTAL_AUM) - Number(r.INVESTED);
      const severity  = idlePct > 70 ? 'high' : 'medium';
      await db.execute(
        `INSERT INTO ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD)
         VALUES (:1,'idle_money',:2,:3,:4,'idle_cash_pct',:5,'40.00')`,
        [
          r.CUSTOMER_ID, severity,
          `Dana Idle ${idlePct}% — Peluang Investasi`,
          `${r.FULL_NAME} memiliki Rp ${idleAmt.toLocaleString('id-ID')} (${idlePct}% dari AUM) yang belum diinvestasikan. Rekomendasikan produk investasi yang sesuai profil risiko.`,
          String(idlePct),
        ]
      );
      createdAlerts.push({ type: 'idle_money', customerId: r.CUSTOMER_ID, idlePct });
    }
  } catch (e) { console.warn('[Alert] idle_money detection:', e.message); }

  // ── 4. Over-Concentration Risk ───────────────────────────────────────────
  // Satu kategori produk mendominasi > 50% AUM — risiko konsentrasi berlebih.
  try {
    const concResult = await db.execute(
      `SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM,
              cp.CATEGORY,
              SUM(cp.AMOUNT) AS CAT_AMOUNT,
              ROUND(SUM(cp.AMOUNT) / c.TOTAL_AUM * 100, 1) AS CAT_PCT
         FROM CUSTOMERS c
         JOIN CUSTOMER_PRODUCTS cp ON cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS = 'ACTIVE'
        WHERE c.RM_USER_ID = :1
          AND c.TOTAL_AUM > 0
          AND cp.CATEGORY IS NOT NULL
          AND cp.CATEGORY != ' '
          AND NOT EXISTS (
            SELECT 1 FROM ALERTS a
             WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
               AND a.ALERT_TYPE = 'concentration_risk'
               AND a.STATUS = 'Open'
          )
        GROUP BY c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM, cp.CATEGORY
       HAVING ROUND(SUM(cp.AMOUNT) / c.TOTAL_AUM * 100, 1) > 50`,
      [rmUserId]
    );
    for (const r of (concResult.rows || [])) {
      const catPct   = Number(r.CAT_PCT);
      const severity = catPct > 70 ? 'high' : 'medium';
      await db.execute(
        `INSERT INTO ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD)
         VALUES (:1,'concentration_risk',:2,:3,:4,'concentration_pct',:5,'50.00')`,
        [
          r.CUSTOMER_ID, severity,
          `Risiko Konsentrasi ${r.CATEGORY} ${catPct}%`,
          `Portofolio ${r.FULL_NAME} terkonsentrasi ${catPct}% di kategori ${r.CATEGORY} (Rp ${Number(r.CAT_AMOUNT).toLocaleString('id-ID')}). Rebalancing disarankan untuk diversifikasi risiko.`,
          String(catPct),
        ]
      );
      createdAlerts.push({ type: 'concentration_risk', customerId: r.CUSTOMER_ID, category: r.CATEGORY, catPct });
    }
  } catch (e) { console.warn('[Alert] concentration_risk detection:', e.message); }

  // ── 5. Tier Upgrade Opportunity ──────────────────────────────────────────
  // Nasabah dengan AUM >= Rp 250 juta tapi belum Privilege/Prioritas — peluang upgrade.
  try {
    const upgradeResult = await db.execute(
      `SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TOTAL_AUM, c.TIER
         FROM CUSTOMERS c
        WHERE c.RM_USER_ID = :1
          AND c.TOTAL_AUM >= 250000000
          AND UPPER(c.TIER) NOT IN ('PRIVILEGE','PRIORITAS')
          AND NOT EXISTS (
            SELECT 1 FROM ALERTS a
             WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
               AND a.ALERT_TYPE = 'upgrade_opportunity'
               AND a.STATUS = 'Open'
          )`,
      [rmUserId]
    );
    for (const r of (upgradeResult.rows || [])) {
      await db.execute(
        `INSERT INTO ALERTS (CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE, METRIC_KEY, METRIC_VALUE, THRESHOLD)
         VALUES (:1,'upgrade_opportunity','high',:2,:3,'aum_idr',:4,'250000000')`,
        [
          r.CUSTOMER_ID,
          `Peluang Upgrade Tier — AUM Rp ${Number(r.TOTAL_AUM).toLocaleString('id-ID')}`,
          `${r.FULL_NAME} memiliki AUM Rp ${Number(r.TOTAL_AUM).toLocaleString('id-ID')} dan berpotensi upgrade ke tier Prioritas/Privilege. Hubungi segera untuk menawarkan benefit eksklusif.`,
          String(Math.round(r.TOTAL_AUM)),
        ]
      );
      createdAlerts.push({ type: 'upgrade_opportunity', customerId: r.CUSTOMER_ID, aum: r.TOTAL_AUM });
    }
  } catch (e) { console.warn('[Alert] upgrade_opportunity detection:', e.message); }

  // ── 6. Underperforming Asset Detection ──────────────────────────────────
  // Compare product 3M return vs benchmark. Alert if gap <= -UNDERPERFORM_TRIGGER_PCT.
  try {
    const underResult = await db.execute(
      `SELECT cp.CUSTOMER_ID, cp.PRODUCT_ID, cp.PRODUCT_NAME, cp.AMOUNT,
              pp.BENCHMARK_NAME, pp.RETURN_3M, pp.BENCH_RETURN_3M,
              (pp.RETURN_3M - pp.BENCH_RETURN_3M) AS GAP_3M
         FROM CUSTOMER_PRODUCTS cp
         JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
         JOIN PRODUCT_PERFORMANCE pp ON pp.PRODUCT_ID = cp.PRODUCT_ID
        WHERE c.RM_USER_ID = :1
          AND cp.STATUS    = 'ACTIVE'
          AND cp.AMOUNT    > 0
          AND pp.RETURN_3M IS NOT NULL
          AND pp.BENCH_RETURN_3M IS NOT NULL
          AND (pp.RETURN_3M - pp.BENCH_RETURN_3M) <= -(
                SELECT NVL(MAX(THRESHOLD_VALUE),2)
                  FROM ALERT_THRESHOLDS
                 WHERE THRESHOLD_KEY='UNDERPERFORM_TRIGGER_PCT' AND IS_ACTIVE=1
              )
          AND NOT EXISTS (
                SELECT 1 FROM ALERTS a
                 WHERE a.CUSTOMER_ID = cp.CUSTOMER_ID
                   AND a.ALERT_TYPE  = 'underperform'
                   AND a.METRIC_KEY  = cp.PRODUCT_ID
                   AND a.STATUS      = 'Open'
              )`,
      [rmUserId]
    );

    // Read high threshold for severity escalation
    const highThreshResult = await db.execute(
      `SELECT NVL(MAX(THRESHOLD_VALUE),6) AS V
         FROM ALERT_THRESHOLDS
        WHERE THRESHOLD_KEY='UNDERPERFORM_HIGH_PCT' AND IS_ACTIVE=1`
    );
    const highPct = Number(highThreshResult.rows?.[0]?.V || 6);

    for (const r of (underResult.rows || [])) {
      const gap     = Number(r.GAP_3M);
      const gapAbs  = Math.abs(gap);
      const severity = gapAbs >= highPct ? 'high' : 'medium';
      const gapStr  = (gap >= 0 ? '+' : '') + gap.toFixed(2) + '%';
      const r3mStr  = (Number(r.RETURN_3M) >= 0 ? '+' : '') + Number(r.RETURN_3M).toFixed(2) + '%';
      const b3mStr  = (Number(r.BENCH_RETURN_3M) >= 0 ? '+' : '') + Number(r.BENCH_RETURN_3M).toFixed(2) + '%';
      await db.execute(
        `INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD)
         VALUES (:1,'underperform',:2,:3,:4,:5,:6,:7)`,
        [
          r.CUSTOMER_ID, severity,
          `${r.PRODUCT_NAME} Underperform ${gapAbs.toFixed(2)}% vs Benchmark (3M)`,
          `${r.PRODUCT_NAME} membukukan return 3M ${r3mStr}, benchmark ${r.BENCHMARK_NAME} ${b3mStr}. Gap: ${gapStr}. Nilai holding Rp ${Number(r.AMOUNT).toLocaleString('id-ID')}. Evaluasi switch atau rebalancing.`,
          r.PRODUCT_ID,
          gapStr,
          '-2.00%',
        ]
      );
      createdAlerts.push({ type: 'underperform', customerId: r.CUSTOMER_ID, productId: r.PRODUCT_ID, gap });
    }
  } catch (e) { console.warn('[Alert] underperform detection:', e.message); }

  return createdAlerts;
}

module.exports = {
  getOpenAlerts, getTotalOpenCount,
  getSubscriptions, upsertSubscription,
  getByCustomer, acknowledge, resolve,
  analyzeAndStream, detectAlerts,
};
