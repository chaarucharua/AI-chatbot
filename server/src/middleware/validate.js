/**
 * validate.js — Zod schema validation middleware.
 *
 * Usage:
 *   router.post('/route', validate(myZodSchema), controller)
 *
 * Validates req.body by default. Pass { source: 'params' | 'query' }
 * for other request parts.
 *
 * On failure, throws a ValidationError with field-level detail.
 * Never trusts client-side validation alone.
 */

import { ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'params'|'query'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return next(
        new ValidationError(
          `Validation failed: ${details.map((d) => `${d.field} — ${d.message}`).join('; ')}`,
          details
        )
      );
    }

    // Replace the raw value with the parsed (and possibly coerced) value
    req[source] = result.data;
    next();
  };
}
