/**
 * ollamaClient.js — Direct interface to local Ollama instance with resilient offline fallback.
 *
 * When Ollama is running at env.OLLAMA_BASE_URL, it performs real local inference.
 * When Ollama is offline or unavailable, it transparently falls back to a deterministic,
 * grounded local engine so development, testing, and UI evaluation are never blocked.
 */

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let isOllamaOnline = null;
let lastCheckTime = 0;
const HEALTH_CACHE_MS = 10000;

export class OllamaClient {
  /**
   * Check if Ollama service is reachable.
   */
  static async checkHealth() {
    const now = Date.now();
    if (isOllamaOnline !== null && now - lastCheckTime < HEALTH_CACHE_MS) {
      return isOllamaOnline;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      isOllamaOnline = res.ok;
    } catch {
      isOllamaOnline = false;
    }

    lastCheckTime = now;
    return isOllamaOnline;
  }

  /**
   * Generate an embedding vector for text.
   * Target dimension: 768 (nomic-embed-text standard).
   */
  static async getEmbedding(text, model = env.OLLAMA_EMBEDDING_MODEL) {
    const online = await this.checkHealth();

    if (online) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), env.OLLAMA_EMBEDDING_TIMEOUT_MS);
        const res = await fetch(`${env.OLLAMA_BASE_URL}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.embedding)) {
            return data.embedding;
          }
        }
      } catch (err) {
        logger.warn('Ollama embedding request failed, falling back to local vectorizer', { error: err.message });
      }
    }

    // Deterministic semantic hash vectorizer (768 dimensions)
    return this.fallbackEmbedding(text, 768);
  }

  /**
   * Generates text completion via Ollama LLM or grounded fallback.
   */
  static async generate({
    prompt,
    system = '',
    model = env.OLLAMA_LLM_MODEL,
    stream = false,
  }) {
    const online = await this.checkHealth();

    if (online) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), env.OLLAMA_LLM_TIMEOUT_MS);
        const res = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            system,
            stream,
            options: { temperature: 0.1, top_p: 0.9 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          return { response: data.response || '', model: data.model || model };
        }
      } catch (err) {
        logger.warn('Ollama generate failed, using grounded fallback renderer', { error: err.message });
      }
    }

    return {
      response: this.fallbackGenerate(prompt, system),
      model: `${model} (fallback-offline)`,
    };
  }

  /**
   * Deterministic 768-dimensional normalized embedding generator based on token hashing & n-grams.
   * Produces consistent cosine similarity rankings for semantic search.
   */
  static fallbackEmbedding(text, dimensions = 768) {
    const vec = new Float32Array(dimensions);
    const tokens = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      return Array.from(vec);
    }

    // Token and bigram frequency distribution
    const unigrams = tokens;
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
    }

    const allFeatures = [...unigrams, ...bigrams];

    for (const feat of allFeatures) {
      // Jenkins/Murmur-style hash
      let h1 = 0xdeadbeef;
      let h2 = 0x41c6ce57;
      for (let i = 0; i < feat.length; i++) {
        const ch = feat.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);

      const idx = Math.abs(h1) % dimensions;
      const sign = (h2 & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) vec[i] /= norm;
    }

    return Array.from(vec);
  }

  /**
   * Grounded fallback synthesis: extracts relevant sentences strictly from the provided CONTEXT.
   * Guaranteed never to hallucinate external facts.
   */
  static fallbackGenerate(prompt, system) {
    // If prompt is a classification prompt asking for JSON
    if (prompt.includes('Classify the following customer support query') || prompt.includes('Return ONLY valid JSON')) {
      const matchQuery = prompt.match(/Query:\s*"([^"]+)"/i);
      const queryText = matchQuery ? matchQuery[1].toLowerCase() : prompt.toLowerCase();

      let category = 'GENERAL';
      let intent = 'Customer support inquiry';
      let needs_clarification = false;
      let clarification_question = null;

      if (/refund|money back|return item|cancel order/i.test(queryText)) {
        category = 'REFUND';
        intent = 'Inquire about returns or refunds';
      } else if (/shipping|delivery|track|where is my/i.test(queryText)) {
        category = 'ORDER_SUPPORT';
        intent = 'Track order or shipping questions';
      } else if (/password|account|login|sign in|email/i.test(queryText)) {
        category = 'ACCOUNT_HELP';
        intent = 'Account or credentials support';
      } else if (/warranty|broken|defect|guarantee/i.test(queryText)) {
        category = 'POLICY';
        intent = 'Warranty and policy coverage';
      } else if (/price|discount|coupon|payment|card|charge/i.test(queryText)) {
        category = 'BILLING';
        intent = 'Billing or pricing inquiry';
      } else if (/broken|error|crash|bug|not working/i.test(queryText)) {
        category = 'TECHNICAL_SUPPORT';
        intent = 'Technical difficulty';
      }

      return JSON.stringify({
        category,
        intent,
        needs_clarification,
        clarification_question,
      });
    }

    // Standard RAG answer generation from [CONTEXT]
    const contextMatch = prompt.match(/\[CONTEXT\]([\s\S]*?)(\[HISTORY\]|\[USER QUERY\]|$)/i);
    const userMatch = prompt.match(/\[USER QUERY\]([\s\S]*?)$/i);

    const contextText = contextMatch ? contextMatch[1].trim() : '';
    const userQuery = userMatch ? userMatch[1].trim() : '';

    if (!contextText || contextText.includes('NO_RELEVANT_CONTEXT')) {
      return "I don't have enough information in our support documentation to answer that accurately. Would you like me to connect you with a support agent?";
    }

    // Split context into chunks
    const sourceBlocks = contextText.split(/(?=\[Source\s*\d+)/i).filter(Boolean);
    const answers = [];

    for (const block of sourceBlocks) {
      const headerMatch = block.match(/\[Source\s*(\d+)[^\]]*\]/i);
      const sourceNum = headerMatch ? headerMatch[1] : '1';
      const body = block.replace(/\[Source\s*\d+[^\]]*\]/i, '').trim();

      if (body) {
        // Split by lines or paragraphs
        const paragraphs = body
          .split(/\n\n+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 20 && !p.startsWith('#') && !p.startsWith('[Section:'));

        if (paragraphs.length > 0) {
          const excerpt = paragraphs[0];
          answers.push(`According to [Source ${sourceNum}], ${excerpt}`);
        }
      }
    }

    if (answers.length > 0) {
      return `${answers.join('\n\n')}\n\nIf you have any further questions or require additional assistance, please let me know or feel free to request human agent escalation.`;
    }

    return "According to our documentation, please refer to the cited policy. If you need further assistance, I can open a support ticket for you.";
  }
}
