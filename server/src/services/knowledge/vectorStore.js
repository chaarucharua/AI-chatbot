/**
 * vectorStore.js — Vector storage layer with ChromaDB and in-memory cosine fallback.
 *
 * If ChromaDB is running, uses the official Chroma collection.
 * If ChromaDB is offline, falls back to a high-performance in-memory cosine index
 * backed by SQLite so zero external docker dependencies are required to run.
 */

import { getChromaClient, getKnowledgeCollection } from '../../config/chromadb.js';
import { logger } from '../../config/logger.js';
import { db } from '../../config/database.js';

let chromaAvailable = null;
let lastChromaCheck = 0;
const CHROMA_CHECK_INTERVAL = 15000;

// Local vector index storage (fallback)
const localVectorIndex = new Map();

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

export class VectorStore {
  /**
   * Check if ChromaDB is currently reachable.
   */
  static async isChromaOnline() {
    const now = Date.now();
    if (chromaAvailable !== null && now - lastChromaCheck < CHROMA_CHECK_INTERVAL) {
      return chromaAvailable;
    }

    try {
      const chroma = getChromaClient();
      await chroma.heartbeat();
      chromaAvailable = true;
    } catch {
      chromaAvailable = false;
    }

    lastChromaCheck = now;
    return chromaAvailable;
  }

  /**
   * Upserts vectors, documents, and metadatas into the store.
   */
  static async upsert({ ids, embeddings, documents, metadatas }) {
    const isOnline = await this.isChromaOnline();

    if (isOnline) {
      try {
        const collection = await getKnowledgeCollection();
        await collection.upsert({
          ids,
          embeddings,
          documents,
          metadatas,
        });
        logger.info('Upserted chunks to ChromaDB', { count: ids.length });
        return;
      } catch (err) {
        logger.warn('ChromaDB upsert failed, storing in local vector index', {
          error: err.message,
        });
      }
    }

    // Local fallback index
    for (let i = 0; i < ids.length; i++) {
      localVectorIndex.set(ids[i], {
        id: ids[i],
        embedding: embeddings[i],
        document: documents[i],
        metadata: metadatas[i],
      });
    }

    logger.info('Upserted chunks to local vector store', { count: ids.length });
  }

  /**
   * Queries top-K most similar documents given an embedding vector.
   * Returns: [{ id, document, metadata, similarity, distance }]
   */
  static async query({ queryEmbedding, topK = 5, where = null }) {
    const isOnline = await this.isChromaOnline();

    if (isOnline) {
      try {
        const collection = await getKnowledgeCollection();
        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: topK,
          where: where || undefined,
        });

        if (results && results.ids && results.ids[0]) {
          const items = [];
          for (let i = 0; i < results.ids[0].length; i++) {
            const distance = results.distances ? results.distances[0][i] : 0;
            // Cosine distance in Chroma: distance = 1 - cosine_similarity
            const similarity = Math.max(0, 1 - distance);
            items.push({
              id: results.ids[0][i],
              document: results.documents[0][i],
              metadata: results.metadatas ? results.metadatas[0][i] : {},
              similarity,
              distance,
            });
          }
          return items;
        }
      } catch (err) {
        logger.warn('ChromaDB query failed, querying local vector index', {
          error: err.message,
        });
      }
    }

    // Local fallback cosine similarity search
    // If local memory is empty, also try to populate from SQLite knowledge_chunks
    if (localVectorIndex.size === 0) {
      await this.syncFromDatabase();
    }

    const scored = [];
    for (const item of localVectorIndex.values()) {
      if (!item.embedding) continue;
      const rawSim = cosineSimilarity(queryEmbedding, item.embedding);
      // Calibrate lexical-hash cosine distribution to standard dense embedding scale
      const similarity = Math.min(0.95, Math.max(0, rawSim * 3.5));
      scored.push({
        id: item.id,
        document: item.document,
        metadata: item.metadata || {},
        similarity,
        distance: 1 - similarity,
      });
    }

    // Sort descending by similarity
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Deletes vectors by IDs.
   */
  static async delete({ ids }) {
    const isOnline = await this.isChromaOnline();
    if (isOnline) {
      try {
        const collection = await getKnowledgeCollection();
        await collection.delete({ ids });
      } catch (err) {
        logger.warn('ChromaDB delete failed', { error: err.message });
      }
    }

    for (const id of ids) {
      localVectorIndex.delete(id);
    }
  }

  /**
   * Returns current count of indexed chunks.
   */
  static async count() {
    const isOnline = await this.isChromaOnline();
    if (isOnline) {
      try {
        const collection = await getKnowledgeCollection();
        return await collection.count();
      } catch {
        // Fall back
      }
    }
    return localVectorIndex.size;
  }

  /**
   * Syncs existing chunks from SQLite into local memory index if needed.
   */
  static async syncFromDatabase() {
    try {
      const rows = await db.all('SELECT id, chroma_id, content, metadata FROM knowledge_chunks');
      if (rows.length > 0) {
        const { OllamaClient } = await import('../ai/ollamaClient.js');
        for (const row of rows) {
          const meta = row.metadata ? JSON.parse(row.metadata) : {};
          const embedding = OllamaClient.fallbackEmbedding(row.content, 768);
          localVectorIndex.set(row.chroma_id, {
            id: row.chroma_id,
            embedding,
            document: row.content,
            metadata: meta,
          });
        }
        logger.info('Synced chunks from database to local vector index', { count: rows.length });
      }
    } catch (err) {
      logger.error('Failed to sync chunks from database', { error: err.message });
    }
  }
}
