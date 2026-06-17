'use strict';
/**
 * Migration: EXEC_AUM_MONTHLY — monthly AUM snapshots for trend chart.
 * Run: node run_exec_intelligence_migration.js
 */
require('dotenv').config();
const db = require('./backend/config/database');

async function run() {
  console.log('[Migration] Initializing DB pool...');
  await db.initialize();
  console.log('[Migration] Pool ready.\n');

  // Drop existing
  try {
    await db.execute('DROP TABLE EXEC_AUM_MONTHLY CASCADE CONSTRAINTS');
    console.log('[Migration] EXEC_AUM_MONTHLY dropped.');
  } catch (_) {
    console.log('[Migration] Creating fresh EXEC_AUM_MONTHLY...');
  }

  await db.execute(`
    CREATE TABLE EXEC_AUM_MONTHLY (
      MONTH_ID        NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      PERIOD_KEY      VARCHAR2(7)    NOT NULL,
      MONTH_LABEL     VARCHAR2(10)   NOT NULL,
      TOTAL_AUM       NUMBER         NOT NULL,
      AUM_GROWTH_PCT  NUMBER,
      IS_FORECAST     NUMBER(1)      DEFAULT 0,
      CREATED_AT      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT exec_aum_period_uk UNIQUE (PERIOD_KEY)
    )
  `);
  console.log('[Migration] EXEC_AUM_MONTHLY created.');

  // Seed: 6 months actual + 2 forecast
  const seeds = [
    ['2025-12', 'Des', 15_200_000_000, null, 0],
    ['2026-01', 'Jan', 15_900_000_000, 4.6,  0],
    ['2026-02', 'Feb', 16_400_000_000, 3.1,  0],
    ['2026-03', 'Mar', 17_100_000_000, 4.3,  0],
    ['2026-04', 'Apr', 17_700_000_000, 3.5,  0],
    ['2026-05', 'Mei', 18_100_000_000, 2.3,  0],
    ['2026-06', 'Jun', 18_900_000_000, 4.4,  1],
    ['2026-07', 'Jul', 19_600_000_000, 3.7,  1],
  ];

  let inserted = 0;
  for (const [pk, lbl, aum, growthPct, isForecast] of seeds) {
    try {
      await db.execute(
        `INSERT INTO EXEC_AUM_MONTHLY
           (PERIOD_KEY, MONTH_LABEL, TOTAL_AUM, AUM_GROWTH_PCT, IS_FORECAST)
         VALUES (:1, :2, :3, :4, :5)`,
        [pk, lbl, aum, growthPct ?? null, isForecast]
      );
      inserted++;
      console.log(`  ✓ ${lbl} ${pk}: Rp ${(aum / 1e9).toFixed(1)}B${isForecast ? ' (forecast)' : ''}`);
    } catch (e) {
      console.error(`  ✗ ${pk}: ${e.message}`);
    }
  }

  console.log(`\n[Migration] Done. ${inserted} month rows seeded.`);
  await db.close();
  process.exit(0);
}

run().catch(e => {
  console.error('[Migration] FATAL:', e.message);
  process.exit(1);
});
