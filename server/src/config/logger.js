/**
 * logger.js — Structured JSON logging via Winston.
 *
 * Log levels (most → least verbose): debug > info > warn > error
 *
 * SECURITY: Never log passwords, JWT tokens, or sensitive customer PII.
 * The logger is configured here; import it everywhere instead of using console.log.
 */

import winston from 'winston';
import { env } from './env.js';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

/**
 * Development format: coloured, human-readable single lines.
 */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  simple()
);

/**
 * Production format: structured JSON, one object per line.
 * Suitable for log aggregation (CloudWatch, Loki, Datadog, etc.).
 */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const transports = [
  new winston.transports.Console({
    format: env.NODE_ENV === 'development' ? devFormat : prodFormat,
  }),
];

// Optionally write logs to a file (useful for debugging in production)
if (env.LOG_TO_FILE) {
  transports.push(
    new winston.transports.File({
      filename: env.LOG_FILE_PATH,
      format: prodFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    })
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports,
  // Prevent Winston from exiting on uncaught exceptions in tests
  exitOnError: false,
});

// Convenience: catch and log truly unexpected errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
  });
});
