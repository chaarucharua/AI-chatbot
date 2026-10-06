/**
 * chunker.js — Semantic paragraph-aware document chunking.
 *
 * Chunks documents respecting paragraph boundaries and section headers,
 * maintaining configurable token size and overlap.
 */

import { env } from '../../config/env.js';

export class SemanticChunker {
  /**
   * Approximate token count (roughly 4 characters per token for English).
   */
  static estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Splits cleaned text into semantic chunks with overlap.
   *
   * @param {string} text             - Cleaned text content
   * @param {object} docMetadata      - Metadata for all chunks in doc
   * @param {number} [targetTokens]   - Target tokens per chunk
   * @param {number} [overlapTokens]  - Overlap tokens between chunks
   */
  static chunk(
    text,
    docMetadata = {},
    targetTokens = env.CHUNK_SIZE,
    overlapTokens = env.CHUNK_OVERLAP
  ) {
    if (!text || text.trim().length === 0) return [];

    const targetChars = targetTokens * 4;
    const overlapChars = overlapTokens * 4;

    // Split on paragraph boundaries first
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

    const chunks = [];
    let currentChunk = '';
    let currentSection = docMetadata.title || 'General';

    for (const paragraph of paragraphs) {
      // Check if paragraph denotes a new section
      const sectionMatch = paragraph.match(/\[Section:\s*([^\]]+)\]/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
      }

      if ((currentChunk + '\n\n' + paragraph).length <= targetChars) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      } else {
        if (currentChunk.trim().length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            section: currentSection,
          });

          // Compute overlap
          const overlapSlice = currentChunk.slice(-overlapChars);
          currentChunk = overlapSlice ? overlapSlice + '\n\n' + paragraph : paragraph;
        } else {
          // If a single paragraph is longer than targetChars, split by sentence
          const sentences = paragraph.split(/(?<=[.?!])\s+/);
          let sentenceChunk = '';

          for (const s of sentences) {
            if ((sentenceChunk + ' ' + s).length <= targetChars) {
              sentenceChunk = sentenceChunk ? sentenceChunk + ' ' + s : s;
            } else {
              if (sentenceChunk.trim()) {
                chunks.push({ content: sentenceChunk.trim(), section: currentSection });
              }
              sentenceChunk = s;
            }
          }
          if (sentenceChunk.trim()) {
            currentChunk = sentenceChunk.trim();
          }
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        section: currentSection,
      });
    }

    // Format final chunk records
    return chunks.map((item, index) => {
      const tokenCount = this.estimateTokens(item.content);
      return {
        chunk_index: index,
        content: item.content,
        token_count: tokenCount,
        metadata: {
          document_id: docMetadata.document_id || '',
          title: docMetadata.title || '',
          document_type: docMetadata.document_type || 'GENERAL',
          section: item.section,
          chunk_index: index,
          total_chunks: chunks.length,
        },
      };
    });
  }
}
