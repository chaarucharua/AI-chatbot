import { TextCleaner } from '../../src/services/knowledge/textCleaner.js';

describe('TextCleaner', () => {
  test('normalizes unicode and removes control characters', () => {
    const raw = 'Hello\x00 World\x1F!  This is a   test.';
    const cleaned = TextCleaner.clean(raw);
    expect(cleaned).toBe('Hello World! This is a test.');
  });

  test('collapses excessive vertical newlines', () => {
    const raw = 'Paragraph 1\n\n\n\n\nParagraph 2';
    const cleaned = TextCleaner.clean(raw);
    expect(cleaned).toBe('Paragraph 1\n\nParagraph 2');
  });

  test('handles empty or non-string input safely', () => {
    expect(TextCleaner.clean('')).toBe('');
    expect(TextCleaner.clean(null)).toBe('');
    expect(TextCleaner.clean(undefined)).toBe('');
  });
});
