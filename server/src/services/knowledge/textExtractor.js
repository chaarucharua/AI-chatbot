/**
 * textExtractor.js — Multi-format document text extraction.
 *
 * Supported formats:
 *   - .txt  (Plain text)
 *   - .md   (Markdown with preserved headers)
 *   - .pdf  (PDF via pdf-parse)
 *   - .json (Structured FAQs / key-value content)
 */

import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { UnsupportedFileTypeError } from '../../utils/errors.js';

export class TextExtractor {
  /**
   * Extracts clean text from file buffer or path.
   *
   * @param {string} filePath
   * @param {string} mimeType
   */
  static async extract(filePath, mimeType = '') {
    const ext = path.extname(filePath).toLowerCase();
    const buffer = await fs.readFile(filePath);

    switch (ext) {
      case '.txt':
        return buffer.toString('utf-8');

      case '.md':
      case '.markdown':
        return this.extractMarkdown(buffer.toString('utf-8'));

      case '.pdf':
        return await this.extractPdf(buffer);

      case '.json':
        return this.extractJson(buffer.toString('utf-8'));

      default:
        throw new UnsupportedFileTypeError(['.txt', '.md', '.pdf', '.json']);
    }
  }

  /**
   * Cleans Markdown while preserving headings as section indicators.
   */
  static extractMarkdown(content) {
    return content
      // Normalize headers: replace # H1 with [Section: H1]
      .replace(/^#{1,6}\s+(.*)$/gm, '\n[Section: $1]\n')
      // Remove inline links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove bold/italics
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      // Remove image tags
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  }

  /**
   * Extracts text from PDF buffer.
   */
  static async extractPdf(buffer) {
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  /**
   * Formats structured JSON (e.g. array of FAQs or key-value entries).
   */
  static extractJson(content) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data
          .map((item, idx) => {
            if (item.question && item.answer) {
              return `[FAQ Item ${idx + 1}]\nQuestion: ${item.question}\nAnswer: ${item.answer}\nCategory: ${item.category || 'General'}`;
            }
            return JSON.stringify(item, null, 2);
          })
          .join('\n\n');
      }

      // Single object
      return Object.entries(data)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n\n');
    } catch {
      return content;
    }
  }
}
