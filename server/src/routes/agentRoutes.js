/**
 * agentRoutes.js — Agent ticket queue, assignment, status update, and messaging endpoints.
 */

import { Router } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/ticketService.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Restricted to SUPPORT_AGENT and ADMIN
router.use(authenticate, requireRole(['SUPPORT_AGENT', 'ADMIN']));

const updateTicketSchema = z.object({
  status: z
    .enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'])
    .optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigned_agent_id: z.string().uuid().nullable().optional(),
});

const agentMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(5000),
  is_internal: z.boolean().optional().default(false),
});

// List tickets with filters
router.get('/tickets', async (req, res, next) => {
  try {
    const { status, priority, agent_id, search } = req.query;
    const tickets = await TicketService.getAllTickets({
      status,
      priority,
      agentId: agent_id,
      search,
    });

    res.json({
      success: true,
      data: tickets,
    });
  } catch (err) {
    next(err);
  }
});

// Get ticket details with internal notes
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const data = await TicketService.getTicketDetails(req.params.id, req.user);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

// Update ticket status / priority / assignment
router.patch('/tickets/:id', validate(updateTicketSchema), async (req, res, next) => {
  try {
    const updated = await TicketService.updateTicket({
      ticketId: req.params.id,
      updates: req.body,
      user: req.user,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// Send agent reply or internal note
router.post('/tickets/:id/messages', validate(agentMessageSchema), async (req, res, next) => {
  try {
    const message = await TicketService.addMessage({
      ticketId: req.params.id,
      user: req.user,
      content: req.body.content,
      isInternal: req.body.is_internal,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
