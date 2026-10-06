/**
 * knowledgeRoutes.js — Admin knowledge base management and document ingestion endpoints.
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { generateId } from '../utils/uuid.js';
import { IngestionService } from '../services/knowledge/ingestionService.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { NotFoundError, FileTooLargeError, UnsupportedFileTypeError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/auditLog.js';

const router = Router();
router.use(authenticate, requireRole(['ADMIN']));

// Ensure upload directory exists
const uploadDir = path.resolve('./data/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${generateId()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.txt', '.md', '.pdf', '.json'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new UnsupportedFileTypeError(allowed));
    }
  },
});

// List all documents
router.get('/documents', async (req, res, next) => {
  try {
    const docs = await db.all(
      `SELECT d.*, u.name as ingested_by_name
       FROM knowledge_documents d
       LEFT JOIN users u ON d.ingested_by = u.id
       ORDER BY d.created_at DESC`
    );

    res.json({
      success: true,
      data: docs,
    });
  } catch (err) {
    next(err);
  }
});

// Get document details + chunks
router.get('/documents/:id', async (req, res, next) => {
  try {
    const doc = await db.get('SELECT * FROM knowledge_documents WHERE id = ?', [req.params.id]);
    if (!doc) {
      throw new NotFoundError('Knowledge document');
    }

    const chunks = await db.all(
      'SELECT id, chroma_id, chunk_index, content, metadata, token_count FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index ASC',
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        document: doc,
        chunks: chunks.map((c) => ({
          ...c,
          metadata: c.metadata ? JSON.parse(c.metadata) : {},
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Upload and ingest document
router.post(
  '/documents',
  uploadLimiter,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE_UPLOADED', message: 'Please provide a file to upload' },
        });
      }

      const title = req.body.title || req.file.originalname;
      const documentType = req.body.document_type || 'GENERAL';
      const docId = generateId();

      await db.execute({
        sql: `INSERT INTO knowledge_documents
              (id, title, filename, file_path, document_type, mime_type, file_size, status, ingested_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'), datetime('now'))`,
        args: [
          docId,
          title,
          req.file.originalname,
          req.file.path,
          documentType,
          req.file.mimetype,
          req.file.size,
          req.user.sub,
        ],
      });

      await writeAuditLog({
        userId: req.user.sub,
        action: 'DOC_UPLOADED',
        entityType: 'knowledge_document',
        entityId: docId,
        metadata: { filename: req.file.originalname, size: req.file.size },
        ipAddress: req.ip,
      });

      // Process ingestion synchronously or in background
      const ingestionResult = await IngestionService.processDocument(docId);

      const createdDoc = await db.get('SELECT * FROM knowledge_documents WHERE id = ?', [docId]);

      res.status(201).json({
        success: true,
        data: {
          document: createdDoc,
          ingestion: ingestionResult,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Re-index document
router.post('/documents/:id/reindex', async (req, res, next) => {
  try {
    const result = await IngestionService.processDocument(req.params.id);
    await writeAuditLog({
      userId: req.user.sub,
      action: 'DOC_REINDEXED',
      entityType: 'knowledge_document',
      entityId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// Delete document
router.delete('/documents/:id', async (req, res, next) => {
  try {
    await IngestionService.deleteDocument(req.params.id);
    await writeAuditLog({
      userId: req.user.sub,
      action: 'DOC_DELETED',
      entityType: 'knowledge_document',
      entityId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'Document and vectors deleted successfully' },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
