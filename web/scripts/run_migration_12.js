'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();
  const run = async (label, sql) => {
    try { await db.execute(sql); console.log('[✓]', label); }
    catch(e) {
      if (/ORA-00955|ORA-01430|ORA-02261|ORA-02291/.test(e.message)) console.log('[~]', label, '(already exists)');
      else console.error('[✗]', label, e.message);
    }
  };

  // 1. GOAL_TYPES reference table
  await run('CREATE GOAL_TYPES', `CREATE TABLE GOAL_TYPES (
    GOAL_TYPE_ID  VARCHAR2(50)  PRIMARY KEY,
    LABEL         VARCHAR2(100) NOT NULL,
    DESCRIPTION   VARCHAR2(500),
    ICON          VARCHAR2(10),
    COLOR         VARCHAR2(20),
    SORT_ORDER    NUMBER DEFAULT 0,
    IS_ACTIVE     NUMBER(1) DEFAULT 1
  )`);

  // 2. CUSTOMER_GOALS table
  await run('CREATE CUSTOMER_GOALS', `CREATE TABLE CUSTOMER_GOALS (
    GOAL_ID       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CUSTOMER_ID   VARCHAR2(50)  NOT NULL,
    GOAL_TYPE_ID  VARCHAR2(50)  NOT NULL,
    TARGET_AMOUNT NUMBER(20,2),
    TARGET_YEAR   NUMBER(4),
    PRIORITY      NUMBER(1)     DEFAULT 1,
    NOTES         VARCHAR2(500),
    STATUS        VARCHAR2(20)  DEFAULT 'Active',
    CREATED_BY    VARCHAR2(50),
    CREATED_AT    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
  )`);
  await run('UK_CUSTOMER_GOALS', `ALTER TABLE CUSTOMER_GOALS ADD CONSTRAINT UK_CUST_GOAL UNIQUE (CUSTOMER_ID, GOAL_TYPE_ID)`);
  await run('FK_CG_CUSTOMER',    `ALTER TABLE CUSTOMER_GOALS ADD CONSTRAINT FK_CG_CUST FOREIGN KEY (CUSTOMER_ID) REFERENCES CUSTOMERS(CUSTOMER_ID) ON DELETE CASCADE`);
  await run('FK_CG_GOALTYPE',    `ALTER TABLE CUSTOMER_GOALS ADD CONSTRAINT FK_CG_GTYPE FOREIGN KEY (GOAL_TYPE_ID) REFERENCES GOAL_TYPES(GOAL_TYPE_ID)`);
  await run('IDX_CG_CUST',       `CREATE INDEX IDX_CG_CUST ON CUSTOMER_GOALS (CUSTOMER_ID)`);

  // 3. Seed GOAL_TYPES (MERGE so idempotent)
  const goalTypes = [
    ['DANA_DARURAT',      'Dana Darurat',          'Cadangan dana untuk kondisi darurat 3-6 bulan pengeluaran',     '🛡️', '#00CCFF', 1],
    ['DANA_PENSIUN',      'Dana Pensiun',           'Menyiapkan dana hari tua yang nyaman dan berkelanjutan',        '🏖️', '#FFB830', 2],
    ['DANA_PENDIDIKAN',   'Dana Pendidikan',        'Membiayai pendidikan anak hingga perguruan tinggi',            '🎓', '#0096FF', 3],
    ['PERTUMBUHAN_MODAL', 'Pertumbuhan Modal',      'Mengembangkan kekayaan jangka panjang di atas inflasi',        '📈', '#FF7830', 4],
    ['PENDAPATAN_PASIF',  'Pendapatan Pasif',       'Mendapatkan penghasilan rutin / kupon dari investasi',         '💰', '#00D47E', 5],
    ['PROTEKSI_JIWA',     'Proteksi Jiwa',          'Melindungi keluarga dari risiko finansial tak terduga',        '🛡️', '#FF5050', 6],
    ['BELI_PROPERTI',     'Pembelian Properti',     'Menabung untuk uang muka pembelian rumah atau properti',       '🏠', '#A060FF', 7],
    ['LIKUIDITAS',        'Likuiditas',             'Mempertahankan akses mudah ke dana tunai kapan pun',           '💧', '#9EA8BE', 8],
  ];

  for (const [id, label, desc, icon, color, sort] of goalTypes) {
    try {
      await db.execute(
        `MERGE INTO GOAL_TYPES g USING DUAL ON (g.GOAL_TYPE_ID=:1)
         WHEN MATCHED THEN UPDATE SET LABEL=:2, DESCRIPTION=:3, ICON=:4, COLOR=:5, SORT_ORDER=:6
         WHEN NOT MATCHED THEN INSERT (GOAL_TYPE_ID,LABEL,DESCRIPTION,ICON,COLOR,SORT_ORDER)
           VALUES (:7,:8,:9,:10,:11,:12)`,
        [id, label, desc, icon, color, sort, id, label, desc, icon, color, sort]
      );
      console.log(`[✓] GOAL_TYPES seed: ${id}`);
    } catch(e) { console.error(`[✗] seed ${id}:`, e.message); }
  }

  await db.execute('COMMIT');
  await db.close();
  console.log('[✓] Migration 12 complete');
})();
