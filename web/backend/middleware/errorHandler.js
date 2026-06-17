'use strict';

/**
 * Centralized Express error handler.
 * Must be registered LAST with app.use(errorHandler).
 */
function errorHandler(err, req, res, next) {
  // Already sent (e.g. SSE streams)
  if (res.headersSent) return next(err);

  const status  = err.statusCode || err.status || 500;
  const message = err.message   || 'Internal server error';

  console.error(`[Error] ${req.method} ${req.path} → ${status}: ${message}`);
  if (status === 500) console.error(err.stack);

  // Oracle DB errors
  if (err.errorNum) {
    console.error('[ORA]', err.errorNum, err.message);
    return res.status(500).json({
      error:   'Database error',
      detail:  process.env.NODE_ENV === 'development' ? `ORA-${err.errorNum}: ${message}` : undefined,
    });
  }

  // OCI SDK errors
  if (err.statusCode && err.serviceCode) {
    return res.status(502).json({
      error:  'AI service error',
      detail: process.env.NODE_ENV === 'development' ? `${err.serviceCode}: ${message}` : undefined,
    });
  }

  res.status(status).json({
    error:  message,
    stack:  process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}

/**
 * Wrap an async route handler to forward errors to errorHandler.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
