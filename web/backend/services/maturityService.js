'use strict';
/**
 * Maturity Service — Scenario 1: Deposit Maturity Reminder
 * Detects upcoming maturities, builds LLM prompt, calls PAF/GenAI,
 * streams the action plan back to the client.
 */
const db     = require('../config/database');
const llm    = require('./llmService');
const rag    = require('./ragService');
const paf    = require('./pafService');

/** Get all maturing deposits for an RM within 60 days */
async function getMaturingDeposits(rmUserId, days = 60) {
  const result = await db.execute(
    `SELECT
       cp.HOLDING_ID, cp.CUSTOMER_ID, cp.PRODUCT_NAME, cp.CATEGORY,
       cp.AMOUNT, cp.INTEREST_RATE, cp.START_DATE, cp.MATURITY_DATE,
       cp.STATUS,
       ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_TO_MATURITY,
       c.FULL_NAME, c.INITIALS, c.AVATAR_COLOR, c.TIER, c.TIER_LABEL,
       c.RISK_PROFILE, c.TOTAL_AUM, c.MONTHLY_INCOME, c.EMAIL, c.PHONE
     FROM CUSTOMER_PRODUCTS cp
     JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
    WHERE c.RM_USER_ID = :1
      AND cp.STATUS = 'ACTIVE'
      AND cp.MATURITY_DATE IS NOT NULL
      AND ROUND(cp.MATURITY_DATE - SYSDATE) BETWEEN 0 AND :2
    ORDER BY cp.MATURITY_DATE ASC`,
    [rmUserId, days]
  );
  return result.rows || [];
}

/** Get maturing deposits for a specific customer */
async function getMaturingByCustomer(customerId) {
  const result = await db.execute(
    `SELECT
       cp.HOLDING_ID, cp.PRODUCT_NAME, cp.CATEGORY,
       cp.AMOUNT, cp.INTEREST_RATE, cp.START_DATE, cp.MATURITY_DATE,
       ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_TO_MATURITY,
       c.FULL_NAME, c.RISK_PROFILE, c.TOTAL_AUM, c.TIER
     FROM CUSTOMER_PRODUCTS cp
     JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
    WHERE cp.CUSTOMER_ID = :1
      AND cp.STATUS = 'ACTIVE'
      AND cp.MATURITY_DATE IS NOT NULL
      AND cp.MATURITY_DATE >= SYSDATE
    ORDER BY cp.MATURITY_DATE ASC`,
    [customerId]
  );
  return result.rows || [];
}

/**
 * Analyze a customer's maturity and stream an action plan.
 * @param {string} customerId
 * @param {object} res         — Express SSE response
 */
async function analyzeAndStream(customerId, res) {
  try {
    // Stage 1 — Data gathering
    paf.emitStage(res, 'Customer Data Agent', 'active', 'Mengambil data deposito jatuh tempo...');
    const deposits = await getMaturingByCustomer(customerId);
    const custResult = await db.execute(
      `SELECT * FROM CUSTOMERS WHERE CUSTOMER_ID = :1`, [customerId]
    );
    const customer = custResult.rows?.[0];
    if (!customer) {
      paf.emitStage(res, 'Customer Data Agent', 'error', 'Nasabah tidak ditemukan');
      paf.emitDone(res);
      return;
    }
    paf.emitStage(res, 'Customer Data Agent', 'done', `${deposits.length} deposito ditemukan`);

    // Stage 2 — RAG retrieval
    paf.emitStage(res, 'Context Retrieval Agent', 'active', 'Menganalisis profil & riwayat nasabah...');
    const query = `deposito maturity nasabah ${customer.FULL_NAME} profil ${customer.RISK_PROFILE}`;
    const ragDocs = await rag.searchCustomerContext(query, customerId, 4);
    const noteDocs = await rag.searchMeetingNotes('deposito jatuh tempo rekomendasi', customerId, 2);
    const allDocs = [...ragDocs, ...noteDocs];
    paf.emitStage(res, 'Context Retrieval Agent', 'done', `${allDocs.length} dokumen konteks ditemukan`);

    // Stage 3 — Product matching
    paf.emitStage(res, 'Product Match Agent', 'active', 'Mencocokkan produk reinvestasi...');
    const productDocs = await rag.searchProducts(
      `deposito alternatif ${customer.RISK_PROFILE} profil ${customer.TIER}`, 4
    );
    paf.emitStage(res, 'Product Match Agent', 'done', `${productDocs.length} produk relevan diidentifikasi`);

    // Stage 4 — LLM analysis
    paf.emitStage(res, 'Maturity Analysis Agent', 'active', 'Menyusun strategi retensi nasabah...');

    // Load action plan section templates from Oracle
    const templates = await getActionPlanTemplates('maturity');
    const T = (key, fallback) => templates[key]?.GUIDANCE || fallback;

    const depositSummary = deposits.map(d =>
      `- ${d.PRODUCT_NAME}: Rp ${Number(d.AMOUNT).toLocaleString('id-ID')} @ ${d.INTEREST_RATE}% p.a., jatuh tempo ${d.MATURITY_DATE} (${d.DAYS_TO_MATURITY} hari)`
    ).join('\n');

    const prompt = `
Analisis situasi deposito jatuh tempo untuk nasabah berikut dan buat rencana aksi komprehensif.

## Data Nasabah [Profil Nasabah]
- Nama: ${customer.FULL_NAME}
- Tier: ${customer.TIER_LABEL || customer.TIER}
- Profil Risiko: ${customer.RISK_PROFILE}
- Total AUM: Rp ${Number(customer.TOTAL_AUM || 0).toLocaleString('id-ID')}
- Pendapatan Bulanan: Rp ${Number(customer.MONTHLY_INCOME || 0).toLocaleString('id-ID')}

## Deposito Jatuh Tempo [Profil Nasabah]
${depositSummary || 'Tidak ada deposito jatuh tempo dalam 60 hari.'}

════════════════════════════════
FORMAT OUTPUT WAJIB (ikuti persis):
════════════════════════════════

### 🔍 DASAR SELEKSI NASABAH
Jelaskan dengan satu paragraf singkat MENGAPA nasabah ini diprioritaskan sekarang:
- Signal utama yang memicu analisis ini (jatuh tempo produk apa, kapan, berapa nilai)
- Tingkat urgensi: TINGGI / SEDANG / RENDAH — dengan alasan berbasis data [Profil Nasabah]
- Potensi dana idle jika tidak segera ditindaklanjuti: Rp [angka dari data]

### 📊 ANALISIS PORTOFOLIO SAAT INI
Ringkasan singkat komposisi AUM dan gap/peluang yang teridentifikasi [Profil Nasabah].

### 💡 REKOMENDASI PRODUK (2–3 pilihan)
Untuk setiap pilihan gunakan format ini:

**[Nomor]. [Nama Produk]** — Skor Kesesuaian: [X]/10
- **Mengapa produk ini cocok:** [kaitkan langsung ke profil risiko & tujuan nasabah] [Katalog Produk]
- **Mengapa sekarang:** [hubungkan ke trigger event — deposito mana, kapan jatuh tempo]
- **Nominal yang disarankan:** Rp [X] ([Y]% dari dana jatuh tempo)
- **Proyeksi return 12 bulan:** Optimis [X]% · Dasar [Y]% · Konservatif [Z]% (estimasi, bukan jaminan)
- → Tingkat Kepercayaan: [TINGGI/SEDANG/RENDAH] — [alasan singkat]

### 📞 ACTION PLAN — SKRIP KOMUNIKASI RM
Buat skrip komunikasi yang terstruktur dan siap pakai untuk RM. Ikuti 4 bagian berikut PERSIS.

#### 🎙️ OPENING
Panduan: ${T('opening', 'Mulai dengan salam hangat, sebut nama nasabah, sebutkan alasan menghubungi secara spesifik.')}
[Tulis skrip OPENING di sini — 2–3 kalimat, natural, langsung bisa dipakai untuk telepon atau WhatsApp]

#### 💎 VALUE PROPOSITION
Panduan: ${T('value_proposition', 'Jelaskan manfaat konkret produk alternatif dengan angka spesifik dari data nasabah.')}
[Tulis VALUE PROPOSITION di sini — 2–3 kalimat dengan angka return spesifik dalam Rupiah]

#### 🛡️ OBJECTION HANDLING
Panduan: ${T('objection_handling', 'Antisipasi 3 keberatan umum dan respons yang empati + berbasis data.')}
[Tulis 3 pasang Keberatan → Respons RM di sini]

#### ✅ CLOSE
Panduan: ${T('close', 'Tutup dengan pertanyaan konkret yang mendorong komitmen tindakan berikutnya.')}
[Tulis kalimat CLOSE di sini — 1–2 kalimat dengan CTA yang jelas]

### ✅ NEXT STEPS — ACTION PLAN
| Waktu | Tindakan Konkret |
|-------|-----------------|
| Hari ini (0–24 jam) | ... |
| 3 hari ke depan | ... |
| 1 minggu | ... |
| Setelah meeting | ... |

### 📌 DATA SUMBER YANG DIGUNAKAN
Cantumkan singkat sumber mana yang berkontribusi: [Profil Nasabah] / [Catatan Meeting] / [Katalog Produk] / [Historis Analisis AI] / [Pengetahuan Umum].
    `.trim();

    paf.emitStage(res, 'Maturity Analysis Agent', 'done', 'Strategi retensi siap');

    // Stage 5 — Recommendation synthesis
    paf.emitStage(res, 'Action Plan Agent', 'active', 'Membuat rencana follow-up RM...');
    paf.emitStage(res, 'Action Plan Agent', 'done', 'Rencana follow-up RM siap');

    // Stream the LLM response — chatStream owns the SSE stream from here and calls res.end()
    await llm.chatStream(
      prompt,
      llm.buildRMPreamble(customer.FULL_NAME),
      [...allDocs, ...productDocs],
      res,
      { maxTokens: 2000 }
    );
  } catch (err) {
    console.error('[Maturity] analyzeAndStream error:', err);
    paf.emitStage(res, 'Error', 'error', err.message);
    paf.emitDone(res);
  }
}

/**
 * Load action plan section templates from ACTION_PLAN_TEMPLATES.
 * Returns an object keyed by SECTION_KEY for quick lookup.
 */
async function getActionPlanTemplates(scenarioType) {
  try {
    const r = await db.execute(
      `SELECT SECTION_KEY, SECTION_LABEL, SECTION_ICON, SECTION_ORDER, GUIDANCE
         FROM ACTION_PLAN_TEMPLATES
        WHERE SCENARIO_TYPE = :1 AND IS_ACTIVE = 1
        ORDER BY SECTION_ORDER ASC`,
      [scenarioType]
    );
    const tmpl = {};
    (r.rows || []).forEach(row => { tmpl[row.SECTION_KEY] = row; });
    return tmpl;
  } catch(e) {
    console.warn('[Maturity] Template load error:', e.message);
    return {};
  }
}

module.exports = { getMaturingDeposits, getMaturingByCustomer, analyzeAndStream, getActionPlanTemplates };
