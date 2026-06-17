'use strict';
const express        = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const notifSvc       = require('../services/notificationService');

const router = express.Router();

/** GET /api/notifications/count — unread badge count */
router.get('/count', requireAuth, asyncHandler(async (req, res) => {
  const count = await notifSvc.getUnreadCount(req.user.userId);
  res.json({ count });
}));

/** GET /api/notifications?limit=25 — list recent notifications */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '25', 10), 50);
  const items = await notifSvc.getNotifications(req.user.userId, limit);
  const count = await notifSvc.getUnreadCount(req.user.userId);
  res.json({ items, unread: count });
}));

/** PATCH /api/notifications/:id/read — mark one notification read */
router.patch('/:id/read', requireAuth, asyncHandler(async (req, res) => {
  await notifSvc.markRead(req.params.id, req.user.userId);
  res.json({ ok: true });
}));

/** PATCH /api/notifications/read-all — mark all read */
router.patch('/read-all', requireAuth, asyncHandler(async (req, res) => {
  await notifSvc.markAllRead(req.user.userId);
  res.json({ ok: true });
}));

/** GET /api/notifications/preferences */
router.get('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const prefs = await notifSvc.getPrefs(req.user.userId);
  res.json({ prefs });
}));

/** PATCH /api/notifications/preferences */
router.patch('/preferences', requireAuth, asyncHandler(async (req, res) => {
  await notifSvc.savePrefs(req.user.userId, req.body);
  const prefs = await notifSvc.getPrefs(req.user.userId);
  res.json({ ok: true, prefs });
}));

/** POST /api/notifications/send-digest — manual email digest trigger */
router.post('/send-digest', requireAuth, asyncHandler(async (req, res) => {
  const result = await notifSvc.sendDigestNow(req.user.userId);
  res.json(result);
}));

module.exports = router;
