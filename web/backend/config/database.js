'use strict';
require('dotenv').config();
const oracledb = require('oracledb');
const path = require('path');

let pool = null;

async function initialize() {
  if (pool) return pool;

  const walletDir = path.resolve(process.env.DB_WALLET_DIR || './wallet');

  // Thin mode — no Oracle Client installation needed.
  // Do NOT call oracledb.initOracleClient() here; calling it without
  // a valid libDir switches to Thick mode and may fail on machines that
  // don't have Oracle Instant Client installed.

  oracledb.autoCommit = true;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];

  pool = await oracledb.createPool({
    user:             process.env.DB_USER        || 'ADMIN',
    password:         process.env.DB_PASSWORD,
    connectString:    process.env.DB_CONNECT_STRING,
    configDir:        walletDir,
    walletLocation:   walletDir,
    walletPassword:   process.env.DB_WALLET_PASSWORD || undefined,
    poolMin:          parseInt(process.env.DB_POOL_MIN)       || 2,
    poolMax:          parseInt(process.env.DB_POOL_MAX)       || 10,
    poolIncrement:    parseInt(process.env.DB_POOL_INCREMENT) || 1,
    queueTimeout:     120000,   // 2 min — prevents NJS-040 on ADB cold start
    poolPingInterval: 60,       // keep-alive: ping idle connections every 60 s
    poolAlias: 'default',
  });

  console.log('[DB] Oracle Autonomous Database 26ai pool initialized');
  return pool;
}

async function close() {
  if (pool) {
    await pool.close(10);
    pool = null;
    console.log('[DB] Pool closed');
  }
}

async function execute(sql, binds = [], opts = {}) {
  if (!pool) {
    console.warn('[DB] Pool not ready — auto-reinitializing...');
    await initialize();
  }
  const conn = await oracledb.getConnection('default');
  try {
    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...opts,
    });
    return result;
  } finally {
    await conn.close();
  }
}

async function executeMany(sql, binds = [], opts = {}) {
  if (!pool) await initialize();
  const conn = await oracledb.getConnection('default');
  try {
    const result = await conn.executeMany(sql, binds, opts);
    return result;
  } finally {
    await conn.close();
  }
}

/** Run a function inside an explicit transaction */
async function transaction(fn) {
  if (!pool) await initialize();
  const conn = await oracledb.getConnection('default');
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

module.exports = { initialize, close, execute, executeMany, transaction };
