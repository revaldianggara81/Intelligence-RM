'use strict';
// Test PRODUCT_NAME_PATTERNS matching logic directly (no browser needed)

const PRODUCT_BROCHURE_MAP = {
  'PROD001': '/docs/product-brochures/pdf/PROD001_Deposito_Reguler_6_Bulan.pdf',
  'PROD002': '/docs/product-brochures/pdf/PROD002_Deposito_Prioritas_12_Bulan.pdf',
  'PROD003': '/docs/product-brochures/pdf/PROD003_Reksa_Dana_Pendapatan_Tetap.pdf',
  'PROD004': '/docs/product-brochures/pdf/PROD004_Reksa_Dana_Saham_Bluechip.pdf',
  'PROD005': '/docs/product-brochures/pdf/PROD005_Obligasi_Negara_Ritel_ORI024.pdf',
  'PROD006': '/docs/product-brochures/pdf/PROD006_Asuransi_Jiwa_Unit_Link.pdf',
  'PROD007': '/docs/product-brochures/pdf/PROD007_Tabungan_Danamon_Lebih.pdf',
  'PROD008': '/docs/product-brochures/pdf/PROD008_Deposito_Reguler_3_Bulan.pdf',
};
const PRODUCT_NAME_PATTERNS = [
  { re:/reksa[\s\-]*dana[\s\-]*saham|rd[\s\-]*saham|equity[\s\-]*fund|bluechip|blue[\s\-]*chip/i,        id:'PROD004', label:'Reksa Dana Saham Bluechip' },
  { re:/reksa[\s\-]*dana[\s\-]*pendapatan[\s\-]*tetap|rd[\s\-]*pendapatan|fixed[\s\-]*income[\s\-]*fund/i, id:'PROD003', label:'Reksa Dana Pendapatan Tetap' },
  { re:/deposito[\s\-]*prioritas/i,                                                                        id:'PROD002', label:'Deposito Prioritas 12 Bulan' },
  { re:/deposito[\s\-]*reguler[\s\-]*6|deposito.*6[\s\-]*bulan/i,                                         id:'PROD001', label:'Deposito Reguler 6 Bulan' },
  { re:/deposito[\s\-]*reguler[\s\-]*3|deposito.*3[\s\-]*bulan/i,                                         id:'PROD008', label:'Deposito Reguler 3 Bulan' },
  { re:/ORI[\s\-]*0?2[4-9]|ori0?2[4-9]|obligasi[\s\-]*negara[\s\-]*ritel/i,                              id:'PROD005', label:'Obligasi Negara Ritel ORI024' },
  { re:/asuransi[\s\-]*jiwa[\s\-]*unit[\s\-]*link|unit[\s\-]*link/i,                                      id:'PROD006', label:'Asuransi Jiwa Unit Link' },
  { re:/tabungan[\s\-]*danamon[\s\-]*lebih|tabungan[\s\-]*lebih/i,                                         id:'PROD007', label:'Tabungan Danamon Lebih' },
  { re:/deposito[\s\-]*berjangka/i,                                                                        id:'PROD001', label:'Deposito Reguler 6 Bulan' },
  { re:/deposito[\s\-]*reguler(?!\s*\d)/i,                                                                 id:'PROD001', label:'Deposito Reguler 6 Bulan' },
  { re:/reksa[\s\-]*dana(?![\s\-]*saham|[\s\-]*campuran)/i,                                               id:'PROD003', label:'Reksa Dana Pendapatan Tetap' },
  { re:/reksa[\s\-]*dana[\s\-]*campuran|balanced[\s\-]*fund/i,                                            id:'PROD003', label:'Reksa Dana Pendapatan Tetap' },
  { re:/obligasi[\s\-]*negara|surat[\s\-]*berharga[\s\-]*negara|SBN/,                                    id:'PROD005', label:'Obligasi Negara Ritel ORI024' },
  { re:/obligasi[\s\-]*korporasi|corporate[\s\-]*bond/i,                                                  id:'PROD003', label:'Reksa Dana Pendapatan Tetap' },
  { re:/asuransi[\s\-]*(?:pendidikan|jiwa|keluarga)|unit[\s\-]*link/i,                                    id:'PROD006', label:'Asuransi Jiwa Unit Link' },
];

function matchPatterns(text) {
  const matched = [];
  const seenIds = new Set();
  for (const { re, id, label } of PRODUCT_NAME_PATTERNS) {
    if (re.test(text) && !seenIds.has(id)) {
      seenIds.add(id);
      matched.push({ id, label });
    }
  }
  return matched;
}

// Simulate typical LLM output texts
const testTexts = [
  // Maturity reminder typical output
  {
    name: 'Maturity reminder - generic deposito',
    text: `Analisis Jatuh Tempo & Tindak Lanjut

Rekap Produk Jatuh Tempo:
Nasabah ini memiliki Deposito Berjangka sebesar Rp 500.000.000 yang akan jatuh tempo pada 15 Juni 2026.

Rekomendasi Tindak Lanjut:
1. Renewal ke Deposito Reguler dengan tenor 12 bulan untuk tingkat bunga lebih kompetitif
2. Diversifikasi ke Reksa Dana untuk potensi return lebih tinggi
3. Pertimbangkan alokasi ke Obligasi Negara (SBN) untuk portofolio lebih stabil`
  },
  // Product recommendation typical output
  {
    name: 'Recommendation - various products',
    text: `Rekomendasi Produk Investasi

Berdasarkan profil risiko nasabah yang Moderate-Aggressive:

1. Reksa Dana Saham Bluechip (Alokasi: 40%)
   Potensi return tinggi untuk jangka panjang

2. Deposito Prioritas 12 Bulan (Alokasi: 30%)
   Proteksi modal dengan bunga 6.25% p.a.

3. Obligasi Negara ORI024 (Alokasi: 30%)
   Kupon tetap, risiko rendah`
  },
  // Campaign output
  {
    name: 'Campaign scan - generic names',
    text: `Nasabah ini eligible untuk kampanye Cross-Sell Reksa Dana.
Saat ini memiliki deposito berjangka namun belum memiliki produk investasi.
Rekomendasikan: Reksa Dana Pendapatan Tetap atau Unit Link untuk diversifikasi.`
  },
  // Alert output
  {
    name: 'Portfolio alert',
    text: `Alert Portofolio: Reksa dana saham mengalami koreksi -8.5% dalam 30 hari terakhir.
Portofolio nasabah yang mengandung reksa dana campuran dan deposito berjangka
perlu di-review. Pertimbangkan rebalancing ke asuransi jiwa unit link.`
  },
  // Edge case: no products mentioned
  {
    name: 'No products',
    text: 'Nasabah ini tidak memiliki produk investasi aktif saat ini. Silakan hubungi untuk onboarding.'
  },
];

console.log('=== Pattern Matching Test ===\n');
let allPassed = true;
for (const { name, text } of testTexts) {
  const matches = matchPatterns(text);
  const hasProducts = name !== 'No products';
  const passed = hasProducts ? matches.length > 0 : matches.length === 0;
  allPassed = allPassed && passed;
  console.log(`[${passed ? '✓' : '✗'}] ${name}`);
  if (matches.length > 0) {
    matches.forEach(m => console.log(`   → ${m.id}: ${m.label} (URL: ${PRODUCT_BROCHURE_MAP[m.id]})`));
  } else {
    console.log('   → (no matches)');
  }
  console.log();
}
console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
