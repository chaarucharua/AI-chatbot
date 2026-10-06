/**
 * ragService.js — Full RAG orchestration pipeline.
 */

import { QueryClassifier } from '../ai/queryClassifier.js';
import { EmbeddingProvider } from '../ai/embeddingProvider.js';
import { VectorStore } from '../knowledge/vectorStore.js';
import { ConfidenceEvaluator } from './confidenceEvaluator.js';
import { PromptBuilder } from './promptBuilder.js';
import { LLMProvider } from '../ai/llmProvider.js';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { generateId } from '../../utils/uuid.js';
import { logger } from '../../config/logger.js';

export class RAGService {
  /**
   * Executes the full RAG pipeline for a user message.
   *
   * @param {object} params
   * @param {string} params.query
   * @param {string} [params.conversationId]
   * @param {string} [params.messageId]
   * @param {Array}  [params.history]
   */
  static async processQuery({
    query,
    conversationId = null,
    messageId = null,
    history = [],
  }) {
    const startTime = Date.now();

    // ── 1. Query Classification ──────────────────────────────
    const classification = await QueryClassifier.classify(query, history);

    if (classification.needs_clarification && classification.clarification_question) {
      await this.logRagEvent({
        conversationId,
        messageId,
        query,
        queryCategory: classification.category,
        retrievedChunks: [],
        retrievalScores: [],
        supportStatus: 'AMBIGUOUS',
        modelUsed: 'classifier',
        latencyMs: Date.now() - startTime,
        escalationDecision: 0,
      });

      return {
        answer: classification.clarification_question,
        sources: [],
        support_status: 'AMBIGUOUS',
        category: classification.category,
        intent: classification.intent,
        confidence_data: { maxScore: 0, avgScore: 0, retrievedCount: 0 },
        suggest_escalation: false,
      };
    }

    // ── 2. Query Embedding ───────────────────────────────────
    const queryEmbedding = await EmbeddingProvider.embed(query);

    // ── 3. Vector Retrieval ──────────────────────────────────
    const retrievedChunks = await VectorStore.query({
      queryEmbedding,
      topK: env.RAG_TOP_K,
    });

    // ── 4. Confidence Evaluation ─────────────────────────────
    const confidence = ConfidenceEvaluator.evaluate(
      retrievedChunks,
      classification.category
    );

    // ── 5. Unsupported Query Handling ────────────────────────
    if (confidence.support_status === 'UNSUPPORTED') {
      const fallbackMsg =
        "I don't have enough information in our support documentation to answer that accurately. Would you like me to connect you with a support agent?";

      await this.logRagEvent({
        conversationId,
        messageId,
        query,
        queryCategory: classification.category,
        retrievedChunks: retrievedChunks.map((c) => c.id),
        retrievalScores: retrievedChunks.map((c) => c.similarity),
        supportStatus: 'UNSUPPORTED',
        modelUsed: env.OLLAMA_LLM_MODEL,
        latencyMs: Date.now() - startTime,
        escalationDecision: 1,
      });

      return {
        answer: fallbackMsg,
        sources: [],
        support_status: 'UNSUPPORTED',
        category: classification.category,
        intent: classification.intent,
        confidence_data: {
          maxScore: confidence.maxScore,
          avgScore: confidence.avgScore,
          retrievedCount: retrievedChunks.length,
        },
        suggest_escalation: true,
      };
    }

    // ── 6. Prompt Construction ───────────────────────────────
    // Filter chunks above minimum threshold
    const minThreshold = Math.max(0.4, env.RAG_SIMILARITY_THRESHOLD - 0.2);
    const relevantChunks = retrievedChunks.filter((c) => c.similarity >= minThreshold);

    const { system, prompt } = PromptBuilder.build({
      query,
      contextChunks: relevantChunks,
      conversationHistory: history,
    });

    // ── 7. LLM Generation ────────────────────────────────────
    const { response, model } = await LLMProvider.generate({
      prompt,
      system,
    });

    // ── 8. Source Citations Mapping ──────────────────────────
    const sources = relevantChunks.map((chunk, index) => ({
      source_number: index + 1,
      title: chunk.metadata?.title || 'Knowledge Base Document',
      section: chunk.metadata?.section || 'General',
      similarity: Number(chunk.similarity.toFixed(4)),
    }));

    // ── 9. Observability Logging ─────────────────────────────
    const latencyMs = Date.now() - startTime;
    await this.logRagEvent({
      conversationId,
      messageId,
      query,
      queryCategory: classification.category,
      retrievedChunks: relevantChunks.map((c) => c.id),
      retrievalScores: relevantChunks.map((c) => c.similarity),
      supportStatus: confidence.support_status,
      modelUsed: model,
      latencyMs,
      escalationDecision: 0,
    });

    return {
      answer: response,
      sources,
      support_status: confidence.support_status,
      category: classification.category,
      intent: classification.intent,
      confidence_data: {
        maxScore: confidence.maxScore,
        avgScore: confidence.avgScore,
        retrievedCount: relevantChunks.length,
      },
      suggest_escalation: confidence.support_status === 'PARTIALLY_SUPPORTED',
    };
  }

  /**
   * Records RAG execution to the internal rag_logs table.
   */
  static async logRagEvent({
    conversationId,
    messageId,
    query,
    queryCategory,
    retrievedChunks = [],
    retrievalScores = [],
    supportStatus,
    modelUsed,
    latencyMs,
    escalationDecision = 0,
  }) {
    try {
      await db.execute({
        sql: `INSERT INTO rag_logs
              (id, conversation_id, message_id, query, query_category, retrieved_chunks, retrieval_scores, support_status, model_used, latency_ms, escalation_decision, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          generateId(),
          conversationId,
          messageId,
          query,
          queryCategory,
          JSON.stringify(retrievedChunks),
          JSON.stringify(retrievalScores),
          supportStatus,
          modelUsed,
          latencyMs,
          escalationDecision,
        ],
      });
    } catch (err) {
      logger.error('Failed to log RAG observability event', { error: err.message });
    }
  }
}
