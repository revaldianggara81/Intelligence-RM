'use strict';
require('dotenv').config();
const oracledb = require('oracledb');
const path     = require('path');

async function run() {
  const walletDir = path.resolve(process.env.DB_WALLET_DIR || './wallet');
  oracledb.autoCommit = true;
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
  const sql = `BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE MEETING_NOTES ADD (NOTE_CATEGORY VARCHAR2(20) DEFAULT ''MEETING'' NOT NULL)';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -01430 THEN RAISE; END IF;
END;`;
  await conn.execute(sql);
  console.log('[OK] Migration 07: NOTE_CATEGORY column ensured on MEETING_NOTES');
  await conn.close();
  process.exit(0);
}
run().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
