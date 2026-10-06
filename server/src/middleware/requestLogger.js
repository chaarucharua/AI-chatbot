/**
 * requestLogger.js — Structured per-request logging middleware.
 *
 * Logs method, path, status, and duration for every request.
 * SECURITY: Does NOT log request bodies (would leak credentials/PII).
 */

import { logger } from '../config/logger.js';

export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
      user_id: req.user?.sub ?? null,
    });
  });

  next();
}
