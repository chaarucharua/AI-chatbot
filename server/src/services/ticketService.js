/**
 * ticketService.js — Full ticket lifecycle management, status transitions, and messaging.
 */

import { db } from '../config/database.js';
import { generateId } from '../utils/uuid.js';
import { writeAuditLog } from '../utils/auditLog.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';

export class TicketService {
  /**
   * Creates a ticket manually or via escalation.
   */
  static async createTicket({
    userId,
    subject,
    description,
    priority = 'MEDIUM',
    conversationId = null,
    ipAddress = null,
  }) {
    const countRow = await db.get('SELECT COUNT(*) as count FROM tickets');
    const ticketSeq = (countRow ? countRow.count : 0) + 1;
    const ticketNumber = `TKT-${String(ticketSeq).padStart(4, '0')}`;
    const id = generateId();

    await db.execute({
      sql: `INSERT INTO tickets (id, ticket_number, user_id, conversation_id, subject, description, priority, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now'), datetime('now'))`,
      args: [id, ticketNumber, userId, conversationId, subject, description, priority],
    });

    await writeAuditLog({
      userId,
      action: 'TICKET_CREATED',
      entityType: 'ticket',
      entityId: id,
      metadata: { ticketNumber, priority, subject },
      ipAddress,
    });

    return await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
  }

  /**
   * Fetches tickets for a specific customer.
   */
  static async getUserTickets(userId) {
    return await db.all(
      `SELECT t.*, u.name as agent_name
       FROM tickets t
       LEFT JOIN users u ON t.assigned_agent_id = u.id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC`,
      [userId]
    );
  }

  /**
   * Fetches all tickets with optional filtering (for agents and admins).
   */
  static async getAllTickets({ status, priority, agentId, search } = {}) {
    let sql = `
      SELECT t.*, u.name as customer_name, u.email as customer_email, a.name as agent_name
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN users a ON t.assigned_agent_id = a.id
      WHERE 1=1
    `;
    const args = [];

    if (status && status !== 'ALL') {
      sql += ' AND t.status = ?';
      args.push(status);
    }

    if (priority && priority !== 'ALL') {
      sql += ' AND t.priority = ?';
      args.push(priority);
    }

    if (agentId === 'UNASSIGNED') {
      sql += ' AND t.assigned_agent_id IS NULL';
    } else if (agentId) {
      sql += ' AND t.assigned_agent_id = ?';
      args.push(agentId);
    }

    if (search) {
      sql += ' AND (t.ticket_number LIKE ? OR t.subject LIKE ? OR u.name LIKE ?)';
      const s = `%${search}%`;
      args.push(s, s, s);
    }

    sql += ' ORDER BY CASE t.priority WHEN "URGENT" THEN 1 WHEN "HIGH" THEN 2 WHEN "MEDIUM" THEN 3 ELSE 4 END, t.created_at DESC';

    return await db.all(sql, args);
  }

  /**
   * Gets ticket details including threaded messages and conversation history.
   */
  static async getTicketDetails(ticketId, user) {
    const ticket = await db.get(
      `SELECT t.*, u.name as customer_name, u.email as customer_email, a.name as agent_name
       FROM tickets t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN users a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [ticketId]
    );

    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    // Role guard
    const isStaff = ['SUPPORT_AGENT', 'ADMIN'].includes(user.role);
    if (!isStaff && ticket.user_id !== user.sub) {
      throw new ForbiddenError('You do not have permission to view this ticket');
    }

    // Messages
    let msgSql = `
      SELECT tm.*, u.name as sender_name, u.role as sender_role
      FROM ticket_messages tm
      JOIN users u ON tm.sender_id = u.id
      WHERE tm.ticket_id = ?
    `;
    const msgArgs = [ticketId];

    if (!isStaff) {
      msgSql += ' AND tm.is_internal = 0';
    }

    msgSql += ' ORDER BY tm.created_at ASC';
    const messages = await db.all(msgSql, msgArgs);

    // Optional linked conversation
    let linkedConversation = null;
    if (ticket.conversation_id && isStaff) {
      const convMessages = await db.all(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [ticket.conversation_id]
      );
      linkedConversation = {
        id: ticket.conversation_id,
        messages: convMessages.map((m) => ({
          ...m,
          sources: m.sources ? JSON.parse(m.sources) : [],
        })),
      };
    }

    return {
      ticket,
      messages,
      linkedConversation,
    };
  }

  /**
   * Updates ticket status, priority, or assigned agent.
   */
  static async updateTicket({ ticketId, updates, user, ipAddress = null }) {
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    const { status, priority, assigned_agent_id } = updates;
    const fields = [];
    const args = [];

    if (status && status !== ticket.status) {
      fields.push('status = ?');
      args.push(status);
    }

    if (priority && priority !== ticket.priority) {
      fields.push('priority = ?');
      args.push(priority);
    }

    if (assigned_agent_id !== undefined && assigned_agent_id !== ticket.assigned_agent_id) {
      fields.push('assigned_agent_id = ?');
      args.push(assigned_agent_id || null);
    }

    if (fields.length === 0) {
      return ticket;
    }

    fields.push("updated_at = datetime('now')");
    args.push(ticketId);

    await db.execute({
      sql: `UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`,
      args,
    });

    await writeAuditLog({
      userId: user.sub,
      action: 'TICKET_UPDATED',
      entityType: 'ticket',
      entityId: ticketId,
      metadata: updates,
      ipAddress,
    });

    return await db.get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  }

  /**
   * Adds a message or internal note to a ticket.
   */
  static async addMessage({ ticketId, user, content, isInternal = false, ipAddress = null }) {
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    const isStaff = ['SUPPORT_AGENT', 'ADMIN'].includes(user.role);
    if (!isStaff && ticket.user_id !== user.sub) {
      throw new ForbiddenError('You do not have access to reply to this ticket');
    }

    // Customers cannot create internal notes
    const internal = isStaff && Boolean(isInternal) ? 1 : 0;
    const senderType = isStaff ? 'AGENT' : 'CUSTOMER';
    const messageId = generateId();

    await db.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_type, content, is_internal, created_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [messageId, ticketId, user.sub, senderType, content, internal],
      });

      // If agent is replying to customer, update status if waiting
      if (isStaff && !internal && ticket.status === 'OPEN') {
        await tx.execute({
          sql: "UPDATE tickets SET status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?",
          args: [ticketId],
        });
      } else if (!isStaff && ticket.status === 'WAITING_FOR_CUSTOMER') {
        await tx.execute({
          sql: "UPDATE tickets SET status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?",
          args: [ticketId],
        });
      } else {
        await tx.execute({
          sql: "UPDATE tickets SET updated_at = datetime('now') WHERE id = ?",
          args: [ticketId],
        });
      }

      // If linked conversation and public agent reply, mirror into conversation as AGENT message
      if (isStaff && !internal && ticket.conversation_id) {
        await tx.execute({
          sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, support_status, created_at)
                VALUES (?, ?, 'AGENT', ?, ?, 'N/A', datetime('now'))`,
          args: [generateId(), ticket.conversation_id, user.sub, content],
        });
      }
    });

    await writeAuditLog({
      userId: user.sub,
      action: internal ? 'INTERNAL_NOTE_ADDED' : 'TICKET_REPLY_SENT',
      entityType: 'ticket',
      entityId: ticketId,
      metadata: { isInternal: Boolean(internal) },
      ipAddress,
    });

    return await db.get(
      `SELECT tm.*, u.name as sender_name, u.role as sender_role
       FROM ticket_messages tm
       JOIN users u ON tm.sender_id = u.id
       WHERE tm.id = ?`,
      [messageId]
    );
  }
}
