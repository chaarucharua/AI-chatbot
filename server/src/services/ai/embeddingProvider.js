/**
 * embeddingProvider.js — Multi-provider vector embedding interface (Gemini & Ollama).
 */

import { GeminiClient } from './geminiClient.js';
import { OllamaClient } from './ollamaClient.js';
import { env } from '../../config/env.js';

export class EmbeddingProvider {
  /**
   * Embeds a single string into a 768-dim float vector.
   */
  static async embed(text) {
    if (!text || typeof text !== 'string') {
      return OllamaClient.fallbackEmbedding('', 768);
    }

    if (env.AI_PROVIDER === 'gemini' || GeminiClient.isConfigured()) {
      return await GeminiClient.getEmbedding(text, env.GEMINI_EMBEDDING_MODEL);
    }

    return await OllamaClient.getEmbedding(text, env.OLLAMA_EMBEDDING_MODEL);
  }

  /**
   * Embeds an array of strings in batches.
   */
  static async embedBatch(texts, batchSize = 10) {
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map((t) => this.embed(t))
      );
      results.push(...batchEmbeddings);
    }
    return results;
  }
}
