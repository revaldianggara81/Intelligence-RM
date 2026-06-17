'use strict';
const express       = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const db            = require('../config/database');
const audit         = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/performance
 * All product performance vs benchmark rows.
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const r = await db.execute(`
    SELECT PERF_ID, PRODUCT_ID, PRODUCT_NAME, CATEGORY, BENCHMARK_NAME,
           RETURN_1M, RETURN_3M, RETURN_6M, RETURN_1Y,
           BENCH_RETURN_1M, BENCH_RETURN_3M, BENCH_RETURN_6M, BENCH_RETURN_1Y,
           RETURN_1M  - BENCH_RETURN_1M AS GAP_1M,
           RETURN_3M  - BENCH_RETURN_3M AS GAP_3M,
           RETURN_6M  - BENCH_RETURN_6M AS GAP_6M,
           RETURN_1Y  - BENCH_RETURN_1Y AS GAP_1Y,
           UPDATED_BY,
           TO_CHAR(UPDATED_AT,'DD Mon YYYY HH24:MI') AS UPDATED_FMT
      FROM PRODUCT_PERFORMANCE
     ORDER BY CATEGORY, PRODUCT_ID
  `);
  res.json({ performance: r.rows || [] });
}));

/**
 * PUT /api/performance/:productId
 * Update return + benchmark values for a product.
 * Body: { return_1m, return_3m, return_6m, return_1y,
 *         bench_return_1m, bench_return_3m, bench_return_6m, bench_return_1y,
 *         benchmark_name }
 */
router.put('/:productId', requireAuth, asyncHandler(async (req, res) => {
  const pid = req.params.productId.toUpperCase();
  const allowed = [
    'return_1m','return_3m','return_6m','return_1y',
    'bench_return_1m','bench_return_3m','bench_return_6m','bench_return_1y',
    'benchmark_name',
  ];
  const sets = [];
  const vals = [];
  let   idx  = 1;
  for (const k of allowed) {
    if (req.body[k] !== undefined && req.body[k] !== null && req.body[k] !== '') {
      sets.push(`${k.toUpperCase()} = :${idx++}`);
      vals.push(k === 'benchmark_name' ? String(req.body[k]) : Number(req.body[k]));
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

  sets.push(`UPDATED_BY = :${idx++}`, `UPDATED_AT = CURRENT_TIMESTAMP`);
  vals.push(req.user.userId, pid);

  const upd = await db.execute(
    `UPDATE PRODUCT_PERFORMANCE SET ${sets.join(', ')} WHERE PRODUCT_ID = :${idx}`,
    vals,
    { autoCommit: true }
  );

  if ((upd.rowsAffected || 0) === 0)
    return res.status(404).json({ error: 'Product not found in PRODUCT_PERFORMANCE' });

  audit.log(req.user.userId, 'UPDATE_PRODUCT_PERFORMANCE', 'PRODUCT_PERFORMANCE',
            pid, req.body, req.ip).catch(() => {});

  // Return updated row
  const row = await db.execute(
    `SELECT PRODUCT_ID, PRODUCT_NAME, RETURN_3M, BENCH_RETURN_3M,
            (RETURN_3M - BENCH_RETURN_3M) AS GAP_3M
       FROM PRODUCT_PERFORMANCE WHERE PRODUCT_ID = :1`, [pid]
  );
  res.json({ ok: true, productId: pid, data: row.rows?.[0] });
}));

/**
 * POST /api/performance/detect
 * Call PROC_PUSH_UNDERPERFORM_ALERTS (global run for all customers).
 */
router.post('/detect', requireAuth, asyncHandler(async (req, res) => {
  await db.execute('BEGIN PROC_PUSH_UNDERPERFORM_ALERTS; END;');
  audit.log(req.user.userId, 'RUN_UNDERPERFORM_DETECT', 'PRODUCT_PERFORMANCE',
            null, {}, req.ip).catch(() => {});
  res.json({ ok: true, message: 'PROC_PUSH_UNDERPERFORM_ALERTS executed' });
}));

module.exports = router;
