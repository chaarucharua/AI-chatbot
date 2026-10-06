/**
 * chatService.js — Conversation lifecycle, message storage, RAG triggering, and escalation.
 */

import { db } from '../config/database.js';
import { generateId } from '../utils/uuid.js';
import { RAGService } from './rag/ragService.js';
import { writeAuditLog } from '../utils/auditLog.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { env } from '../config/env.js';

export class ChatService {
  /**
   * Creates a new conversation for a customer.
   */
  static async createConversation(userId, title = null) {
    const id = generateId();
    await db.execute({
      sql: `INSERT INTO conversations (id, user_id, status, title, created_at, updated_at)
            VALUES (?, ?, 'ACTIVE', ?, datetime('now'), datetime('now'))`,
      args: [id, userId, title],
    });

    return await db.get('SELECT * FROM conversations WHERE id = ?', [id]);
  }

  /**
   * Lists all conversations for a user.
   */
  static async getUserConversations(userId) {
    return await db.all(
      `SELECT c.*, 
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`,
      [userId]
    );
  }

  /**
   * Fetches a conversation with its messages, enforcing access control.
   */
  static async getConversation(conversationId, user) {
    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
    if (!conv) {
      throw new NotFoundError('Conversation');
    }

    // Role check: only owner, agent, or admin can read
    if (conv.user_id !== user.sub && !['SUPPORT_AGENT', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenError('You do not have access to this conversation');
    }

    const messages = await db.all(
      `SELECT id, conversation_id, sender_type, sender_id, content, support_status, sources, query_category, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversationId]
    );

    // Format parsed sources for client
    const formattedMessages = messages.map((m) => ({
      ...m,
      sources: m.sources ? JSON.parse(m.sources) : [],
    }));

    return {
      conversation: conv,
      messages: formattedMessages,
    };
  }

  /**
   * Sends a user message, executes RAG, and persists bot response.
   */
  static async sendMessage({ conversationId, user, content, ipAddress = null }) {
    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
    if (!conv) {
      throw new NotFoundError('Conversation');
    }

    if (conv.user_id !== user.sub && !['SUPPORT_AGENT', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenError('You do not have access to this conversation');
    }

    if (conv.status === 'CLOSED') {
      throw new ValidationError('This conversation has been closed and cannot accept new messages');
    }

    // 1. Insert customer message
    const userMsgId = generateId();
    await db.execute({
      sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, created_at)
            VALUES (?, ?, 'CUSTOMER', ?, ?, datetime('now'))`,
      args: [userMsgId, conversationId, user.sub, content],
    });

    // Update conversation title if first message
    if (!conv.title) {
      const generatedTitle = content.slice(0, 40) + (content.length > 40 ? '...' : '');
      await db.execute({
        sql: `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [generatedTitle, conversationId],
      });
    }

    // 2. Fetch context window turns
    const historyRows = await db.all(
      `SELECT sender_type, content
       FROM messages
       WHERE conversation_id = ? AND id != ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [conversationId, userMsgId, env.CONVERSATION_CONTEXT_TURNS]
    );
    const history = historyRows.reverse();

    // 3. Execute RAG
    const ragResult = await RAGService.processQuery({
      query: content,
      conversationId,
      messageId: userMsgId,
      history,
    });

    // 4. Insert Bot message
    const botMsgId = generateId();
    await db.execute({
      sql: `INSERT INTO messages
            (id, conversation_id, sender_type, sender_id, content, support_status, confidence_data, sources, query_category, created_at)
            VALUES (?, ?, 'BOT', NULL, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        botMsgId,
        conversationId,
        ragResult.answer,
        ragResult.support_status,
        JSON.stringify(ragResult.confidence_data),
        JSON.stringify(ragResult.sources),
        ragResult.category,
      ],
    });

    // Update conversation timestamp
    await db.execute({
      sql: `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
      args: [conversationId],
    });

    return {
      userMessage: {
        id: userMsgId,
        conversation_id: conversationId,
        sender_type: 'CUSTOMER',
        content,
        created_at: new Date().toISOString(),
      },
      botMessage: {
        id: botMsgId,
        conversation_id: conversationId,
        sender_type: 'BOT',
        content: ragResult.answer,
        support_status: ragResult.support_status,
        sources: ragResult.sources,
        query_category: ragResult.category,
        suggest_escalation: ragResult.suggest_escalation,
        created_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Escalates a conversation to human support and creates a ticket.
   */
  static async escalateConversation({ conversationId, user, reason = 'Customer requested human support', ipAddress = null }) {
    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
    if (!conv) {
      throw new NotFoundError('Conversation');
    }

    if (conv.user_id !== user.sub && !['SUPPORT_AGENT', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenError('You do not have access to this conversation');
    }

    if (conv.status === 'ESCALATED') {
      // Check if ticket already exists
      const existingTicket = await db.get('SELECT * FROM tickets WHERE conversation_id = ?', [conversationId]);
      if (existingTicket) {
        return {
          ticketId: existingTicket.id,
          ticketNumber: existingTicket.ticket_number,
          message: `Conversation already escalated under ticket #${existingTicket.ticket_number}`,
        };
      }
    }

    // Generate human-readable ticket number (e.g. TKT-0042)
    const countRow = await db.get('SELECT COUNT(*) as count FROM tickets');
    const ticketSeq = (countRow ? countRow.count : 0) + 1;
    const ticketNumber = `TKT-${String(ticketSeq).padStart(4, '0')}`;

    // Get last user message for subject
    const lastUserMsg = await db.get(
      "SELECT content FROM messages WHERE conversation_id = ? AND sender_type = 'CUSTOMER' ORDER BY created_at DESC LIMIT 1",
      [conversationId]
    );

    const subject = lastUserMsg
      ? `Support request: ${lastUserMsg.content.slice(0, 50)}...`
      : `Support Ticket ${ticketNumber}`;

    const ticketId = generateId();

    // Create ticket in transaction
    await db.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO tickets
              (id, ticket_number, user_id, conversation_id, subject, description, priority, status, escalation_reason, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'MEDIUM', 'OPEN', ?, datetime('now'), datetime('now'))`,
        args: [
          ticketId,
          ticketNumber,
          user.sub,
          conversationId,
          subject,
          `Escalated from conversation. Reason: ${reason}`,
          reason,
        ],
      });

      await tx.execute({
        sql: `UPDATE conversations SET status = 'ESCALATED', updated_at = datetime('now') WHERE id = ?`,
        args: [conversationId],
      });

      // Insert System message
      const systemMessage = `Your conversation has been escalated to our human support team. Ticket #${ticketNumber} has been opened and assigned to our queue. An agent will reply shortly.`;
      await tx.execute({
        sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, support_status, created_at)
              VALUES (?, ?, 'SYSTEM', NULL, ?, 'N/A', datetime('now'))`,
        args: [generateId(), conversationId, systemMessage],
      });
    });

    await writeAuditLog({
      userId: user.sub,
      action: 'CONVERSATION_ESCALATED',
      entityType: 'ticket',
      entityId: ticketId,
      metadata: { conversationId, ticketNumber, reason },
      ipAddress,
    });

    return {
      ticketId,
      ticketNumber,
      message: `Your conversation has been escalated. Ticket #${ticketNumber} created.`,
    };
  }
}
