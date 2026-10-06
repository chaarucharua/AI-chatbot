/**
 * requireRole.js — Role-Based Access Control (RBAC) middleware.
 *
 * Usage: requireRole(['ADMIN', 'SUPPORT_AGENT'])
 * Must be used AFTER the authenticate middleware.
 *
 * Role hierarchy: ADMIN > SUPPORT_AGENT > CUSTOMER
 */

import { ForbiddenError } from '../utils/errors.js';

/**
 * Returns Express middleware that restricts the route to users whose
 * role is in the provided allowedRoles array.
 *
 * @param {string[]} allowedRoles - e.g. ['ADMIN', 'SUPPORT_AGENT']
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      // Should not reach here without authenticate() first, but be defensive
      return next(new ForbiddenError());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }

    next();
  };
}
