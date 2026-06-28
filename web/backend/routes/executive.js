'use strict';
const express        = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const db             = require('../config/database');
const audit          = require('../services/auditService');
const execSvc        = require('../services/executiveService');
const llm            = require('../services/llmService');

const router = express.Router();

/* ════════════════════════════════════════════════════════════════
   EXECUTIVE INTELLIGENCE — system preamble for AI insight
════════════════════════════════════════════════════════════════ */
const EXEC_PREAMBLE = `Anda adalah Analis Portofolio Senior dan AI Intelligence Engine Bank Danamon.
Berikan insight eksekutif singkat, data-driven, dalam Bahasa Indonesia yang profesional.
Format: 2-3 kalimat padat (maksimal 90 kata).
Selalu sebutkan angka/persentase spesifik dari data.
Akhiri dengan 1 rekomendasi tindakan yang paling prioritas.
PENTING: Jangan mengarang angka. Hanya gunakan data yang diberikan.`;

/* ════════════════════════════════════════════════════════════════
   GET /api/executive/intelligence
   Full intelligence data: AUM trend, Customer Radar, RM Cockpit, NBA
════════════════════════════════════════════════════════════════ */
router.get('/intelligence', requireAuth, asyncHandler(async (req, res) => {
  const data = await execSvc.getIntelligenceSummary();
  res.json(data);
}));

/* ════════════════════════════════════════════════════════════════
   POST /api/executive/ai-insight
   Body: { widget: 'aum_velocity'|'health_dist'|'ci_radar'|'rm_productivity', data: {...} }
   Returns: { insight: "AI-generated narrative..." }
════════════════════════════════════════════════════════════════ */
router.post('/ai-insight', requireAuth, asyncHandler(async (req, res) => {
  // Outer safety net — always return 200 with some insight text
  try {
    const { widget, data } = req.body || {};

    const PROMPTS = {
      aum_velocity: `Analisis tren AUM bulanan berikut dan berikan insight eksekutif singkat.
Fokus pada: (1) momentum pertumbuhan, (2) apakah target pertumbuhan tercapai, (3) apakah proyeksi forecast realistis.`,

      health_dist: `Analisis distribusi Customer Health Score portofolio berikut.
Fokus pada: (1) jumlah nasabah berisiko, (2) rata-rata skor portfolio vs benchmark 70, (3) tindakan prioritas untuk meningkatkan kesehatan portfolio.`,

      ci_radar: `Analisis data Customer Intelligence Radar berikut (Health Score, Churn Risk, Opportunity Score).
Fokus pada: (1) nasabah churn risk tertinggi, (2) opportunity pipeline terbesar, (3) next best action paling mendesak.`,

      rm_productivity: `Analisis data produktivitas Relationship Manager berikut.
Fokus pada: (1) engagement rate vs target 80%, (2) alert resolution velocity, (3) saran peningkatan produktivitas spesifik.`,
    };

    const prompt = PROMPTS[widget];
    if (!prompt) return res.status(400).json({ error: 'Widget tidak dikenal' });

    // Format data context
    const contextStr = JSON.stringify(data, null, 2).substring(0, 3000);
    const fullPrompt = `${prompt}\n\n--- DATA ---\n${contextStr}\n--- END DATA ---`;

    // Inner try: attempt OCI Cohere LLM
    try {
      const insight = await llm.chat(fullPrompt, EXEC_PREAMBLE, [], {
        maxTokens: 250,
        temperature: 0.35,
      });
      return res.json({ insight: insight.trim() });
    } catch (llmErr) {
      console.warn('[exec/ai-insight] LLM unavailable, using rule-based fallback:', llmErr.message);
    }

    // Fallback: rule-based insight (always succeeds)
    return res.json({ insight: generateFallbackInsight(widget, data) });

  } catch (outerErr) {
    // Last resort — never let this endpoint return a 5xx
    console.error('[exec/ai-insight] Unexpected error:', outerErr.message);
    return res.json({ insight: 'Analisis AI sementara tidak tersedia. Silakan refresh dashboard.' });
  }
}));

/** Rule-based fallback when OCI is unavailable */
function generateFallbackInsight(widget, data) {
  try {
    if (widget === 'aum_velocity') {
      const rows = data.rows || data;
      const last = rows.filter(r => !r.IS_FORECAST && !r.isforecast);
      const latest = last[last.length - 1];
      const prev   = last[last.length - 2];
      const growth = latest && prev
        ? (((latest.TOTAL_AUM || latest.totalAum) - (prev.TOTAL_AUM || prev.totalAum)) /
           (prev.TOTAL_AUM || prev.totalAum) * 100).toFixed(1)
        : '—';
      return `Portfolio AUM mencapai Rp ${((latest?.TOTAL_AUM || latest?.totalAum || 0)/1e9).toFixed(1)}B, tumbuh ${growth}% MoM. Momentum positif dipertahankan selama 6 bulan terakhir. Prioritas: eksekusi 3 NBA terbesar untuk mencapai target forecast Jun-Jul 2026.`;
    }
    if (widget === 'health_dist') {
      const avg = data.avgScore || 0;
      const atRisk = (data.atRisk || 0) + (data.critical || 0);
      return `Rata-rata Health Score portfolio: ${avg}/100. ${atRisk} nasabah berada di zona risiko (At Risk + Critical). Segera lakukan engagement intensif dan rebalancing portofolio untuk nasabah dengan skor < 50.`;
    }
    if (widget === 'ci_radar') {
      const customers = data.customers || data;
      const highChurn = customers.filter(c => (c.churnRisk || c.CHURN_RISK) === 'high').length;
      const topOpp = customers.sort((a, b) => (b.oppScore || b.OPP_SCORE || 0) - (a.oppScore || a.OPP_SCORE || 0))[0];
      return `${highChurn} nasabah dalam status Churn Risk High memerlukan intervensi segera. Opportunity pipeline terbesar: ${topOpp?.name || topOpp?.FULL_NAME} dengan Opportunity Score ${topOpp?.oppScore || topOpp?.OPP_SCORE}/100. Jalankan NBA prioritas hari ini.`;
    }
    if (widget === 'rm_productivity') {
      const rms = Array.isArray(data) ? data : [data];
      const rm = rms[0] || {};
      return `Engagement rate RM: ${rm.engagePct || 0}% (target: 80%). ${rm.openAlerts || 0} alert terbuka memerlukan tindak lanjut. Tingkatkan frekuensi kontak nasabah churn risk dari mingguan menjadi 2x/minggu.`;
    }
  } catch (_) {}
  return 'Insight AI tidak tersedia. Silakan periksa data dan coba refresh dashboard.';
}

/**
 * GET /api/executive/summary
 * Branch-wide portfolio KPIs: AUM, customers, RM performance,
 * product mix, campaign stats, alert trend.
 */
router.get('/summary', requireAuth, asyncHandler(async (req, res) => {
  const [
    totalAumRow,
    rmPerfResult,
    tierResult,
    riskResult,
    alertOpenResult,
    alertTrendRow,
    topCustomersResult,
    productMixResult,
    campaignStatsResult,
  ] = await Promise.all([

    // Total AUM + customer count
    db.execute(`SELECT NVL(SUM(TOTAL_AUM),0) AS TOTAL_AUM, COUNT(*) AS TOTAL_CUSTOMERS FROM CUSTOMERS`),

    // RM performance — AUM, customer count, open alert count
    db.execute(`
      SELECT u.FULL_NAME, u.BRANCH,
             (SELECT COUNT(*) FROM CUSTOMERS c WHERE c.RM_USER_ID = u.USER_ID) AS CNT,
             (SELECT NVL(SUM(c.TOTAL_AUM),0) FROM CUSTOMERS c WHERE c.RM_USER_ID = u.USER_ID) AS AUM,
             (SELECT COUNT(*) FROM ALERTS a JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID WHERE c.RM_USER_ID = u.USER_ID AND a.STATUS = 'Open') AS OPEN_ALERTS
        FROM RM_USERS u
       WHERE u.IS_ACTIVE = 1
       ORDER BY AUM DESC
    `),

    // Tier breakdown
    db.execute(`SELECT TIER, COUNT(*) AS CNT, NVL(SUM(TOTAL_AUM),0) AS AUM
                  FROM CUSTOMERS GROUP BY TIER ORDER BY AUM DESC`),

    // Risk profile breakdown
    db.execute(`SELECT RISK_PROFILE, COUNT(*) AS CNT FROM CUSTOMERS GROUP BY RISK_PROFILE`),

    // Open alert severity summary
    db.execute(`SELECT SEVERITY, COUNT(*) AS CNT FROM ALERTS WHERE STATUS = 'Open' GROUP BY SEVERITY`),

    // Alert trend: resolved last 7 days + triggered last 30 days
    db.execute(`
      SELECT
        COUNT(CASE WHEN STATUS = 'Resolved' AND RESOLVED_AT >= SYSDATE - 7  THEN 1 END) AS RESOLVED_7D,
        COUNT(CASE WHEN TRIGGERED_AT >= SYSDATE - 30                         THEN 1 END) AS TRIGGERED_30D
        FROM ALERTS
    `),

    // Top 5 customers by AUM
    db.execute(`
      SELECT c.FULL_NAME, c.TIER_LABEL, c.TOTAL_AUM, c.RISK_PROFILE, u.FULL_NAME AS RM_NAME
        FROM CUSTOMERS c LEFT JOIN RM_USERS u ON c.RM_USER_ID = u.USER_ID
       ORDER BY c.TOTAL_AUM DESC NULLS LAST FETCH FIRST 5 ROWS ONLY
    `),

    // Product AUM mix from active holdings
    db.execute(`
      SELECT cp.CATEGORY, COUNT(*) AS HOLDINGS, NVL(SUM(cp.AMOUNT),0) AS TOTAL_AMOUNT
        FROM CUSTOMER_PRODUCTS cp WHERE cp.STATUS = 'ACTIVE'
       GROUP BY cp.CATEGORY ORDER BY TOTAL_AMOUNT DESC
    `),

    // Campaign performance — eligible count per active campaign
    db.execute(`
      SELECT c.CAMPAIGN_ID,
             c.NAME                          AS CAMPAIGN_NAME,
             TO_CHAR(c.START_DATE,'DD Mon')  AS START_FMT,
             TO_CHAR(c.END_DATE,  'DD Mon YYYY') AS END_FMT,
             COUNT(ce.CUSTOMER_ID)           AS TOTAL_SCANNED,
             NVL(SUM(ce.IS_ELIGIBLE), 0)     AS ELIGIBLE_COUNT
        FROM CAMPAIGNS c
        LEFT JOIN CAMPAIGN_ELIGIBILITY ce ON ce.CAMPAIGN_ID = c.CAMPAIGN_ID
       WHERE c.STATUS = 'ACTIVE'
       GROUP BY c.CAMPAIGN_ID, c.NAME, c.START_DATE, c.END_DATE
       ORDER BY ELIGIBLE_COUNT DESC NULLS LAST
       FETCH FIRST 5 ROWS ONLY
    `),
  ]);

  const alertsByLevel = {};
  (alertOpenResult.rows || []).forEach(r => { alertsByLevel[r.SEVERITY] = r.CNT; });

  const trendRow = alertTrendRow.rows?.[0] || {};

  res.json({
    kpis: {
      totalAum:         totalAumRow.rows[0]?.TOTAL_AUM      || 0,
      totalCustomers:   totalAumRow.rows[0]?.TOTAL_CUSTOMERS || 0,
      openAlerts:       Object.values(alertsByLevel).reduce((a, b) => a + b, 0),
      alertsByLevel,
      resolvedLast7:    trendRow.RESOLVED_7D   || 0,
      totalTriggered30: trendRow.TRIGGERED_30D || 0,
    },
    rmPerformance:  rmPerfResult.rows        || [],
    tierBreakdown:  tierResult.rows          || [],
    riskBreakdown:  riskResult.rows          || [],
    topCustomers:   topCustomersResult.rows  || [],
    productMix:     productMixResult.rows    || [],
    campaignStats:  campaignStatsResult.rows || [],
  });
}));

/**
 * GET /api/executive/compliance
 * KYC status table with RM names, KYC counts per status,
 * audit event count (last 30 days), recent audit trail.
 */
router.get('/compliance', requireAuth, asyncHandler(async (req, res) => {
  const [kycResult, kycCountRow, auditCountRow, auditLogs] = await Promise.all([

    // KYC table — include RM name and formatted expiry
    db.execute(`
      SELECT c.KYC_STATUS, c.FULL_NAME, c.CUSTOMER_ID,
             TO_CHAR(c.KYC_EXPIRY, 'DD Mon YYYY') AS KYC_EXPIRY_FMT,
             ROUND(c.KYC_EXPIRY - SYSDATE)        AS DAYS_TO_EXPIRY,
             u.FULL_NAME                          AS RM_NAME
        FROM CUSTOMERS c
        LEFT JOIN RM_USERS u ON c.RM_USER_ID = u.USER_ID
       WHERE c.KYC_EXPIRY IS NOT NULL
       ORDER BY c.KYC_EXPIRY ASC
       FETCH FIRST 20 ROWS ONLY
    `),

    // KYC status counts across all customers
    db.execute(`
      SELECT
        COUNT(CASE WHEN KYC_STATUS = 'Verified'                    THEN 1 END) AS VERIFIED,
        COUNT(CASE WHEN KYC_STATUS IN ('Pending','Pending Review')  THEN 1 END) AS PENDING,
        COUNT(CASE WHEN KYC_STATUS = 'Expired'                     THEN 1 END) AS EXPIRED,
        COUNT(*) AS TOTAL
        FROM CUSTOMERS
    `),

    // Audit event count — last 30 days
    db.execute(`SELECT COUNT(*) AS CNT FROM AUDIT_LOG WHERE CREATED_AT >= SYSDATE - 30`),

    // Recent audit trail (last 10 events)
    audit.getRecent(10),
  ]);

  const counts   = kycCountRow.rows?.[0]   || {};
  const auditCnt = auditCountRow.rows?.[0]?.CNT || 0;

  res.json({
    kycStatus: kycResult.rows || [],
    kycCounts: {
      verified: counts.VERIFIED || 0,
      pending:  counts.PENDING  || 0,
      expired:  counts.EXPIRED  || 0,
      total:    counts.TOTAL    || 0,
    },
    auditEventCount30d: auditCnt,
    auditTrail: auditLogs,
  });
}));

/**
 * GET /api/executive/risk-flags
 * Top open alerts ordered by severity — used as the Risk Flags panel.
 */
router.get('/risk-flags', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(`
    SELECT a.ALERT_ID, a.ALERT_TYPE, a.TITLE, a.MESSAGE, a.SEVERITY, a.STATUS,
           a.METRIC_KEY, a.METRIC_VALUE, a.THRESHOLD,
           TO_CHAR(a.TRIGGERED_AT, 'DD Mon HH24:MI') AS TRIGGERED_FMT,
           c.FULL_NAME  AS CUSTOMER_NAME,
           c.CUSTOMER_ID
      FROM ALERTS a
      JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
     WHERE a.STATUS = 'Open'
     ORDER BY
       CASE a.SEVERITY
         WHEN 'Critical' THEN 0
         WHEN 'High'     THEN 1
         WHEN 'Medium'   THEN 2
         ELSE 3
       END,
       a.TRIGGERED_AT DESC
     FETCH FIRST 10 ROWS ONLY
  `);
  res.json({ riskFlags: result.rows || [] });
}));

/**
 * GET /api/executive/alert-type-counts
 * Count of open alerts grouped by ALERT_TYPE — drives the Alert Intelligence
 * section of the executive dashboard with live data from ALERTS table.
 */
router.get('/alert-type-counts', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(`
    SELECT ALERT_TYPE, COUNT(*) AS CNT
      FROM ALERTS
     WHERE STATUS = 'Open'
     GROUP BY ALERT_TYPE
  `);
  const counts = {};
  (result.rows || []).forEach(r => { counts[r.ALERT_TYPE] = Number(r.CNT || 0); });
  res.json({ counts });
}));

module.exports = router;
