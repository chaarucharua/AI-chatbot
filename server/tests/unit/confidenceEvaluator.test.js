import { ConfidenceEvaluator } from '../../src/services/rag/confidenceEvaluator.js';

describe('ConfidenceEvaluator', () => {
  test('evaluates high similarity chunk as SUPPORTED', () => {
    const chunks = [{ similarity: 0.85 }, { similarity: 0.72 }];
    const result = ConfidenceEvaluator.evaluate(chunks, 'GENERAL', false);

    expect(result.support_status).toBe('SUPPORTED');
    expect(result.isSupported).toBe(true);
    expect(result.maxScore).toBe(0.85);
  });

  test('evaluates mid similarity chunk as PARTIALLY_SUPPORTED', () => {
    const chunks = [{ similarity: 0.62 }, { similarity: 0.55 }];
    const result = ConfidenceEvaluator.evaluate(chunks, 'GENERAL', false);

    expect(result.support_status).toBe('PARTIALLY_SUPPORTED');
    expect(result.isSupported).toBe(true);
  });

  test('evaluates low similarity or empty chunks as UNSUPPORTED', () => {
    const lowChunks = [{ similarity: 0.25 }];
    const lowResult = ConfidenceEvaluator.evaluate(lowChunks, 'GENERAL', false);
    expect(lowResult.support_status).toBe('UNSUPPORTED');
    expect(lowResult.isSupported).toBe(false);

    const emptyResult = ConfidenceEvaluator.evaluate([], 'GENERAL', false);
    expect(emptyResult.support_status).toBe('UNSUPPORTED');
    expect(emptyResult.isSupported).toBe(false);
  });

  test('evaluates ambiguous flag as AMBIGUOUS', () => {
    const chunks = [{ similarity: 0.90 }];
    const result = ConfidenceEvaluator.evaluate(chunks, 'AMBIGUOUS', true);

    expect(result.support_status).toBe('AMBIGUOUS');
    expect(result.isSupported).toBe(false);
  });
});
