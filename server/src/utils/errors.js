/**
 * errors.js — Application-specific error classes.
 *
 * All custom errors extend AppError, which carries:
 *   - statusCode: HTTP status to return
 *   - code:       Machine-readable error code (for client error handling)
 *   - message:    Human-readable message (safe to show to users)
 *
 * The centralized errorHandler middleware catches these and maps them
 * to the standard API response envelope. Stack traces are NEVER exposed
 * to clients in production.
 */

export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes known errors from unexpected bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = []) {
    super(400, 'VALIDATION_ERROR', message);
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(409, 'CONFLICT', message);
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxMB) {
    super(413, 'FILE_TOO_LARGE', `File exceeds the maximum allowed size of ${maxMB}MB`);
  }
}

export class UnsupportedFileTypeError extends AppError {
  constructor(allowed = []) {
    super(
      415,
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported file type. Allowed: ${allowed.join(', ')}`
    );
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(429, 'RATE_LIMIT_EXCEEDED', message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(code = 'SERVICE_UNAVAILABLE', message = 'A required service is temporarily unavailable') {
    super(503, code, message);
  }
}
