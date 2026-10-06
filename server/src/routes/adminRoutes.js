/**
 * adminRoutes.js — System administration, metrics, user management, and RAG observability.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { adminLimiter } from '../middleware/rateLimiter.js';
import { writeAuditLog } from '../utils/auditLog.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();
router.use(authenticate, requireRole(['ADMIN']), adminLimiter);

const updateUserSchema = z.object({
  role: z.enum(['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN']).optional(),
  is_active: z.coerce.number().min(0).max(1).optional(),
});

// System Overview & Analytics
router.get('/stats', async (req, res, next) => {
  try {
    const userStats = await db.get(
      `SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'CUSTOMER' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN role = 'SUPPORT_AGENT' THEN 1 ELSE 0 END) as agents,
        SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) as admins
       FROM users`
    );

    const ticketStats = await db.get(
      `SELECT 
        COUNT(*) as total_tickets,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_tickets,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_tickets,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved_tickets,
        SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed_tickets,
        SUM(CASE WHEN priority = 'URGENT' THEN 1 ELSE 0 END) as urgent_tickets
       FROM tickets`
    );

    const convStats = await db.get(
      `SELECT 
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_conversations,
        SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END) as escalated_conversations
       FROM conversations`
    );

    const msgStats = await db.get(
      `SELECT 
        COUNT(*) as total_messages,
        SUM(CASE WHEN sender_type = 'CUSTOMER' THEN 1 ELSE 0 END) as customer_messages,
        SUM(CASE WHEN sender_type = 'BOT' THEN 1 ELSE 0 END) as bot_messages,
        SUM(CASE WHEN sender_type = 'AGENT' THEN 1 ELSE 0 END) as agent_messages
       FROM messages`
    );

    const kbStats = await db.get(
      `SELECT 
        COUNT(*) as total_documents,
        SUM(chunk_count) as total_chunks,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_documents
       FROM knowledge_documents`
    );

    const ragMetrics = await db.get(
      `SELECT 
        COUNT(*) as total_queries,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN support_status = 'SUPPORTED' THEN 1 ELSE 0 END) as supported_queries,
        SUM(CASE WHEN support_status = 'PARTIALLY_SUPPORTED' THEN 1 ELSE 0 END) as partial_queries,
        SUM(CASE WHEN support_status = 'UNSUPPORTED' THEN 1 ELSE 0 END) as unsupported_queries,
        SUM(CASE WHEN escalation_decision = 1 THEN 1 ELSE 0 END) as escalations_offered
       FROM rag_logs`
    );

    res.json({
      success: true,
      data: {
        users: userStats,
        tickets: ticketStats,
        conversations: convStats,
        messages: msgStats,
        knowledgeBase: kbStats,
        ragMetrics: {
          total_queries: ragMetrics.total_queries || 0,
          avg_latency_ms: Math.round(ragMetrics.avg_latency_ms || 0),
          supported_queries: ragMetrics.supported_queries || 0,
          partial_queries: ragMetrics.partial_queries || 0,
          unsupported_queries: ragMetrics.unsupported_queries || 0,
          escalations_offered: ragMetrics.escalations_offered || 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// List all users
router.get('/users', async (req, res, next) => {
  try {
    const users = await db.all(
      `SELECT id, name, email, role, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
});

// Update user role or status
router.patch('/users/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      throw new NotFoundError('User');
    }

    const { role, is_active } = req.body;
    const fields = [];
    const args = [];

    if (role !== undefined) {
      fields.push('role = ?');
      args.push(role);
    }

    if (is_active !== undefined) {
      fields.push('is_active = ?');
      args.push(is_active);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      args.push(req.params.id);
      await db.execute({
        sql: `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        args,
      });

      await writeAuditLog({
        userId: req.user.sub,
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: req.params.id,
        metadata: req.body,
        ipAddress: req.ip,
      });
    }

    const updated = await db.get(
      'SELECT id, name, email, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [req.params.id]
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// Conversations oversight
router.get('/conversations', async (req, res, next) => {
  try {
    const list = await db.all(
      `SELECT c.*, u.name as customer_name, u.email as customer_email,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.updated_at DESC
       LIMIT 100`
    );

    res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
});

// RAG Observability Logs
router.get('/rag-logs', async (req, res, next) => {
  try {
    const logs = await db.all(
      `SELECT * FROM rag_logs ORDER BY created_at DESC LIMIT 100`
    );

    res.json({
      success: true,
      data: logs.map((l) => ({
        ...l,
        retrieved_chunks: l.retrieved_chunks ? JSON.parse(l.retrieved_chunks) : [],
        retrieval_scores: l.retrieval_scores ? JSON.parse(l.retrieval_scores) : [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
