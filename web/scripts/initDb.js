'use strict';
/**
 * scripts/initDb.js
 * Run schema.sql against Oracle Autonomous DB 26ai.
 *
 * Fix: uses ONE connection for the entire script (avoids NJS-040 pool exhaustion)
 * and creates the pool with poolMin/Max=1 since only one concurrent connection
 * is needed for a sequential DDL run.
 *
 * Usage: node scripts/initDb.js
 */
require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const oracledb = require('oracledb');

const SCHEMA_FILE = path.join(__dirname, '../backend/db/schema.sql');

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Intelligence RM Platform — DB Init          ║');
  console.log('╚══════════════════════════════════════════════╝');

  // ── 1. Configure oracledb ──────────────────────────────────────────
  oracledb.autoCommit  = true;
  oracledb.outFormat   = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];

  const walletDir = path.resolve(process.env.DB_WALLET_DIR || './wallet');

  // ── 2. Create a minimal pool (1 connection only) ───────────────────
  await oracledb.createPool({
    user:           process.env.DB_USER     || 'ADMIN',
    password:       process.env.DB_PASSWORD,
    connectString:  process.env.DB_CONNECT_STRING,
    configDir:      walletDir,
    walletLocation: walletDir,
    walletPassword: process.env.DB_WALLET_PASSWORD || undefined,
    poolMin:        1,
    poolMax:        1,      // only 1 needed — prevents queue exhaustion
    poolIncrement:  0,
    queueTimeout:   120000, // 2 minutes per statement
    poolAlias:      'initPool',
  });
  console.log('[DB] Pool initialized (1 connection)\n');

  // ── 3. Get ONE connection for the entire script ────────────────────
  const conn = await oracledb.getConnection('initPool');

  // ── 4. Parse and filter statements ────────────────────────────────
  const rawSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

  // Strip full-line comments, then split on ";" at end of meaningful lines.
  // Keep VECTOR INDEX statements intact (they span multiple lines).
  const statements = rawSql
    .split(';')
    .map(s => {
      // Remove leading lines that are pure comments
      return s
        .split('\n')
        .filter(line => {
          const t = line.trim();
          return t.length > 0 && !t.startsWith('--');
        })
        .join('\n')
        .trim();
    })
    .filter(s => s.length > 0);

  let created = 0;
  let skipped = 0;
  let errors  = 0;

  // ── 5. Execute each statement on the single connection ────────────
  for (const stmt of statements) {
    const firstLine = stmt.split('\n').find(l => l.trim().length > 0) || stmt;
    const preview   = firstLine.trim().substring(0, 80);

    try {
      await conn.execute(stmt);
      console.log(`  ✓  ${preview}`);
      created++;
    } catch (err) {
      const oraNum = err.errorNum;

      if (oraNum === 955) {
        // ORA-00955: name already used by existing object — safe to skip
        console.log(`  ⊘  SKIP (exists): ${preview.substring(0, 60)}`);
        skipped++;
      } else if (oraNum === 942) {
        // ORA-00942: table/view does not exist — skip silently
        skipped++;
      } else if (!oraNum && err.message && err.message.includes('NJS-')) {
        // Driver-level error — fatal, stop here
        console.error(`\n  ✗  DRIVER ERROR on: ${preview}`);
        console.error(`     ${err.message}`);
        console.error('\n  ⚠  This is usually a connection or pool issue, not a schema issue.');
        errors++;
        break; // stop processing — connection is unreliable
      } else {
        console.error(`  ✗  ERROR on: ${preview}`);
        console.error(`     ORA-${oraNum || '?'}: ${err.message}`);
        errors++;
        // Continue to next statement for non-fatal Oracle errors
      }
    }
  }

  // ── 6. Cleanup ────────────────────────────────────────────────────
  await conn.close();
  try { await oracledb.getPool('initPool').close(5); } catch (_) {}

  console.log('\n──────────────────────────────────────────────');
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${skipped} (already exist)`);
  console.log(`  Errors  : ${errors}`);
  console.log('──────────────────────────────────────────────');

  if (errors > 0) {
    console.warn('\n⚠  Some statements failed — see errors above.');
    process.exit(1);
  }

  console.log('\n✅  Schema initialized successfully.');
  console.log('   Next step:  npm run seed-db\n');
}

main().catch(err => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});
