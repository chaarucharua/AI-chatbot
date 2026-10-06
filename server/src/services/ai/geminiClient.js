/**
 * geminiClient.js — Google Gemini API client with resilient fallback.
 *
 * Uses the official Google Gen AI SDK (@google/genai) for:
 *   - Gemini model text generation (e.g. gemini-2.5-flash / gemini-1.5-flash)
 *   - Google text-embedding-004 (768-dimensional embeddings)
 *
 * If GEMINI_API_KEY is not yet supplied or in offline testing, it gracefully
 * falls back to our deterministic grounded synthesis and local vectorizer.
 */

import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { OllamaClient } from './ollamaClient.js';

let genAIClient = null;

function getClient() {
  if (!genAIClient && env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return genAIClient;
}

export class GeminiClient {
  /**
   * Check if Gemini API key is configured.
   */
  static isConfigured() {
    return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
  }

  /**
   * Generate vector embedding using Google text-embedding-004.
   */
  static async getEmbedding(text, model = env.GEMINI_EMBEDDING_MODEL) {
    if (this.isConfigured()) {
      try {
        const client = getClient();
        const response = await client.models.embedContent({
          model,
          contents: text,
        });

        if (response?.embedding?.values) {
          return response.embedding.values;
        }
      } catch (err) {
        logger.warn('Gemini embedding failed, using local vector fallback', {
          error: err.message,
        });
      }
    }

    // Fallback deterministic 768-dim embedding
    return OllamaClient.fallbackEmbedding(text, 768);
  }

  /**
   * Generates text completion using Gemini LLM.
   */
  static async generate({
    prompt,
    system = '',
    model = env.GEMINI_MODEL,
  }) {
    if (this.isConfigured()) {
      try {
        const client = getClient();
        const config = {
          temperature: 0.1,
          topP: 0.9,
        };

        if (system) {
          config.systemInstruction = system;
        }

        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config,
        });

        const text = response.text || '';
        if (text) {
          return {
            response: text,
            model,
          };
        }
      } catch (err) {
        logger.warn('Gemini generate failed, using grounded fallback renderer', {
          error: err.message,
        });
      }
    }

    // Grounded fallback renderer (strict facts only, zero hallucination)
    return {
      response: OllamaClient.fallbackGenerate(prompt, system),
      model: `${model} (fallback-offline)`,
    };
  }
}
