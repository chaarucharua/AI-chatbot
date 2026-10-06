/**
 * seed.js — Database and Knowledge Base seed runner.
 *
 * Populates:
 *   - Default Admin, Support Agent, and Customer users
 *   - Core NovaCart knowledge documents with automatic chunking and vector indexing
 *   - Initial tickets and sample conversation for dashboard evaluation
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { initDatabase, db, closeDatabase } from '../config/database.js';
import { generateId } from '../utils/uuid.js';
import { IngestionService } from '../services/knowledge/ingestionService.js';
import { logger } from '../config/logger.js';

async function seed() {
  logger.info('Starting database seeding...');
  await initDatabase();

  // 1. Seed Users
  const passwordHash = await bcrypt.hash('AdminPass123!', 12);
  const agentHash    = await bcrypt.hash('AgentPass123!', 12);
  const customerHash = await bcrypt.hash('CustomerPass123!', 12);

  const users = [
    {
      id: 'usr_admin_000000000001',
      name: 'Sarah Connor (Admin)',
      email: 'admin@novacart.com',
      password_hash: passwordHash,
      role: 'ADMIN',
    },
    {
      id: 'usr_agent_000000000002',
      name: 'Alex Rivera (Support Lead)',
      email: 'agent@novacart.com',
      password_hash: agentHash,
      role: 'SUPPORT_AGENT',
    },
    {
      id: 'usr_cust_000000000003',
      name: 'John Doe',
      email: 'customer@novacart.com',
      password_hash: customerHash,
      role: 'CUSTOMER',
    },
  ];

  for (const u of users) {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [u.email]);
    if (!existing) {
      await db.execute({
        sql: `INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        args: [u.id, u.name, u.email, u.password_hash, u.role],
      });
      logger.info(`Created user: ${u.email} (${u.role})`);
    } else {
      logger.info(`User already exists: ${u.email}`);
    }
  }

  // 2. Seed Knowledge Documents
  const docsToSeed = [
    {
      filename: 'shipping_policy.md',
      title: 'NovaCart Shipping & Delivery Policy',
      type: 'POLICY',
      mime: 'text/markdown',
    },
    {
      filename: 'refund_returns.md',
      title: 'NovaCart Returns & Refund Policy',
      type: 'POLICY',
      mime: 'text/markdown',
    },
    {
      filename: 'warranty_guarantee.md',
      title: 'NovaCart Warranty & Product Guarantee',
      type: 'POLICY',
      mime: 'text/markdown',
    },
    {
      filename: 'account_security.md',
      title: 'NovaCart Account Security & Privacy',
      type: 'POLICY',
      mime: 'text/markdown',
    },
    {
      filename: 'order_support_faq.json',
      title: 'NovaCart Order Support & Billing FAQs',
      type: 'FAQ',
      mime: 'application/json',
    },
  ];

  const kbDir = path.resolve('./knowledge-base');

  for (const docInfo of docsToSeed) {
    const filePath = path.join(kbDir, docInfo.filename);
    if (!fs.existsSync(filePath)) {
      logger.warn(`Seed file missing: ${filePath}`);
      continue;
    }

    const stat = fs.statSync(filePath);
    let doc = await db.get(
      'SELECT id FROM knowledge_documents WHERE filename = ?',
      [docInfo.filename]
    );

    let docId = doc ? doc.id : generateId();

    if (!doc) {
      await db.execute({
        sql: `INSERT INTO knowledge_documents
              (id, title, filename, file_path, document_type, mime_type, file_size, status, ingested_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'usr_admin_000000000001', datetime('now'), datetime('now'))`,
        args: [
          docId,
          docInfo.title,
          docInfo.filename,
          filePath,
          docInfo.type,
          docInfo.mime,
          stat.size,
        ],
      });
      logger.info(`Inserted document record: ${docInfo.title}`);
    } else {
      await db.execute({
        sql: `UPDATE knowledge_documents SET file_path = ?, file_size = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [filePath, stat.size, docId],
      });
    }

    // Ingest through pipeline
    logger.info(`Processing ingestion for: ${docInfo.title}...`);
    try {
      await IngestionService.processDocument(docId);
      logger.info(`Ingested: ${docInfo.title}`);
    } catch (err) {
      logger.error(`Failed to ingest ${docInfo.title}: ${err.message}`);
    }
  }

  // 3. Seed Sample Conversation & Escalated Ticket
  const sampleConvId = 'conv_sample_0000000001';
  const existingConv = await db.get('SELECT id FROM conversations WHERE id = ?', [sampleConvId]);
  if (!existingConv) {
    await db.execute({
      sql: `INSERT INTO conversations (id, user_id, status, title, created_at, updated_at)
            VALUES (?, 'usr_cust_000000000003', 'ESCALATED', 'Return requested for opened headphones', datetime('now', '-2 hours'), datetime('now', '-1 hour'))`,
      args: [sampleConvId],
    });

    // Messages
    await db.execute({
      sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, support_status, created_at)
            VALUES (?, ?, 'CUSTOMER', 'usr_cust_000000000003', 'Can I return headphones that have been opened?', 'N/A', datetime('now', '-2 hours'))`,
      args: [generateId(), sampleConvId],
    });

    await db.execute({
      sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, support_status, sources, created_at)
            VALUES (?, ?, 'BOT', NULL, 'According to [Source 1], sealed electronics, software, and consumable goods must have their factory shrink-wrap or security seals intact to qualify for a return.', 'SUPPORTED', ?, datetime('now', '-2 hours'))`,
      args: [generateId(), sampleConvId, JSON.stringify([{ source_number: 1, title: 'NovaCart Returns & Refund Policy', section: 'Eligibility & Condition' }])],
    });

    await db.execute({
      sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, support_status, created_at)
            VALUES (?, ?, 'CUSTOMER', 'usr_cust_000000000003', 'The sound in the right ear was defective right out of the box though. Can I speak to a human?', 'N/A', datetime('now', '-1 hour'))`,
      args: [generateId(), sampleConvId],
    });

    // Sample Ticket
    const ticketId = 'tkt_sample_0000000001';
    await db.execute({
      sql: `INSERT INTO tickets (id, ticket_number, user_id, conversation_id, subject, description, priority, status, assigned_agent_id, escalation_reason, created_at, updated_at)
            VALUES (?, 'TKT-0001', 'usr_cust_000000000003', ?, 'Defective headphones right ear out of box', 'Customer received headphones with defective right ear out of the box. Seal was broken due to opening to test.', 'HIGH', 'IN_PROGRESS', 'usr_agent_000000000002', 'Out-of-box defect on opened electronics', datetime('now', '-1 hour'), datetime('now'))`,
      args: [ticketId, sampleConvId],
    });

    // Ticket messages
    await db.execute({
      sql: `INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_type, content, is_internal, created_at)
            VALUES (?, ?, 'usr_cust_000000000003', 'CUSTOMER', 'The sound in the right ear was defective right out of the box though. Can I speak to a human?', 0, datetime('now', '-1 hour'))`,
      args: [generateId(), ticketId],
    });

    await db.execute({
      sql: `INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_type, content, is_internal, created_at)
            VALUES (?, ?, 'usr_agent_000000000002', 'AGENT', 'Customer has photos ready. Authorized for defective replacement under 1-Year Limited Warranty without deduction.', 1, datetime('now', '-45 minutes'))`,
      args: [generateId(), ticketId],
    });

    await db.execute({
      sql: `INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_type, content, is_internal, created_at)
            VALUES (?, ?, 'usr_agent_000000000002', 'AGENT', 'Hello John, since this is an out-of-the-box defect, it is 100% covered under our Warranty policy. I have generated a free prepaid return label for you.', 0, datetime('now', '-30 minutes'))`,
      args: [generateId(), ticketId],
    });

    logger.info('Sample escalated conversation and ticket created.');
  }

  logger.info('Database seeding completed successfully!');
}

seed()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Seeding error:', err);
    await closeDatabase();
    process.exit(1);
  });
