/**
 * chromadb.js — ChromaDB client initialization.
 *
 * Provides a single ChromaDB client instance and a helper to
 * get-or-create the knowledge base collection.
 *
 * ChromaDB uses cosine similarity by default when using the
 * 'cosine' distance function, where similarity = 1 - distance.
 * The RAG service converts raw distances to similarity scores.
 */

import { ChromaClient } from 'chromadb';
import { env } from './env.js';
import { logger } from './logger.js';

let chromaClient;
let knowledgeCollection;

/**
 * Returns the singleton ChromaDB client.
 */
export function getChromaClient() {
  if (!chromaClient) {
    chromaClient = new ChromaClient({ path: env.CHROMA_URL });
  }
  return chromaClient;
}

/**
 * Returns the knowledge base collection.
 * Creates it if it doesn't exist.
 * Uses cosine distance so we can convert: similarity = 1 - distance.
 *
 * @returns {Promise<Collection>}
 */
export async function getKnowledgeCollection() {
  if (knowledgeCollection) return knowledgeCollection;

  const client = getChromaClient();

  try {
    knowledgeCollection = await client.getOrCreateCollection({
      name: env.CHROMA_COLLECTION,
      metadata: {
        description: 'NovaCart customer support knowledge base',
        'hnsw:space': 'cosine',
      },
    });

    logger.info('ChromaDB collection ready', {
      collection: env.CHROMA_COLLECTION,
      url: env.CHROMA_URL,
    });

    return knowledgeCollection;
  } catch (error) {
    logger.error('Failed to connect to ChromaDB', {
      url: env.CHROMA_URL,
      error: error.message,
    });
    throw new ServiceUnavailableError('VECTOR_DB_UNAVAILABLE', 'The vector database is unavailable.');
  }
}

/**
 * Resets the cached collection reference.
 * Used when the collection is deleted/recreated during re-indexing.
 */
export function resetCollectionCache() {
  knowledgeCollection = null;
}

// Import here to avoid circular deps — defined after exports
import { ServiceUnavailableError } from '../utils/errors.js';
