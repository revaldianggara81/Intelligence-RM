'use strict';
/**
 * Generate product brochures (HTML + PDF) for all active products in PRODUCT_CATALOG.
 * Run: node scripts/generate_brochures.js
 * Product data sourced dynamically from Oracle PRODUCT_CATALOG table.
 */
require('dotenv').config();
const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const db        = require('../backend/config/database');

const OUT_HTML = path.join(__dirname, '../docs/product-brochures/html');
const OUT_PDF  = path.join(__dirname, '../docs/product-brochures/pdf');
fs.mkdirSync(OUT_HTML, { recursive: true });
fs.mkdirSync(OUT_PDF,  { recursive: true });

/* ─── Load products from PRODUCT_CATALOG ─────────────────────────── */
async function loadProducts() {
  const r = await db.execute(`
    SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION,
           INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS,
           RISK_LEVEL, FEATURES
      FROM PRODUCT_CATALOG
     WHERE IS_ACTIVE = 1
     ORDER BY CATEGORY, PRODUCT_ID
  `);
  return (r.rows || []).map(row => ({
    id:           row.PRODUCT_ID,
    name:         row.PRODUCT_NAME,
    category:     row.CATEGORY       || 'tabungan',
    desc:         row.DESCRIPTION    || row.PRODUCT_NAME,
    rate:         Number(row.INTEREST_RATE || 0),
    minAmount:    Number(row.MIN_AMOUNT    || 0),
    maxAmount:    row.MAX_AMOUNT ? Number(row.MAX_AMOUNT) : null,
    tenureMonths: row.TENURE_MONTHS  ? Number(row.TENURE_MONTHS) : null,
    risk:         row.RISK_LEVEL     || 'low',
    // FEATURES stored as JSON array string in DB, e.g. '["Feature A","Feature B"]'
    features: (() => {
      try { return JSON.parse(row.FEATURES || '[]'); }
      catch (_) { return row.FEATURES ? [row.FEATURES] : []; }
    })(),
  }));
}

/* ─── Lookup tables ──────────────────────────────────────────────── */
const CATEGORY_META = {
  asuransi:   { label: 'Asuransi & Proteksi', icon: '🛡️', color: '#8B5CF6', light: '#EDE9FE' },
  deposito:   { label: 'Deposito',             icon: '🏦', color: '#0EA5E9', light: '#E0F2FE' },
  obligasi:   { label: 'Obligasi Negara',      icon: '📜', color: '#16A34A', light: '#DCFCE7' },
  reksa_dana: { label: 'Reksa Dana',           icon: '📈', color: '#D97706', light: '#FEF3C7' },
  tabungan:   { label: 'Tabungan',             icon: '💰', color: '#0D9488', light: '#CCFBF1' },
};

const RISK_META = {
  low:    { label: 'Rendah',  bars: 1, color: '#16A34A', bg: '#DCFCE7', desc: 'Cocok untuk investor konservatif yang mengutamakan keamanan modal.' },
  medium: { label: 'Sedang',  bars: 2, color: '#D97706', bg: '#FEF3C7', desc: 'Cocok untuk investor moderat yang mencari keseimbangan antara risiko dan imbal hasil.' },
  high:   { label: 'Tinggi',  bars: 3, color: '#DC2626', bg: '#FEE2E2', desc: 'Cocok untuk investor agresif dengan toleransi risiko tinggi dan horizon jangka panjang.' },
};

const BENEFITS_MAP = {
  asuransi:   ['Proteksi jiwa seumur hidup (s/d usia 99 tahun)','Nilai investasi berkembang sesuai kinerja pasar','Fleksibilitas pemilihan reksa dana sesuai profil risiko','Top-up premi kapan saja sesuai kemampuan','Manfaat klaim meninggal dunia minimal 200% premi'],
  deposito:   ['Bunga kompetitif di atas rata-rata pasar','Keamanan dana dijamin oleh LPS (s/d Rp 2 miliar)','Tidak terpengaruh volatilitas pasar saham','Pencairan dana mudah dan cepat','Cocok sebagai instrumen pendapatan tetap'],
  obligasi:   ['Dijamin penuh oleh Pemerintah Republik Indonesia','Kupon dibayarkan setiap bulan secara otomatis','Dapat diperdagangkan di pasar sekunder','Kontribusi langsung pada pembangunan nasional','Imbal hasil lebih tinggi dari deposito bank'],
  reksa_dana: ['Dikelola secara profesional oleh Manajer Investasi berlisensi OJK','Diversifikasi portofolio dengan modal minimal','Laporan kinerja transparan dan real-time','Tidak dikenakan pajak atas capital gain bagi individu','Dapat diredeem kapan saja (likuiditas tinggi)'],
  tabungan:   ['Bebas biaya administrasi bulanan','Bunga berjenjang — saldo lebih besar, bunga lebih tinggi','Akses ATM & mobile banking 24/7','Gratis transfer ke rekening bank lain (N kali/bulan)','Fasilitas auto-debit untuk pembayaran rutin'],
};

const PROFILE_MAP = {
  asuransi:   ['Kepala keluarga usia 25–55 tahun','Profesional dengan tanggungan keluarga','Investor yang menginginkan dual benefit proteksi + investasi','Nasabah dengan horizon investasi panjang (> 10 tahun)'],
  deposito:   ['Investor konservatif yang mengutamakan keamanan','Nasabah dengan dana yang tidak digunakan jangka pendek','Pensiunan atau pre-pensiunan yang butuh pendapatan tetap','Pengusaha yang ingin memarkir dana operasional'],
  obligasi:   ['Investor yang mencari alternatif deposito dengan yield lebih tinggi','Nasabah yang mendukung pembangunan negara','Investor dengan toleransi risiko rendah–menengah','Cocok untuk diversifikasi portofolio fixed income'],
  reksa_dana: ['Investor yang ingin mulai berinvestasi dengan modal kecil','Profesional muda usia 25–45 tahun','Nasabah yang tidak memiliki waktu mengelola investasi sendiri','Investor yang ingin diversifikasi dari deposito ke pasar modal'],
  tabungan:   ['Nasabah umum semua segmen','Pelajar dan mahasiswa','Nasabah yang baru mulai menabung','Keluarga muda yang membutuhkan rekening fleksibel'],
};

const STEPS = ['Hubungi RM Bank Danamon Anda','Lengkapi formulir pembukaan produk','Siapkan dokumen: KTP, NPWP, dan buku tabungan','Lakukan setoran awal sesuai ketentuan','Konfirmasi dan terima dokumen produk resmi'];

const RISKS_DETAIL = {
  low:    ['Risiko kredit minimal (produk dijamin pemerintah/LPS)','Volatilitas rendah — nilai pokok aman','Risiko likuiditas rendah — pencairan mudah'],
  medium: ['Nilai investasi dapat naik dan turun mengikuti pasar','Risiko kredit bergantung pada penerbit underlying','Potensi kerugian jangka pendek, namun mitigasi jangka panjang'],
  high:   ['Nilai investasi sangat fluktuatif mengikuti IHSG','Risiko kerugian modal signifikan dalam jangka pendek','Hanya cocok untuk investor dengan horizon > 5 tahun','Kinerja masa lalu bukan jaminan hasil di masa depan'],
};

/* ─── Formatters ─────────────────────────────────────────────────── */
const rupiah = v => 'Rp ' + Number(v).toLocaleString('id-ID');
const tenorStr = m => m == null ? 'Fleksibel (tanpa tenor)' : m >= 12 ? `${m / 12} Tahun` : `${m} Bulan`;

/* ─── HTML template ──────────────────────────────────────────────── */
function buildHTML(p) {
  const cat   = CATEGORY_META[p.category] || CATEGORY_META.tabungan;
  const risk  = RISK_META[p.risk]         || RISK_META.low;
  const bens  = BENEFITS_MAP[p.category]  || [];
  const prof  = PROFILE_MAP[p.category]   || [];
  const risks = RISKS_DETAIL[p.risk]      || [];
  const rateLabel = p.category === 'reksa_dana' ? 'Target Return' : p.category === 'asuransi' ? 'Potensi Return' : 'Suku Bunga';
  const rateUnit  = p.category === 'reksa_dana' ? 'p.a.*' : 'p.a.';

  const riskBars = [1,2,3].map(i =>
    `<div class="risk-bar ${i <= risk.bars ? 'active' : ''}" style="background:${i <= risk.bars ? risk.color : '#E5E7EB'}"></div>`
  ).join('');

  const featureCards = p.features.map(f => `
    <div class="feature-card">
      <div class="feature-check" style="color:${cat.color}">✓</div>
      <span>${f}</span>
    </div>`).join('');

  const benefitItems = bens.map(b => `
    <li class="benefit-item">
      <span class="bullet" style="background:${cat.color}"></span>${b}
    </li>`).join('');

  const profileItems = prof.map(q => `
    <div class="profile-chip">
      <span class="profile-icon">👤</span>${q}
    </div>`).join('');

  const riskItems = risks.map(r => `
    <div class="risk-item">
      <span class="risk-dot" style="background:${risk.color}"></span>${r}
    </div>`).join('');

  const stepItems = STEPS.map((s, i) => `
    <div class="step">
      <div class="step-num" style="background:${cat.color}">${i+1}</div>
      <span>${s}</span>
    </div>`).join('');

  const maxInfo = p.maxAmount ? `<br><span class="meta-sub">Maks: ${rupiah(p.maxAmount)}</span>` : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.name} — Bank Danamon</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', sans-serif;
    background: #F8FAFC;
    color: #1E293B;
    font-size: 13px;
    line-height: 1.6;
    width: 794px; /* A4 width at 96dpi */
    margin: 0 auto;
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #1B2B50 0%, #0F1C36 100%);
    color: white;
    padding: 0;
    position: relative;
    overflow: hidden;
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 32px 0;
  }
  .bank-logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo-box {
    width: 36px; height: 36px;
    background: #E31E24;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 900; color: white;
    letter-spacing: -1px;
  }
  .logo-text { font-size: 15px; font-weight: 700; color: white; letter-spacing: .5px; }
  .logo-sub  { font-size: 9px; color: rgba(255,255,255,.55); letter-spacing: 1.5px; text-transform: uppercase; }
  .valid-badge {
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.2);
    padding: 4px 12px; border-radius: 20px;
    font-size: 9px; color: rgba(255,255,255,.75); letter-spacing: .5px;
  }
  .header-body {
    padding: 24px 32px 28px;
    display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end;
  }
  .cat-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,.12);
    border: 1px solid rgba(255,255,255,.2);
    padding: 4px 12px; border-radius: 20px;
    font-size: 10px; color: rgba(255,255,255,.85);
    margin-bottom: 10px;
  }
  .product-title {
    font-size: 26px; font-weight: 800; color: white;
    line-height: 1.2; margin-bottom: 8px;
    letter-spacing: -.3px;
  }
  .product-desc { font-size: 12px; color: rgba(255,255,255,.65); max-width: 460px; }
  .product-id {
    font-size: 9px; color: rgba(255,255,255,.35);
    font-family: 'Courier New', monospace; margin-top: 6px;
  }
  .header-metrics {
    display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
  }
  .big-rate {
    text-align: right;
  }
  .rate-val {
    font-size: 42px; font-weight: 800; color: white; line-height: 1;
    letter-spacing: -1px;
  }
  .rate-label { font-size: 10px; color: rgba(255,255,255,.55); text-align: right; }
  .header-divider {
    height: 4px;
    background: linear-gradient(90deg, ${cat.color} 0%, ${cat.color}88 60%, transparent 100%);
  }

  /* ── Key Metrics Strip ── */
  .metrics-strip {
    background: white;
    border-bottom: 1px solid #E2E8F0;
    display: grid; grid-template-columns: repeat(4, 1fr);
    box-shadow: 0 2px 8px rgba(0,0,0,.06);
  }
  .metric {
    padding: 16px 20px; border-right: 1px solid #F1F5F9;
    text-align: center;
  }
  .metric:last-child { border-right: none; }
  .metric-val { font-size: 16px; font-weight: 700; color: #1E293B; }
  .metric-lbl { font-size: 9.5px; color: #94A3B8; text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }
  .metric-sub { font-size: 9px; color: #CBD5E1; margin-top: 1px; }

  /* ── Body ── */
  .body { padding: 24px 32px; }

  /* ── Section ── */
  .section { margin-bottom: 22px; }
  .section-head {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px; padding-bottom: 6px;
    border-bottom: 2px solid ${cat.color};
  }
  .section-icon {
    width: 24px; height: 24px; border-radius: 6px;
    background: ${cat.light};
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
  }
  .section-title { font-size: 12px; font-weight: 700; color: #1E293B; text-transform: uppercase; letter-spacing: .8px; }

  /* ── Features ── */
  .features-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .feature-card {
    background: ${cat.light};
    border: 1px solid ${cat.color}33;
    border-radius: 8px; padding: 10px 12px;
    display: flex; align-items: flex-start; gap: 8px;
  }
  .feature-check { font-size: 13px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
  .feature-card span { font-size: 11.5px; color: #374151; font-weight: 500; line-height: 1.4; }

  /* ── Two-col layout ── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

  /* ── Benefits ── */
  .benefit-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .benefit-item { display: flex; align-items: flex-start; gap: 10px; font-size: 12px; color: #374151; }
  .bullet {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 5px;
  }

  /* ── Risk ── */
  .risk-section {
    background: ${risk.bg};
    border: 1px solid ${risk.color}44;
    border-radius: 10px; padding: 14px 16px;
  }
  .risk-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .risk-label-row { display: flex; align-items: center; gap: 8px; }
  .risk-badge {
    background: ${risk.color}; color: white;
    padding: 3px 10px; border-radius: 20px;
    font-size: 10px; font-weight: 700;
  }
  .risk-bars { display: flex; gap: 4px; }
  .risk-bar { width: 28px; height: 8px; border-radius: 3px; }
  .risk-desc { font-size: 11px; color: #4B5563; margin-bottom: 10px; font-style: italic; }
  .risk-item { display: flex; align-items: flex-start; gap: 8px; font-size: 11.5px; color: #374151; margin-bottom: 5px; }
  .risk-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }

  /* ── Profile ── */
  .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .profile-chip {
    background: white; border: 1px solid #E2E8F0;
    border-radius: 8px; padding: 8px 10px;
    display: flex; align-items: center; gap: 7px;
    font-size: 11.5px; color: #374151;
    box-shadow: 0 1px 3px rgba(0,0,0,.04);
  }
  .profile-icon { font-size: 12px; }

  /* ── Steps ── */
  .steps-list { display: flex; flex-direction: column; gap: 8px; }
  .step { display: flex; align-items: flex-start; gap: 12px; font-size: 12px; color: #374151; }
  .step-num {
    width: 22px; height: 22px; border-radius: 50%; color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; flex-shrink: 0;
  }

  /* ── Info box ── */
  .info-box {
    background: #FFF7ED; border: 1px solid #FED7AA;
    border-radius: 8px; padding: 12px 14px;
  }
  .info-box p { font-size: 11px; color: #92400E; line-height: 1.6; }

  /* ── Footer ── */
  .footer {
    background: #1B2B50; color: rgba(255,255,255,.7);
    padding: 14px 32px;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 9.5px;
  }
  .footer-left { display: flex; flex-direction: column; gap: 2px; }
  .footer-logo { font-weight: 700; color: white; font-size: 11px; }
  .footer-right { text-align: right; }
  .footer a { color: rgba(255,255,255,.7); text-decoration: none; }

  .divider { height: 1px; background: #F1F5F9; margin: 0 0 18px; }

  .tag {
    display: inline-block;
    background: ${cat.light}; color: ${cat.color};
    border: 1px solid ${cat.color}44;
    padding: 2px 8px; border-radius: 12px;
    font-size: 9px; font-weight: 600; letter-spacing: .3px;
  }

  @media print {
    body { width: 100%; }
    .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .metrics-strip, .risk-section, .feature-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- ── HEADER ── -->
<div class="header">
  <div class="header-top">
    <div class="bank-logo">
      <div class="logo-box">D</div>
      <div>
        <div class="logo-text">Bank Danamon</div>
        <div class="logo-sub">Intelligence RM Platform</div>
      </div>
    </div>
    <div class="valid-badge">Berlaku s/d Des 2026 · ${p.id}</div>
  </div>
  <div class="header-body">
    <div>
      <div class="cat-pill">${cat.icon} ${cat.label}</div>
      <div class="product-title">${p.name}</div>
      <div class="product-desc">${p.desc}</div>
      <div class="product-id">ID Produk: ${p.id}</div>
    </div>
    <div class="header-metrics">
      <div class="big-rate">
        <div class="rate-val">${p.rate}%</div>
        <div class="rate-label">${rateLabel} ${rateUnit}</div>
      </div>
    </div>
  </div>
  <div class="header-divider"></div>
</div>

<!-- ── KEY METRICS STRIP ── -->
<div class="metrics-strip">
  <div class="metric">
    <div class="metric-val">${rupiah(p.minAmount)}</div>
    <div class="metric-lbl">Min. Investasi</div>
    ${p.maxAmount ? `<div class="metric-sub">Maks: ${rupiah(p.maxAmount)}</div>` : '<div class="metric-sub">Tidak ada batas</div>'}
  </div>
  <div class="metric">
    <div class="metric-val">${tenorStr(p.tenureMonths)}</div>
    <div class="metric-lbl">Tenor</div>
    <div class="metric-sub">${p.tenureMonths ? 'Berjangka tetap' : 'Tanpa jatuh tempo'}</div>
  </div>
  <div class="metric">
    <div class="metric-val">${p.rate}%</div>
    <div class="metric-lbl">${rateLabel}</div>
    <div class="metric-sub">${rateUnit}</div>
  </div>
  <div class="metric">
    <div class="metric-val" style="color:${risk.color}">${risk.label}</div>
    <div class="metric-lbl">Tingkat Risiko</div>
    <div class="risk-bars" style="justify-content:center;margin-top:4px">${riskBars}</div>
  </div>
</div>

<!-- ── BODY ── -->
<div class="body">

  <!-- Features -->
  <div class="section">
    <div class="section-head">
      <div class="section-icon">${cat.icon}</div>
      <div class="section-title">Fitur Unggulan</div>
    </div>
    <div class="features-grid">${featureCards}</div>
  </div>

  <!-- Two column: Benefits + Risk -->
  <div class="two-col">
    <!-- Benefits -->
    <div class="section">
      <div class="section-head">
        <div class="section-icon">✅</div>
        <div class="section-title">Keunggulan Produk</div>
      </div>
      <ul class="benefit-list">${benefitItems}</ul>
    </div>

    <!-- Risk -->
    <div class="section">
      <div class="section-head">
        <div class="section-icon">⚠️</div>
        <div class="section-title">Profil & Risiko Investasi</div>
      </div>
      <div class="risk-section">
        <div class="risk-header">
          <div class="risk-label-row">
            <span class="risk-badge">Risiko ${risk.label}</span>
          </div>
          <div class="risk-bars">${riskBars}</div>
        </div>
        <div class="risk-desc">${risk.desc}</div>
        ${riskItems}
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Two column: Target + Steps -->
  <div class="two-col">
    <!-- Target Customer -->
    <div class="section">
      <div class="section-head">
        <div class="section-icon">🎯</div>
        <div class="section-title">Nasabah yang Tepat</div>
      </div>
      <div class="profile-grid">${profileItems}</div>
    </div>

    <!-- How to Invest -->
    <div class="section">
      <div class="section-head">
        <div class="section-icon">📋</div>
        <div class="section-title">Cara Berinvestasi</div>
      </div>
      <div class="steps-list">${stepItems}</div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Disclaimer -->
  <div class="section">
    <div class="section-head">
      <div class="section-icon">ℹ️</div>
      <div class="section-title">Informasi Penting & Disclaimer</div>
    </div>
    <div class="info-box">
      <p>
        Produk ini diterbitkan oleh <strong>PT Bank Danamon Indonesia Tbk</strong> yang terdaftar dan diawasi oleh <strong>Otoritas Jasa Keuangan (OJK)</strong>.
        ${p.category === 'deposito' ? 'Dana nasabah dijamin oleh <strong>Lembaga Penjamin Simpanan (LPS)</strong> sesuai ketentuan yang berlaku.' : ''}
        ${p.category === 'reksa_dana' ? 'Reksa Dana adalah produk pasar modal — <strong>bukan produk Bank</strong> dan tidak dijamin oleh LPS. Kinerja masa lalu tidak menjamin kinerja masa depan.' : ''}
        ${p.category === 'obligasi' ? 'Obligasi Negara Ritel dijamin sepenuhnya oleh Pemerintah Republik Indonesia melalui Kementerian Keuangan RI.' : ''}
        ${p.category === 'asuransi' ? 'Produk asuransi tidak dijamin oleh LPS. Manfaat investasi bergantung pada kinerja reksa dana yang dipilih.' : ''}
        Investasi mengandung risiko. Pastikan Anda telah memahami seluruh ketentuan produk sebelum berinvestasi.
        Untuk informasi lebih lengkap, hubungi Relationship Manager Bank Danamon Anda atau kunjungi <strong>www.danamon.co.id</strong>.
      </p>
    </div>
  </div>

</div>

<!-- ── FOOTER ── -->
<div class="footer">
  <div class="footer-left">
    <div class="footer-logo">Bank Danamon Indonesia</div>
    <div>📞 1500 090 &nbsp;|&nbsp; ✉ cs@danamon.co.id &nbsp;|&nbsp; 🌐 www.danamon.co.id</div>
    <div>Terdaftar &amp; Diawasi OJK &nbsp;|&nbsp; Anggota LPS</div>
  </div>
  <div class="footer-right">
    <div>Dokumen ini disiapkan oleh RM Platform v2026</div>
    <div>${p.id} · ${cat.label}</div>
    <div style="margin-top:3px; color: rgba(255,255,255,.35); font-size:8px">
      Data per 30 Mei 2026 · Untuk penggunaan internal RM
    </div>
  </div>
</div>

</body>
</html>`;
}

/* ─── Index page ──────────────────────────────────────────────────── */
function buildIndex(products) {
  const cards = products.map(p => {
    const cat  = CATEGORY_META[p.category] || CATEGORY_META.tabungan;
    const risk = RISK_META[p.risk] || RISK_META.low;
    const rateLabel = p.category === 'reksa_dana' ? 'Target Return' : p.category === 'asuransi' ? 'Potensi Return' : 'Suku Bunga';
    return `
    <a class="card" href="${p.id}_${p.name.replace(/\s+/g, '_')}.html" style="border-top: 4px solid ${cat.color}; text-decoration:none; color:inherit;">
      <div class="card-cat" style="color:${cat.color}">${cat.icon} ${cat.label}</div>
      <div class="card-name">${p.name}</div>
      <div class="card-desc">${p.desc}</div>
      <div class="card-meta">
        <div class="meta-row">
          <span class="meta-key">Imbal Hasil</span>
          <span class="meta-val" style="color:${cat.color}">${p.rate}% ${p.category === 'reksa_dana' ? 'p.a.*' : 'p.a.'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Min. Investasi</span>
          <span class="meta-val">${rupiah(p.minAmount)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Tenor</span>
          <span class="meta-val">${tenorStr(p.tenureMonths)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Risiko</span>
          <span class="risk-tag" style="background:${risk.bg}; color:${risk.color}">${risk.label}</span>
        </div>
      </div>
      <div class="card-cta" style="background:${cat.color}">Lihat Detail Brochure →</div>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Katalog Produk — Bank Danamon</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, sans-serif; background: #F1F5F9; color: #1E293B; }
  .header { background: linear-gradient(135deg, #1B2B50, #0F1C36); color: white; padding: 32px 40px; }
  .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
  .header p  { font-size: 13px; color: rgba(255,255,255,.6); }
  .badge { display:inline-block; background:#E31E24; color:white; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:700; margin-bottom:12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; padding: 28px 40px; max-width: 1100px; margin: 0 auto; }
  .card { background: white; border-radius: 12px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.07); display: flex; flex-direction: column; gap: 8px; cursor:pointer; transition: box-shadow .2s; }
  .card:hover { box-shadow: 0 6px 24px rgba(0,0,0,.12); transform: translateY(-2px); transition: all .2s; }
  .card-cat  { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  .card-name { font-size: 14px; font-weight: 700; color: #1E293B; line-height: 1.3; }
  .card-desc { font-size: 11px; color: #64748B; line-height: 1.5; flex: 1; }
  .card-meta { display: flex; flex-direction: column; gap: 5px; border-top: 1px solid #F1F5F9; padding-top: 10px; margin-top: 4px; }
  .meta-row  { display: flex; align-items: center; justify-content: space-between; }
  .meta-key  { font-size: 10px; color: #94A3B8; }
  .meta-val  { font-size: 11px; font-weight: 600; color: #1E293B; }
  .risk-tag  { font-size: 9.5px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
  .card-cta  { color: white; text-align: center; padding: 8px; border-radius: 8px; font-size: 11px; font-weight: 700; margin-top: 4px; }
  .footer    { text-align: center; padding: 20px; font-size: 11px; color: #94A3B8; }
</style>
</head>
<body>
<div class="header">
  <div class="badge">Product Catalog · Bank Danamon · 2026</div>
  <h1>Katalog Produk Investasi & Simpanan</h1>
  <p>Klik produk untuk melihat brochure lengkap termasuk fitur, risiko, dan cara berinvestasi.</p>
</div>
<div class="grid">${cards}</div>
<div class="footer">Bank Danamon Indonesia · Data per 30 Mei 2026 · Intelligence RM Platform</div>
</body>
</html>`;
}

/* ─── Main ────────────────────────────────────────────────────────── */
(async () => {
  // Load products from Oracle PRODUCT_CATALOG
  console.log('\n[0] Connecting to Oracle and loading PRODUCT_CATALOG...');
  await db.initialize();
  const PRODUCTS = await loadProducts();
  console.log(`    Loaded ${PRODUCTS.length} active products: ${PRODUCTS.map(p => p.id).join(', ')}`);
  await db.close();

  // Write all HTML files
  console.log('\n[1] Writing HTML brochures...');
  const htmlFiles = [];
  for (const p of PRODUCTS) {
    const fname = `${p.id}_${p.name.replace(/\s+/g, '_')}.html`;
    const fpath = path.join(OUT_HTML, fname);
    fs.writeFileSync(fpath, buildHTML(p), 'utf8');
    htmlFiles.push({ p, fname, fpath });
    console.log(`  [✓] ${fname}`);
  }
  // Write index
  const indexPath = path.join(OUT_HTML, 'index.html');
  fs.writeFileSync(indexPath, buildIndex(PRODUCTS), 'utf8');
  console.log(`  [✓] index.html`);

  // Convert to PDF via Puppeteer
  console.log('\n[2] Converting to PDF...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();

  for (const { p, fname, fpath } of htmlFiles) {
    await page.goto(`file:///${fpath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 600));
    const pdfName = fname.replace('.html', '.pdf');
    const pdfPath = path.join(OUT_PDF, pdfName);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    console.log(`  [✓] ${pdfName}`);
  }

  // Index PDF
  await page.goto(`file:///${indexPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.join(OUT_PDF, 'Product_Catalog_Index.pdf'),
    format: 'A4', printBackground: true,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  });
  console.log('  [✓] Product_Catalog_Index.pdf');

  await browser.close();

  console.log('\n[✓] All done!');
  console.log(`    HTML → ${OUT_HTML}`);
  console.log(`    PDF  → ${OUT_PDF}`);
  console.log(`    Total HTML: ${fs.readdirSync(OUT_HTML).length} files`);
  console.log(`    Total PDF:  ${fs.readdirSync(OUT_PDF).length} files`);
})();
