'use strict';
const express          = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const goalSvc          = require('../services/goalService');
const audit            = require('../services/auditService');

const router = express.Router();

/** GET /api/goals/types — all active goal type definitions */
router.get('/types', requireAuth, asyncHandler(async (req, res) => {
  const types = await goalSvc.getGoalTypes();
  res.json({ types });
}));

module.exports = router;
