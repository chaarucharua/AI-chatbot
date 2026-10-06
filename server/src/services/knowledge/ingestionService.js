/**
 * ingestionService.js — Full document processing and vector ingestion pipeline.
 */

import { db } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { generateId } from '../../utils/uuid.js';
import { TextExtractor } from './textExtractor.js';
import { TextCleaner } from './textCleaner.js';
import { SemanticChunker } from './chunker.js';
import { EmbeddingProvider } from '../ai/embeddingProvider.js';
import { VectorStore } from './vectorStore.js';
import { NotFoundError } from '../../utils/errors.js';

export class IngestionService {
  /**
   * Processes a document record through the full ingestion pipeline.
   *
   * @param {string} documentId
   */
  static async processDocument(documentId) {
    const doc = await db.get(
      'SELECT id, title, filename, file_path, document_type, mime_type FROM knowledge_documents WHERE id = ?',
      [documentId]
    );

    if (!doc) {
      throw new NotFoundError('Knowledge document');
    }

    try {
      await db.execute({
        sql: "UPDATE knowledge_documents SET status = 'PROCESSING', updated_at = datetime('now') WHERE id = ?",
        args: [documentId],
      });

      // 1. Text extraction
      const rawText = await TextExtractor.extract(doc.file_path, doc.mime_type);

      // 2. Cleaning
      const cleanedText = TextCleaner.clean(rawText);

      if (!cleanedText) {
        throw new Error('Document contained no readable text content');
      }

      // 3. Chunking
      const chunks = SemanticChunker.chunk(cleanedText, {
        document_id: doc.id,
        title: doc.title,
        document_type: doc.document_type,
      });

      if (chunks.length === 0) {
        throw new Error('No chunks generated from document');
      }

      // 4. Batch Embeddings
      const chunkTexts = chunks.map((c) => c.content);
      const embeddings = await EmbeddingProvider.embedBatch(chunkTexts);

      // 5. Delete existing chunks if re-indexing
      const oldChunks = await db.all(
        'SELECT chroma_id FROM knowledge_chunks WHERE document_id = ?',
        [documentId]
      );
      if (oldChunks.length > 0) {
        await VectorStore.delete({ ids: oldChunks.map((c) => c.chroma_id) });
        await db.execute({
          sql: 'DELETE FROM knowledge_chunks WHERE document_id = ?',
          args: [documentId],
        });
      }

      // 6. Vector Store Upsert
      const chromaIds = chunks.map((_, i) => `${doc.id}_chunk_${i}`);
      const metadatas = chunks.map((c) => c.metadata);

      await VectorStore.upsert({
        ids: chromaIds,
        embeddings,
        documents: chunkTexts,
        metadatas,
      });

      // 7. Store Chunks in SQLite
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await db.execute({
          sql: `INSERT INTO knowledge_chunks (id, document_id, chroma_id, chunk_index, content, metadata, token_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [
            generateId(),
            doc.id,
            chromaIds[i],
            c.chunk_index,
            c.content,
            JSON.stringify(c.metadata),
            c.token_count,
          ],
        });
      }

      // 8. Mark document ACTIVE
      await db.execute({
        sql: `UPDATE knowledge_documents
              SET status = 'ACTIVE', chunk_count = ?, error_message = NULL, updated_at = datetime('now')
              WHERE id = ?`,
        args: [chunks.length, doc.id],
      });

      logger.info('Document ingested successfully', {
        id: doc.id,
        title: doc.title,
        chunks: chunks.length,
      });

      return {
        success: true,
        documentId: doc.id,
        chunkCount: chunks.length,
      };
    } catch (err) {
      logger.error('Document ingestion failed', {
        id: doc.id,
        error: err.message,
      });

      await db.execute({
        sql: `UPDATE knowledge_documents
              SET status = 'FAILED', error_message = ?, updated_at = datetime('now')
              WHERE id = ?`,
        args: [err.message, doc.id],
      });

      throw err;
    }
  }

  /**
   * Deletes a document, its chunks from SQLite and vectors from VectorStore.
   */
  static async deleteDocument(documentId) {
    const doc = await db.get(
      'SELECT id FROM knowledge_documents WHERE id = ?',
      [documentId]
    );

    if (!doc) {
      throw new NotFoundError('Document');
    }

    const chunks = await db.all(
      'SELECT chroma_id FROM knowledge_chunks WHERE document_id = ?',
      [documentId]
    );

    if (chunks.length > 0) {
      await VectorStore.delete({ ids: chunks.map((c) => c.chroma_id) });
    }

    await db.execute({
      sql: 'DELETE FROM knowledge_chunks WHERE document_id = ?',
      args: [documentId],
    });

    await db.execute({
      sql: 'DELETE FROM knowledge_documents WHERE id = ?',
      args: [documentId],
    });

    logger.info('Document deleted from knowledge base and vector store', { id: documentId });
  }
}
