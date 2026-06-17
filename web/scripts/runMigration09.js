'use strict';
/**
 * scripts/runMigration09.js
 * Creates COPILOT_SUGGESTED_PROMPTS table and seeds default prompts.
 */
require('dotenv').config();
const oracledb = require('oracledb');
const path     = require('path');

const SEED_PROMPTS = [
  { text: 'Rangkum portofolio dan next best action untuk Budi Santoso',          category: 'customer',  icon: '👤', order: 1 },
  { text: 'Nasabah mana yang depositonya jatuh tempo bulan ini?',                 category: 'portfolio', icon: '📅', order: 2 },
  { text: 'Buatkan pitch upgrade Privilege untuk Sari Wijaya',                    category: 'product',   icon: '⭐', order: 3 },
  { text: 'Apa yang harus saya sampaikan kepada Reza Pratama soal penurunan portofolio?', category: 'customer', icon: '🚨', order: 4 },
  { text: 'Daftar nasabah yang eligible untuk penempatan ORI-027',                category: 'product',   icon: '📋', order: 5 },
  { text: 'Buatkan talking points untuk meeting jam 3 sore ini',                  category: 'general',   icon: '🗓️', order: 6 },
  { text: 'Analisa risiko nasabah dengan eksposur reksa dana saham terbesar',     category: 'portfolio', icon: '📊', order: 7 },
  { text: 'Siapa nasabah prioritas yang belum dihubungi dalam 30 hari terakhir?', category: 'general',   icon: '🔔', order: 8 },
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

  // ── 1. Create table (idempotent) ──────────────────────────────────────
  await conn.execute(`BEGIN
  EXECUTE IMMEDIATE q'[CREATE TABLE COPILOT_SUGGESTED_PROMPTS (
    PROMPT_ID    NUMBER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    PROMPT_TEXT  VARCHAR2(500) NOT NULL,
    CATEGORY     VARCHAR2(50)  DEFAULT 'general'  NOT NULL,
    ICON         VARCHAR2(20)  DEFAULT '💡'       NOT NULL,
    SORT_ORDER   NUMBER        DEFAULT 0           NOT NULL,
    IS_ACTIVE    NUMBER(1)     DEFAULT 1           NOT NULL,
    CREATED_AT   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
  )]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;`);
  console.log('[OK] Table COPILOT_SUGGESTED_PROMPTS ensured');

  // ── 2. Index (idempotent) ─────────────────────────────────────────────
  await conn.execute(`BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX IDX_CSP_ACTIVE_SORT ON COPILOT_SUGGESTED_PROMPTS(IS_ACTIVE, SORT_ORDER)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;`);
  console.log('[OK] Index ensured');

  // ── 3. Seed (skip if already seeded) ─────────────────────────────────
  const cnt = await conn.execute(`SELECT COUNT(*) AS CNT FROM COPILOT_SUGGESTED_PROMPTS`);
  if ((cnt.rows[0].CNT || 0) > 0) {
    console.log('[SKIP] Seed data already present (' + cnt.rows[0].CNT + ' rows)');
  } else {
    for (const p of SEED_PROMPTS) {
      await conn.execute(
        `INSERT INTO COPILOT_SUGGESTED_PROMPTS (PROMPT_TEXT, CATEGORY, ICON, SORT_ORDER)
         VALUES (:1, :2, :3, :4)`,
        [p.text, p.category, p.icon, p.order]
      );
    }
    console.log('[OK] Seeded ' + SEED_PROMPTS.length + ' suggested prompts');
  }

  await conn.close();
  console.log('[DONE] Migration 09 complete');
  process.exit(0);
}

run().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
