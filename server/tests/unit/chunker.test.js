import { SemanticChunker } from '../../src/services/knowledge/chunker.js';

describe('SemanticChunker', () => {
  test('estimates tokens approximately', () => {
    const text = 'Hello world!';
    expect(SemanticChunker.estimateTokens(text)).toBe(3);
  });

  test('chunks text respecting paragraph boundaries and section titles', () => {
    const text = `[Section: Shipping]
NovaCart offers fast shipping within 3-5 days.

Orders are processed Monday through Friday.

[Section: Returns]
You can return items within 30 days for a full refund.`;

    const chunks = SemanticChunker.chunk(text, {
      document_id: 'doc-1',
      title: 'Policies',
      document_type: 'POLICY',
    }, 50, 10);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.document_id).toBe('doc-1');
    expect(chunks[0].content).toContain('NovaCart offers fast shipping');
  });

  test('returns empty array on empty string', () => {
    expect(SemanticChunker.chunk('')).toEqual([]);
    expect(SemanticChunker.chunk('   ')).toEqual([]);
  });
});
