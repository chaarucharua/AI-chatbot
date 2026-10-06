/**
 * auditLog.js — Centralized audit logging to the audit_logs table.
 *
 * Called from services when significant events occur.
 * SECURITY: Never log passwords, JWTs, or raw sensitive data in metadata.
 */

import { db } from '../config/database.js';
import { generateId } from './uuid.js';
import { logger } from '../config/logger.js';

/**
 * Write an audit log entry.
 *
 * @param {object} params
 * @param {string|null} params.userId     - Actor's user ID (null for anonymous)
 * @param {string}      params.action     - Event name e.g. 'USER_LOGIN'
 * @param {string|null} params.entityType - Entity type e.g. 'ticket'
 * @param {string|null} params.entityId   - Entity's UUID
 * @param {object}      params.metadata   - Safe contextual info (no secrets)
 * @param {string|null} params.ipAddress  - Requester IP
 */
export async function writeAuditLog({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = {},
  ipAddress = null,
}) {
  try {
    await db.execute({
      sql: `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        generateId(),
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(metadata),
        ipAddress,
      ],
    });
  } catch (err) {
    // Audit log failure should NEVER crash the application
    logger.error('Failed to write audit log', { action, error: err.message });
  }
}
