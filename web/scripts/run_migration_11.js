'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  // 1. Add GOAL_TAG column (ORA-01430 = column already exists)
  try {
    await db.execute(`ALTER TABLE PRODUCT_CATALOG ADD (GOAL_TAG VARCHAR2(300))`);
    console.log('[✓] Added GOAL_TAG column');
  } catch(e) {
    if (String(e.message).includes('ORA-01430') || String(e.message).includes('01430')) {
      console.log('[~] GOAL_TAG already exists');
    } else { console.error('[✗] GOAL_TAG:', e.message); }
  }

  // 2. Add RETURN_TYPE column
  try {
    await db.execute(`ALTER TABLE PRODUCT_CATALOG ADD (RETURN_TYPE VARCHAR2(20))`);
    console.log('[✓] Added RETURN_TYPE column');
  } catch(e) {
    if (String(e.message).includes('ORA-01430') || String(e.message).includes('01430')) {
      console.log('[~] RETURN_TYPE already exists');
    } else { console.error('[✗] RETURN_TYPE:', e.message); }
  }

  // 3. Populate GOAL_TAG + RETURN_TYPE
  const updates = [
    ['PROD001', 'Dana Darurat|Likuiditas',          'fixed'],
    ['PROD002', 'Dana Darurat|Pendapatan Tetap',    'fixed'],
    ['PROD003', 'Dana Pensiun|Pertumbuhan Stabil',  'target'],
    ['PROD004', 'Pertumbuhan Modal|Jangka Panjang', 'variable'],
    ['PROD005', 'Pendapatan Tetap|Dana Pensiun',    'fixed'],
    ['PROD006', 'Proteksi Jiwa|Dana Pendidikan',    'target'],
    ['PROD007', 'Dana Darurat|Likuiditas Harian',   'fixed'],
    ['PROD008', 'Dana Darurat|Jangka Pendek',       'fixed'],
  ];

  for (const [pid, goal, rtype] of updates) {
    try {
      const r = await db.execute(
        `UPDATE PRODUCT_CATALOG SET GOAL_TAG=:1, RETURN_TYPE=:2 WHERE PRODUCT_ID=:3`,
        [goal, rtype, pid]
      );
      console.log(`[✓] Updated ${pid} (${r.rowsAffected} row)`);
    } catch(e) {
      console.error(`[✗] ${pid}:`, e.message);
    }
  }

  // 4. Commit
  try {
    await db.execute('COMMIT');
    console.log('[✓] Committed');
  } catch(e) { console.error('[✗] COMMIT:', e.message); }

  await db.close();
  console.log('[✓] Migration 11 complete');
})();
