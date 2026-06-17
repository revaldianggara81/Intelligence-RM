'use strict';
/**
 * scripts/runMigration08.js
 * Creates CALL_CENTER_TRANSCRIPTS table and seeds sample data.
 */
require('dotenv').config();
const oracledb = require('oracledb');
const path     = require('path');

const SEED_TRANSCRIPTS = [
  // CUST003 – Hendra Kusuma Jati
  {
    customerId: 'CUST003', callDate: '2026-05-20', duration: 480, agent: 'Rina Susanti',
    callType: 'INBOUND', topic: 'Keluhan penurunan nilai reksa dana',
    sentiment: 'NEGATIVE',
    resolution: 'Nasabah diedukasi mengenai fluktuasi pasar. Dijanjikan follow-up dari RM.',
    text: `[00:00] Agent Rina: Selamat siang, Bank Danamon, dengan Rina, ada yang bisa saya bantu?
[00:05] Nasabah (Hendra): Iya siang. Saya mau tanya soal reksa dana saya. Kenapa nilainya turun drastis ya? Hampir minus 8% dalam sebulan.
[00:15] Agent Rina: Baik Pak Hendra, saya cek dulu ya. Mohon tunggu sebentar... Benar Pak, untuk Reksa Dana Saham Bluechip Anda memang mengalami penurunan seiring kondisi pasar global yang sedang volatile.
[00:45] Nasabah: Iya tapi saya kan sudah investasi hampir 3 tahun. Ini bikin saya khawatir. Apa sebaiknya saya tarik saja?
[01:05] Agent Rina: Saya mengerti kekhawatiran Bapak. Namun untuk keputusan investasi yang lebih komprehensif, saya sarankan Bapak berkonsultasi langsung dengan RM Anda, yaitu Bu Anisa Rahma. Beliau bisa memberikan analisis lengkap sesuai profil risiko Bapak.
[01:30] Nasabah: Kapan bisa dihubungi? Saya butuh kepastian segera.
[01:38] Agent Rina: Saya akan catat permintaan callback dari Bapak. Bu Anisa akan menghubungi Bapak dalam 1x24 jam kerja.
[01:50] Nasabah: Baik, tolong dipercepat ya. Saya juga ingin tahu apakah ada produk yang lebih aman untuk kondisi pasar sekarang.
[02:10] Agent Rina: Tentu Pak, akan saya sampaikan ke RM Bapak. Apakah ada hal lain yang bisa saya bantu?
[02:20] Nasabah: Tidak, itu saja. Terima kasih.
[02:25] Agent Rina: Sama-sama Pak Hendra. Terima kasih sudah menghubungi Bank Danamon.`,
  },
  {
    customerId: 'CUST003', callDate: '2026-05-08', duration: 320, agent: 'Budi Prasetyo',
    callType: 'INBOUND', topic: 'Inquiry deposito jatuh tempo',
    sentiment: 'NEUTRAL',
    resolution: 'Informasi diberikan. Nasabah akan konsultasi dengan RM sebelum memutuskan perpanjangan.',
    text: `[00:00] Agent Budi: Selamat pagi, Bank Danamon, dengan Budi, ada yang bisa saya bantu?
[00:06] Nasabah (Hendra): Pagi. Saya mau tanya, deposito saya yang bulan ini jatuh tempo—apakah sudah ada notifikasi ke RM saya?
[00:18] Agent Budi: Baik Pak Hendra, saya periksa... Ya Pak, sistem kami sudah mengirimkan notifikasi ke RM Bapak. Deposito Reguler 6 Bulan Anda senilai Rp 500 juta jatuh tempo tanggal 29 Mei 2026.
[00:40] Nasabah: Oke bagus. Saya ingin tahu apakah rate deposito sekarang masih sama atau ada perubahan?
[00:50] Agent Budi: Untuk rate terbaru, saat ini deposito 6 bulan kami menawarkan 5.75% per annum. Namun untuk penawaran khusus nasabah Prioritas seperti Bapak, RM Anda bisa memberikan rate yang lebih kompetitif.
[01:15] Nasabah: Saya juga tertarik dengan obligasi pemerintah. Ada info terbaru?
[01:25] Agent Budi: Untuk produk obligasi, ada ORI024 yang masih bisa diakses. Detail teknisnya lebih baik Bapak diskusikan langsung dengan RM untuk rekomendasi yang tepat sesuai portofolio Bapak.
[01:45] Nasabah: Oke mengerti. Nanti saya hubungi RM saya langsung.
[01:52] Agent Budi: Baik Pak. Ada hal lain?
[01:55] Nasabah: Tidak, cukup. Makasih.`,
  },
  {
    customerId: 'CUST003', callDate: '2026-04-15', duration: 610, agent: 'Sari Wulandari',
    callType: 'OUTBOUND', topic: 'Penawaran produk asuransi jiwa unit link',
    sentiment: 'POSITIVE',
    resolution: 'Nasabah tertarik. Jadwal pertemuan dengan RM disepakati untuk 22 April 2026.',
    text: `[00:00] Agent Sari: Selamat siang, bisa bicara dengan Bapak Hendra Kusuma Jati?
[00:08] Nasabah (Hendra): Ya, saya sendiri.
[00:10] Agent Sari: Selamat siang Pak Hendra, saya Sari dari Bank Danamon. Saya menghubungi Bapak berkaitan dengan program spesial kami untuk nasabah Prioritas—yaitu produk Asuransi Jiwa Unit Link yang menggabungkan perlindungan jiwa dan investasi.
[00:35] Nasabah: Oh ya? Ceritakan lebih lanjut.
[00:40] Agent Sari: Produk ini memberikan perlindungan jiwa hingga 5x premi sekaligus mengoptimalkan investasi dengan target return 8% per tahun. Sangat cocok untuk nasabah dengan profil risiko agresif seperti Bapak.
[01:10] Nasabah: Berapa minimum preminya?
[01:15] Agent Sari: Mulai dari Rp 500 juta per tahun Pak, dan ada fleksibilitas untuk top-up kapan saja.
[01:30] Nasabah: Hmm, menarik. Saya ingin tahu lebih detail. Bisa diatur pertemuan dengan RM saya?
[01:45] Agent Sari: Tentu Pak! Saya bisa langsung koordinasikan dengan Bu Anisa Rahma, RM Bapak. Apakah tanggal 22 April jam 10 pagi cocok?
[02:00] Nasabah: Bisa, atur saja.
[02:05] Agent Sari: Baik, saya konfirmasi pertemuan tanggal 22 April 2026 pukul 10:00 di kantor Danamon cabang Sudirman. Bu Anisa akan mempersiapkan proposal lengkap.
[02:25] Nasabah: Oke. Terima kasih ya informasinya.
[02:30] Agent Sari: Sama-sama Pak Hendra. Terima kasih atas kepercayaan Bapak kepada Bank Danamon.`,
  },
  // CUST001 – Sari Rahayu
  {
    customerId: 'CUST001', callDate: '2026-05-18', duration: 240, agent: 'Ahmad Firdaus',
    callType: 'INBOUND', topic: 'Reset PIN mobile banking',
    sentiment: 'NEUTRAL',
    resolution: 'PIN berhasil di-reset melalui verifikasi data nasabah.',
    text: `[00:00] Agent Ahmad: Selamat pagi, Bank Danamon, ada yang bisa saya bantu?
[00:05] Nasabah (Sari): Pagi, saya mau reset PIN mobile banking saya.
[00:10] Agent Ahmad: Baik Bu Sari, saya bantu proses reset PIN. Boleh saya verifikasi data dulu? Nomor KTP?
[00:18] Nasabah: 3271xxxxxxxxxxxx
[00:25] Agent Ahmad: Tanggal lahir?
[00:28] Nasabah: 15 Maret 1985
[00:35] Agent Ahmad: Terima kasih Bu. Proses reset PIN sudah selesai. Silakan cek SMS ke nomor terdaftar untuk PIN sementara. Harap diganti segera setelah login.
[01:00] Nasabah: Oke sudah masuk SMSnya. Makasih ya.
[01:05] Agent Ahmad: Sama-sama Bu Sari.`,
  },
  // CUST005 – Budi Santoso
  {
    customerId: 'CUST005', callDate: '2026-05-22', duration: 720, agent: 'Dewi Anggraini',
    callType: 'INBOUND', topic: 'Keluhan penolakan pengajuan KPR',
    sentiment: 'NEGATIVE',
    resolution: 'Nasabah diberikan penjelasan alasan penolakan. Disarankan untuk mengajukan kembali setelah 3 bulan dengan peningkatan skor kredit.',
    text: `[00:00] Agent Dewi: Selamat sore, Bank Danamon, dengan Dewi, ada yang bisa saya bantu?
[00:06] Nasabah (Budi): Sore. Saya Budi Santoso. Pengajuan KPR saya ditolak tanpa penjelasan jelas. Saya minta penjelasan resmi.
[00:20] Agent Dewi: Saya turut menyesal mendengar hal ini Pak Budi. Saya akan cek pengajuan Anda... Berdasarkan hasil evaluasi, pengajuan KPR Bapak terkendala pada debt-to-income ratio yang melebihi threshold kami, yaitu 40%.
[00:55] Nasabah: Tapi saya sudah nasabah Danamon lebih dari 10 tahun. Ini tidak adil.
[01:10] Agent Dewi: Saya sangat menghargai loyalitas Bapak. Namun kebijakan kredit mengacu pada kondisi keuangan saat ini. Saya sarankan Bapak berkonsultasi dengan RM Bapak untuk strategi peningkatan profil kredit.
[01:35] Nasabah: Kapan bisa diajukan lagi?
[01:42] Agent Dewi: Umumnya setelah 3 bulan, dengan catatan ada perbaikan pada rasio utang Bapak. RM Bapak bisa membantu merencanakan langkah-langkahnya.
[02:10] Nasabah: Oke saya minta callback dari RM saya hari ini juga.
[02:18] Agent Dewi: Baik Pak Budi, saya catat permintaan callback urgent. RM Bapak akan menghubungi sebelum jam 5 sore ini.
[02:30] Nasabah: Terima kasih.`,
  },
];

async function run() {
  const walletDir = path.resolve(process.env.DB_WALLET_DIR || './wallet');
  oracledb.autoCommit = true;
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

  // ── 1. Create table (idempotent) ─────────────────────────────────
  const createSQL = `BEGIN
  EXECUTE IMMEDIATE q'[CREATE TABLE CALL_CENTER_TRANSCRIPTS (
    TRANSCRIPT_ID   NUMBER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CUSTOMER_ID     VARCHAR2(50)  NOT NULL REFERENCES CUSTOMERS(CUSTOMER_ID),
    CALL_DATE       DATE          NOT NULL,
    CALL_DURATION   NUMBER,
    AGENT_NAME      VARCHAR2(200),
    CALL_TYPE       VARCHAR2(20)  DEFAULT 'INBOUND',
    TOPIC           VARCHAR2(500),
    TRANSCRIPT_TEXT CLOB          NOT NULL,
    SENTIMENT       VARCHAR2(20),
    RESOLUTION      VARCHAR2(500),
    CREATED_AT      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
  )]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;`;
  await conn.execute(createSQL);
  console.log('[OK] Table CALL_CENTER_TRANSCRIPTS ensured');

  for (const idx of [
    `CREATE INDEX IDX_CCT_CUSTOMER ON CALL_CENTER_TRANSCRIPTS(CUSTOMER_ID)`,
    `CREATE INDEX IDX_CCT_DATE ON CALL_CENTER_TRANSCRIPTS(CUSTOMER_ID, CALL_DATE DESC)`,
  ]) {
    await conn.execute(
      `BEGIN EXECUTE IMMEDIATE '${idx}'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;`
    );
  }
  console.log('[OK] Indexes ensured');

  // ── 2. Seed (skip if rows already exist) ─────────────────────────
  const cnt = await conn.execute(`SELECT COUNT(*) AS CNT FROM CALL_CENTER_TRANSCRIPTS`);
  if ((cnt.rows[0].CNT || 0) > 0) {
    console.log('[SKIP] Seed data already present (' + cnt.rows[0].CNT + ' rows)');
  } else {
    for (const t of SEED_TRANSCRIPTS) {
      await conn.execute(
        `INSERT INTO CALL_CENTER_TRANSCRIPTS
           (CUSTOMER_ID, CALL_DATE, CALL_DURATION, AGENT_NAME, CALL_TYPE, TOPIC,
            TRANSCRIPT_TEXT, SENTIMENT, RESOLUTION)
         VALUES (:1, TO_DATE(:2,'YYYY-MM-DD'), :3, :4, :5, :6, :7, :8, :9)`,
        [t.customerId, t.callDate, t.duration, t.agent, t.callType, t.topic,
         t.text, t.sentiment, t.resolution]
      );
    }
    console.log('[OK] Seeded ' + SEED_TRANSCRIPTS.length + ' sample transcripts');
  }

  await conn.close();
  console.log('[DONE] Migration 08 complete');
  process.exit(0);
}

run().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
