'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../config/database');
const { signToken, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const audit    = require('../services/auditService');
const alertSvc = require('../services/alertService');

const router = express.Router();

/** POST /api/auth/login */
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const result = await db.execute(
    `SELECT USER_ID, USERNAME, PASSWORD_HASH, FULL_NAME, ROLE, INITIALS, EMAIL, BRANCH, IS_ACTIVE
       FROM RM_USERS WHERE USERNAME = :1`,
    [username.toLowerCase().trim()]
  );

  const user = result.rows?.[0];
  if (!user || !user.IS_ACTIVE) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.PASSWORD_HASH);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Update last login
  await db.execute(
    `UPDATE RM_USERS SET LAST_LOGIN = CURRENT_TIMESTAMP WHERE USER_ID = :1`,
    [user.USER_ID]
  );

  const token = signToken({
    userId:   user.USER_ID,
    username: user.USERNAME,
    fullName: user.FULL_NAME,
    role:     user.ROLE,
    initials: user.INITIALS,
    branch:   user.BRANCH,
  });

  audit.log(user.USER_ID, 'LOGIN', 'RM_USER', user.USER_ID, null, req.ip).catch(() => {});

  // Non-blocking: refresh alert detection in background so dashboard shows fresh alerts on login
  alertSvc.detectAlerts(user.USER_ID).catch(e => console.warn('[Login] detectAlerts:', e.message));

  res.json({
    token,
    user: {
      userId:   user.USER_ID,
      username: user.USERNAME,
      fullName: user.FULL_NAME,
      role:     user.ROLE,
      initials: user.INITIALS,
      email:    user.EMAIL,
      branch:   user.BRANCH,
    },
  });
}));

/** POST /api/auth/logout */
router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  audit.log(req.user.userId, 'LOGOUT', 'RM_USER', req.user.userId, null, req.ip).catch(() => {});
  res.json({ message: 'Logged out successfully' });
}));

/** GET /api/auth/me */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.execute(
    `SELECT USER_ID, USERNAME, FULL_NAME, ROLE, INITIALS, EMAIL, BRANCH, LAST_LOGIN
       FROM RM_USERS WHERE USER_ID = :1`,
    [req.user.userId]
  );
  const user = result.rows?.[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}));

module.exports = router;
