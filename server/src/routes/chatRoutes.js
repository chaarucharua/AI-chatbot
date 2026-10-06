/**
 * chatRoutes.js — Conversation and chat endpoints.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ChatService } from '../services/chatService.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { chatLimiter } from '../middleware/rateLimiter.js';
import { env } from '../config/env.js';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

const messageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(env.MAX_MESSAGE_LENGTH, `Message exceeds max length of ${env.MAX_MESSAGE_LENGTH} characters`),
});

const escalateSchema = z.object({
  reason: z.string().trim().max(500).optional().default('Customer requested human escalation'),
});

// List conversations
router.get('/', async (req, res, next) => {
  try {
    const list = await ChatService.getUserConversations(req.user.sub);
    res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
});

// Create conversation
router.post('/', async (req, res, next) => {
  try {
    const title = req.body.title || null;
    const conv = await ChatService.createConversation(req.user.sub, title);
    res.status(201).json({
      success: true,
      data: conv,
    });
  } catch (err) {
    next(err);
  }
});

// Get conversation details & messages
router.get('/:id', async (req, res, next) => {
  try {
    const data = await ChatService.getConversation(req.params.id, req.user);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

// Send message to conversation
router.post(
  '/:id/messages',
  chatLimiter,
  validate(messageSchema),
  async (req, res, next) => {
    try {
      const result = await ChatService.sendMessage({
        conversationId: req.params.id,
        user: req.user,
        content: req.body.content,
        ipAddress: req.ip,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Escalate conversation
router.post(
  '/:id/escalate',
  validate(escalateSchema),
  async (req, res, next) => {
    try {
      const result = await ChatService.escalateConversation({
        conversationId: req.params.id,
        user: req.user,
        reason: req.body.reason,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
