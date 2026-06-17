'use strict';
/**
 * Campaign Service — Scenario 2b: Privilege Upgrade Campaign
 * Scans customers against campaign rules and generates personalized pitches.
 */
const db  = require('../config/database');
const llm = require('./llmService');
const rag = require('./ragService');
const paf = require('./pafService');

/** Get active campaigns */
async function getActiveCampaigns() {
  const result = await db.execute(
    `SELECT * FROM CAMPAIGNS WHERE STATUS = 'ACTIVE' ORDER BY START_DATE DESC`
  );
  return result.rows || [];
}

/** Get campaign eligibility with customer details */
async function getCampaignEligibility(campaignId) {
  const result = await db.execute(
    `SELECT
       ce.*, c.FULL_NAME, c.INITIALS, c.AVATAR_COLOR,
       c.TIER, c.TIER_LABEL, c.RISK_PROFILE, c.TOTAL_AUM, c.MONTHLY_INCOME
     FROM CAMPAIGN_ELIGIBILITY ce
     JOIN CUSTOMERS c ON ce.CUSTOMER_ID = c.CUSTOMER_ID
     WHERE ce.CAMPAIGN_ID = :1
     ORDER BY ce.IS_ELIGIBLE DESC, ce.AUM_3M_AVG DESC NULLS LAST`,
    [campaignId]
  );
  return result.rows || [];
}

/**
 * Scan all customers in an RM's portfolio against campaign rules.
 * Updates CAMPAIGN_ELIGIBILITY table and streams progress.
 */
async function scanAndStream(campaignId, rmUserId, res) {
  try {
    // Stage 1 — Load campaign rules
    paf.emitStage(res, 'Campaign Rules Agent', 'active', 'Memuat aturan kampanye...');
    const campResult = await db.execute(
      `SELECT * FROM CAMPAIGNS WHERE CAMPAIGN_ID = :1`, [campaignId]
    );
    const campaign = campResult.rows?.[0];
    if (!campaign) {
      paf.emitStage(res, 'Campaign Rules Agent', 'error', 'Kampanye tidak ditemukan');
      paf.emitDone(res);
      return;
    }
    let rules = [];
    try { rules = JSON.parse(campaign.RULES || '[]'); } catch (_) {}
    paf.emitStage(res, 'Campaign Rules Agent', 'done', `${rules.length} aturan dimuat`);

    // Stage 2 — Load customer portfolio
    paf.emitStage(res, 'Portfolio Scan Agent', 'active', 'Memindai portofolio nasabah...');
    const customers = await db.execute(
      `SELECT c.*,
              NVL((SELECT MIN(ROUND(cp.MATURITY_DATE - SYSDATE))
                     FROM CUSTOMER_PRODUCTS cp
                    WHERE cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS='ACTIVE'
                      AND cp.MATURITY_DATE IS NOT NULL AND cp.MATURITY_DATE >= SYSDATE), 999) AS MATURITY_DAYS,
              NVL((SELECT COUNT(*) FROM ALERTS a
                    WHERE a.CUSTOMER_ID = c.CUSTOMER_ID AND a.ALERT_TYPE = 'cc_missed'), 0) AS FAILED_TXN,
              MONTHS_BETWEEN(SYSDATE, c.CREATED_AT) AS ACCOUNT_AGE_MONTHS
         FROM CUSTOMERS c
        WHERE c.RM_USER_ID = :1`,
      [rmUserId]
    );
    const allCustomers = customers.rows || [];
    paf.emitStage(res, 'Portfolio Scan Agent', 'done', `${allCustomers.length} nasabah dipindai`);

    // Stage 3 — Rule evaluation
    paf.emitStage(res, 'Eligibility Agent', 'active', 'Mengevaluasi eligibilitas per nasabah...');

    let eligibleCount = 0;
    const eligibilityResults = [];

    for (const cust of allCustomers) {
      const eval1 = evaluateRule(rules[0], cust);
      const eval2 = evaluateRule(rules[1], cust);
      const eval3 = evaluateRule(rules[2], cust);
      const isEligible = eval1 && eval2 && eval3;

      if (isEligible) eligibleCount++;

      eligibilityResults.push({
        CUSTOMER_ID: cust.CUSTOMER_ID,
        FULL_NAME:   cust.FULL_NAME,
        TIER:        cust.TIER,
        TOTAL_AUM:   cust.TOTAL_AUM,
        IS_ELIGIBLE: isEligible ? 1 : 0,
        RULE1_PASS:  eval1 ? 1 : 0,
        RULE2_PASS:  eval2 ? 1 : 0,
        RULE3_PASS:  eval3 ? 1 : 0,
      });

      // Upsert into CAMPAIGN_ELIGIBILITY
      await upsertEligibility(campaignId, cust.CUSTOMER_ID, {
        isEligible: isEligible ? 1 : 0,
        rule1Pass:  eval1 ? 1 : 0,
        rule2Pass:  eval2 ? 1 : 0,
        rule3Pass:  eval3 ? 1 : 0,
        aum3mAvg:   cust.TOTAL_AUM,
      });

      // Emit progress
      paf.emitResult(res, {
        type: 'eligibility_update',
        customer: {
          id:          cust.CUSTOMER_ID,
          name:        cust.FULL_NAME,
          tier:        cust.TIER,
          aum:         cust.TOTAL_AUM,
          isEligible,
          rule1Pass:   eval1,
          rule2Pass:   eval2,
          rule3Pass:   eval3,
        },
      });
    }

    paf.emitStage(res, 'Eligibility Agent', 'done', `${eligibleCount} nasabah eligible dari ${allCustomers.length}`);

    // Stage 4 — Generate pitch for top eligible customers
    if (eligibleCount > 0) {
      paf.emitStage(res, 'Pitch Generation Agent', 'active', 'Membuat pitch personal untuk nasabah eligible...');

      const topEligible = eligibilityResults
        .filter(e => e.IS_ELIGIBLE)
        .sort((a, b) => Number(b.TOTAL_AUM) - Number(a.TOTAL_AUM))
        .slice(0, 3);

      const pitchList = topEligible.map(e =>
        `- ${e.FULL_NAME} (${e.TIER}): AUM Rp ${Number(e.TOTAL_AUM || 0).toLocaleString('id-ID')}`
      ).join('\n');

      // Build detailed eligibility evidence for each top eligible customer
      const eligibleDetail = topEligible.map((e, idx) => {
        const aumFmt = Number(e.TOTAL_AUM || 0).toLocaleString('id-ID');
        const rules  = [];
        if (e.RULE1_PASS) rules.push('✓ Nasabah personal (bukan korporasi)');
        if (e.RULE2_PASS) rules.push('✓ Belum berstatus Privilege dalam 6 bulan terakhir');
        if (e.RULE3_PASS) rules.push(`✓ AUM rata-rata 3 bulan ≥ Rp 500 juta (aktual: Rp ${aumFmt})`);
        return `${idx + 1}. **${e.FULL_NAME}** (${e.TIER}) — AUM: Rp ${aumFmt}\n   Bukti kelayakan:\n   ${rules.join('\n   ')}`;
      }).join('\n\n');

      const prompt = `
Kampanye: **${campaign.NAME}**
${campaign.DESCRIPTION}

## Nasabah Eligible Teratas [Profil Nasabah]
${eligibleDetail}

════════════════════════════════
FORMAT OUTPUT WAJIB (ikuti persis):
════════════════════════════════

### 🔍 DASAR SELEKSI SETIAP NASABAH
Untuk setiap nasabah di atas, jelaskan MENGAPA mereka dipilih — bukan hanya "memenuhi syarat",
tapi signal data spesifik apa yang membuat SEKARANG adalah waktu yang tepat untuk approach:
- Nilai AUM aktual vs threshold kampanye
- Perubahan AUM dalam 3 bulan terakhir (tren naik/stabil)
- Alasan mengapa nasabah ini kemungkinan receptive saat ini

### 📋 STRATEGI KAMPANYE PER NASABAH
Untuk SETIAP nasabah eligible, buat:

**[Nama Nasabah]** — Prioritas: [1/2/3]
- **Opening approach terbaik:** [via telepon / WhatsApp / kunjungan — pilih satu dan jelaskan mengapa]
- **Pesan kunci personal:** [sesuaikan dengan tier dan AUM nasabah, bukan template generik]
- **Benefit Privilege yang paling relevan untuknya:** [maksimal 2 benefit yang paling sesuai profilnya]
- **Timing yang disarankan:** [hari/waktu dan alasan]

### 📧 EMAIL TEMPLATE (siap kirim)
Subject: [Subject yang personal dan menarik]
[Isi email — personal, bukan template korporat, referensi langsung ke nasabah terkemuka]

### 📱 SCRIPT TELEPON (30–45 detik)
[Script natural yang bisa langsung dibacakan — bukan kaku seperti skrip formal]

### 🛡️ OBJECTION HANDLING
| Keberatan Umum | Respons Terbaik |
|----------------|-----------------|
| "Saya sudah puas dengan layanan saat ini" | ... |
| "Apa bedanya dengan layanan saya sekarang?" | ... |
| "Nanti saja, saya sedang sibuk" | ... |

### ✅ NEXT STEPS — ACTION PLAN
| Nasabah | Tindakan Pertama | Tenggat |
|---------|-----------------|---------|
| [Nama 1] | ... | ... |
| [Nama 2] | ... | ... |
| [Nama 3] | ... | ... |

### 📌 DATA SUMBER YANG DIGUNAKAN
Sebutkan sumber yang berkontribusi: [Profil Nasabah] / [Catatan Meeting] / [Katalog Produk] / [Pengetahuan Umum].
      `.trim();

      await llm.chatStream(
        prompt,
        llm.buildRMPreamble(),
        [],
        res,
        { maxTokens: 1500 }
      );
    } else {
      // Emit summary result
      paf.emitResult(res, {
        type: 'scan_complete',
        eligibleCount,
        totalScanned: allCustomers.length,
        message: 'Tidak ada nasabah yang memenuhi semua syarat kampanye saat ini.',
      });
      paf.emitDone(res);
    }

  } catch (err) {
    console.error('[Campaign] scanAndStream error:', err);
    paf.emitStage(res, 'Error', 'error', err.message);
    paf.emitDone(res);
  }
}

/** Generate a personalized pitch for one customer in a campaign */
async function generatePitch(campaignId, customerId, res) {
  try {
    const [campResult, custResult] = await Promise.all([
      db.execute(`SELECT * FROM CAMPAIGNS WHERE CAMPAIGN_ID = :1`, [campaignId]),
      db.execute(`SELECT * FROM CUSTOMERS WHERE CUSTOMER_ID = :1`, [customerId]),
    ]);
    const campaign = campResult.rows?.[0];
    const customer = custResult.rows?.[0];
    if (!campaign || !customer) {
      paf.emitDone(res);
      return;
    }

    paf.emitStage(res, 'Pitch Agent', 'active', 'Membuat pitch personal...');
    const notesDocs = await rag.searchMeetingNotes('preferensi layanan premium upgrade', customerId, 2);

    const prompt = `
Buat pitch personal yang terstruktur untuk nasabah berikut.

## Profil Nasabah [Profil Nasabah]
- Nama: ${customer.FULL_NAME}
- Tier: ${customer.TIER_LABEL || customer.TIER}
- AUM: Rp ${Number(customer.TOTAL_AUM || 0).toLocaleString('id-ID')}
- Profil Risiko: ${customer.RISK_PROFILE}
- Usia: ${customer.AGE} tahun

## Kampanye: "${campaign.NAME}"
${campaign.DESCRIPTION}

════════════════════════════════
FORMAT OUTPUT WAJIB (ikuti persis):
════════════════════════════════

### 🔍 MENGAPA NASABAH INI DIPILIH
Jelaskan secara spesifik berdasarkan data:
- Data signal yang membuat nasabah ini eligible [Profil Nasabah]
- Mengapa SEKARANG adalah waktu yang tepat untuk approach ini
- Benefit Privilege yang paling relevan untuk profil nasabah ini spesifik

### 💬 PITCH SCRIPT (2–3 menit)
Percakapan langsung dari RM ke nasabah — natural, bukan kaku:

**Pembukaan** (bangun rapport, 20–30 detik):
"[kalimat natural yang mencerminkan pengenalan RM terhadap nasabah]"

**Inti Pesan** (sampaikan nilai, 60–90 detik):
"[jelaskan benefit yang relevan langsung untuk nasabah ini — sebutkan benefit spesifik sesuai tier dan kebiasaannya]"

**Transisi ke Tindakan** (30 detik):
"[ajak nasabah ke langkah selanjutnya secara natural]"

**Penutup dengan CTA jelas** (15–20 detik):
"[satu pertanyaan penutup yang mendorong komitmen]"

### 🛡️ ANTISIPASI KEBERATAN
| Kemungkinan Respons Nasabah | Jawaban RM |
|-----------------------------|-----------|
| [keberatan 1 yang spesifik untuk profil ini] | ... |
| [keberatan 2] | ... |

### ✅ NEXT STEPS SETELAH PITCH
| Waktu | Tindakan |
|-------|---------|
| Jika langsung setuju | ... |
| Jika butuh waktu berpikir | ... |
| Jika menolak | ... |

→ Tingkat Kepercayaan pitch ini berhasil: [TINGGI/SEDANG/RENDAH] — [alasan berbasis profil nasabah]

### 📌 DATA SUMBER YANG DIGUNAKAN
[Profil Nasabah] / [Catatan Meeting] / [Katalog Produk] / [Pengetahuan Umum].
    `.trim();

    paf.emitStage(res, 'Pitch Agent', 'done', 'Pitch siap');
    await llm.chatStream(prompt, llm.buildRMPreamble(customer.FULL_NAME), notesDocs, res, { maxTokens: 800 });

  } catch (err) {
    console.error('[Campaign] generatePitch error:', err);
    paf.emitDone(res);
  }
}

/** Evaluate a single rule against customer data */
function evaluateRule(rule, customer) {
  if (!rule) return true;
  const val = customer[rule.field?.toUpperCase()] ?? customer[rule.field];
  if (val === undefined || val === null) return false;

  switch (rule.op) {
    case '>=': return Number(val) >= Number(rule.value);
    case '<=': return Number(val) <= Number(rule.value);
    case '>':  return Number(val) > Number(rule.value);
    case '<':  return Number(val) < Number(rule.value);
    case '=':  return String(val).toLowerCase() === String(rule.value).toLowerCase();
    case 'in': return Array.isArray(rule.value) && rule.value.map(v => String(v).toLowerCase()).includes(String(val).toLowerCase());
    default:   return false;
  }
}

/** Upsert campaign eligibility record */
async function upsertEligibility(campaignId, customerId, data) {
  try {
    // Try update first
    const upd = await db.execute(
      `UPDATE CAMPAIGN_ELIGIBILITY
          SET IS_ELIGIBLE = :1, RULE1_PASS = :2, RULE2_PASS = :3, RULE3_PASS = :4,
              AUM_3M_AVG = :5, SCANNED_AT = CURRENT_TIMESTAMP
        WHERE CAMPAIGN_ID = :6 AND CUSTOMER_ID = :7`,
      [data.isEligible, data.rule1Pass, data.rule2Pass, data.rule3Pass,
       data.aum3mAvg, campaignId, customerId]
    );
    if ((upd.rowsAffected || 0) === 0) {
      await db.execute(
        `INSERT INTO CAMPAIGN_ELIGIBILITY
           (CAMPAIGN_ID, CUSTOMER_ID, IS_ELIGIBLE, RULE1_PASS, RULE2_PASS, RULE3_PASS, AUM_3M_AVG)
         VALUES (:1, :2, :3, :4, :5, :6, :7)`,
        [campaignId, customerId, data.isEligible, data.rule1Pass, data.rule2Pass, data.rule3Pass, data.aum3mAvg]
      );
    }
  } catch (err) {
    console.warn('[Campaign] upsertEligibility:', err.message);
  }
}

module.exports = { getActiveCampaigns, getCampaignEligibility, scanAndStream, generatePitch };
