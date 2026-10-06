/**
 * authenticate.js — JWT authentication middleware.
 *
 * Verifies the Bearer token in the Authorization header.
 * On success, attaches the decoded payload to req.user:
 *   req.user = { sub: userId, role, iat, exp }
 *
 * SECURITY: JWT_SECRET is read from env config — never hardcoded.
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header missing or malformed'));
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Your session has expired. Please log in again.'));
    }
    return next(new UnauthorizedError('Invalid authentication token'));
  }
}
