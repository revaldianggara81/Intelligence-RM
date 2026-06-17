'use strict';
/**
 * Executive Intelligence Service
 * Computes: Health Score, Churn Risk %, Opportunity Score, NBA, RM Productivity
 * All metrics derived live from existing Oracle tables.
 */
const db = require('../config/database');

/* ─────────────────────────────────────────────────────────────
   1. AUM MONTHLY TREND  (from EXEC_AUM_MONTHLY table)
───────────────────────────────────────────────────────────── */
async function getAumTrend() {
  const result = await db.execute(`
    SELECT MONTH_LABEL, PERIOD_KEY, TOTAL_AUM, AUM_GROWTH_PCT, IS_FORECAST
      FROM EXEC_AUM_MONTHLY
     ORDER BY PERIOD_KEY ASC
  `);
  return result.rows || [];
}

/* ─────────────────────────────────────────────────────────────
   2. CUSTOMER INTELLIGENCE RADAR
   Computes per-customer: Health Score, Churn Risk %, Opportunity Score, NBA
   Sources: CUSTOMERS, CUSTOMER_PRODUCTS, ALERTS, RM_APPOINTMENTS
───────────────────────────────────────────────────────────── */
async function getCustomerIntelligence() {
  const result = await db.execute(`
    WITH alert_metrics AS (
      SELECT
        CUSTOMER_ID,
        COUNT(CASE WHEN SEVERITY = 'High'   AND STATUS = 'Open' THEN 1 END)                             AS HIGH_ALERTS,
        COUNT(CASE WHEN SEVERITY = 'Medium' AND STATUS = 'Open' THEN 1 END)                             AS MED_ALERTS,
        COUNT(CASE WHEN ALERT_TYPE = 'idle_money'          AND STATUS = 'Open' THEN 1 END)              AS IDLE_ALERTS,
        COUNT(CASE WHEN ALERT_TYPE = 'concentration_risk'  AND STATUS = 'Open' THEN 1 END)              AS CONC_ALERTS,
        COUNT(CASE WHEN ALERT_TYPE = 'upgrade_opportunity' AND STATUS = 'Open' THEN 1 END)              AS UPG_ALERTS,
        COUNT(CASE WHEN ALERT_TYPE = 'maturity'            AND STATUS = 'Open' THEN 1 END)              AS MAT_ALERTS,
        NVL(MAX(CASE WHEN ALERT_TYPE = 'concentration_risk' AND STATUS = 'Open'
                     AND REGEXP_LIKE(METRIC_VALUE, '^[0-9]+(\.[0-9]+)?$')
                THEN TO_NUMBER(METRIC_VALUE) END), 0)                                                    AS MAX_CONC_PCT
      FROM ALERTS
      GROUP BY CUSTOMER_ID
    ),
    product_metrics AS (
      SELECT
        CUSTOMER_ID,
        COUNT(DISTINCT CATEGORY)  AS CAT_COUNT,
        NVL(SUM(AMOUNT), 0)       AS TOTAL_PROD_AMT
      FROM CUSTOMER_PRODUCTS
      WHERE STATUS = 'ACTIVE'
      GROUP BY CUSTOMER_ID
    ),
    engagement_metrics AS (
      SELECT
        CUSTOMER_ID,
        ROUND(SYSDATE - CAST(MAX(APPOINTMENT_DATE) AS DATE))                                            AS DAYS_SINCE,
        COUNT(CASE WHEN APPOINTMENT_DATE >= SYSDATE - 30 THEN 1 END)                                   AS APPTS_30D,
        COUNT(CASE WHEN APPOINTMENT_DATE >= SYSDATE - 90 THEN 1 END)                                   AS APPTS_90D
      FROM RM_APPOINTMENTS
      GROUP BY CUSTOMER_ID
    )
    SELECT
      c.CUSTOMER_ID,
      c.FULL_NAME,
      c.TIER,
      c.TOTAL_AUM,
      c.KYC_STATUS,
      NVL(am.HIGH_ALERTS,  0)   AS HIGH_ALERTS,
      NVL(am.MED_ALERTS,   0)   AS MED_ALERTS,
      NVL(am.IDLE_ALERTS,  0)   AS IDLE_ALERTS,
      NVL(am.CONC_ALERTS,  0)   AS CONC_ALERTS,
      NVL(am.UPG_ALERTS,   0)   AS UPG_ALERTS,
      NVL(am.MAT_ALERTS,   0)   AS MAT_ALERTS,
      NVL(am.MAX_CONC_PCT, 0)   AS MAX_CONC_PCT,
      NVL(pm.CAT_COUNT,    1)   AS PRODUCT_CATS,
      NVL(pm.TOTAL_PROD_AMT, 0) AS TOTAL_PROD_AMT,
      NVL(em.DAYS_SINCE,   999) AS DAYS_SINCE_CONTACT,
      NVL(em.APPTS_30D,    0)   AS APPTS_30D,
      NVL(em.APPTS_90D,    0)   AS APPTS_90D,

      /* ── HEALTH SCORE (0-100) ────────────────────────────────── */
      LEAST(100, GREATEST(0,
          30
        + CASE WHEN c.KYC_STATUS = 'Verified' THEN 15 ELSE 0 END
        + CASE
            WHEN NVL(pm.CAT_COUNT,1) >= 3 THEN 20
            WHEN NVL(pm.CAT_COUNT,1) =  2 THEN 12
            ELSE 5
          END
        + CASE
            WHEN NVL(em.APPTS_30D,0) > 0            THEN 20
            WHEN NVL(em.APPTS_90D,0) > 0            THEN 10
            WHEN NVL(em.DAYS_SINCE,999) <= 30        THEN 20
            WHEN NVL(em.DAYS_SINCE,999) <= 90        THEN 10
            ELSE 0
          END
        - NVL(am.HIGH_ALERTS, 0) * 8
        - NVL(am.MED_ALERTS,  0) * 3
        - CASE WHEN NVL(am.IDLE_ALERTS, 0) > 0       THEN 8  ELSE 0 END
        - CASE
            WHEN NVL(am.MAX_CONC_PCT,0) > 70          THEN 10
            WHEN NVL(am.MAX_CONC_PCT,0) > 50          THEN 5
            ELSE 0
          END
      )) AS HEALTH_SCORE,

      /* ── CHURN RISK % (0-100) ───────────────────────────────── */
      LEAST(100, GREATEST(0,
          CASE
            WHEN NVL(em.DAYS_SINCE,999) > 90  THEN 40
            WHEN NVL(em.DAYS_SINCE,999) > 60  THEN 25
            WHEN NVL(em.DAYS_SINCE,999) > 30  THEN 12
            ELSE 5
          END
        + CASE WHEN NVL(am.IDLE_ALERTS,0) > 0         THEN 20 ELSE 0 END
        + CASE
            WHEN NVL(am.MAX_CONC_PCT,0) > 70           THEN 20
            WHEN NVL(am.MAX_CONC_PCT,0) > 50           THEN 12
            ELSE 0
          END
        + CASE
            WHEN NVL(am.HIGH_ALERTS,0) > 2             THEN 15
            WHEN NVL(am.HIGH_ALERTS,0) > 0             THEN 8
            ELSE 0
          END
        + CASE WHEN c.KYC_STATUS != 'Verified'         THEN 8  ELSE 0 END
      )) AS CHURN_RISK_PCT,

      /* ── OPPORTUNITY SCORE (0-100) ─────────────────────────── */
      LEAST(100, GREATEST(0,
          CASE
            WHEN c.TOTAL_AUM >= 3000000000  THEN 20
            WHEN c.TOTAL_AUM >= 1000000000  THEN 15
            WHEN c.TOTAL_AUM >= 500000000   THEN 10
            ELSE 5
          END
        + LEAST(25, NVL(am.IDLE_ALERTS,  0) * 25)
        + LEAST(20, NVL(am.MAT_ALERTS,   0) * 20)
        + CASE
            WHEN NVL(pm.CAT_COUNT,1) <= 1   THEN 20
            WHEN NVL(pm.CAT_COUNT,1)  = 2   THEN 10
            ELSE 5
          END
        + LEAST(15, NVL(am.UPG_ALERTS,  0) * 15)
        + CASE WHEN NVL(am.MAX_CONC_PCT,0) > 50 THEN 15 ELSE 0 END
      )) AS OPP_SCORE

    FROM CUSTOMERS c
    LEFT JOIN alert_metrics      am ON am.CUSTOMER_ID = c.CUSTOMER_ID
    LEFT JOIN product_metrics    pm ON pm.CUSTOMER_ID = c.CUSTOMER_ID
    LEFT JOIN engagement_metrics em ON em.CUSTOMER_ID = c.CUSTOMER_ID
    ORDER BY HEALTH_SCORE DESC
  `);
  return result.rows || [];
}

/* ─────────────────────────────────────────────────────────────
   3. RM PRODUCTIVITY COCKPIT
   Sources: RM_USERS, CUSTOMERS, ALERTS, RM_APPOINTMENTS
───────────────────────────────────────────────────────────── */
async function getRMProductivity() {
  const result = await db.execute(`
    SELECT
      u.USER_ID,
      u.FULL_NAME,
      u.BRANCH,
      COUNT(DISTINCT c.CUSTOMER_ID)                                                                     AS CUST_COUNT,
      NVL(SUM(c.TOTAL_AUM), 0)                                                                          AS TOTAL_AUM,
      COUNT(DISTINCT a.ALERT_ID)                                                                         AS OPEN_ALERTS,
      COUNT(DISTINCT CASE WHEN ap.APPOINTMENT_DATE >= SYSDATE - 7  THEN ap.APPOINTMENT_ID END)          AS APPTS_7D,
      COUNT(DISTINCT CASE WHEN ap.APPOINTMENT_DATE >= SYSDATE - 30 THEN ap.APPOINTMENT_ID END)          AS APPTS_30D,
      COUNT(DISTINCT CASE WHEN ap.STATUS = 'completed'
                           AND ap.APPOINTMENT_DATE >= SYSDATE - 30 THEN ap.APPOINTMENT_ID END)          AS COMPLETED_30D,
      COUNT(DISTINCT CASE WHEN ap.STATUS = 'scheduled'
                           AND ap.APPOINTMENT_DATE >= SYSDATE      THEN ap.APPOINTMENT_ID END)          AS SCHEDULED_UPCOMING
    FROM RM_USERS u
    LEFT JOIN CUSTOMERS        c  ON c.RM_USER_ID    = u.USER_ID
    LEFT JOIN ALERTS           a  ON a.CUSTOMER_ID   = c.CUSTOMER_ID AND a.STATUS = 'Open'
    LEFT JOIN RM_APPOINTMENTS  ap ON ap.RM_USER_ID   = u.USER_ID
    WHERE u.IS_ACTIVE = 1
    GROUP BY u.USER_ID, u.FULL_NAME, u.BRANCH
    ORDER BY TOTAL_AUM DESC
  `);
  return result.rows || [];
}

/* ─────────────────────────────────────────────────────────────
   4. HELPER: Derive NBA text from computed customer metrics
───────────────────────────────────────────────────────────── */
function deriveNBA(row) {
  if (row.UPG_ALERTS > 0)
    return 'Eksekusi upgrade tier — AUM memenuhi syarat Prioritas';
  if (row.IDLE_ALERTS > 0) {
    const idlePct = row.TOTAL_AUM > 0 && row.TOTAL_PROD_AMT < row.TOTAL_AUM
      ? Math.round(((row.TOTAL_AUM - row.TOTAL_PROD_AMT) / row.TOTAL_AUM) * 100)
      : 30;
    return `Pindahkan idle cash ~${idlePct}% AUM ke reksa dana/obligasi`;
  }
  if (row.MAT_ALERTS > 0)
    return 'Presentasi opsi reinvestasi untuk deposito jatuh tempo';
  if (row.MAX_CONC_PCT > 50)
    return `Rebalancing: kurangi konsentrasi ${Math.round(row.MAX_CONC_PCT)}% ke produk lain`;
  if (row.KYC_STATUS !== 'Verified')
    return 'Selesaikan pembaruan KYC — compliance deadline';
  return 'Review portofolio bulanan & potensi cross-sell';
}

function deriveNBAType(row) {
  if (row.UPG_ALERTS > 0)   return 'upgrade';
  if (row.CHURN_RISK_PCT >= 55 || row.MAX_CONC_PCT > 50) return 'retention';
  if (row.KYC_STATUS !== 'Verified') return 'compliance';
  return 'revenue';
}

function deriveChurnLabel(pct) {
  if (pct >= 55) return 'high';
  if (pct >= 30) return 'medium';
  return 'low';
}

function deriveEngagement(daysSince, appts30d) {
  if (appts30d > 0 || daysSince <= 30) return 'Aktif';
  if (daysSince <= 60) return 'Sedang';
  return 'Rendah';
}

function deriveOppValRp(row) {
  // Rough pipeline value estimate
  let base = (row.TOTAL_AUM || 0) * 0.08;
  if (row.IDLE_ALERTS > 0)   base *= 1.6;
  if (row.MAT_ALERTS  > 0)   base *= 1.4;
  if (row.UPG_ALERTS  > 0)   base *= 1.2;
  const b = Math.round(base / 1e9 * 10) / 10;
  if (b >= 1) return `Rp ${b.toFixed(1)}B`;
  return `Rp ${Math.round(base / 1e6)}M`;
}

/* ─────────────────────────────────────────────────────────────
   5. FULL INTELLIGENCE SUMMARY
   Returns everything the frontend needs in one call.
───────────────────────────────────────────────────────────── */
async function getIntelligenceSummary() {
  const [aumTrend, ciRaw, rmRaw] = await Promise.all([
    getAumTrend(),
    getCustomerIntelligence(),
    getRMProductivity(),
  ]);

  // Enrich customer intelligence with derived fields
  const customers = ciRaw.map(row => ({
    id:               row.CUSTOMER_ID,
    name:             row.FULL_NAME,
    tier:             (row.TIER || 'regular').toLowerCase(),
    aum:              row.TOTAL_AUM,
    healthScore:      row.HEALTH_SCORE,
    churnRiskPct:     row.CHURN_RISK_PCT,
    churnRisk:        deriveChurnLabel(row.CHURN_RISK_PCT),
    oppScore:         row.OPP_SCORE,
    oppVal:           deriveOppValRp(row),
    nba:              deriveNBA(row),
    nbaType:          deriveNBAType(row),
    engagement:       deriveEngagement(row.DAYS_SINCE_CONTACT, row.APPTS_30D),
    kycStatus:        row.KYC_STATUS,
    idleAlerts:       row.IDLE_ALERTS,
    concAlerts:       row.CONC_ALERTS,
    matAlerts:        row.MAT_ALERTS,
    upgAlerts:        row.UPG_ALERTS,
    maxConcPct:       row.MAX_CONC_PCT,
    productCats:      row.PRODUCT_CATS,
    daysSinceContact: row.DAYS_SINCE_CONTACT,
    appts30d:         row.APPTS_30D,
  }));

  // Compute aggregate KPIs from customer data
  const avgHealthScore  = customers.length
    ? Math.round(customers.reduce((s, c) => s + c.healthScore, 0) / customers.length)
    : 0;
  const churnRiskCount  = customers.filter(c => c.churnRisk !== 'low').length;
  const totalAum        = customers.reduce((s, c) => s + (Number(c.aum) || 0), 0);
  const revPipeline     = customers.reduce((s, c) => s + (Number(c.aum) || 0) * 0.08, 0);

  // NBA list: top 8 by priority (churn > upgrade > revenue > compliance)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const nbaList = [...customers]
    .sort((a, b) => (priorityOrder[a.churnRisk] - priorityOrder[b.churnRisk]) || b.oppScore - a.oppScore)
    .slice(0, 8)
    .map((c, i) => ({
      priority:    i < 2 ? 'p1' : i < 5 ? 'p2' : 'p3',
      custName:    c.name,
      custTier:    c.tier,
      action:      c.nba,
      value:       c.oppVal,
      type:        c.nbaType,
      daysUrgent:  c.churnRisk === 'high' ? 1 : c.churnRisk === 'medium' ? 3 : 7,
    }));

  // RM enrichment
  const rms = rmRaw.map(r => {
    const aum = Number(r.TOTAL_AUM || 0);
    const aumLabel = aum >= 1e9
      ? `Rp ${(aum / 1e9).toFixed(1)}B`
      : `Rp ${Math.round(aum / 1e6)}M`;
    const alerts = Number(r.OPEN_ALERTS || 0);
    const appts7d = Number(r.APPTS_7D || 0);
    const completed30d = Number(r.COMPLETED_30D || 0);
    const cust = Number(r.CUST_COUNT || 0);
    const engagePct = cust > 0
      ? Math.min(100, Math.round((Number(r.APPTS_30D || 0) / (cust * 1.5)) * 100))
      : 0;
    const prodIdx = alerts <= 1 && engagePct >= 70 ? 'A'
                  : alerts <= 3 && engagePct >= 40 ? 'B' : 'C';
    return {
      userId:           r.USER_ID,
      name:             r.FULL_NAME,
      branch:           r.BRANCH,
      custCount:        cust,
      aum:              aumLabel,
      openAlerts:       alerts,
      contacts7d:       appts7d,
      appts30d:         Number(r.APPTS_30D || 0),
      completed30d,
      scheduledUpcoming: Number(r.SCHEDULED_UPCOMING || 0),
      engagePct,
      prodIdx,
      nbaCompleted:     completed30d,
      nbaTotal:         Math.max(completed30d + Number(r.SCHEDULED_UPCOMING || 0), 1),
    };
  });

  return {
    aumTrend,
    customers,
    rms,
    nbaList,
    kpis: {
      totalAum,
      avgHealthScore,
      churnRiskCount,
      revOpportunityPipeline: revPipeline,
      engagementRate: rms[0]?.engagePct || 0,
    },
  };
}

module.exports = { getAumTrend, getCustomerIntelligence, getRMProductivity, getIntelligenceSummary };
