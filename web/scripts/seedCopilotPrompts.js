'use strict';
/**
 * scripts/seedCopilotPrompts.js
 * Replaces all rows in COPILOT_SUGGESTED_PROMPTS with the full sample dataset.
 * Safe to re-run: truncates table first, then inserts 40 prompts.
 *
 * Usage:  node scripts/seedCopilotPrompts.js
 */
require('dotenv').config();
const oracledb = require('oracledb');
const path     = require('path');

// ─── Sample dataset ───────────────────────────────────────────────────────────
// 4 categories × 10 prompts = 40 total
// category: customer | portfolio | product | general
const PROMPTS = [

  // ── 👤  CUSTOMER  ─────────────────────────────────────────────────────────
  {
    text:     'Rangkum profil lengkap Hendra Kusuma Jati: AUM, produk aktif, risiko, dan rekomendasi aksi',
    category: 'customer', icon: '👤', order: 10,
  },
  {
    text:     'Apa yang harus saya sampaikan kepada Budi Santoso soal penurunan reksa dana sahamnya?',
    category: 'customer', icon: '🚨', order: 11,
  },
  {
    text:     'Buatkan skrip percakapan untuk follow-up nasabah yang reksa dananya merugi bulan ini',
    category: 'customer', icon: '💬', order: 12,
  },
  {
    text:     'Nasabah mana yang AUM-nya turun signifikan dalam 3 bulan terakhir?',
    category: 'customer', icon: '📉', order: 13,
  },
  {
    text:     'Identifikasi nasabah dengan potensi churn tinggi berdasarkan pola transaksi dan sentimen call center',
    category: 'customer', icon: '⚠️', order: 14,
  },
  {
    text:     'Analisa sentimen percakapan call center CUST003 dan rekomendasikan langkah tindak lanjut RM',
    category: 'customer', icon: '📞', order: 15,
  },
  {
    text:     'Siapa nasabah tier Regular yang paling berpotensi untuk upgrade ke Privilege bulan ini?',
    category: 'customer', icon: '⭐', order: 16,
  },
  {
    text:     'Buatkan personalized pitch untuk Sari Rahayu berdasarkan profil risiko dan tujuan keuangannya',
    category: 'customer', icon: '🎯', order: 17,
  },
  {
    text:     'Bagaimana cara terbaik mendekati Budi Santoso untuk menawarkan rollover deposito yang jatuh tempo?',
    category: 'customer', icon: '🤝', order: 18,
  },
  {
    text:     'Rangkum riwayat interaksi dan histori rekomendasi AI untuk nasabah CUST005 dalam 6 bulan terakhir',
    category: 'customer', icon: '🔍', order: 19,
  },

  // ── 📊  PORTFOLIO  ────────────────────────────────────────────────────────
  {
    text:     'Deposito nasabah mana yang jatuh tempo dalam 7 hari ke depan dan apa opsi reinvestasinya?',
    category: 'portfolio', icon: '📅', order: 20,
  },
  {
    text:     'Identifikasi nasabah yang konsentrasi asetnya di atas 80% pada satu produk (risiko over-concentration)',
    category: 'portfolio', icon: '⚖️', order: 21,
  },
  {
    text:     'Analisa dampak kenaikan BI Rate 25 bps terhadap portofolio deposito seluruh nasabah saya',
    category: 'portfolio', icon: '📈', order: 22,
  },
  {
    text:     'Nasabah mana yang perlu rebalancing portofolio berdasarkan profil risiko mereka saat ini?',
    category: 'portfolio', icon: '🔄', order: 23,
  },
  {
    text:     'Berapa total AUM saya dan bagaimana distribusinya per produk dan per tier nasabah?',
    category: 'portfolio', icon: '💰', order: 24,
  },
  {
    text:     'Buat ringkasan semua portfolio alert aktif beserta urutan prioritas penanganannya',
    category: 'portfolio', icon: '🔔', order: 25,
  },
  {
    text:     'Nasabah mana yang eligible untuk penambahan eksposur reksa dana saham berdasarkan risk tolerance?',
    category: 'portfolio', icon: '📊', order: 26,
  },
  {
    text:     'Simulasikan proyeksi keuntungan kumulatif portofolio Hendra Kusuma Jati selama 4 kuartal ke depan',
    category: 'portfolio', icon: '🔮', order: 27,
  },
  {
    text:     'Identifikasi nasabah yang paper loss-nya melebihi 15% dan membutuhkan intervensi segera',
    category: 'portfolio', icon: '🚨', order: 28,
  },
  {
    text:     'Bandingkan performa portofolio antar nasabah Prioritas saya di bulan Mei 2026',
    category: 'portfolio', icon: '🏆', order: 29,
  },

  // ── 🏦  PRODUCT  ──────────────────────────────────────────────────────────
  {
    text:     'Buatkan pitch ORI-027 yang dipersonalisasi untuk nasabah dengan profil risiko konservatif',
    category: 'product', icon: '🏛️', order: 30,
  },
  {
    text:     'Apa perbedaan utama Deposito Reguler vs Reksa Dana Pasar Uang? Kapan sebaiknya merekomendasikan masing-masing?',
    category: 'product', icon: '⚖️', order: 31,
  },
  {
    text:     'Produk investasi apa yang paling cocok untuk nasabah baru dengan profil risiko moderat dan horizon 3 tahun?',
    category: 'product', icon: '🎯', order: 32,
  },
  {
    text:     'Buatkan skrip penawaran asuransi jiwa unit link untuk nasabah dengan tanggungan keluarga besar',
    category: 'product', icon: '🛡️', order: 33,
  },
  {
    text:     'Buat proposal bundling produk: deposito + reksa dana untuk nasabah dengan AUM Rp 500 juta',
    category: 'product', icon: '📦', order: 34,
  },
  {
    text:     'Nasabah mana yang paling cocok untuk ditawarkan Reksa Dana Pendapatan Tetap bulan ini?',
    category: 'product', icon: '📋', order: 35,
  },
  {
    text:     'Berikan rekomendasi alokasi portofolio optimal untuk nasabah usia 45 tahun dengan profil moderat',
    category: 'product', icon: '🗂️', order: 36,
  },
  {
    text:     'Buatkan skrip upgrade tier Privilege untuk nasabah yang baru mencapai AUM Rp 500 juta',
    category: 'product', icon: '⭐', order: 37,
  },
  {
    text:     'Daftar nasabah yang eligible untuk penempatan ORI-027 sebelum window subscription tutup',
    category: 'product', icon: '⏰', order: 38,
  },
  {
    text:     'Jelaskan keunggulan kompetitif produk wealth management Danamon dibandingkan bank pesaing',
    category: 'product', icon: '🏦', order: 39,
  },

  // ── 🗓️  GENERAL  ──────────────────────────────────────────────────────────
  {
    text:     'Buatkan agenda dan prioritas kerja saya sebagai RM untuk hari ini berdasarkan alert dan jatuh tempo aktif',
    category: 'general', icon: '🗓️', order: 40,
  },
  {
    text:     'Siapa saja nasabah yang perlu saya hubungi hari ini dan apa pesan kuncinya untuk masing-masing?',
    category: 'general', icon: '📋', order: 41,
  },
  {
    text:     'Buatkan template email follow-up setelah meeting rebalancing portofolio dengan nasabah',
    category: 'general', icon: '📧', order: 42,
  },
  {
    text:     'Rangkumkan semua catatan meeting saya dengan nasabah dalam seminggu terakhir',
    category: 'general', icon: '📝', order: 43,
  },
  {
    text:     'Bagaimana cara menangani nasabah yang komplain tentang performa reksa dana saham saat pasar turun?',
    category: 'general', icon: '🛠️', order: 44,
  },
  {
    text:     'Buatkan talking points untuk presentasi layanan wealth management kepada prospek nasabah baru',
    category: 'general', icon: '🎤', order: 45,
  },
  {
    text:     'Apa saja target dan KPI RM yang perlu saya perhatikan untuk mencapai kuota bulan ini?',
    category: 'general', icon: '📊', order: 46,
  },
  {
    text:     'Buatkan skrip cold-call yang menarik untuk menawarkan layanan investasi kepada prospek baru',
    category: 'general', icon: '📱', order: 47,
  },
  {
    text:     'Apa regulasi OJK terbaru yang perlu saya perhatikan saat merekomendasikan produk investasi?',
    category: 'general', icon: '⚖️', order: 48,
  },
  {
    text:     'Strategi apa yang paling efektif untuk meningkatkan AUM portofolio saya 20% dalam 6 bulan ke depan?',
    category: 'general', icon: '🚀', order: 49,
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
async function run() {
  const walletDir = path.resolve(process.env.DB_WALLET_DIR || './wallet');
  oracledb.autoCommit = false;
  oracledb.outFormat  = oracledb.OUT_FORMAT_OBJECT;

  await oracledb.createPool({
    user:           process.env.DB_USER     || 'ADMIN',
    password:       process.env.DB_PASSWORD,
    connectString:  process.env.DB_CONNECT_STRING,
    configDir:      walletDir,
    walletLocation: walletDir,
    walletPassword: process.env.DB_WALLET_PASSWORD || undefined,
    poolMin: 1, poolMax: 1, poolIncrement: 0,
  });

  const conn = await oracledb.getConnection();

  try {
    // 1. Wipe existing data and reset identity
    await conn.execute(`DELETE FROM COPILOT_SUGGESTED_PROMPTS`);
    console.log('[OK] Cleared existing prompts');

    // 2. Insert all 40 prompts
    let inserted = 0;
    for (const p of PROMPTS) {
      await conn.execute(
        `INSERT INTO COPILOT_SUGGESTED_PROMPTS
           (PROMPT_TEXT, CATEGORY, ICON, SORT_ORDER)
         VALUES (:1, :2, :3, :4)`,
        [p.text, p.category, p.icon, p.order]
      );
      inserted++;
    }

    await conn.commit();

    console.log(`[OK] Inserted ${inserted} prompts`);

    // 3. Verify
    const cnt = await conn.execute(
      `SELECT CATEGORY, COUNT(*) AS CNT
         FROM COPILOT_SUGGESTED_PROMPTS
         GROUP BY CATEGORY
         ORDER BY CATEGORY`
    );
    console.log('\n[OK] Prompt counts by category:');
    cnt.rows.forEach(r => console.log(`  ${r.CATEGORY.padEnd(12)} : ${r.CNT}`));

    const total = await conn.execute(`SELECT COUNT(*) AS CNT FROM COPILOT_SUGGESTED_PROMPTS`);
    console.log(`\n[DONE] Total: ${total.rows[0].CNT} prompts in COPILOT_SUGGESTED_PROMPTS`);

  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.close();
  }

  process.exit(0);
}

run().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
