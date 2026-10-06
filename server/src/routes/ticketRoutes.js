/**
 * ticketRoutes.js — Customer-facing ticket endpoints.
 */

import { Router } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/ticketService.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  conversation_id: z.string().uuid().optional().nullable(),
});

const replyTicketSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(5000),
});

// List customer's tickets
router.get('/', async (req, res, next) => {
  try {
    const tickets = await TicketService.getUserTickets(req.user.sub);
    res.json({
      success: true,
      data: tickets,
    });
  } catch (err) {
    next(err);
  }
});

// Create new ticket
router.post('/', validate(createTicketSchema), async (req, res, next) => {
  try {
    const ticket = await TicketService.createTicket({
      userId: req.user.sub,
      subject: req.body.subject,
      description: req.body.description,
      priority: req.body.priority,
      conversationId: req.body.conversation_id,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
});

// Get ticket details and messages
router.get('/:id', async (req, res, next) => {
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

// Customer reply to ticket
router.post('/:id/messages', validate(replyTicketSchema), async (req, res, next) => {
  try {
    const message = await TicketService.addMessage({
      ticketId: req.params.id,
      user: req.user,
      content: req.body.content,
      isInternal: false,
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
