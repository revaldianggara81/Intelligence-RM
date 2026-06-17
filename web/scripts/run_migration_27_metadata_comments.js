'use strict';
/**
 * Migration 27 — Table & Column Metadata Comments
 *
 * Adds COMMENT ON TABLE / COMMENT ON COLUMN to every table and column
 * in the Intelligence RM Platform Oracle schema.
 *
 * Metadata helps Oracle tools, PAF agents, ORDS auto-REST, Data Dictionary
 * browsers, and new developers understand each object's purpose.
 *
 * Usage:  node scripts/run_migration_27_metadata_comments.js
 */
require('dotenv').config();
const db = require('../backend/config/database');

/* ──────────────────────────────────────────────────────────────────────────
   COMMENT definitions
   Format: ['TABLE.COLUMN (or just TABLE)', 'description text']
   Column key  →  'TABLE_NAME.COLUMN_NAME'
   Table  key  →  'TABLE_NAME'
────────────────────────────────────────────────────────────────────────── */
const COMMENTS = [

  /* ═══════════════════════════════════════════════════════════════════════
     1. RM_USERS — Relationship Manager accounts
  ═══════════════════════════════════════════════════════════════════════ */
  ['RM_USERS',
    'Akun pengguna Relationship Manager (RM) Bank Danamon. Menyimpan kredensial login, informasi profil, cabang, dan status aktif setiap RM yang menggunakan platform Intelligence RM.'],
  ['RM_USERS.USER_ID',
    'Primary key. Identifier unik RM, biasanya singkatan pegawai (contoh: rm001, rm002). Digunakan sebagai foreign key di hampir semua tabel lain.'],
  ['RM_USERS.USERNAME',
    'Username login RM. Harus unik di seluruh sistem. Digunakan bersama password_hash untuk autentikasi JWT.'],
  ['RM_USERS.PASSWORD_HASH',
    'Hash bcrypt dari password RM. Tidak pernah disimpan dalam bentuk plaintext. Dihasilkan dengan bcryptjs rounds=10.'],
  ['RM_USERS.FULL_NAME',
    'Nama lengkap RM seperti yang ditampilkan di dashboard, notifikasi, dan laporan. Contoh: Anisa Rahma.'],
  ['RM_USERS.ROLE',
    'Peran RM dalam sistem. Default: Relationship Manager. Nilai lain: Manager, Admin. Menentukan akses fitur di frontend.'],
  ['RM_USERS.INITIALS',
    'Inisial nama RM (1-3 huruf) untuk ditampilkan pada avatar kompak di UI. Contoh: AR untuk Anisa Rahma.'],
  ['RM_USERS.EMAIL',
    'Alamat email RM untuk pengiriman notifikasi, laporan, dan komunikasi sistem.'],
  ['RM_USERS.BRANCH',
    'Nama atau kode cabang Bank Danamon tempat RM bertugas. Contoh: Jakarta Pusat, Surabaya Darmo.'],
  ['RM_USERS.IS_ACTIVE',
    'Flag status aktif RM. 1 = aktif dan dapat login; 0 = nonaktif/diblokir. Pemeriksaan dilakukan saat autentikasi JWT.'],
  ['RM_USERS.LAST_LOGIN',
    'Timestamp terakhir kali RM berhasil login ke platform. Diperbarui setiap login sukses.'],
  ['RM_USERS.CREATED_AT',
    'Timestamp pembuatan akun RM. Diisi otomatis oleh CURRENT_TIMESTAMP saat INSERT.'],

  /* ═══════════════════════════════════════════════════════════════════════
     2. CUSTOMERS — Nasabah wealth management
  ═══════════════════════════════════════════════════════════════════════ */
  ['CUSTOMERS',
    'Data nasabah wealth management Bank Danamon yang dikelola oleh RM. Berisi profil risiko, tier, informasi kontak, total AUM, dan status KYC. Tabel central yang direferensikan oleh hampir semua modul aplikasi.'],
  ['CUSTOMERS.CUSTOMER_ID',
    'Primary key. Identifier unik nasabah (contoh: CUST001, CUST002). Digunakan sebagai foreign key di CUSTOMER_PRODUCTS, ALERTS, MEETING_NOTES, dan tabel lainnya.'],
  ['CUSTOMERS.FULL_NAME',
    'Nama lengkap nasabah sesuai dokumen KYC/identitas. Ditampilkan di seluruh UI dan laporan.'],
  ['CUSTOMERS.INITIALS',
    'Inisial nama nasabah untuk ditampilkan di avatar kompak dan daftar ringkas.'],
  ['CUSTOMERS.AVATAR_COLOR',
    'Kode warna hex atau nama kelas CSS untuk latar belakang avatar nasabah di UI. Dihasilkan otomatis saat onboarding.'],
  ['CUSTOMERS.AGE',
    'Usia nasabah dalam tahun. Digunakan dalam algoritma rekomendasi produk dan segmentasi profil risiko.'],
  ['CUSTOMERS.GENDER',
    'Jenis kelamin nasabah. Nilai: Male / Female / Other. Digunakan untuk personalisasi komunikasi.'],
  ['CUSTOMERS.EMAIL',
    'Alamat email nasabah untuk komunikasi, pengiriman laporan, dan konfirmasi transaksi.'],
  ['CUSTOMERS.PHONE',
    'Nomor telepon/handphone nasabah. Format bebas termasuk kode negara. Contoh: +62 812-3456-7890.'],
  ['CUSTOMERS.ADDRESS',
    'Alamat lengkap nasabah (CLOB). Mencakup jalan, kota, provinsi, dan kode pos.'],
  ['CUSTOMERS.RISK_PROFILE',
    'Profil risiko investasi nasabah hasil assessment. Nilai: Conservative / Moderate / Aggressive. Menentukan produk yang dapat direkomendasikan dan batas konsentrasi portofolio.'],
  ['CUSTOMERS.TIER',
    'Segmen layanan nasabah berdasarkan total AUM. Nilai: prioritas / privilege / regular. Menentukan level layanan dan akses fitur premium.'],
  ['CUSTOMERS.TIER_LABEL',
    'Label display tier nasabah untuk UI. Contoh: Prioritas, Privilege, Regular. Dapat berbeda format dari kolom TIER.'],
  ['CUSTOMERS.MONTHLY_INCOME',
    'Estimasi pendapatan bulanan nasabah dalam Rupiah. Digunakan dalam profiling finansial dan penentuan limit investasi.'],
  ['CUSTOMERS.TOTAL_AUM',
    'Total Assets Under Management nasabah dalam Rupiah (semua produk aktif). Diperbarui secara berkala. Dasar penentuan tier dan segmentasi.'],
  ['CUSTOMERS.RM_USER_ID',
    'FK ke RM_USERS.USER_ID. RM yang bertanggung jawab mengelola nasabah ini. Digunakan untuk scoping data per-RM di semua query.'],
  ['CUSTOMERS.KYC_STATUS',
    'Status Know Your Customer nasabah. Nilai: Verified / Pending / Expired. Digunakan oleh PAF_AGENT_ALERT untuk alert KYC expiry.'],
  ['CUSTOMERS.KYC_EXPIRY',
    'Tanggal kadaluarsa dokumen KYC nasabah. PAF_AGENT_ALERT memantau kolom ini untuk membuat alert sebelum expired.'],
  ['CUSTOMERS.NOTES',
    'Catatan bebas internal tentang nasabah (CLOB). Hanya terlihat oleh RM yang bersangkutan.'],
  ['CUSTOMERS.CREATED_AT',
    'Timestamp onboarding nasabah ke platform Intelligence RM.'],
  ['CUSTOMERS.UPDATED_AT',
    'Timestamp terakhir pembaruan data nasabah. Diperbarui oleh trigger atau aplikasi saat ada perubahan profil.'],

  /* ═══════════════════════════════════════════════════════════════════════
     3. PRODUCT_CATALOG — Katalog produk investasi
  ═══════════════════════════════════════════════════════════════════════ */
  ['PRODUCT_CATALOG',
    'Katalog produk investasi Bank Danamon yang tersedia untuk direkomendasikan kepada nasabah. Berisi detail produk, tingkat return, batas investasi, tenor, dan level risiko. Digunakan oleh PAF_AGENT_RECOMMENDATION untuk matching produk ke profil nasabah.'],
  ['PRODUCT_CATALOG.PRODUCT_ID',
    'Primary key. Identifier unik produk (contoh: PROD001, PROD002). Direferensikan oleh CUSTOMER_PRODUCTS dan AI_RECOMMENDATIONS.'],
  ['PRODUCT_CATALOG.PRODUCT_NAME',
    'Nama lengkap produk investasi. Contoh: Deposito Reguler 6 Bulan, Reksa Dana Saham Bluechip.'],
  ['PRODUCT_CATALOG.CATEGORY',
    'Kategori produk investasi. Nilai: deposito / reksa_dana / obligasi / asuransi / tabungan / saham. Digunakan dalam algoritma FCP dan PAF agents.'],
  ['PRODUCT_CATALOG.DESCRIPTION',
    'Deskripsi lengkap produk (CLOB) termasuk fitur, manfaat, dan syarat investasi. Digunakan dalam RAG untuk PAF_AGENT_COPILOT.'],
  ['PRODUCT_CATALOG.INTEREST_RATE',
    'Tingkat bunga/return tahunan produk (persen). Digunakan dalam algoritma Forecast Current Product (FCP) untuk proyeksi keuntungan. Contoh: 6.5 untuk 6.5% p.a.'],
  ['PRODUCT_CATALOG.MIN_AMOUNT',
    'Minimum jumlah investasi dalam Rupiah. Digunakan untuk validasi saat rekomendasi dan pembuatan produk.'],
  ['PRODUCT_CATALOG.MAX_AMOUNT',
    'Maximum jumlah investasi dalam Rupiah. NULL berarti tidak ada batas atas.'],
  ['PRODUCT_CATALOG.TENURE_MONTHS',
    'Tenor produk dalam bulan. Contoh: 6 untuk Deposito 6 Bulan, 12 untuk ORI 1 tahun. NULL untuk produk open-ended.'],
  ['PRODUCT_CATALOG.RISK_LEVEL',
    'Level risiko produk. Nilai: low / medium / high. Digunakan untuk matching dengan CUSTOMERS.RISK_PROFILE dalam rekomendasi.'],
  ['PRODUCT_CATALOG.IS_ACTIVE',
    'Flag ketersediaan produk. 1 = aktif/tersedia; 0 = tidak aktif/tidak tersedia untuk nasabah baru. Produk inactive tidak muncul di rekomendasi.'],
  ['PRODUCT_CATALOG.VALID_FROM',
    'Tanggal mulai berlaku produk (untuk produk periodik seperti ORI, SBN). NULL untuk produk evergreen.'],
  ['PRODUCT_CATALOG.VALID_TO',
    'Tanggal akhir berlaku/subscripsi produk. NULL untuk produk evergreen.'],
  ['PRODUCT_CATALOG.FEATURES',
    'JSON array fitur-fitur utama produk (CLOB). Contoh: ["Dijamin LPS","Bunga tetap","Bisa diperpanjang otomatis"]. Ditampilkan di UI product comparison.'],
  ['PRODUCT_CATALOG.GOAL_TAG',
    'Tag tujuan finansial yang sesuai untuk produk ini, dipisah pipe (|). Contoh: Dana Darurat|Likuiditas. Digunakan dalam fitur Goal-Based Planning.'],
  ['PRODUCT_CATALOG.RETURN_TYPE',
    'Jenis return produk. Nilai: fixed (tetap), variable (fluktuasi pasar), target (target imbal hasil). Mempengaruhi metode kalkulasi FCP.'],
  ['PRODUCT_CATALOG.CREATED_AT',
    'Timestamp penambahan produk ke katalog.'],

  /* ═══════════════════════════════════════════════════════════════════════
     4. CUSTOMER_PRODUCTS — Portofolio/holdings nasabah
  ═══════════════════════════════════════════════════════════════════════ */
  ['CUSTOMER_PRODUCTS',
    'Data kepemilikan produk investasi nasabah (portofolio holdings). Setiap baris merepresentasikan satu produk yang dimiliki nasabah. Tabel ini adalah dasar untuk Forecast Current Product (FCP), deteksi jatuh tempo, dan analisis konsentrasi risiko.'],
  ['CUSTOMER_PRODUCTS.HOLDING_ID',
    'Primary key auto-increment. Identifier unik setiap kepemilikan produk nasabah.'],
  ['CUSTOMER_PRODUCTS.CUSTOMER_ID',
    'FK ke CUSTOMERS.CUSTOMER_ID. Pemilik produk ini.'],
  ['CUSTOMER_PRODUCTS.PRODUCT_ID',
    'FK ke PRODUCT_CATALOG.PRODUCT_ID. Referensi ke katalog produk. Dapat NULL jika produk sudah tidak ada di katalog.'],
  ['CUSTOMER_PRODUCTS.PRODUCT_NAME',
    'Nama produk yang di-denormalize dari PRODUCT_CATALOG untuk kemudahan query. Dipertahankan meskipun produk di katalog berubah.'],
  ['CUSTOMER_PRODUCTS.CATEGORY',
    'Kategori produk yang di-denormalize. Digunakan oleh algoritma FCP untuk menentukan metode kalkulasi (majemuk untuk Reksa Dana, sederhana untuk Deposito).'],
  ['CUSTOMER_PRODUCTS.AMOUNT',
    'Nilai pokok investasi nasabah dalam Rupiah. Dasar perhitungan return proyeksi di FCP.'],
  ['CUSTOMER_PRODUCTS.INTEREST_RATE',
    'Tingkat bunga/return aktual produk ini untuk nasabah (persen/tahun). Dapat berbeda dari PRODUCT_CATALOG.INTEREST_RATE karena negosiasi atau promo khusus nasabah.'],
  ['CUSTOMER_PRODUCTS.START_DATE',
    'Tanggal nasabah mulai investasi/pembelian produk. Digunakan dalam kalkulasi prorata return.'],
  ['CUSTOMER_PRODUCTS.MATURITY_DATE',
    'Tanggal jatuh tempo produk. Dimonitor oleh PAF_AGENT_MATURITY untuk membuat alert. NULL untuk produk open-ended.'],
  ['CUSTOMER_PRODUCTS.STATUS',
    'Status kepemilikan produk. Nilai: Active (aktif dipegang), Matured (sudah jatuh tempo), Redeemed (sudah dicairkan). FCP hanya memproses status Active.'],
  ['CUSTOMER_PRODUCTS.RETURN_PCT',
    'Persentase return aktual/saat ini (unrealized gain/loss). Diperbarui secara berkala dari feed data pasar.'],
  ['CUSTOMER_PRODUCTS.CREATED_AT',
    'Timestamp pencatatan produk ke dalam portofolio nasabah di platform.'],
  ['CUSTOMER_PRODUCTS.UPDATED_AT',
    'Timestamp terakhir pembaruan data holding, termasuk perubahan nilai dan status.'],

  /* ═══════════════════════════════════════════════════════════════════════
     5. ALERTS — Alert/peringatan untuk RM
  ═══════════════════════════════════════════════════════════════════════ */
  ['ALERTS',
    'Tabel pusat untuk semua alert yang dihasilkan oleh PAF agents dan aturan bisnis. Setiap alert membutuhkan tindakan RM. Digunakan oleh PAF_AGENT_ALERT (pembuatan), PAF_AGENT_RECOMMENDATION (trigger rekomendasi), dan RM Dashboard (tampilan).'],
  ['ALERTS.ALERT_ID',
    'Primary key auto-increment. Identifier unik setiap alert.'],
  ['ALERTS.CUSTOMER_ID',
    'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah yang terkait dengan alert ini.'],
  ['ALERTS.ALERT_TYPE',
    'Jenis/kategori alert. Nilai: maturity (jatuh tempo), portfolio_loss (kerugian), kyc_expiry (KYC expired), idle_money (dana idle), concentration_risk (konsentrasi), upgrade_opportunity (peluang upgrade tier), market_event (kejadian pasar), campaign (kampanye), underperform (underperformance produk).'],
  ['ALERTS.SEVERITY',
    'Tingkat urgensi alert. Nilai: high (memerlukan tindakan segera, <7 hari), medium (perhatian dalam minggu ini), low (informasi/pantau). Menentukan warna dan prioritas tampilan di dashboard.'],
  ['ALERTS.TITLE',
    'Judul alert yang singkat dan deskriptif (maks 500 karakter). Ditampilkan sebagai headline di daftar alert. Contoh: "Deposito Rp 750Jt Jatuh Tempo 7 Hari".'],
  ['ALERTS.MESSAGE',
    'Pesan detail alert (CLOB). Berisi analisis lengkap, konteks, dan rekomendasi tindakan yang dihasilkan oleh PAF agent atau aturan bisnis.'],
  ['ALERTS.METRIC_KEY',
    'Kunci metrik yang memicu alert. Contoh: maturity_days, portfolio_loss_pct, kyc_days_remaining. Digunakan untuk sorting dan filtering.'],
  ['ALERTS.METRIC_VALUE',
    'Nilai aktual metrik saat alert dibuat. Contoh: "7" (hari), "-15.3" (persen). Disimpan sebagai string untuk fleksibilitas.'],
  ['ALERTS.THRESHOLD',
    'Nilai batas yang dilampaui sehingga alert dibuat. Contoh: "30" (hari) untuk maturity alert. Referensi ke ALERT_THRESHOLDS.'],
  ['ALERTS.STATUS',
    'Status penanganan alert oleh RM. Nilai: Open (belum ditangani), Acknowledged (sudah dilihat/di-acknowledge), Resolved (sudah diselesaikan). Default: Open.'],
  ['ALERTS.TRIGGERED_AT',
    'Timestamp saat alert dibuat/dipicu oleh sistem. Default CURRENT_TIMESTAMP.'],
  ['ALERTS.RESOLVED_AT',
    'Timestamp saat RM menandai alert sebagai Resolved. NULL jika belum diselesaikan.'],
  ['ALERTS.RESOLVED_BY',
    'FK ke RM_USERS.USER_ID. RM yang menyelesaikan alert. NULL jika belum diselesaikan.'],

  /* ═══════════════════════════════════════════════════════════════════════
     6. CAMPAIGNS — Kampanye pemasaran
  ═══════════════════════════════════════════════════════════════════════ */
  ['CAMPAIGNS',
    'Kampanye pemasaran dan retensi yang dirancang untuk mendorong RM menawarkan produk atau upgrade tier kepada nasabah tertentu. PAF_AGENT_CAMPAIGN memproses tabel ini untuk mencocokkan nasabah yang memenuhi kriteria.'],
  ['CAMPAIGNS.CAMPAIGN_ID',
    'Primary key. Identifier unik kampanye. Contoh: CAMP_Q1_2026_DEPOSITO.'],
  ['CAMPAIGNS.NAME',
    'Nama kampanye yang deskriptif. Ditampilkan di UI campaign management. Contoh: Promo Deposito Spesial Q1 2026.'],
  ['CAMPAIGNS.DESCRIPTION',
    'Deskripsi lengkap tujuan, target, dan mekanisme kampanye (CLOB).'],
  ['CAMPAIGNS.TYPE',
    'Jenis kampanye. Nilai: privilege_upgrade (dorong nasabah naik tier), product_placement (penawaran produk baru), retention (retensi nasabah berisiko churn).'],
  ['CAMPAIGNS.STATUS',
    'Status kampanye. Nilai: Active (sedang berjalan), Inactive (tidak aktif), Completed (selesai). PAF_AGENT_CAMPAIGN hanya memproses kampanye Active.'],
  ['CAMPAIGNS.START_DATE',
    'Tanggal mulai kampanye. PAF_AGENT_CAMPAIGN tidak akan memproses kampanye sebelum tanggal ini.'],
  ['CAMPAIGNS.END_DATE',
    'Tanggal berakhir kampanye. Kampanye yang melewati tanggal ini tidak diproses meskipun STATUS=Active.'],
  ['CAMPAIGNS.RULES',
    'Aturan eligibilitas kampanye dalam format JSON array (CLOB). Mendefinisikan kriteria segmen nasabah, minimum AUM, profil risiko, dan kondisi lain.'],
  ['CAMPAIGNS.CREATED_AT',
    'Timestamp pembuatan kampanye di sistem.'],

  /* ═══════════════════════════════════════════════════════════════════════
     7. CAMPAIGN_ELIGIBILITY
  ═══════════════════════════════════════════════════════════════════════ */
  ['CAMPAIGN_ELIGIBILITY',
    'Hasil evaluasi eligibilitas setiap nasabah untuk setiap kampanye. Diisi oleh PAF_AGENT_CAMPAIGN setelah memproses aturan kampanye terhadap profil nasabah. Memiliki unique constraint per pasangan (CAMPAIGN_ID, CUSTOMER_ID).'],
  ['CAMPAIGN_ELIGIBILITY.ELIGIBILITY_ID',
    'Primary key auto-increment.'],
  ['CAMPAIGN_ELIGIBILITY.CAMPAIGN_ID',
    'FK ke CAMPAIGNS.CAMPAIGN_ID. Kampanye yang dievaluasi.'],
  ['CAMPAIGN_ELIGIBILITY.CUSTOMER_ID',
    'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah yang dievaluasi.'],
  ['CAMPAIGN_ELIGIBILITY.IS_ELIGIBLE',
    'Hasil akhir evaluasi eligibilitas. 1 = nasabah memenuhi semua aturan kampanye; 0 = tidak memenuhi.'],
  ['CAMPAIGN_ELIGIBILITY.RULE1_PASS',
    'Hasil evaluasi aturan kampanye #1 (contoh: cek minimum AUM). 1 = lulus; 0 = gagal.'],
  ['CAMPAIGN_ELIGIBILITY.RULE2_PASS',
    'Hasil evaluasi aturan kampanye #2 (contoh: cek tier). 1 = lulus; 0 = gagal.'],
  ['CAMPAIGN_ELIGIBILITY.RULE3_PASS',
    'Hasil evaluasi aturan kampanye #3 (contoh: cek profil risiko). 1 = lulus; 0 = gagal.'],
  ['CAMPAIGN_ELIGIBILITY.AUM_3M_AVG',
    'Rata-rata AUM nasabah dalam 3 bulan terakhir saat evaluasi. Snapshot untuk audit eligibilitas.'],
  ['CAMPAIGN_ELIGIBILITY.NOTES',
    'Catatan tambahan dari PAF agent mengenai alasan eligibilitas atau penolakan (CLOB).'],
  ['CAMPAIGN_ELIGIBILITY.SCANNED_AT',
    'Timestamp saat evaluasi eligibilitas dilakukan oleh PAF_AGENT_CAMPAIGN.'],

  /* ═══════════════════════════════════════════════════════════════════════
     8. MEETING_NOTES — Catatan meeting RM
  ═══════════════════════════════════════════════════════════════════════ */
  ['MEETING_NOTES',
    'Rekaman interaksi RM dengan nasabah: meeting tatap muka, panggilan telepon, kunjungan, atau inquiry. Digunakan oleh PAF_AGENT_COPILOT via RAG untuk memberikan konteks historis interaksi nasabah dalam percakapan AI.'],
  ['MEETING_NOTES.NOTE_ID',
    'Primary key auto-increment. Identifier unik catatan meeting.'],
  ['MEETING_NOTES.CUSTOMER_ID',
    'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah yang terlibat dalam interaksi.'],
  ['MEETING_NOTES.RM_USER_ID',
    'FK ke RM_USERS.USER_ID. RM yang membuat catatan ini.'],
  ['MEETING_NOTES.MEETING_DATE',
    'Tanggal interaksi/meeting berlangsung. Dapat berbeda dari CREATED_AT jika catatan dibuat belakangan.'],
  ['MEETING_NOTES.NOTE_TYPE',
    'Jenis interaksi. Nilai: meeting (tatap muka), call (telepon), visit (kunjungan lapangan), inquiry (pertanyaan/permintaan), personal_assessment (assessment internal RM).'],
  ['MEETING_NOTES.SUMMARY',
    'Ringkasan isi meeting/interaksi (CLOB). Dapat diisi manual oleh RM atau dihasilkan oleh transkripsi otomatis call center.'],
  ['MEETING_NOTES.TOPICS',
    'Topik yang dibahas dalam JSON array (CLOB). Contoh: ["Jatuh Tempo Deposito","Reksa Dana","Perencanaan Pensiun"].'],
  ['MEETING_NOTES.PRODUCTS_DISCUSSED',
    'Produk yang dibahas selama interaksi dalam JSON array (CLOB). Digunakan untuk tracking sales pipeline.'],
  ['MEETING_NOTES.FOLLOW_UP',
    'Tindak lanjut yang disepakati setelah meeting (CLOB). Contoh: kirim prospektus, jadwalkan pertemuan berikutnya.'],
  ['MEETING_NOTES.CREATED_AT',
    'Timestamp pencatatan di sistem (bukan tanggal meeting).'],

  /* ═══════════════════════════════════════════════════════════════════════
     9. AUDIT_LOG
  ═══════════════════════════════════════════════════════════════════════ */
  ['AUDIT_LOG',
    'Log audit komprehensif untuk semua aktivitas pengguna dan sistem yang signifikan. Mencatat siapa melakukan apa, kapan, pada objek mana. Digunakan untuk kepatuhan regulasi, investigasi insiden keamanan, dan analisis penggunaan platform.'],
  ['AUDIT_LOG.LOG_ID',
    'Primary key auto-increment.'],
  ['AUDIT_LOG.USER_ID',
    'FK ke RM_USERS.USER_ID. Pengguna yang melakukan aksi. NULL untuk aksi sistem otomatis.'],
  ['AUDIT_LOG.ACTION',
    'Kode aksi yang dilakukan. Contoh: AI_COPILOT_CHAT, UPDATE_ALERT_STATUS, DOWNLOAD_PORTFOLIO_REPORT, LOGIN, PORTFOLIO_AI_ANALYSIS.'],
  ['AUDIT_LOG.ENTITY_TYPE',
    'Jenis objek yang diaksi. Contoh: CUSTOMER, ALERT, PRODUCT, REPORT. Memudahkan filtering audit trail per tipe objek.'],
  ['AUDIT_LOG.ENTITY_ID',
    'Identifier objek yang diaksi (VARCHAR2 untuk fleksibilitas). Contoh: CUST001, 42 (ALERT_ID), PROD003.'],
  ['AUDIT_LOG.DETAILS',
    'Detail tambahan aksi dalam format JSON (CLOB). Berisi data sebelum/sesudah perubahan, parameter request, atau informasi konteks lainnya.'],
  ['AUDIT_LOG.IP_ADDRESS',
    'Alamat IP sumber request. Digunakan untuk analisis keamanan dan deteksi akses tidak wajar.'],
  ['AUDIT_LOG.CREATED_AT',
    'Timestamp kejadian aksi. Diindeks DESC untuk query terbaru lebih cepat.'],

  /* ═══════════════════════════════════════════════════════════════════════
     10. AI_ANALYSIS_CACHE
  ═══════════════════════════════════════════════════════════════════════ */
  ['AI_ANALYSIS_CACHE',
    'Cache hasil analisis LLM untuk menghindari pemanggilan OCI GenAI yang berulang dan mahal untuk query identik. Menggunakan cache_key berbasis hash prompt untuk lookup cepat. Hasil cache expire sesuai EXPIRES_AT.'],
  ['AI_ANALYSIS_CACHE.CACHE_ID',
    'Primary key auto-increment.'],
  ['AI_ANALYSIS_CACHE.CACHE_KEY',
    'Kunci cache unik (hash SHA-256 dari kombinasi scenario+customer_id+prompt). Diindeks UNIQUE untuk lookup O(1).'],
  ['AI_ANALYSIS_CACHE.SCENARIO',
    'Skenario analisis AI yang di-cache. Nilai: maturity / recommendation / campaign / alert / copilot / portfolio_analysis.'],
  ['AI_ANALYSIS_CACHE.CUSTOMER_ID',
    'ID nasabah yang terkait dengan analisis. NULL untuk analisis global (tidak spesifik nasabah).'],
  ['AI_ANALYSIS_CACHE.PROMPT_HASH',
    'Hash SHA-256 dari prompt yang dikirim ke LLM. Digunakan bersama CACHE_KEY untuk verifikasi konsistensi cache.'],
  ['AI_ANALYSIS_CACHE.RESULT',
    'Hasil respons LLM dalam format JSON atau teks (CLOB). Dikembalikan langsung jika cache hit valid.'],
  ['AI_ANALYSIS_CACHE.MODEL_USED',
    'Nama model LLM yang menghasilkan hasil ini. Contoh: cohere.command-r-plus. Digunakan untuk invalidasi cache saat model berubah.'],
  ['AI_ANALYSIS_CACHE.TOKENS_USED',
    'Jumlah token yang digunakan dalam pemanggilan LLM original. Untuk monitoring biaya OCI GenAI.'],
  ['AI_ANALYSIS_CACHE.CREATED_AT',
    'Timestamp saat cache entry dibuat.'],
  ['AI_ANALYSIS_CACHE.EXPIRES_AT',
    'Timestamp kedaluwarsa cache. Setelah melewati tanggal ini, cache entry dianggap tidak valid dan LLM akan dipanggil ulang.'],

  /* ═══════════════════════════════════════════════════════════════════════
     11. CUSTOMER_EMBEDDINGS — Vector embeddings profil nasabah
  ═══════════════════════════════════════════════════════════════════════ */
  ['CUSTOMER_EMBEDDINGS',
    'Tabel vector Oracle 23ai untuk menyimpan embedding teks profil nasabah. Digunakan oleh PAF_AGENT_COPILOT untuk Retrieval Augmented Generation (RAG): menemukan nasabah atau konteks yang relevan berdasarkan similarity semantik query RM.'],
  ['CUSTOMER_EMBEDDINGS.EMBED_ID',
    'Primary key auto-increment.'],
  ['CUSTOMER_EMBEDDINGS.CUSTOMER_ID',
    'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah yang di-embed.'],
  ['CUSTOMER_EMBEDDINGS.CONTENT_TYPE',
    'Jenis konten yang di-embed. Nilai: profile (data profil), notes (catatan), products (produk dimiliki), goals (tujuan finansial).'],
  ['CUSTOMER_EMBEDDINGS.CONTENT',
    'Teks asli yang di-embed (CLOB). Disimpan untuk referensi dan re-embed saat model berubah.'],
  ['CUSTOMER_EMBEDDINGS.EMBEDDING',
    'Vector FLOAT32 dimensi 1024 hasil embedding model OCI GenAI. Digunakan dalam VECTOR_DISTANCE query similarity search untuk RAG.'],
  ['CUSTOMER_EMBEDDINGS.MODEL_USED',
    'Nama embedding model yang digunakan. Contoh: cohere.embed-multilingual-v3.0. Digunakan untuk invalidasi saat model berganti.'],
  ['CUSTOMER_EMBEDDINGS.CREATED_AT',
    'Timestamp pembuatan embedding.'],

  /* ═══════════════════════════════════════════════════════════════════════
     12. MEETING_NOTES_EMBEDDINGS
  ═══════════════════════════════════════════════════════════════════════ */
  ['MEETING_NOTES_EMBEDDINGS',
    'Vector embeddings untuk catatan meeting nasabah. Memungkinkan PAF_AGENT_COPILOT mencari catatan meeting yang relevan secara semantik berdasarkan query RM. Bagian dari arsitektur RAG multi-sumber.'],
  ['MEETING_NOTES_EMBEDDINGS.EMBED_ID',   'Primary key auto-increment.'],
  ['MEETING_NOTES_EMBEDDINGS.NOTE_ID',    'FK ke MEETING_NOTES.NOTE_ID. Catatan meeting yang di-embed.'],
  ['MEETING_NOTES_EMBEDDINGS.CUSTOMER_ID','FK ke CUSTOMERS.CUSTOMER_ID. Nasabah terkait. Memudahkan filtering per nasabah.'],
  ['MEETING_NOTES_EMBEDDINGS.CONTENT',    'Teks asli catatan meeting yang di-embed (CLOB).'],
  ['MEETING_NOTES_EMBEDDINGS.EMBEDDING',  'Vector FLOAT32 dimensi 1024 dari isi catatan meeting.'],
  ['MEETING_NOTES_EMBEDDINGS.MODEL_USED', 'Model embedding yang digunakan.'],
  ['MEETING_NOTES_EMBEDDINGS.CREATED_AT', 'Timestamp pembuatan embedding.'],

  /* ═══════════════════════════════════════════════════════════════════════
     13. PRODUCT_EMBEDDINGS
  ═══════════════════════════════════════════════════════════════════════ */
  ['PRODUCT_EMBEDDINGS',
    'Vector embeddings untuk produk di PRODUCT_CATALOG. Memungkinkan PAF_AGENT_COPILOT dan PAF_AGENT_RECOMMENDATION menemukan produk yang relevan secara semantik berdasarkan query natural language.'],
  ['PRODUCT_EMBEDDINGS.EMBED_ID',   'Primary key auto-increment.'],
  ['PRODUCT_EMBEDDINGS.PRODUCT_ID', 'FK ke PRODUCT_CATALOG.PRODUCT_ID. Produk yang di-embed.'],
  ['PRODUCT_EMBEDDINGS.CONTENT',    'Teks gabungan nama+deskripsi+fitur produk yang di-embed (CLOB).'],
  ['PRODUCT_EMBEDDINGS.EMBEDDING',  'Vector FLOAT32 dimensi 1024 dari konten produk.'],
  ['PRODUCT_EMBEDDINGS.MODEL_USED', 'Model embedding yang digunakan.'],
  ['PRODUCT_EMBEDDINGS.CREATED_AT', 'Timestamp pembuatan embedding.'],

  /* ═══════════════════════════════════════════════════════════════════════
     14. MARKET_CONTEXT_EMBEDDINGS
  ═══════════════════════════════════════════════════════════════════════ */
  ['MARKET_CONTEXT_EMBEDDINGS',
    'Vector embeddings untuk data konteks pasar historis (berita, kejadian market). Digunakan oleh PAF_AGENT_COPILOT untuk memberikan konteks pasar yang relevan saat RM bertanya tentang kondisi ekonomi atau pergerakan pasar.'],
  ['MARKET_CONTEXT_EMBEDDINGS.EMBED_ID',   'Primary key auto-increment.'],
  ['MARKET_CONTEXT_EMBEDDINGS.EVENT_DATE', 'Tanggal kejadian pasar yang di-embed.'],
  ['MARKET_CONTEXT_EMBEDDINGS.TITLE',      'Judul kejadian/berita pasar (maks 500 karakter).'],
  ['MARKET_CONTEXT_EMBEDDINGS.CONTENT',    'Isi lengkap konteks pasar yang di-embed (CLOB).'],
  ['MARKET_CONTEXT_EMBEDDINGS.EMBEDDING',  'Vector FLOAT32 dimensi 1024 dari konten konteks pasar.'],
  ['MARKET_CONTEXT_EMBEDDINGS.MODEL_USED', 'Model embedding yang digunakan.'],
  ['MARKET_CONTEXT_EMBEDDINGS.CREATED_AT', 'Timestamp pembuatan embedding.'],

  /* ═══════════════════════════════════════════════════════════════════════
     15. GOAL_TYPES — Master tipe tujuan finansial
  ═══════════════════════════════════════════════════════════════════════ */
  ['GOAL_TYPES',
    'Tabel master untuk jenis-jenis tujuan finansial nasabah. Digunakan dalam fitur Goal-Based Planning untuk mengkategorikan tujuan investasi nasabah.'],
  ['GOAL_TYPES.GOAL_TYPE_ID', 'Primary key. Contoh: dana_darurat, pendidikan, pensiun, beli_rumah.'],
  ['GOAL_TYPES.LABEL',        'Label display tujuan finansial. Contoh: Dana Darurat, Dana Pendidikan Anak.'],
  ['GOAL_TYPES.DESCRIPTION',  'Deskripsi singkat tujuan finansial ini.'],
  ['GOAL_TYPES.ICON',         'Emoji atau kode ikon untuk representasi visual di UI.'],
  ['GOAL_TYPES.COLOR',        'Kode warna hex atau nama kelas CSS untuk warna tema tujuan di UI.'],
  ['GOAL_TYPES.SORT_ORDER',   'Urutan tampilan di daftar pilihan tujuan finansial. Ascending.'],
  ['GOAL_TYPES.IS_ACTIVE',    '1 = tujuan aktif dan dapat dipilih; 0 = tidak aktif.'],

  /* ═══════════════════════════════════════════════════════════════════════
     16. CUSTOMER_GOALS
  ═══════════════════════════════════════════════════════════════════════ */
  ['CUSTOMER_GOALS',
    'Tujuan finansial yang didefinisikan untuk setiap nasabah. Setiap nasabah dapat memiliki beberapa tujuan dengan target jumlah dan tahun berbeda. Digunakan dalam fitur Goal-Based Planning dan produk recommendation.'],
  ['CUSTOMER_GOALS.GOAL_ID',       'Primary key auto-increment.'],
  ['CUSTOMER_GOALS.CUSTOMER_ID',   'FK ke CUSTOMERS.CUSTOMER_ID.'],
  ['CUSTOMER_GOALS.GOAL_TYPE_ID',  'FK ke GOAL_TYPES.GOAL_TYPE_ID. Jenis tujuan finansial.'],
  ['CUSTOMER_GOALS.TARGET_AMOUNT', 'Target nilai yang ingin dicapai dalam Rupiah.'],
  ['CUSTOMER_GOALS.TARGET_YEAR',   'Tahun target pencapaian tujuan (format YYYY).'],
  ['CUSTOMER_GOALS.PRIORITY',      'Prioritas tujuan nasabah: 1 = Utama, 2 = Sekunder, 3 = Tersier.'],
  ['CUSTOMER_GOALS.NOTES',         'Catatan tambahan tentang tujuan ini dari RM atau nasabah.'],
  ['CUSTOMER_GOALS.STATUS',        'Status tujuan. Nilai: Active (aktif dipantau), Achieved (tercapai), Cancelled (dibatalkan).'],
  ['CUSTOMER_GOALS.CREATED_BY',    'FK ke RM_USERS.USER_ID. RM yang membuat/mencatat tujuan ini.'],
  ['CUSTOMER_GOALS.CREATED_AT',    'Timestamp pembuatan record tujuan.'],
  ['CUSTOMER_GOALS.UPDATED_AT',    'Timestamp pembaruan terakhir.'],

  /* ═══════════════════════════════════════════════════════════════════════
     17. SCHEDULER_LOG
  ═══════════════════════════════════════════════════════════════════════ */
  ['SCHEDULER_LOG',
    'Log eksekusi scheduled job Oracle (DBMS_SCHEDULER). Setiap baris merekam satu run dari job seperti JOB_MATURITY_ALERTS, JOB_MARKET_FETCH. Digunakan untuk monitoring, debugging, dan audit otomasi sistem.'],
  ['SCHEDULER_LOG.LOG_ID',         'Primary key auto-increment.'],
  ['SCHEDULER_LOG.JOB_NAME',       'Nama Oracle Scheduler job. Contoh: JOB_MATURITY_ALERTS, JOB_MARKET_DATA_FETCH.'],
  ['SCHEDULER_LOG.RUN_AT',         'Timestamp job mulai dieksekusi.'],
  ['SCHEDULER_LOG.STATUS',         'Status eksekusi. Nilai: RUNNING (sedang berjalan), SUCCESS (selesai sukses), FAILED (gagal dengan error).'],
  ['SCHEDULER_LOG.ALERTS_CREATED', 'Jumlah alert baru yang dibuat dalam run ini. Metrik utama untuk job maturity/market alert.'],
  ['SCHEDULER_LOG.ALERTS_UPDATED', 'Jumlah alert yang diperbarui (bukan dibuat baru) dalam run ini.'],
  ['SCHEDULER_LOG.DURATION_MS',    'Durasi eksekusi job dalam milidetik. Digunakan untuk monitoring performa.'],
  ['SCHEDULER_LOG.ERROR_MSG',      'Pesan error jika STATUS=FAILED. Maks 2000 karakter untuk ringkasan error.'],
  ['SCHEDULER_LOG.RUN_BY',         'Siapa yang menjalankan: SCHEDULER (otomatis), atau nama RM/admin jika dijalankan manual.'],

  /* ═══════════════════════════════════════════════════════════════════════
     18. ACTION_PLAN_TEMPLATES
  ═══════════════════════════════════════════════════════════════════════ */
  ['ACTION_PLAN_TEMPLATES',
    'Template rencana aksi yang digunakan oleh PAF_AGENT_COPILOT dan fitur S1 Meeting Prep untuk menghasilkan panduan tindakan RM berdasarkan skenario. Setiap template terdiri dari section-section terstruktur per jenis skenario (maturity, portfolio_loss, dll).'],
  ['ACTION_PLAN_TEMPLATES.TEMPLATE_ID',    'Primary key auto-increment.'],
  ['ACTION_PLAN_TEMPLATES.SCENARIO_TYPE',  'Jenis skenario action plan. Contoh: maturity_alert, portfolio_loss, kyc_renewal, campaign_approach.'],
  ['ACTION_PLAN_TEMPLATES.SECTION_KEY',    'Kunci unik section dalam skenario. Contoh: opening, situation_analysis, product_recommendation, closing.'],
  ['ACTION_PLAN_TEMPLATES.SECTION_LABEL',  'Label display section untuk ditampilkan di UI action plan.'],
  ['ACTION_PLAN_TEMPLATES.SECTION_ICON',   'Ikon/emoji section untuk representasi visual di UI.'],
  ['ACTION_PLAN_TEMPLATES.SECTION_ORDER',  'Urutan tampilan section dalam action plan. Ascending.'],
  ['ACTION_PLAN_TEMPLATES.GUIDANCE',       'Konten panduan tindakan RM dalam section ini (maks 4000 karakter). Dapat berisi placeholder dinamis.'],
  ['ACTION_PLAN_TEMPLATES.IS_ACTIVE',      '1 = template aktif digunakan; 0 = template deprecated.'],
  ['ACTION_PLAN_TEMPLATES.UPDATED_AT',     'Timestamp pembaruan terakhir template.'],

  /* ═══════════════════════════════════════════════════════════════════════
     19. NOTIFICATIONS
  ═══════════════════════════════════════════════════════════════════════ */
  ['NOTIFICATIONS',
    'Notifikasi in-app untuk RM. Setiap baris adalah satu notifikasi yang dikirimkan ke RM tertentu, biasanya dipicu oleh alert baru, rekomendasi, atau event sistem. Diakses via GET /api/notifications.'],
  ['NOTIFICATIONS.NOTIF_ID',    'Primary key auto-increment.'],
  ['NOTIFICATIONS.RM_USER_ID',  'FK ke RM_USERS.USER_ID. Penerima notifikasi.'],
  ['NOTIFICATIONS.NOTIF_TYPE',  'Jenis notifikasi. Contoh: alert_created, recommendation_ready, campaign_assigned, system_maintenance.'],
  ['NOTIFICATIONS.TITLE',       'Judul notifikasi singkat (maks 200 karakter). Ditampilkan di notification badge dan list.'],
  ['NOTIFICATIONS.MESSAGE',     'Pesan detail notifikasi (maks 2000 karakter).'],
  ['NOTIFICATIONS.SEVERITY',    'Tingkat urgensitas. Nilai: high, medium, low. Menentukan warna indicator di UI.'],
  ['NOTIFICATIONS.CUSTOMER_ID', 'ID nasabah terkait notifikasi ini. NULL jika notifikasi bukan tentang nasabah spesifik.'],
  ['NOTIFICATIONS.ALERT_ID',    'FK ke ALERTS.ALERT_ID. Alert yang memicu notifikasi ini. NULL jika bukan dari alert.'],
  ['NOTIFICATIONS.IS_READ',     '0 = belum dibaca (ditampilkan sebagai unread); 1 = sudah dibaca. Diperbarui saat RM membuka notifikasi.'],
  ['NOTIFICATIONS.CREATED_AT',  'Timestamp pembuatan notifikasi.'],

  /* ═══════════════════════════════════════════════════════════════════════
     20. NOTIFICATION_PREFS
  ═══════════════════════════════════════════════════════════════════════ */
  ['NOTIFICATION_PREFS',
    'Preferensi notifikasi per RM. Mengontrol channel (in-app, email, OCI), frekuensi pengiriman, dan horizon waktu untuk alert jatuh tempo. Satu baris per RM (UNIQUE pada RM_USER_ID).'],
  ['NOTIFICATION_PREFS.PREF_ID',              'Primary key auto-increment.'],
  ['NOTIFICATION_PREFS.RM_USER_ID',           'FK ke RM_USERS.USER_ID. Unik — satu preferensi per RM.'],
  ['NOTIFICATION_PREFS.IN_APP_ENABLED',       '1 = notifikasi in-app aktif; 0 = dinonaktifkan.'],
  ['NOTIFICATION_PREFS.EMAIL_ENABLED',        '1 = pengiriman email aktif; 0 = tidak.'],
  ['NOTIFICATION_PREFS.EMAIL_ADDRESS',        'Alamat email tujuan notifikasi. Dapat berbeda dari RM_USERS.EMAIL (misal: forward ke tim).'],
  ['NOTIFICATION_PREFS.DIGEST_FREQ',          'Frekuensi pengiriman notifikasi. Nilai: immediate (langsung), daily (digest harian 07:00), weekly (digest mingguan Senin).'],
  ['NOTIFICATION_PREFS.OCI_NOTIF_ENABLED',    '1 = pengiriman via OCI Notifications service aktif; 0 = tidak.'],
  ['NOTIFICATION_PREFS.MATURITY_HORIZON_DAYS','Horizon hari untuk mulai monitoring maturity alert. Default: 30 hari. RM akan mendapat alert untuk produk yang jatuh tempo dalam jumlah hari ini.'],
  ['NOTIFICATION_PREFS.MATURITY_HIGH_DAYS',   'Batas hari untuk severity HIGH pada maturity alert. Default: 14 hari. Produk jatuh tempo dalam <=14 hari → alert HIGH.'],
  ['NOTIFICATION_PREFS.MATURITY_MEDIUM_DAYS', 'Batas hari untuk severity MEDIUM pada maturity alert. Default: 30 hari. Produk jatuh tempo dalam 15-30 hari → alert MEDIUM.'],
  ['NOTIFICATION_PREFS.UPDATED_AT',           'Timestamp pembaruan preferensi terakhir.'],

  /* ═══════════════════════════════════════════════════════════════════════
     21. ALERT_THRESHOLDS
  ═══════════════════════════════════════════════════════════════════════ */
  ['ALERT_THRESHOLDS',
    'Konfigurasi threshold untuk pemicu alert yang dapat diubah oleh admin tanpa perlu deploy kode. Setiap threshold memiliki key unik, value numerik, dan unit. Digunakan oleh PROC_PUSH_MATURITY_ALERTS dan job-job lainnya.'],
  ['ALERT_THRESHOLDS.THRESHOLD_ID',    'Primary key auto-increment.'],
  ['ALERT_THRESHOLDS.THRESHOLD_KEY',   'Kunci identifier threshold. Contoh: maturity_high_days, portfolio_loss_pct_high, idle_money_days. Unik.'],
  ['ALERT_THRESHOLDS.CATEGORY',        'Kategori threshold. Contoh: maturity, portfolio, kyc, market. Untuk grouping di admin UI.'],
  ['ALERT_THRESHOLDS.LABEL',           'Label deskriptif threshold untuk admin UI.'],
  ['ALERT_THRESHOLDS.DESCRIPTION',     'Penjelasan lengkap apa yang diukur threshold ini dan dampak perubahannya.'],
  ['ALERT_THRESHOLDS.THRESHOLD_VALUE', 'Nilai threshold aktual. Digunakan oleh stored procedures dan PAF agents.'],
  ['ALERT_THRESHOLDS.UNIT',            'Satuan nilai threshold. Contoh: days, percent, rupiah.'],
  ['ALERT_THRESHOLDS.MIN_VALUE',       'Nilai minimum yang diizinkan (validasi input admin). NULL = tidak ada batas bawah.'],
  ['ALERT_THRESHOLDS.MAX_VALUE',       'Nilai maksimum yang diizinkan (validasi input admin). NULL = tidak ada batas atas.'],
  ['ALERT_THRESHOLDS.IS_ACTIVE',       '1 = threshold aktif digunakan dalam kalkulasi; 0 = dinonaktifkan/di-override.'],
  ['ALERT_THRESHOLDS.UPDATED_BY',      'RM atau SYSTEM yang terakhir mengubah nilai threshold. Untuk audit trail perubahan konfigurasi.'],
  ['ALERT_THRESHOLDS.UPDATED_AT',      'Timestamp pembaruan terakhir threshold.'],

  /* ═══════════════════════════════════════════════════════════════════════
     22. MARKET_DATA
  ═══════════════════════════════════════════════════════════════════════ */
  ['MARKET_DATA',
    'Data harga pasar terkini untuk instrumen yang dipantau (IHSG, LQ45, yield SBN, dsb). Diisi oleh job JOB_MARKET_DATA_FETCH dari Yahoo Finance atau feed eksternal. Digunakan PAF_AGENT_ALERT untuk membuat market event alerts.'],
  ['MARKET_DATA.DATA_ID',     'Primary key auto-increment.'],
  ['MARKET_DATA.SYMBOL',      'Simbol instrumen pasar. Contoh: ^JKSE (IHSG), ^LQ45, US10Y (yield obligasi AS).'],
  ['MARKET_DATA.MARKET_NAME', 'Nama lengkap instrumen. Contoh: IDX Composite, LQ45 Index.'],
  ['MARKET_DATA.ASSET_CLASS', 'Kelas aset instrumen. Nilai: equity, bond, commodity, forex, index.'],
  ['MARKET_DATA.PRICE',       'Harga penutupan terakhir dalam mata uang lokal.'],
  ['MARKET_DATA.PREV_CLOSE',  'Harga penutupan hari sebelumnya. Dasar perhitungan CHANGE_ABS dan CHANGE_PCT.'],
  ['MARKET_DATA.CHANGE_ABS',  'Perubahan harga absolut dari PREV_CLOSE (bisa negatif).'],
  ['MARKET_DATA.CHANGE_PCT',  'Perubahan harga dalam persen dari PREV_CLOSE (bisa negatif).'],
  ['MARKET_DATA.DAY_HIGH',    'Harga tertinggi hari ini.'],
  ['MARKET_DATA.DAY_LOW',     'Harga terendah hari ini.'],
  ['MARKET_DATA.HIGH_52W',    'Harga tertinggi dalam 52 minggu terakhir.'],
  ['MARKET_DATA.LOW_52W',     'Harga terendah dalam 52 minggu terakhir.'],
  ['MARKET_DATA.SOURCE',      'Sumber data. Default: yahoo_finance. Dapat diganti dengan IDX API atau Bloomberg.'],
  ['MARKET_DATA.FETCHED_AT',  'Timestamp saat data ini diambil dari sumber. Unik per SYMBOL+FETCHED_AT.'],

  /* ═══════════════════════════════════════════════════════════════════════
     23. MARKET_ALERT_RULES
  ═══════════════════════════════════════════════════════════════════════ */
  ['MARKET_ALERT_RULES',
    'Aturan untuk menghasilkan alert berdasarkan pergerakan data pasar. Setiap rule mendefinisikan instrumen, jenis kondisi (penurunan, kenaikan, batas), dan template pesan alert yang akan dibuat ketika kondisi terpenuhi.'],
  ['MARKET_ALERT_RULES.RULE_ID',              'Primary key auto-increment.'],
  ['MARKET_ALERT_RULES.RULE_KEY',             'Kunci identifier rule, unik. Contoh: ihsg_drop_2pct, yield_spike_50bps.'],
  ['MARKET_ALERT_RULES.SYMBOL',               'Simbol instrumen yang dipantau oleh rule ini. Referensi ke MARKET_DATA.SYMBOL.'],
  ['MARKET_ALERT_RULES.RULE_TYPE',            'Jenis kondisi yang dicek. Nilai: pct_drop, pct_rise, abs_drop, abs_rise, threshold_breach.'],
  ['MARKET_ALERT_RULES.THRESHOLD_VALUE',      'Nilai threshold yang memicu rule. Contoh: 2.0 untuk drop 2%.'],
  ['MARKET_ALERT_RULES.SEVERITY_TRIGGER',     'Severity default alert yang dibuat saat rule terpicu: high/medium/low.'],
  ['MARKET_ALERT_RULES.SEVERITY_HIGH_THRESH', 'Threshold untuk eskalasi severity ke HIGH. Contoh: drop 5% → eskalasi ke HIGH.'],
  ['MARKET_ALERT_RULES.AFFECTED_CATEGORIES',  'Kategori produk nasabah yang terdampak rule ini, dipisah koma. Contoh: reksa_dana,saham. Digunakan untuk menentukan nasabah mana yang perlu di-alert.'],
  ['MARKET_ALERT_RULES.ALERT_TITLE_TMPL',     'Template judul alert dengan placeholder. Contoh: "IHSG Turun {change_pct}% - Review Portofolio".'],
  ['MARKET_ALERT_RULES.ALERT_MSG_TMPL',       'Template pesan detail alert dengan placeholder dinamis.'],
  ['MARKET_ALERT_RULES.COOLDOWN_HOURS',       'Jeda minimum (jam) antara dua trigger yang sama. Mencegah alert spam saat pasar bergejolak.'],

  /* ═══════════════════════════════════════════════════════════════════════
     24. MARKET_ALERT_HISTORY
  ═══════════════════════════════════════════════════════════════════════ */
  ['MARKET_ALERT_HISTORY',
    'Riwayat setiap kali sebuah MARKET_ALERT_RULES terpicu. Digunakan untuk implementasi cooldown (mencegah alert duplikat) dan analisis frekuensi kejadian pasar.'],
  ['MARKET_ALERT_HISTORY.HISTORY_ID',     'Primary key auto-increment.'],
  ['MARKET_ALERT_HISTORY.RULE_KEY',       'FK ke MARKET_ALERT_RULES.RULE_KEY. Rule yang terpicu.'],
  ['MARKET_ALERT_HISTORY.TRIGGERED_AT',   'Timestamp rule terpicu.'],
  ['MARKET_ALERT_HISTORY.TRIGGER_VALUE',  'Nilai aktual metrik saat rule terpicu. Contoh: -3.2 (persen penurunan IHSG).'],
  ['MARKET_ALERT_HISTORY.ALERTS_CREATED', 'Jumlah alert yang berhasil dibuat dari trigger ini (satu per nasabah terdampak).'],

  /* ═══════════════════════════════════════════════════════════════════════
     25. PRODUCT_PERFORMANCE
  ═══════════════════════════════════════════════════════════════════════ */
  ['PRODUCT_PERFORMANCE',
    'Data performa return produk investasi vs benchmark dalam periode 1 bulan, 3 bulan, 6 bulan, dan 1 tahun. Digunakan untuk mengidentifikasi produk underperform dan memicu alert UNDERPERFORM kepada nasabah pemilik.'],
  ['PRODUCT_PERFORMANCE.PERF_ID',         'Primary key auto-increment.'],
  ['PRODUCT_PERFORMANCE.PRODUCT_ID',      'Identifier produk. Referensi ke PRODUCT_CATALOG.PRODUCT_ID.'],
  ['PRODUCT_PERFORMANCE.PRODUCT_NAME',    'Nama produk yang di-denormalize untuk kemudahan query.'],
  ['PRODUCT_PERFORMANCE.CATEGORY',        'Kategori produk yang di-denormalize.'],
  ['PRODUCT_PERFORMANCE.BENCHMARK_NAME',  'Nama benchmark pembanding. Contoh: IHSG, JCI Bond Index, SPN 1Y.'],
  ['PRODUCT_PERFORMANCE.RETURN_1M',       'Return aktual produk dalam 1 bulan terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.RETURN_3M',       'Return aktual produk dalam 3 bulan terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.RETURN_6M',       'Return aktual produk dalam 6 bulan terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.RETURN_1Y',       'Return aktual produk dalam 1 tahun terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.BENCH_RETURN_1M', 'Return benchmark dalam 1 bulan terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.BENCH_RETURN_3M', 'Return benchmark dalam 3 bulan terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.BENCH_RETURN_6M', 'Return benchmark dalam 6 bulan terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.BENCH_RETURN_1Y', 'Return benchmark dalam 1 tahun terakhir (persen).'],
  ['PRODUCT_PERFORMANCE.UPDATED_AT',      'Timestamp pembaruan terakhir data performa.'],

  /* ═══════════════════════════════════════════════════════════════════════
     26. RM_TASKS
  ═══════════════════════════════════════════════════════════════════════ */
  ['RM_TASKS',
    'Tugas dan follow-up yang dibuat untuk RM, baik secara otomatis oleh PAF agents (terutama PAF_AGENT_ALERT) maupun secara manual oleh RM. Ditampilkan di Calendar Actions dan dashboard task RM.'],
  ['RM_TASKS.TASK_ID',     'Primary key auto-increment.'],
  ['RM_TASKS.RM_USER_ID',  'FK ke RM_USERS.USER_ID. RM yang bertanggung jawab atas task ini.'],
  ['RM_TASKS.CUSTOMER_ID', 'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah terkait task. NULL untuk task non-nasabah.'],
  ['RM_TASKS.ALERT_ID',    'FK ke ALERTS.ALERT_ID. Alert yang memicu pembuatan task ini. NULL jika dibuat manual.'],
  ['RM_TASKS.TASK_TYPE',   'Jenis task. Nilai: follow_up (tindak lanjut), rebalancing (rebalancing portofolio), meeting (jadwalkan pertemuan), review (review portofolio). Default: follow_up.'],
  ['RM_TASKS.TITLE',       'Judul task yang singkat dan actionable. Contoh: "Hubungi Bapak Budi tentang rollover deposito".'],
  ['RM_TASKS.DESCRIPTION', 'Deskripsi detail task, konteks, dan langkah yang perlu diambil.'],
  ['RM_TASKS.DUE_DATE',    'Deadline penyelesaian task. Digunakan untuk sorting prioritas di dashboard RM.'],
  ['RM_TASKS.PRIORITY',    'Prioritas task. Nilai: high, medium, low. Menentukan urutan tampilan.'],
  ['RM_TASKS.STATUS',      'Status task. Nilai: open (belum dikerjakan), done (selesai), cancelled (dibatalkan).'],
  ['RM_TASKS.CREATED_AT',  'Timestamp pembuatan task.'],
  ['RM_TASKS.UPDATED_AT',  'Timestamp pembaruan status task terakhir.'],

  /* ═══════════════════════════════════════════════════════════════════════
     27. ALERT_ACTIONS
  ═══════════════════════════════════════════════════════════════════════ */
  ['ALERT_ACTIONS',
    'Tindakan yang diambil RM terhadap alert tertentu: menjadwalkan diskusi, menginisiasi rebalancing, atau membuat task. Setiap baris merekam satu aksi RM pada satu alert. Digunakan oleh V_CALENDAR_ACTIONS untuk tampilan kalender.'],
  ['ALERT_ACTIONS.ACTION_ID',      'Primary key auto-increment.'],
  ['ALERT_ACTIONS.ALERT_ID',       'FK ke ALERTS.ALERT_ID. Alert yang ditindaklanjuti.'],
  ['ALERT_ACTIONS.ACTION_TYPE',    'Jenis aksi. Nilai: schedule_discussion (jadwalkan meeting), initiate_rebalancing (inisiasi rebalancing), create_task (buat tugas follow-up).'],
  ['ALERT_ACTIONS.CUSTOMER_ID',    'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah terkait aksi ini.'],
  ['ALERT_ACTIONS.RM_USER_ID',     'FK ke RM_USERS.USER_ID. RM yang melakukan aksi.'],
  ['ALERT_ACTIONS.REFERENCE_ID',   'ID objek yang dibuat sebagai hasil aksi. Contoh: APPOINTMENT_ID untuk schedule_discussion, TASK_ID untuk create_task.'],
  ['ALERT_ACTIONS.REFERENCE_TYPE', 'Tipe objek referensi. Nilai: APPOINTMENT, RM_TASKS. Menentukan tabel mana REFERENCE_ID merujuk.'],
  ['ALERT_ACTIONS.NOTES',          'Catatan RM saat mengambil aksi ini (maks 1000 karakter).'],
  ['ALERT_ACTIONS.CREATED_AT',     'Timestamp aksi diambil.'],

  /* ═══════════════════════════════════════════════════════════════════════
     28. RM_ALERT_SUBSCRIPTIONS
  ═══════════════════════════════════════════════════════════════════════ */
  ['RM_ALERT_SUBSCRIPTIONS',
    'Preferensi langganan alert per RM per jenis alert. RM dapat memilih jenis alert yang ingin diterima, segmen nasabah yang dipantau, dan filter severity. Satu baris per kombinasi (RM_USER_ID, ALERT_TYPE).'],
  ['RM_ALERT_SUBSCRIPTIONS.SUB_ID',            'Primary key auto-increment.'],
  ['RM_ALERT_SUBSCRIPTIONS.RM_USER_ID',        'FK ke RM_USERS.USER_ID. RM pemilik preferensi.'],
  ['RM_ALERT_SUBSCRIPTIONS.ALERT_TYPE',        'Jenis alert yang di-subscribe. Referensi ke ALERT_TYPE_CATALOGUE.ALERT_TYPE.'],
  ['RM_ALERT_SUBSCRIPTIONS.IS_ACTIVE',         '1 = langganan aktif; 0 = tidak menerima alert jenis ini.'],
  ['RM_ALERT_SUBSCRIPTIONS.CUSTOMER_SEGMENTS', 'Segmen nasabah yang ingin dipantau. DEFAULT: ALL. Dapat diisi tier tertentu: prioritas,privilege.'],
  ['RM_ALERT_SUBSCRIPTIONS.SEVERITY_FILTER',   'Filter minimum severity yang diterima. Contoh: high (hanya alert HIGH). NULL = semua severity.'],
  ['RM_ALERT_SUBSCRIPTIONS.CREATED_AT',        'Timestamp pembuatan preferensi.'],
  ['RM_ALERT_SUBSCRIPTIONS.UPDATED_AT',        'Timestamp pembaruan preferensi terakhir.'],

  /* ═══════════════════════════════════════════════════════════════════════
     29. ALERT_TYPE_CATALOGUE
  ═══════════════════════════════════════════════════════════════════════ */
  ['ALERT_TYPE_CATALOGUE',
    'Tabel master untuk semua jenis alert yang didukung sistem. Mendefinisikan label display, ikon, dan deskripsi setiap alert_type. Digunakan untuk memvalidasi nilai ALERT_TYPE di tabel ALERTS dan untuk mengisi UI filter/subscription.'],
  ['ALERT_TYPE_CATALOGUE.ALERT_TYPE',   'Primary key. Kode jenis alert. Contoh: maturity, portfolio_loss, kyc_expiry, idle_money, concentration_risk.'],
  ['ALERT_TYPE_CATALOGUE.LABEL',        'Label display untuk UI. Contoh: Jatuh Tempo, Kerugian Portofolio, KYC Expired.'],
  ['ALERT_TYPE_CATALOGUE.ICON',         'Emoji atau kode ikon untuk representasi visual jenis alert di UI.'],
  ['ALERT_TYPE_CATALOGUE.DESCRIPTION',  'Deskripsi lengkap kapan alert jenis ini dibuat dan apa artinya bagi RM.'],
  ['ALERT_TYPE_CATALOGUE.IS_ACTIVE',    '1 = jenis alert aktif digunakan; 0 = deprecated/tidak digunakan.'],
  ['ALERT_TYPE_CATALOGUE.SORT_ORDER',   'Urutan tampilan dalam daftar filter alert type. Ascending.'],
  ['ALERT_TYPE_CATALOGUE.CREATED_AT',   'Timestamp penambahan alert type ke katalog.'],

  /* ═══════════════════════════════════════════════════════════════════════
     30. MCP_ANALYSIS_LOG
  ═══════════════════════════════════════════════════════════════════════ */
  ['MCP_ANALYSIS_LOG',
    'Log eksekusi analisis oleh PAF agents melalui MCP (Model Context Protocol) server. Menyimpan full response LLM, jumlah token, dan durasi untuk setiap analisis alert yang diproses PAF_AGENT_ALERT via MCP.'],
  ['MCP_ANALYSIS_LOG.LOG_ID',        'Primary key auto-increment.'],
  ['MCP_ANALYSIS_LOG.ALERT_ID',      'FK ke ALERTS.ALERT_ID. Alert yang dianalisis.'],
  ['MCP_ANALYSIS_LOG.RM_USER_ID',    'FK ke RM_USERS.USER_ID. RM yang memicu analisis. NULL jika dijalankan otomatis.'],
  ['MCP_ANALYSIS_LOG.MODEL_USED',    'Model yang digunakan untuk analisis. Default: PAF_MCP. Contoh: cohere.command-r-plus.'],
  ['MCP_ANALYSIS_LOG.ANALYSIS_CLOB', 'Full text hasil analisis LLM dalam format markdown (CLOB). Berisi ringkasan risiko, konteks, dan rekomendasi.'],
  ['MCP_ANALYSIS_LOG.TOKEN_COUNT',   'Total token yang digunakan dalam pemanggilan LLM (input + output). Untuk monitoring biaya OCI GenAI.'],
  ['MCP_ANALYSIS_LOG.DURATION_MS',   'Durasi pemanggilan LLM dalam milidetik.'],
  ['MCP_ANALYSIS_LOG.CREATED_AT',    'Timestamp analisis dilakukan.'],

  /* ═══════════════════════════════════════════════════════════════════════
     31. PORTFOLIO_AI_REPORTS
  ═══════════════════════════════════════════════════════════════════════ */
  ['PORTFOLIO_AI_REPORTS',
    'Menyimpan setiap hasil analisis AI portofolio yang dihasilkan oleh PAF_AGENT_COPILOT (endpoint /api/portfolio/analysis). Setiap analisis disimpan otomatis setelah stream selesai. Berfungsi sebagai riwayat analisis dan sumber data untuk generate laporan DOCX.'],
  ['PORTFOLIO_AI_REPORTS.REPORT_ID',     'Primary key auto-increment. Identifier laporan. Format tampilan: PAR-000001.'],
  ['PORTFOLIO_AI_REPORTS.CUSTOMER_ID',   'FK ke CUSTOMERS.CUSTOMER_ID. Nasabah yang dianalisis.'],
  ['PORTFOLIO_AI_REPORTS.RM_USER_ID',    'FK ke RM_USERS.USER_ID. RM yang memicu analisis.'],
  ['PORTFOLIO_AI_REPORTS.REPORT_TITLE',  'Judul laporan yang dihasilkan otomatis. Format: "Analisis Portofolio — [Nama Nasabah] — [Tanggal]".'],
  ['PORTFOLIO_AI_REPORTS.ANALYSIS_TEXT', 'Full text analisis AI dalam format markdown (CLOB). Berisi 6 bagian: Gambaran Umum, Analisis Per Produk, Pertumbuhan, Diversifikasi, Insight Strategis, dan Kesimpulan.'],
  ['PORTFOLIO_AI_REPORTS.FORECAST_JSON', 'Snapshot data forecast portofolio saat analisis dibuat (CLOB JSON). Digunakan untuk generate DOCX tanpa perlu recalculate.'],
  ['PORTFOLIO_AI_REPORTS.ALERTS_JSON',   'Snapshot alert aktif nasabah saat analisis (CLOB JSON). Dimasukkan ke dalam laporan DOCX.'],
  ['PORTFOLIO_AI_REPORTS.CUSTOMER_JSON', 'Snapshot data profil nasabah saat analisis (CLOB JSON). Digunakan untuk header laporan DOCX.'],
  ['PORTFOLIO_AI_REPORTS.REPORT_STATUS', 'Status laporan. Nilai: SAVED (tersimpan), DOWNLOADED (sudah diunduh sebagai DOCX), ARCHIVED (diarsipkan/dihapus soft).'],
  ['PORTFOLIO_AI_REPORTS.CREATED_AT',    'Timestamp analisis selesai dan tersimpan.'],

  /* ═══════════════════════════════════════════════════════════════════════
     32. CALL_CENTER_TRANSCRIPTS
  ═══════════════════════════════════════════════════════════════════════ */
  ['CALL_CENTER_TRANSCRIPTS',
    'Transkrip percakapan call center antara nasabah dengan customer service Bank Danamon. Digunakan oleh PAF_AGENT_COPILOT via RAG untuk memberikan konteks historis interaksi nasabah dari channel call center kepada RM.'],

  /* ═══════════════════════════════════════════════════════════════════════
     33. COPILOT_SUGGESTED_PROMPTS
  ═══════════════════════════════════════════════════════════════════════ */
  ['COPILOT_SUGGESTED_PROMPTS',
    'Kumpulan prompt yang disarankan kepada RM saat menggunakan fitur AI Copilot. Membantu RM menemukan pertanyaan berguna tanpa harus mengetik dari nol. Diisi dan dikurasi oleh admin.'],

  /* ═══════════════════════════════════════════════════════════════════════
     34. RM_APPOINTMENTS
  ═══════════════════════════════════════════════════════════════════════ */
  ['RM_APPOINTMENTS',
    'Jadwal meeting/appointment RM dengan nasabah. Dibuat ketika RM mengambil aksi schedule_discussion dari sebuah alert. Ditampilkan di Calendar Actions module dan dapat diperbarui statusnya oleh RM.'],

  /* ═══════════════════════════════════════════════════════════════════════
     35. AI_ANALYSIS_HISTORY (alias AI_HISTORY)
  ═══════════════════════════════════════════════════════════════════════ */
  ['AI_ANALYSIS_HISTORY',
    'Riwayat percakapan dan analisis AI yang pernah dilakukan RM melalui Copilot. Memungkinkan RM melihat kembali hasil analisis AI sebelumnya dan melanjutkan konteks percakapan. Diakses via /api/ai-history.'],
];

/* ──────────────────────────────────────────────────────────────────────────
   Execute
────────────────────────────────────────────────────────────────────────── */
async function run() {
  await db.initialize();
  console.log('Migration 27 — Table & Column Metadata Comments\n');

  let ok = 0, skip = 0, fail = 0;

  for (const [key, comment] of COMMENTS) {
    const parts = key.split('.');
    const sql = parts.length === 2
      ? `COMMENT ON COLUMN ${parts[0]}.${parts[1]} IS '${comment.replace(/'/g, "''")}'`
      : `COMMENT ON TABLE  ${parts[0]} IS '${comment.replace(/'/g, "''")}'`;

    try {
      await db.execute(sql);
      console.log(`  ✅  ${key}`);
      ok++;
    } catch (e) {
      if (e.message.match(/ORA-00942|ORA-00904/)) {
        console.log(`  ⏭   ${key} (table/column not found — skip)`);
        skip++;
      } else {
        console.error(`  ❌  ${key}: ${e.message.split('\n')[0]}`);
        fail++;
      }
    }
  }

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  ✅  Applied : ${ok}`);
  console.log(`  ⏭   Skipped : ${skip} (object not found in this schema)`);
  console.log(`  ❌  Errors  : ${fail}`);
  console.log('──────────────────────────────────────────────────────────');

  if (ok > 0) {
    // Quick verification
    const verify = await db.execute(
      `SELECT COUNT(*) AS C FROM ALL_TAB_COMMENTS
       WHERE OWNER = USER AND COMMENTS IS NOT NULL`,
    );
    console.log(`\n📊 Total table comments in schema: ${verify.rows[0].C}`);

    const colVerify = await db.execute(
      `SELECT COUNT(*) AS C FROM ALL_COL_COMMENTS
       WHERE OWNER = USER AND COMMENTS IS NOT NULL`,
    );
    console.log(`📊 Total column comments in schema: ${colVerify.rows[0].C}`);
  }

  console.log('\n✅  Migration 27 complete');
  await db.close();
}

run().catch(err => {
  console.error('Migration 27 FAILED:', err.message || err);
  process.exit(1);
});
