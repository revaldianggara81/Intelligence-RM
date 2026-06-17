'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql, params = [], opts = {}) => {
    try {
      await db.execute(sql, params, { autoCommit: true, ...opts });
      console.log('[✓]', label);
    } catch (e) {
      if (/ORA-00955|ORA-01430|ORA-02261|ORA-00001/.test(e.message))
        console.log('[~]', label, '(already exists / duplicate)');
      else console.error('[✗]', label, e.message);
    }
  };

  const upsertSetting = async (key, value, desc) => {
    try {
      await db.execute(
        `MERGE INTO SYSTEM_SETTINGS dst USING DUAL ON (dst.SETTING_KEY = :1)
         WHEN MATCHED     THEN UPDATE SET SETTING_VALUE=:2, DESCRIPTION=:3, UPDATED_AT=CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN INSERT (SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES (:4,:5,:6)`,
        [key, value, desc, key, value, desc],
        { autoCommit: true }
      );
      console.log('[✓] SYSTEM_SETTINGS upsert:', key);
    } catch (e) { console.error('[✗] SYSTEM_SETTINGS upsert:', key, e.message); }
  };

  // ── 1. SYSTEM_SETTINGS — Product Management Approval Thresholds ────────────
  await upsertSetting(
    'PM_ADD_APPROVAL_THRESHOLD', '500000000',
    'Minimum transaction amount (Rp) that requires manager approval for ADD product requests'
  );
  await upsertSetting(
    'PM_REMOVE_APPROVAL_THRESHOLD', '200000000',
    'Minimum transaction amount (Rp) that requires manager approval for REMOVE product requests'
  );

  // ── 2. ALERT_TYPE_CATALOGUE — Dynamic alert type registry ─────────────────
  await run('CREATE ALERT_TYPE_CATALOGUE',
    `CREATE TABLE ALERT_TYPE_CATALOGUE (
      ALERT_TYPE   VARCHAR2(50)  NOT NULL,
      LABEL        VARCHAR2(100) NOT NULL,
      ICON         VARCHAR2(20)  NOT NULL,
      DESCRIPTION  VARCHAR2(300),
      IS_ACTIVE    NUMBER(1)     DEFAULT 1 NOT NULL,
      SORT_ORDER   NUMBER        DEFAULT 0,
      CREATED_AT   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT PK_ALERT_TYPE_CAT PRIMARY KEY (ALERT_TYPE)
    )`);

  // Seed alert types
  const alertTypes = [
    ['maturity',           'Deposito Jatuh Tempo',     '⏰', 'Alert ketika deposito nasabah mendekati tanggal jatuh tempo', 1, 1],
    ['portfolio_loss',     'Kerugian Portofolio',       '📉', 'Alert ketika produk mengalami kerugian melebihi threshold', 1, 2],
    ['idle_money',         'Dana Idle',                 '💤', 'Alert ketika lebih dari 40% AUM nasabah tidak diinvestasikan', 1, 3],
    ['concentration_risk', 'Risiko Konsentrasi',        '⚠️', 'Alert ketika satu kategori mendominasi lebih dari 50% portofolio', 1, 4],
    ['upgrade_opportunity','Peluang Upgrade Tier',      '🚀', 'Alert ketika AUM nasabah memenuhi syarat tier lebih tinggi', 1, 5],
    ['underperform',       'Underperform vs Benchmark', '📊', 'Alert ketika return produk di bawah benchmark/peer secara signifikan', 1, 6],
    ['market_event',       'Event Pasar (IHSG/USD)',    '🌐', 'Alert berbasis event pasar seperti penurunan IHSG atau pelemahan Rupiah', 1, 7],
  ];

  for (const [type, label, icon, desc, active, order] of alertTypes) {
    try {
      await db.execute(
        `MERGE INTO ALERT_TYPE_CATALOGUE dst USING DUAL ON (dst.ALERT_TYPE = :1)
         WHEN MATCHED     THEN UPDATE SET LABEL=:2, ICON=:3, DESCRIPTION=:4, IS_ACTIVE=:5, SORT_ORDER=:6
         WHEN NOT MATCHED THEN INSERT (ALERT_TYPE, LABEL, ICON, DESCRIPTION, IS_ACTIVE, SORT_ORDER)
                               VALUES (:7, :8, :9, :10, :11, :12)`,
        [type, label, icon, desc, active, order, type, label, icon, desc, active, order],
        { autoCommit: true }
      );
      console.log(`[✓] ALERT_TYPE_CATALOGUE: ${type}`);
    } catch (e) { console.error(`[✗] ALERT_TYPE_CATALOGUE: ${type}`, e.message); }
  }

  await db.close();
  console.log('[✓] Migration 22 complete — SYSTEM_SETTINGS + ALERT_TYPE_CATALOGUE ready');
})();
