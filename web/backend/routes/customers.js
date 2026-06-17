'use strict';
const express           = require('express');
const { requireAuth }   = require('../middleware/auth');
const { asyncHandler }  = require('../middleware/errorHandler');
const customerSvc       = require('../services/customerService');
const marketInsightSvc  = require('../services/marketInsightService');
const goalSvc           = require('../services/goalService');
const audit             = require('../services/auditService');

const router = express.Router();

/** GET /api/customers — list all customers for authenticated RM */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const customers = await customerSvc.listByRM(req.user.userId);
  res.json({ customers });
}));

/** GET /api/customers/search?q=... */
router.get('/search', requireAuth, asyncHandler(async (req, res) => {
  const q = req.query.q || '';
  if (q.trim().length < 2) return res.json({ customers: [] });
  const customers = await customerSvc.search(q.trim(), req.user.userId);
  res.json({ customers });
}));

/** GET /api/customers/:id — full 360 profile */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const customer = await customerSvc.getById(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  audit.log(req.user.userId, 'VIEW_CUSTOMER', 'CUSTOMER', req.params.id, null, req.ip).catch(() => {});
  res.json({ customer });
}));

/**
 * GET /api/customers/:id/notes?category=MEETING|PERSONAL&limit=50
 * Retrieve notes for a customer (newest first).
 */
router.get('/:id/notes', requireAuth, asyncHandler(async (req, res) => {
  const { category, limit } = req.query;
  const notes = await customerSvc.getNotes(req.params.id, req.user.userId, {
    category: category || null,
    limit:    Math.min(parseInt(limit || '50', 10), 100),
  });
  res.json({ notes });
}));

/** POST /api/customers/:id/notes — add a meeting note */
router.post('/:id/notes', requireAuth, asyncHandler(async (req, res) => {
  await customerSvc.addMeetingNote(req.params.id, req.user.userId, req.body);
  audit.log(req.user.userId, 'ADD_MEETING_NOTE', 'CUSTOMER', req.params.id, req.body, req.ip).catch(() => {});
  res.json({ message: 'Meeting note added successfully' });
}));

/**
 * POST /api/customers/:id/reembed
 * Re-generates the vector embedding for a customer's profile row.
 * Call this after updating the CUSTOMERS table directly in the DB so that
 * RAG-powered AI responses reflect the latest name / attributes.
 */
router.post('/:id/reembed', requireAuth, asyncHandler(async (req, res) => {
  const result = await customerSvc.reembed(req.params.id);
  audit.log(req.user.userId, 'REEMBED_CUSTOMER', 'CUSTOMER', req.params.id, null, req.ip).catch(() => {});
  res.json({ message: 'Customer embedding regenerated successfully', customerId: result.customerId });
}));

/**
 * GET /api/customers/:id/market-insight
 * Returns latest cached market intelligence insight (≤ 24 h) or auto-generates a fresh one.
 */
router.get('/:id/market-insight', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customer = await customerSvc.getById(id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const result = await marketInsightSvc.getOrGenerate(id, customer, req.user.userId);
  audit.log(req.user.userId, 'VIEW_MARKET_INSIGHT', 'CUSTOMER', id, null, req.ip).catch(() => {});
  res.json(result);
}));

/**
 * POST /api/customers/:id/market-insight/generate
 * Force-generates a fresh market intelligence insight and saves to DB.
 */
router.post('/:id/market-insight/generate', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customer = await customerSvc.getById(id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const result = await marketInsightSvc.getOrGenerate(id, customer, req.user.userId, true);
  audit.log(req.user.userId, 'GENERATE_MARKET_INSIGHT', 'CUSTOMER', id, null, req.ip).catch(() => {});
  res.json(result);
}));

/**
 * GET /api/customers/:id/goals
 * Returns active financial goals for a customer (with type labels/icons).
 */
router.get('/:id/goals', requireAuth, asyncHandler(async (req, res) => {
  const goals = await goalSvc.getCustomerGoals(req.params.id);
  res.json({ goals });
}));

/**
 * POST /api/customers/:id/goals
 * Bulk-replace all active goals for a customer.
 * Body: { goalTypeIds: ['DANA_DARURAT', 'DANA_PENSIUN', ...] }
 */
router.post('/:id/goals', requireAuth, asyncHandler(async (req, res) => {
  const { goalTypeIds } = req.body;
  if (!Array.isArray(goalTypeIds)) {
    return res.status(400).json({ error: 'goalTypeIds must be an array' });
  }
  await goalSvc.setGoals(req.params.id, goalTypeIds, req.user.userId);
  audit.log(req.user.userId, 'SET_CUSTOMER_GOALS', 'CUSTOMER', req.params.id, { goalTypeIds }, req.ip).catch(() => {});
  const goals = await goalSvc.getCustomerGoals(req.params.id);
  res.json({ message: 'Goals updated successfully', goals });
}));

/**
 * DELETE /api/customers/:id/goals/:goalTypeId
 * Deactivate a single goal for a customer.
 */
router.delete('/:id/goals/:goalTypeId', requireAuth, asyncHandler(async (req, res) => {
  await goalSvc.removeGoal(req.params.id, req.params.goalTypeId);
  audit.log(req.user.userId, 'REMOVE_CUSTOMER_GOAL', 'CUSTOMER', req.params.id, { goalTypeId: req.params.goalTypeId }, req.ip).catch(() => {});
  res.json({ message: 'Goal removed' });
}));

module.exports = router;
