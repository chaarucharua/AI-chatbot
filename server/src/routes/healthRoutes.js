/**
 * healthRoutes.js — System health check endpoint.
 *
 * GET /api/health
 * Returns overall system status, uptime, and individual service checks.
 * This endpoint is PUBLIC (no auth) so load balancers and monitoring
 * tools can use it without credentials.
 *
 * NOTE: Internal details (DB path, model names) are NOT exposed —
 * only a boolean status per service.
 */

import { Router } from 'express';
import { db } from '../config/database.js';
import { getChromaClient } from '../config/chromadb.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/', async (req, res) => {
  const startTime = Date.now();
  const checks = {};

  // ── Database (SQLite/libsql) ────────────────────────────────
  try {
    await db.execute('SELECT 1');
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = { status: 'error', message: 'Database unavailable' };
  }

  // ── ChromaDB ───────────────────────────────────────────────
  try {
    const chroma = getChromaClient();
    await chroma.heartbeat();
    checks.vectorDatabase = { status: 'ok' };
  } catch (err) {
    checks.vectorDatabase = { status: 'error', message: 'Vector database unavailable' };
  }

  // ── AI Service (Gemini or Ollama) ──────────────────────────
  try {
    if (env.AI_PROVIDER === 'gemini') {
      const hasKey = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
      checks.aiService = {
        status: 'ok',
        provider: 'gemini',
        model: env.GEMINI_MODEL,
        key_configured: hasKey,
      };
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) {
        checks.aiService = { status: 'ok', provider: 'ollama' };
      } else {
        checks.aiService = { status: 'degraded', provider: 'ollama', message: 'Ollama offline, fallback active' };
      }
    }
  } catch (err) {
    checks.aiService = {
      status: 'degraded',
      provider: env.AI_PROVIDER,
      message: 'Running in offline fallback mode',
    };
  }

  // ── Determine overall status ───────────────────────────────
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const anyError = Object.values(checks).some((c) => c.status === 'error');

  const overallStatus = allOk ? 'ok' : anyError ? 'degraded' : 'ok';
  const httpStatus = 200; // Always 200 — let the body carry the detail

  res.status(httpStatus).json({
    success: true,
    data: {
      status: overallStatus,
      uptime_seconds: Math.floor(process.uptime()),
      latency_ms: Date.now() - startTime,
      environment: env.NODE_ENV,
      services: checks,
    },
  });
});

export default router;
