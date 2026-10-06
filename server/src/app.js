/**
 * app.js — Express application bootstrap.
 *
 * Startup order:
 *   1. Load & validate environment variables
 *   2. Initialize SQLite (schema creation)
 *   3. Register global middleware (security, CORS, body parsing, logging)
 *   4. Mount routes
 *   5. Register error handler (must be last)
 *   6. Start HTTP server
 *   7. Register graceful shutdown handlers
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { env } from './config/env.js';
import { initDatabase, closeDatabase } from './config/database.js';
import { logger } from './config/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const app = express();

// ─────────────────────────────────────────────────────────────
// SECURITY HEADERS (helmet)
// ─────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Allow embedding in dev tools
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─────────────────────────────────────────────────────────────
// BODY PARSING
// Limit body size to prevent payload flooding
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─────────────────────────────────────────────────────────────
// REQUEST LOGGING
// ─────────────────────────────────────────────────────────────
app.use(requestLogger);

// ─────────────────────────────────────────────────────────────
// TRUST PROXY (needed for accurate IP in rate limiter)
// Set to 1 if behind a single reverse proxy (nginx, etc.)
// ─────────────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────
app.use('/api/health',        healthRoutes);
app.use('/api/auth',          authRoutes);
app.use('/api/conversations', chatRoutes);
app.use('/api/tickets',       ticketRoutes);
app.use('/api/agent',         agentRoutes);
app.use('/api/knowledge',     knowledgeRoutes);
app.use('/api/admin',         adminRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// CENTRALIZED ERROR HANDLER — must be LAST middleware
// ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────
// DATABASE INITIALIZATION
// ─────────────────────────────────────────────────────────────
try {
  await initDatabase(); // Initialize and run schema migrations
} catch (err) {
  logger.error('Failed to initialize database — exiting', { error: err.message });
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 NovaCart API server running`, {
    port: env.PORT,
    env: env.NODE_ENV,
    pid: process.pid,
  });
});

// ─────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// Ensures in-flight requests are finished before exiting.
// ─────────────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down gracefully`);
  server.close(() => {
    closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });

  // Force-kill after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
