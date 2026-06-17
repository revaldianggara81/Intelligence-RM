'use strict';
/**
 * Market Intelligence Service
 * Generates AI-powered, personalized market insight per customer
 * based on current Indonesian macroeconomic conditions.
 * Results are cached in CUSTOMER_AI_INSIGHTS (valid 24 h).
 */
const db  = require('../config/database');
const llm = require('./llmService');
const oci = require('../config/oci');

/* ─────────────────────────────────────────────────────────────
   MARKET CONTEXT — Indonesia, 30 Mei 2026
   Production: replace with a live market-data feed integration.
───────────────────────────────────────────────────────────── */
const MARKET_CONTEXT = {
  asOf: '30 Mei 2026',
  forex: {
    usdIdr: { rate: 16450, changeWow: -0.3 },  // negative = Rupiah menguat
    eurIdr: { rate: 17820, changeWow:  0.1 },
  },
  rates: {
    biRate:    { value: 5.75, note: 'dipangkas 25bps Apr 2026' },
    fedRate:   { value: 4.25, note: 'hold — FOMC Mei 2026' },
    inflation: { value: 2.8,  note: 'YoY Mar 2026' },
  },
  equities: {
    ihsg: { level: 7350, changeMom: +1.2, changeYtd: -2.1 },
    lq45: { level:  890, changeMom: +0.8 },
  },
  fixedIncome: {
    ori028:      { yield: 6.35, tenor: '2 tahun' },
    sbr014:      { yield: 6.55, tenor: '2 tahun' },
    obligKorpAA: { yieldMin: 7.2, yieldMax: 7.8 },
  },
  reksaDana: {
    saham:         { ytd: -3.5 },
    pendapatanTetap: { ytd: +2.8 },
    pasarUang:     { ytd: +2.1 },
  },
  gold: { pricePerGram: 1480000, changeYtd: +8.2 },
};

const PREAMBLE = `Anda adalah Market Intelligence Analyst senior Bank Danamon Indonesia.
Berikan analisis kondisi pasar yang relevan dan rekomendasi investasi yang dipersonalisasi
untuk nasabah berdasarkan profil risiko, portofolio aktif, dan kondisi pasar terkini.
Format output: tepat 3 poin berformat "• [emoji] [isi]", masing-masing 1–2 kalimat padat.
Bahasa Indonesia profesional. Maksimal 130 kata total.
PENTING: Hanya gunakan angka dari data yang diberikan. Jangan mengarang fakta.`;

/* ─────────────────────────────────────────────────────────────
   Build personalized prompt
───────────────────────────────────────────────────────────── */
function buildPrompt(cust, mc) {
  const n = v => Number(v || 0).toLocaleString('id-ID');

  const products = (cust.HOLDINGS || [])
    .filter(h => String(h.STATUS || '').toUpperCase() === 'ACTIVE')
    .map(h => `${h.PRODUCT_NAME} (${h.CATEGORY}, Rp ${n(h.AMOUNT)})`)
    .slice(0, 5)
    .join(', ') || 'Tidak ada data produk aktif';

  const alerts = (cust.ALERTS || [])
    .map(a => `${a.TITLE} [${a.SEVERITY}/${a.ALERT_TYPE}]`)
    .slice(0, 4)
    .join('; ') || 'Tidak ada alert aktif';

  return `PROFIL NASABAH:
Nama           : ${cust.FULL_NAME}
Profil Risiko  : ${cust.RISK_PROFILE}
Total AUM      : Rp ${n(cust.TOTAL_AUM)}
Usia           : ${cust.AGE || '—'} tahun
Produk Aktif   : ${products}
Alert Aktif    : ${alerts}

KONDISI PASAR TERKINI — ${mc.asOf}:
• USD/IDR      : Rp ${n(mc.forex.usdIdr.rate)} (${mc.forex.usdIdr.changeWow > 0 ? '+' : ''}${mc.forex.usdIdr.changeWow}% WoW — Rupiah ${mc.forex.usdIdr.changeWow <= 0 ? 'menguat' : 'melemah'})
• BI Rate      : ${mc.rates.biRate.value}% (${mc.rates.biRate.note})
• Fed Rate     : ${mc.rates.fedRate.value}% (${mc.rates.fedRate.note})
• Inflasi      : ${mc.rates.inflation.value}% YoY
• IHSG         : ${n(mc.equities.ihsg.level)} (${mc.equities.ihsg.changeMom > 0 ? '+' : ''}${mc.equities.ihsg.changeMom}% MoM | ${mc.equities.ihsg.changeYtd}% YTD)
• ORI028       : yield ${mc.fixedIncome.ori028.yield}%  |  SBR014: ${mc.fixedIncome.sbr014.yield}%
• Obligasi Korporasi AA: ${mc.fixedIncome.obligKorpAA.yieldMin}–${mc.fixedIncome.obligKorpAA.yieldMax}%
• RD Saham YTD : ${mc.reksaDana.saham.ytd}%  |  RD Pend. Tetap: +${mc.reksaDana.pendapatanTetap.ytd}%  |  RD Pasar Uang: +${mc.reksaDana.pasarUang.ytd}%
• Emas         : Rp ${n(mc.gold.pricePerGram)}/gram (+${mc.gold.changeYtd}% YTD)

Berikan tepat 3 poin market intelligence yang relevan dan actionable untuk nasabah ini.`;
}

/* ─────────────────────────────────────────────────────────────
   Rule-based fallback (used when LLM is unavailable)
───────────────────────────────────────────────────────────── */
function buildFallback(cust, mc) {
  const risk    = (cust.RISK_PROFILE || '').toLowerCase();
  const alerts  = cust.ALERTS || [];
  const hasIdle = alerts.some(a => (a.ALERT_TYPE || '').includes('idle'));
  const hasMat  = alerts.some(a => (a.ALERT_TYPE || '').includes('maturity'));
  const n       = v => Number(v || 0).toLocaleString('id-ID');

  const lines = [];

  // Insight 1 — BI Rate + Fixed Income
  if (hasIdle || hasMat) {
    lines.push(`• 🏦 BI Rate ${mc.rates.biRate.value}% (${mc.rates.biRate.note}) — momen tepat untuk reinvestasi ke ORI028 (${mc.fixedIncome.ori028.yield}%) atau Obligasi Korporasi AA (${mc.fixedIncome.obligKorpAA.yieldMin}–${mc.fixedIncome.obligKorpAA.yieldMax}%) yang menawarkan real return positif di atas inflasi ${mc.rates.inflation.value}%.`);
  } else {
    lines.push(`• 🏦 BI Rate ${mc.rates.biRate.value}% dengan inflasi ${mc.rates.inflation.value}% YoY menghasilkan real return positif. Reksa Dana Pendapatan Tetap (+${mc.reksaDana.pendapatanTetap.ytd}% YTD) menjadi pilihan optimal untuk porsi fixed income portofolio.`);
  }

  // Insight 2 — Equities / Risk profile
  if (risk.includes('agresif') || risk.includes('aggressive')) {
    lines.push(`• 📈 IHSG ${n(mc.equities.ihsg.level)} (${mc.equities.ihsg.changeYtd}% YTD) masih tertekan — koreksi ini membuka peluang akumulasi Reksa Dana Saham secara bertahap (DCA) untuk horizon investasi > 3 tahun.`);
  } else if (risk.includes('konservatif') || risk.includes('conservative')) {
    lines.push(`• 🛡 Profil konservatif: volatilitas IHSG ${mc.equities.ihsg.changeYtd}% YTD mendorong fokus ke SBR014 (${mc.fixedIncome.sbr014.yield}%) dan Reksa Dana Pasar Uang (+${mc.reksaDana.pasarUang.ytd}% YTD) sebagai instrumen minim risiko.`);
  } else {
    lines.push(`• ⚖️ Reksa Dana Pendapatan Tetap +${mc.reksaDana.pendapatanTetap.ytd}% YTD vs Reksa Dana Saham ${mc.reksaDana.saham.ytd}% YTD — alokasi ke fixed income dapat ditingkatkan seiring tren penurunan BI Rate.`);
  }

  // Insight 3 — Forex + Gold hedge
  const forexDir = mc.forex.usdIdr.changeWow <= 0 ? 'menguat' : 'melemah';
  lines.push(`• 💱 Rupiah ${forexDir} vs USD (Rp ${n(mc.forex.usdIdr.rate)}) — pertimbangkan emas (Rp ${n(mc.gold.pricePerGram)}/gram, +${mc.gold.changeYtd}% YTD) sebagai hedge terhadap volatilitas nilai tukar dan ketidakpastian global.`);

  return lines.join('\n\n');
}

/* ─────────────────────────────────────────────────────────────
   Core: generate insight via LLM → save to DB
───────────────────────────────────────────────────────────── */
async function generateAndSave(customerId, customer, rmUserId) {
  const mc = MARKET_CONTEXT;
  let insightText;

  try {
    insightText = await llm.chat(buildPrompt(customer, mc), PREAMBLE, [], {
      maxTokens: 400,
      temperature: 0.4,
    });
    if (!insightText || !insightText.trim()) throw new Error('Empty LLM response');
    insightText = insightText.trim();
  } catch (err) {
    console.warn('[marketInsight] LLM unavailable, using fallback:', err.message);
    insightText = buildFallback(customer, mc);
  }

  await db.execute(
    `INSERT INTO CUSTOMER_AI_INSIGHTS
       (CUSTOMER_ID, INSIGHT_TYPE, INSIGHT_TEXT, MARKET_CONTEXT, MODEL_USED, CREATED_BY)
     VALUES (:1, 'MARKET_INTELLIGENCE', :2, :3, :4, :5)`,
    [
      customerId,
      insightText,
      JSON.stringify(mc),
      oci.LLM_MODEL || 'cohere.command-r-plus',
      rmUserId || null,
    ]
  );

  return { insightText, marketContext: mc, generatedAt: new Date().toISOString(), fresh: true };
}

/* ─────────────────────────────────────────────────────────────
   Public: get cached insight (< 24 h) or generate fresh
───────────────────────────────────────────────────────────── */
async function getOrGenerate(customerId, customer, rmUserId, forceRefresh = false) {
  if (!forceRefresh) {
    const res = await db.execute(
      `SELECT INSIGHT_TEXT, MARKET_CONTEXT, GENERATED_AT
         FROM CUSTOMER_AI_INSIGHTS
        WHERE CUSTOMER_ID  = :1
          AND INSIGHT_TYPE = 'MARKET_INTELLIGENCE'
          AND GENERATED_AT >= SYSDATE - 1
        ORDER BY GENERATED_AT DESC
        FETCH FIRST 1 ROW ONLY`,
      [customerId]
    );
    const row = res.rows?.[0];
    if (row) {
      let ctx = {};
      try { ctx = JSON.parse(row.MARKET_CONTEXT || '{}'); } catch (_) {}
      return {
        insightText:   row.INSIGHT_TEXT,
        marketContext: ctx,
        generatedAt:   row.GENERATED_AT,
        fresh:         false,
      };
    }
  }
  return generateAndSave(customerId, customer, rmUserId);
}

module.exports = { getOrGenerate, generateAndSave, MARKET_CONTEXT };
