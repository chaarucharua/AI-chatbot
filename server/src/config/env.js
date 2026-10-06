/**
 * env.js — Validated environment configuration.
 *
 * Reads from process.env (populated by dotenv in app.js).
 * Fails FAST with a clear message if required variables are missing or invalid.
 * All application code imports from here — never from process.env directly.
 */

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().default('./data/support.db'),
  TURSO_AUTH_TOKEN: z.string().optional().default(''),

  // Auth — JWT_SECRET must be at least 32 characters
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters.')
    .default('fa06d78f3fef11bae86c1821a7b58d9606c55a95bb8ac1f8f6e2be2a9fba0494'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // CORS
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  // AI Provider Selection: 'gemini' | 'ollama'
  AI_PROVIDER: z.enum(['gemini', 'ollama']).default('gemini'),

  // Google Gemini API
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),

  // Ollama (optional local fallback)
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_LLM_MODEL: z.string().default('qwen3:4b'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  OLLAMA_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // ChromaDB
  CHROMA_URL: z.string().url().default('http://localhost:8000'),
  CHROMA_COLLECTION: z.string().default('novacart_knowledge'),

  // RAG
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.70),
  RAG_CONTEXT_MAX_TOKENS: z.coerce.number().int().positive().default(3000),

  // Chunking
  CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).default(100),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),

  // Chat
  MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(2000),
  CONVERSATION_CONTEXT_TURNS: z.coerce.number().int().min(1).max(20).default(6),

  // Rate limits
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_REGISTER_WINDOW_MIN: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_CHAT_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_CHAT_WINDOW_MIN: z.coerce.number().int().positive().default(1),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_UPLOAD_WINDOW_MIN: z.coerce.number().int().positive().default(60),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_TO_FILE: z.coerce.boolean().default(false),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),
});

/**
 * Parse and validate all environment variables.
 * Throws a descriptive error on startup if any required var is missing or invalid.
 */
function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  • ${i.path.join('.')}: ${i.message}`
    );
    console.error(
      '❌ Environment configuration error. Fix the following before starting:\n' +
        issues.join('\n')
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
