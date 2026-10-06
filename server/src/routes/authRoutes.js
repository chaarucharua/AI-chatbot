/**
 * authRoutes.js — Public authentication endpoints.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/authService.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const user = await AuthService.register({
        ...req.body,
        ipAddress: req.ip,
      });

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const result = await AuthService.login({
        ...req.body,
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

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await AuthService.getCurrentUser(req.user.sub);
    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
