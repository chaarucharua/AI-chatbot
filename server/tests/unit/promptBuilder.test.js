import { PromptBuilder } from '../../src/services/rag/promptBuilder.js';

describe('PromptBuilder', () => {
  test('constructs system prompt with anti-hallucination rules', () => {
    const { system } = PromptBuilder.build({ query: 'Hello' });
    expect(system).toContain('NovaCart');
    expect(system).toContain('Answer questions using ONLY the facts explicitly provided');
    expect(system).toContain('NEVER invent');
  });

  test('formats context chunks with numbered source labels', () => {
    const chunks = [
      {
        document: 'Items can be returned within 30 days.',
        metadata: { title: 'Return Policy', section: 'Eligibility' },
      },
    ];

    const { prompt } = PromptBuilder.build({
      query: 'What is the return window?',
      contextChunks: chunks,
    });

    expect(prompt).toContain('[Source 1: Return Policy - Eligibility]');
    expect(prompt).toContain('Items can be returned within 30 days.');
    expect(prompt).toContain('[USER QUERY]\nWhat is the return window?');
  });

  test('includes conversation history when provided', () => {
    const history = [
      { sender_type: 'CUSTOMER', content: 'Hi there' },
      { sender_type: 'BOT', content: 'Hello! How can I help you?' },
    ];

    const { prompt } = PromptBuilder.build({
      query: 'I need a refund',
      contextChunks: [],
      conversationHistory: history,
    });

    expect(prompt).toContain('[HISTORY]');
    expect(prompt).toContain('CUSTOMER: Hi there');
    expect(prompt).toContain('BOT: Hello! How can I help you?');
  });
});
