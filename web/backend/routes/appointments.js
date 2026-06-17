'use strict';
const express      = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const svc          = require('../services/appointmentService');
const audit        = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/appointments
 * Query: ?year=2026&month=5  (defaults to current month)
 * Returns all appointments for the authenticated RM in the given month.
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const year  = req.query.year  ? parseInt(req.query.year,  10) : undefined;
  const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
  const appointments = await svc.list(req.user.userId, { year, month });
  res.json({ appointments });
}));

/**
 * GET /api/appointments/upcoming?limit=5
 * Returns the next N scheduled appointments from now.
 */
router.get('/upcoming', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '8', 10), 20);
  const appointments = await svc.getUpcoming(req.user.userId, limit);
  res.json({ appointments });
}));

/**
 * GET /api/appointments/:id
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const appt = await svc.getById(req.params.id, req.user.userId);
  if (!appt) return res.status(404).json({ error: 'Appointment tidak ditemukan' });
  res.json({ appointment: appt });
}));

/**
 * POST /api/appointments
 * Body: { customerId?, customerName?, title, meetingType, notes?, appointmentDate, durationMin? }
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, customerName, title, meetingType, notes, appointmentDate, durationMin } = req.body;
  if (!title || !meetingType || !appointmentDate) {
    return res.status(400).json({ error: 'title, meetingType, dan appointmentDate wajib diisi' });
  }
  const id = await svc.create(req.user.userId, req.body);
  audit.log(req.user.userId, 'CREATE_APPOINTMENT', 'CUSTOMER', customerId || null,
    { title, meetingType }, req.ip).catch(() => {});
  res.status(201).json({ ok: true, appointmentId: id });
}));

/**
 * PUT /api/appointments/:id
 * Body: any editable fields
 */
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const appt = await svc.getById(req.params.id, req.user.userId);
  if (!appt) return res.status(404).json({ error: 'Appointment tidak ditemukan' });

  await svc.update(req.params.id, req.user.userId, req.body);
  audit.log(req.user.userId, 'UPDATE_APPOINTMENT', 'CUSTOMER', appt.CUSTOMER_ID || null,
    { id: req.params.id }, req.ip).catch(() => {});
  res.json({ ok: true });
}));

/**
 * PATCH /api/appointments/:id/status
 * Body: { status: 'scheduled'|'completed'|'cancelled' }
 */
router.patch('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status wajib diisi' });
  const appt = await svc.getById(req.params.id, req.user.userId);
  if (!appt) return res.status(404).json({ error: 'Appointment tidak ditemukan' });

  await svc.updateStatus(req.params.id, req.user.userId, status);
  res.json({ ok: true });
}));

/**
 * DELETE /api/appointments/:id
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const appt = await svc.getById(req.params.id, req.user.userId);
  if (!appt) return res.status(404).json({ error: 'Appointment tidak ditemukan' });

  await svc.remove(req.params.id, req.user.userId);
  audit.log(req.user.userId, 'DELETE_APPOINTMENT', 'CUSTOMER', appt.CUSTOMER_ID || null,
    { id: req.params.id }, req.ip).catch(() => {});
  res.json({ ok: true });
}));

module.exports = router;
