/**
 * rateLimiter.js — Per-route rate limiters.
 *
 * All limits are read from the validated env config so they can be
 * adjusted without code changes.
 *
 * Uses express-rate-limit with an in-memory store (suitable for
 * single-server deployment). For multi-server deployments, replace
 * the store with a Redis-backed one.
 */

import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Creates a rate limiter middleware.
 * @param {number} max          - Max requests in window
 * @param {number} windowMin    - Window duration in minutes
 * @param {string} message      - Human-readable error message
 */
function createLimiter(max, windowMin, message) {
  return rateLimit({
    windowMs: windowMin * 60 * 1000,
    max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export const loginLimiter = createLimiter(
  env.RATE_LIMIT_LOGIN_MAX,
  env.RATE_LIMIT_LOGIN_WINDOW_MIN,
  `Too many login attempts. Please wait ${env.RATE_LIMIT_LOGIN_WINDOW_MIN} minutes before trying again.`
);

export const registerLimiter = createLimiter(
  env.RATE_LIMIT_REGISTER_MAX,
  env.RATE_LIMIT_REGISTER_WINDOW_MIN,
  'Too many registration attempts. Please try again later.'
);

export const chatLimiter = createLimiter(
  env.RATE_LIMIT_CHAT_MAX,
  env.RATE_LIMIT_CHAT_WINDOW_MIN,
  `Message rate limit exceeded. You can send ${env.RATE_LIMIT_CHAT_MAX} messages per minute.`
);

export const uploadLimiter = createLimiter(
  env.RATE_LIMIT_UPLOAD_MAX,
  env.RATE_LIMIT_UPLOAD_WINDOW_MIN,
  'Upload rate limit exceeded. Please try again later.'
);

export const adminLimiter = createLimiter(
  200,
  1,
  'Admin API rate limit exceeded.'
);
