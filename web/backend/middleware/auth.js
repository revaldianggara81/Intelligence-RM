'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'danamon-rm-dev-secret-change-in-production';

/**
 * Verify JWT from Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Require a specific role (e.g. 'Branch Manager').
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const hasRole = roles.some(r =>
      req.user.role?.toLowerCase().includes(r.toLowerCase())
    );
    if (!hasRole) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

/**
 * Sign a JWT for a user.
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

module.exports = { requireAuth, requireRole, signToken, JWT_SECRET };
