'use strict';
/**
 * One-shot migration runner for RM_APPOINTMENTS table.
 * Run: node run_migration.js
 */
require('dotenv').config();
const db = require('./backend/config/database');

async function run() {
  console.log('[Migration] Initializing DB pool...');
  await db.initialize();
  console.log('[Migration] Pool ready. Creating RM_APPOINTMENTS table...\n');

  // Drop existing table (re-run safe)
  try {
    await db.execute('DROP TABLE RM_APPOINTMENTS CASCADE CONSTRAINTS');
    console.log('[Migration] RM_APPOINTMENTS dropped.');
  } catch (_) {
    console.log('[Migration] Table did not exist — creating fresh.');
  }

  // Create table
  await db.execute(`
    CREATE TABLE RM_APPOINTMENTS (
      APPOINTMENT_ID   NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      RM_USER_ID       VARCHAR2(50)    NOT NULL,
      CUSTOMER_ID      VARCHAR2(50),
      CUSTOMER_NAME    VARCHAR2(200),
      TITLE            VARCHAR2(200)   NOT NULL,
      MEETING_TYPE     VARCHAR2(20)    NOT NULL,
      NOTES            VARCHAR2(2000),
      APPOINTMENT_DATE TIMESTAMP       NOT NULL,
      DURATION_MIN     NUMBER          DEFAULT 30,
      STATUS           VARCHAR2(20)    DEFAULT 'scheduled',
      CREATED_AT       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT appt_meeting_type_ck CHECK (MEETING_TYPE IN ('email','whatsapp','phone','visit')),
      CONSTRAINT appt_status_ck       CHECK (STATUS IN ('scheduled','completed','cancelled')),
      CONSTRAINT appt_rm_fk FOREIGN KEY (RM_USER_ID) REFERENCES RM_USERS(USER_ID) ON DELETE CASCADE,
      CONSTRAINT appt_cust_fk FOREIGN KEY (CUSTOMER_ID) REFERENCES CUSTOMERS(CUSTOMER_ID) ON DELETE SET NULL
    )
  `);
  console.log('[Migration] RM_APPOINTMENTS table created.');

  // Indexes
  await db.execute('CREATE INDEX idx_appt_rm_date  ON RM_APPOINTMENTS(RM_USER_ID, APPOINTMENT_DATE)');
  await db.execute('CREATE INDEX idx_appt_customer ON RM_APPOINTMENTS(CUSTOMER_ID)');
  await db.execute('CREATE INDEX idx_appt_status   ON RM_APPOINTMENTS(STATUS)');
  console.log('[Migration] Indexes created.');

  // Seed data — current month appointments for rm001
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth(); // 0-based

  // ts: date from start of current month
  function ts(dayOffset, hour) {
    const d = new Date(y, m, dayOffset, hour, 0, 0);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  }
  // tsFuture: date from TODAY + N days
  function tsFuture(daysAhead, hour) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  }
  // tsPast: date from TODAY - N days
  function tsPast(daysAgo, hour) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  }

  const seeds = [
    // ── Past appointments (completed) ──────────────────────────────────
    ['rm001','CUST001','Budi Karya',   'Review Deposito Jatuh Tempo & Rebalancing',        'visit',     'Deposito 500jt jatuh tempo minggu depan. Siapkan proposal reinvestasi ke ORI026.',   tsPast(25,10), 60, 'completed'],
    ['rm001','CUST003','Hendra Kusuma Jati','Follow-up Portfolio Review Q2',                'phone',     'Bahas idle money 55% AUM. Rekomendasikan obligasi korporasi.',                       tsPast(20,14), 30, 'completed'],
    ['rm001','CUST004','Dewi Lestari', 'Perbaruan KYC & Dokumen',                          'email',     'KYC akan expired 30 hari lagi. Kirim form pembaruan via email. CC compliance.',      tsPast(15, 9), 15, 'completed'],
    ['rm001','CUST006','Reza Pratama', 'Tawarkan Upgrade Tier Prioritas',                  'whatsapp',  'AUM 280jt sudah memenuhi syarat upgrade. Kirim info benefit tier Prioritas.',        tsPast(10,11), 20, 'completed'],
    ['rm001','CUST001','Budi Karya',   'Konfirmasi Reinvestasi Deposito',                  'phone',     'Follow-up setelah meeting. Konfirmasi keputusan reinvestasi.',                       tsPast( 5,16), 20, 'completed'],
    // ── Today / tomorrow ───────────────────────────────────────────────
    ['rm001','CUST005','Rudi Santoso', 'Kunjungan Kantor — Perkenalan Produk Baru',        'visit',     'Presentasi Obligasi Korporasi high-yield dan SBR013.',                               tsFuture(0,11), 90, 'scheduled'],
    ['rm001','CUST002','Sari Wijaya II','Check-in Bulanan via WhatsApp',                   'whatsapp',  'Update performa reksa dana. Tanyakan kebutuhan likuiditas jangka pendek.',           tsFuture(0,14), 15, 'scheduled'],
    // ── Upcoming (1–14 days ahead) ─────────────────────────────────────
    ['rm001','CUST007','Mega Wulandari','Diskusi Strategi Portofolio H2 2026',             'visit',     'Nasabah ingin diversifikasi ke aset asing. Siapkan info reksa dana global & obligasi USD.', tsFuture(2,15), 60, 'scheduled'],
    ['rm001', null,    null,           'Internal Team Meeting — Monthly Review',            'visit',     'Review target AUM bulan berjalan bersama kepala cabang.',                            tsFuture(4, 9), 120,'scheduled'],
    ['rm001','CUST003','Hendra Kusuma Jati','Tindak Lanjut Alert Konsentrasi Portofolio', 'email',     'Kirim laporan rebalancing. Saran alihkan reksa_dana ke obligasi.',                   tsFuture(7,10), 15, 'scheduled'],
    ['rm001','CUST004','Dewi Lestari', 'Follow-up KYC Completion',                         'phone',     'Konfirmasi dokumen KYC sudah diterima compliance.',                                  tsFuture(9,11), 20, 'scheduled'],
    ['rm001','CUST006','Reza Pratama', 'Meeting Onboarding Tier Prioritas',                'visit',     'Serahkan welcome kit Prioritas. Kenalkan produk eksklusif tier.',                    tsFuture(12,10), 60, 'scheduled'],
    ['rm001','CUST005','Rudi Santoso', 'Konfirmasi Pembelian Obligasi',                    'whatsapp',  'Follow-up pasca presentasi. Tanyakan keputusan pembelian OBL-2026.',                 tsFuture(14,15), 15, 'scheduled'],
  ];

  let inserted = 0;
  for (const [rmId, custId, custName, title, mtype, notes, apptDt, dur, status] of seeds) {
    try {
      await db.execute(
        `INSERT INTO RM_APPOINTMENTS
           (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES,
            APPOINTMENT_DATE, DURATION_MIN, STATUS)
         VALUES (:1, :2, :3, :4, :5, :6,
                 TO_TIMESTAMP(:7,'YYYY-MM-DD HH24:MI:SS'), :8, :9)`,
        [rmId, custId, custName, title, mtype, notes, apptDt, dur, status]
      );
      inserted++;
      console.log(`  ✓ ${title}`);
    } catch (e) {
      console.error(`  ✗ ${title}: ${e.message}`);
    }
  }

  console.log(`\n[Migration] Done. ${inserted} appointments seeded.`);
  await db.close();
  process.exit(0);
}

run().catch(e => {
  console.error('[Migration] FATAL:', e.message);
  process.exit(1);
});
