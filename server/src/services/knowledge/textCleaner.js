/**
 * textCleaner.js — Cleans and normalizes extracted text before chunking.
 */

export class TextCleaner {
  /**
   * Cleans text:
   * - Normalizes unicode (NFKC)
   * - Replaces tabs and non-breaking spaces with standard space
   * - Strips control characters
   * - Collapses 3+ newlines to 2 newlines (preserves paragraph breaks)
   * - Trims whitespace
   */
  static clean(text) {
    if (!text || typeof text !== 'string') return '';

    return (
      text
        // Unicode normalization
        .normalize('NFKC')
        // Replace non-standard whitespace
        .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
        // Remove null and non-printable control characters (except newline, return, tab)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Replace tabs with 2 spaces
        .replace(/\t/g, '  ')
        // Collapse multiple horizontal spaces
        .replace(/[^\S\r\n]+/g, ' ')
        // Collapse excess vertical whitespace (keep at most 2 newlines)
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }
}
