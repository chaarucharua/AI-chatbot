/**
 * authService.js — User authentication, registration, and token issuance.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { generateId } from '../utils/uuid.js';
import { writeAuditLog } from '../utils/auditLog.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors.js';

const SALT_ROUNDS = 12;

export class AuthService {
  /**
   * Registers a new user with CUSTOMER role by default.
   */
  static async register({ name, email, password, ipAddress = null }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await db.get(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = generateId();

    await db.execute({
      sql: `INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'CUSTOMER', 1, datetime('now'), datetime('now'))`,
      args: [userId, name.trim(), normalizedEmail, passwordHash],
    });

    await writeAuditLog({
      userId,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: userId,
      metadata: { email: normalizedEmail, role: 'CUSTOMER' },
      ipAddress,
    });

    return {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role: 'CUSTOMER',
    };
  }

  /**
   * Authenticates user credentials and issues a signed JWT.
   */
  static async login({ email, password, ipAddress = null }) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.get(
      'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (!user || !user.is_active) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });

    await writeAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ipAddress,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Fetches user profile by ID.
   */
  static async getCurrentUser(userId) {
    const user = await db.get(
      'SELECT id, name, email, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      throw new NotFoundError('User');
    }

    return user;
  }
}
