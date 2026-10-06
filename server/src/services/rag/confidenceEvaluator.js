/**
 * confidenceEvaluator.js — Evaluates retrieval relevance and determines support status.
 *
 * Threshold tiers:
 *   - SUPPORTED:           maxScore >= RAG_SIMILARITY_THRESHOLD (default 0.70)
 *   - PARTIALLY_SUPPORTED: RAG_SIMILARITY_THRESHOLD - 0.10 <= maxScore < RAG_SIMILARITY_THRESHOLD
 *   - UNSUPPORTED:         maxScore < RAG_SIMILARITY_THRESHOLD - 0.10 OR 0 chunks
 *   - AMBIGUOUS:           if query was classified as ambiguous
 */

import { env } from '../../config/env.js';

export class ConfidenceEvaluator {
  /**
   * Evaluates retrieved chunks against configured thresholds.
   *
   * @param {Array<{similarity: number}>} retrievedChunks
   * @param {string} queryCategory
   * @param {boolean} isAmbiguous
   */
  static evaluate(retrievedChunks = [], queryCategory = 'GENERAL', isAmbiguous = false) {
    if (isAmbiguous || queryCategory === 'AMBIGUOUS') {
      return {
        support_status: 'AMBIGUOUS',
        maxScore: 0,
        avgScore: 0,
        relevantCount: 0,
        isSupported: false,
      };
    }

    if (!retrievedChunks || retrievedChunks.length === 0) {
      return {
        support_status: 'UNSUPPORTED',
        maxScore: 0,
        avgScore: 0,
        relevantCount: 0,
        isSupported: false,
      };
    }

    const scores = retrievedChunks.map((c) => c.similarity || 0);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    const threshold = env.RAG_SIMILARITY_THRESHOLD;
    const partialThreshold = Math.max(0.4, threshold - 0.15);

    let support_status = 'UNSUPPORTED';
    let isSupported = false;

    if (maxScore >= threshold) {
      support_status = 'SUPPORTED';
      isSupported = true;
    } else if (maxScore >= partialThreshold) {
      support_status = 'PARTIALLY_SUPPORTED';
      isSupported = true;
    } else {
      support_status = 'UNSUPPORTED';
      isSupported = false;
    }

    return {
      support_status,
      maxScore: Number(maxScore.toFixed(4)),
      avgScore: Number(avgScore.toFixed(4)),
      relevantCount: retrievedChunks.length,
      isSupported,
    };
  }
}
