/**
 * errorHandler.js — Centralized error handling middleware.
 *
 * Must be the LAST middleware registered in app.js.
 * Maps AppError subclasses to appropriate HTTP responses.
 * Hides internal details (stack traces, DB errors) from clients in production.
 */

import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Operational errors: known, expected failures we constructed ourselves
  if (err instanceof AppError) {
    const body = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    // Include validation details (safe to expose — they're user input errors)
    if (err instanceof ValidationError && err.details?.length) {
      body.error.details = err.details;
    }

    // In development, include stack trace for faster debugging
    if (env.NODE_ENV === 'development') {
      body.error.stack = err.stack;
    }

    if (err.statusCode >= 500) {
      logger.error('Operational server error', {
        code: err.code,
        message: err.message,
        path: req.path,
        method: req.method,
        stack: err.stack,
      });
    }

    return res.status(err.statusCode).json(body);
  }

  // Unexpected errors: bugs, unhandled edge cases
  logger.error('Unexpected error', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
      // Never expose stack traces or error details in production
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}
