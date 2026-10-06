/**
 * queryClassifier.js — Uses LLM with strict JSON validation to classify queries.
 */

import { z } from 'zod';
import { LLMProvider } from './llmProvider.js';
import { logger } from '../../config/logger.js';

const VALID_CATEGORIES = [
  'FAQ',
  'PRODUCT_INFORMATION',
  'ACCOUNT_HELP',
  'BILLING',
  'REFUND',
  'TECHNICAL_SUPPORT',
  'ORDER_SUPPORT',
  'POLICY',
  'GENERAL',
  'AMBIGUOUS',
  'UNSUPPORTED',
];

const classificationSchema = z.object({
  category: z.string().transform((val) => {
    const upper = val.toUpperCase().trim();
    return VALID_CATEGORIES.includes(upper) ? upper : 'GENERAL';
  }),
  intent: z.string().default('Customer inquiry'),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().nullable().default(null),
});

export class QueryClassifier {
  /**
   * Classify user query intent and category.
   */
  static async classify(userMessage, conversationHistory = []) {
    const historyText = conversationHistory
      .slice(-2)
      .map((m) => `${m.sender_type}: ${m.content}`)
      .join('\n');

    const prompt = `Classify the following customer support query.
Return ONLY valid JSON matching this schema exactly. No extra text, markdown formatting, or preamble.

Schema: {"category": string, "intent": string, "needs_clarification": boolean, "clarification_question": string|null}

Valid categories: ${VALID_CATEGORIES.join(', ')}

Query: "${userMessage.replace(/"/g, '\\"')}"
Conversation so far: "${historyText.replace(/"/g, '\\"')}"`;

    try {
      const { response } = await LLMProvider.generate({
        prompt,
        system: 'You are a query classification engine. Output only strictly valid JSON.',
      });

      // Strip markdown code fences if present (e.g. ```json ... ```)
      const cleaned = response
        .replace(/^```(?:json)?/im, '')
        .replace(/```$/im, '')
        .trim();

      const parsedJson = JSON.parse(cleaned);
      const validated = classificationSchema.parse(parsedJson);
      return validated;
    } catch (err) {
      logger.warn('Query classification parsing failed, using fallback heuristic', {
        error: err.message,
      });

      // Fallback heuristics
      const lower = userMessage.toLowerCase();
      let category = 'GENERAL';
      let intent = 'Customer question';

      if (/refund|return|money back|exchange/i.test(lower)) {
        category = 'REFUND';
        intent = 'Return or refund inquiry';
      } else if (/order|ship|track|delivery|where is/i.test(lower)) {
        category = 'ORDER_SUPPORT';
        intent = 'Order status or shipping';
      } else if (/password|login|account|profile/i.test(lower)) {
        category = 'ACCOUNT_HELP';
        intent = 'Account support';
      } else if (/pay|invoice|card|billing|charge|checkout/i.test(lower)) {
        category = 'BILLING';
        intent = 'Billing & payment inquiry';
      } else if (/warranty|guarantee|policy|terms/i.test(lower)) {
        category = 'POLICY';
        intent = 'Policy inquiry';
      }

      return {
        category,
        intent,
        needs_clarification: false,
        clarification_question: null,
      };
    }
  }
}
