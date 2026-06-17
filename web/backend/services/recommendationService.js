'use strict';
/**
 * Recommendation Service — Scenario 2a: Product Recommendation Engine
 * Matches products to customer profile using RAG + LLM scoring.
 */
const db       = require('../config/database');
const llm      = require('./llmService');
const rag      = require('./ragService');
const paf      = require('./pafService');
const goalSvc  = require('./goalService');

/** Get active products from catalog */
async function getActiveProducts() {
  const result = await db.execute(
    `SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION,
            INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS,
            RISK_LEVEL, GOAL_TAG, RETURN_TYPE, FEATURES,
            IS_ACTIVE, VALID_FROM, VALID_TO, CREATED_AT
       FROM PRODUCT_CATALOG WHERE IS_ACTIVE = 1
      ORDER BY CATEGORY, INTEREST_RATE DESC`
  );
  return result.rows || [];
}

/** Get customer's existing product categories (to avoid redundant recommendations) */
async function getCustomerProductCategories(customerId) {
  const result = await db.execute(
    `SELECT DISTINCT CATEGORY FROM CUSTOMER_PRODUCTS
      WHERE CUSTOMER_ID = :1 AND STATUS = 'ACTIVE'`,
    [customerId]
  );
  return (result.rows || []).map(r => r.CATEGORY);
}

/**
 * Analyze customer profile and recommend products — streams to res.
 */
async function analyzeAndStream(customerId, res) {
  try {
    // Stage 1 — Profile analysis
    paf.emitStage(res, 'Profile Analysis Agent', 'active', 'Menganalisis profil dan portofolio nasabah...');

    const custResult = await db.execute(
      `SELECT c.*,
              NVL((SELECT SUM(cp.AMOUNT) FROM CUSTOMER_PRODUCTS cp
                    WHERE cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS='ACTIVE' AND cp.CATEGORY='deposito'),0) AS DEPOSITO_TOTAL,
              NVL((SELECT SUM(cp.AMOUNT) FROM CUSTOMER_PRODUCTS cp
                    WHERE cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS='ACTIVE' AND cp.CATEGORY='reksa_dana'),0) AS REKSADANA_TOTAL,
              NVL((SELECT SUM(cp.AMOUNT) FROM CUSTOMER_PRODUCTS cp
                    WHERE cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS='ACTIVE' AND cp.CATEGORY='obligasi'),0) AS OBLIGASI_TOTAL
         FROM CUSTOMERS c
        WHERE c.CUSTOMER_ID = :1`,
      [customerId]
    );
    const customer = custResult.rows?.[0];
    if (!customer) {
      paf.emitStage(res, 'Profile Analysis Agent', 'error', 'Nasabah tidak ditemukan');
      paf.emitDone(res);
      return;
    }

    const [existingCategories, customerGoals] = await Promise.all([
      getCustomerProductCategories(customerId),
      goalSvc.getCustomerGoals(customerId),
    ]);
    paf.emitStage(res, 'Profile Analysis Agent', 'done', `Profil ${customer.RISK_PROFILE} · ${existingCategories.length} kategori aktif · ${customerGoals.length} tujuan keuangan`);

    // Stage 2 — RAG context
    paf.emitStage(res, 'Context Retrieval Agent', 'active', 'Mengambil riwayat dan preferensi nasabah...');
    const query = `rekomendasi produk investasi ${customer.RISK_PROFILE} ${customer.TIER}`;
    const [profileDocs, notesDocs] = await Promise.all([
      rag.searchCustomerContext(query, customerId, 3),
      rag.searchMeetingNotes('produk investasi preferensi tujuan keuangan', customerId, 2),
    ]);
    paf.emitStage(res, 'Context Retrieval Agent', 'done', `${profileDocs.length + notesDocs.length} konteks ditemukan`);

    // Stage 3 — Product scoring
    paf.emitStage(res, 'Product Scoring Agent', 'active', 'Menghitung skor kesesuaian produk...');
    const products = await getActiveProducts();
    const productDocs = await rag.searchProducts(
      `produk ${customer.RISK_PROFILE} ${customer.TIER} income ${customer.MONTHLY_INCOME}`, 6
    );
    paf.emitStage(res, 'Product Scoring Agent', 'done', `${products.length} produk dievaluasi`);

    // Stage 4 — LLM recommendation
    paf.emitStage(res, 'Recommendation Agent', 'active', 'Membuat rekomendasi personal...');

    const totalAum = Number(customer.TOTAL_AUM || 0);
    const depTotal = Number(customer.DEPOSITO_TOTAL || 0);
    const rdTotal  = Number(customer.REKSADANA_TOTAL || 0);
    const obTotal  = Number(customer.OBLIGASI_TOTAL || 0);
    const cashEquiv = totalAum - depTotal - rdTotal - obTotal;

    const allocationPct = (val) => totalAum > 0 ? ((val / totalAum) * 100).toFixed(1) : '0.0';

    const prompt = `
Buat rekomendasi produk yang sangat personal dan terstruktur untuk nasabah berikut.

## Profil Nasabah [Profil Nasabah]
- Nama: ${customer.FULL_NAME}
- Usia: ${customer.AGE} tahun | Tier: ${customer.TIER_LABEL || customer.TIER}
- Profil Risiko: ${customer.RISK_PROFILE}
- Pendapatan Bulanan: Rp ${Number(customer.MONTHLY_INCOME || 0).toLocaleString('id-ID')}
- Total AUM: Rp ${totalAum.toLocaleString('id-ID')}
- Kategori Produk Aktif: ${existingCategories.length > 0 ? existingCategories.join(', ') : 'Belum ada'}

## Alokasi Portofolio Saat Ini [Profil Nasabah]
- Deposito:    Rp ${depTotal.toLocaleString('id-ID')} (${allocationPct(depTotal)}%)
- Reksa Dana:  Rp ${rdTotal.toLocaleString('id-ID')} (${allocationPct(rdTotal)}%)
- Obligasi:    Rp ${obTotal.toLocaleString('id-ID')} (${allocationPct(obTotal)}%)
- Kas/Lainnya: Rp ${cashEquiv.toLocaleString('id-ID')} (${allocationPct(cashEquiv)}%)

## Tujuan Keuangan Nasabah [Tujuan Keuangan]
${customerGoals.length > 0
  ? customerGoals.map(g =>
      `- ${g.ICON || '🎯'} ${g.LABEL}${g.TARGET_AMOUNT ? ': target Rp ' + Number(g.TARGET_AMOUNT).toLocaleString('id-ID') : ''}${g.TARGET_YEAR ? ' (target tahun ' + g.TARGET_YEAR + ')' : ''}`
    ).join('\n')
  : '- Belum ada tujuan keuangan yang dicatat'
}

## Produk Tersedia [Katalog Produk]
${products.map(p =>
  `- ${p.PRODUCT_NAME} (${p.CATEGORY}): ${p.INTEREST_RATE || '-'}% p.a., risiko ${p.RISK_LEVEL}, min Rp ${Number(p.MIN_AMOUNT || 0).toLocaleString('id-ID')}${p.GOAL_TAG ? ', goal: ' + p.GOAL_TAG : ''}`
).join('\n')}

════════════════════════════════
FORMAT OUTPUT WAJIB (ikuti persis):
════════════════════════════════

### 🔍 DASAR SELEKSI NASABAH
Jelaskan dalam 2–3 kalimat MENGAPA nasabah ini mendapatkan analisis rekomendasi ini sekarang:
- Signal data spesifik yang menjadi pemicu (contoh: kas idle > X%, konsentrasi tinggi di deposito, dll.) [Profil Nasabah]
- Gap portofolio yang teridentifikasi vs profil risiko ${customer.RISK_PROFILE} dan tujuan keuangan yang dinyatakan [Tujuan Keuangan]
- Peluang yang terlewat jika tidak ditindaklanjuti

### 📊 ANALISIS PORTOFOLIO
Evaluasi singkat: kelebihan dan kelemahan alokasi saat ini vs benchmark profil ${customer.RISK_PROFILE} [Profil Nasabah].
Identifikasi: over-concentration, under-diversified, idle cash ratio.

### 🎯 REKOMENDASI UTAMA (3 produk teratas)
Untuk setiap rekomendasi gunakan format ini:

**[Nomor]. [Nama Produk]** ([Kategori]) — Skor Kesesuaian: [X]/10
- **Mengapa produk ini:** [kaitkan LANGSUNG ke profil risiko, usia, DAN tujuan keuangan yang dinyatakan nasabah] [Katalog Produk] [Tujuan Keuangan]
- **Mengapa sekarang:** [signal atau trigger spesifik dari portofolio yang membuat ini relevan hari ini]
- **Evidence data:** [data konkret dari portofolio yang mendukung rekomendasi ini] [Profil Nasabah]
- **Nominal yang disarankan:** Rp [X] ([Y]% dari AUM / kas idle)
- **Proyeksi return:**
  - Optimis: Rp [X] dalam [Y] bulan (asumsi rate [Z]%) (estimasi, bukan jaminan)
  - Dasar:   Rp [X] dalam [Y] bulan
  - Konservatif: Rp [X] dalam [Y] bulan
- **3 Pitch Points untuk RM:** [argumen kunci yang relevan untuk nasabah ini spesifik]
- → Tingkat Kepercayaan: [TINGGI/SEDANG/RENDAH] — [alasan]

### 🗂️ TARGET ALOKASI IDEAL
Tabel alokasi yang direkomendasikan untuk profil ${customer.RISK_PROFILE}:
| Kategori | Saat Ini | Target Ideal | Selisih |
|----------|----------|--------------|---------|
| Deposito | ${allocationPct(depTotal)}% | ...% | ... |
| Reksa Dana | ${allocationPct(rdTotal)}% | ...% | ... |
| Obligasi | ${allocationPct(obTotal)}% | ...% | ... |

### ✅ NEXT STEPS — ACTION PLAN
| Waktu | Tindakan Konkret |
|-------|-----------------|
| Hari ini | ... |
| 3 hari | ... |
| 1 minggu | ... |
| Setelah deal | ... |

### 📌 DATA SUMBER YANG DIGUNAKAN
Sebutkan sumber yang berkontribusi: [Profil Nasabah] / [Tujuan Keuangan] / [Catatan Meeting] / [Katalog Produk] / [Historis Analisis AI] / [Pengetahuan Umum].
Jika ada data yang tidak tersedia atau terbatas, sebutkan di sini.
    `.trim();

    paf.emitStage(res, 'Recommendation Agent', 'done', 'Rekomendasi siap disampaikan');

    await llm.chatStream(
      prompt,
      llm.buildRMPreamble(customer.FULL_NAME),
      [...profileDocs, ...notesDocs, ...productDocs],
      res,
      { maxTokens: 2000 }
    );

  } catch (err) {
    console.error('[Recommendation] analyzeAndStream error:', err);
    paf.emitStage(res, 'Error', 'error', err.message);
    paf.emitDone(res);
  }
}

module.exports = { analyzeAndStream, getActiveProducts };
