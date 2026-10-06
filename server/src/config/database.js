/**
 * database.js — SQLite connection and schema initialization using @libsql/client.
 *
 * Provides safe parameterized queries and automatic schema initialization.
 *
 * SECURITY: All queries MUST use parameterized statements.
 *           Never interpolate user input into SQL strings.
 */

import { createClient } from '@libsql/client';
import { env } from './env.js';
import { logger } from './logger.js';
import path from 'path';
import fs from 'fs';

let client = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'SUPPORT_AGENT', 'ADMIN')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLOSED', 'ESCALATED')),
    title      TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_conv_user_id ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_conv_status  ON conversations(status);

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type     TEXT NOT NULL CHECK(sender_type IN ('CUSTOMER', 'BOT', 'AGENT', 'SYSTEM')),
    sender_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    content         TEXT NOT NULL,
    support_status  TEXT CHECK(support_status IN ('SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED','AMBIGUOUS','N/A')),
    confidence_data TEXT,
    sources         TEXT,
    query_category  TEXT,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_msg_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_msg_created_at      ON messages(created_at);

  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    filename      TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(document_type IN ('FAQ','POLICY','PRODUCT','GENERAL')),
    mime_type     TEXT,
    file_size     INTEGER,
    version       INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','ACTIVE','FAILED','DELETED')),
    chunk_count   INTEGER NOT NULL DEFAULT 0,
    ingested_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_doc_status ON knowledge_documents(status);

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chroma_id   TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    metadata    TEXT,
    token_count INTEGER,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chunk_document_id ON knowledge_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_chunk_chroma_id   ON knowledge_chunks(chroma_id);

  CREATE TABLE IF NOT EXISTS tickets (
    id                TEXT PRIMARY KEY,
    ticket_number     TEXT UNIQUE NOT NULL,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id   TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    subject           TEXT NOT NULL,
    description       TEXT NOT NULL,
    priority          TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
    status            TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','RESOLVED','CLOSED')),
    assigned_agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    escalation_reason TEXT,
    created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at        DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ticket_user_id   ON tickets(user_id);
  CREATE INDEX IF NOT EXISTS idx_ticket_status    ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_ticket_agent_id  ON tickets(assigned_agent_id);

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id          TEXT PRIMARY KEY,
    ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('CUSTOMER','AGENT','SYSTEM')),
    content     TEXT NOT NULL,
    is_internal INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tmsg_ticket_id ON ticket_messages(ticket_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    metadata    TEXT,
    ip_address  TEXT,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_user_id   ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

  CREATE TABLE IF NOT EXISTS rag_logs (
    id               TEXT PRIMARY KEY,
    conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    message_id       TEXT REFERENCES messages(id) ON DELETE SET NULL,
    query            TEXT NOT NULL,
    query_category   TEXT,
    retrieved_chunks TEXT,
    retrieval_scores TEXT,
    support_status   TEXT,
    model_used       TEXT,
    latency_ms       INTEGER,
    escalation_decision INTEGER DEFAULT 0,
    created_at       DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_rag_conversation_id ON rag_logs(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_rag_created_at      ON rag_logs(created_at);
`;

function getClientConfig() {
  const url = env.DATABASE_URL || './data/support.db';
  const isRemote = url.startsWith('libsql://') || url.startsWith('https://') || url.startsWith('http://');

  if (isRemote) {
    return {
      url,
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    };
  }

  // Local file SQLite
  const cleanPath = url.startsWith('file:') ? url.slice(5) : url;
  const dbPath = path.resolve(cleanPath);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return {
    url: `file:${dbPath}`,
  };
}

/**
 * Initializes the database connection and creates tables if they don't exist.
 */
export async function initDatabase() {
  if (client) return client;

  const config = getClientConfig();
  client = createClient(config);

  try {
    // Only execute local PRAGMAs on local file databases
    if (config.url.startsWith('file:')) {
      await client.execute('PRAGMA foreign_keys = ON;');
      await client.execute('PRAGMA journal_mode = WAL;');
      await client.execute('PRAGMA busy_timeout = 5000;');
    }
    await client.executeMultiple(SCHEMA_SQL);
    logger.info('Database connected and schema initialized', { url: config.url });
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
  }

  return client;
}

/**
 * Accessor that returns the active client (or creates one).
 */
export function getDatabase() {
  if (!client) {
    const config = getClientConfig();
    client = createClient(config);
  }
  return client;
}

/**
 * Database helper methods for ergonomic async SQL operations.
 */
export const db = {
  async execute(stmt, args = []) {
    const cl = getDatabase();
    if (typeof stmt === 'string') {
      return await cl.execute({ sql: stmt, args });
    }
    return await cl.execute(stmt);
  },

  async get(sql, args = []) {
    const res = await this.execute(sql, args);
    return res.rows.length > 0 ? res.rows[0] : null;
  },

  async all(sql, args = []) {
    const res = await this.execute(sql, args);
    return res.rows;
  },

  async run(sql, args = []) {
    const res = await this.execute(sql, args);
    return {
      rowsAffected: res.rowsAffected,
      lastInsertRowid: res.lastInsertRowid,
    };
  },

  async exec(sql) {
    const cl = getDatabase();
    return await cl.executeMultiple(sql);
  },

  async transaction(callback) {
    const cl = getDatabase();
    const tx = await cl.transaction('write');
    try {
      const result = await callback(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  },

  get client() {
    return getDatabase();
  },
};

/**
 * Gracefully closes the database connection.
 */
export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    logger.info('Database connection closed');
  }
}
