/**
 * llmProvider.js — Multi-provider AI interface (Google Gemini & Ollama).
 */

import { GeminiClient } from './geminiClient.js';
import { OllamaClient } from './ollamaClient.js';
import { env } from '../../config/env.js';

export class LLMProvider {
  /**
   * Generates text response using configured AI provider (Gemini or Ollama).
   */
  static async generate({
    prompt,
    system = '',
    model = null,
  }) {
    if (env.AI_PROVIDER === 'gemini' || GeminiClient.isConfigured()) {
      return await GeminiClient.generate({
        prompt,
        system,
        model: model || env.GEMINI_MODEL,
      });
    }

    return await OllamaClient.generate({
      prompt,
      system,
      model: model || env.OLLAMA_LLM_MODEL,
    });
  }
}
