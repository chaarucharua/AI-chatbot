/**
 * pagination.js — Pagination helpers for list endpoints.
 */

/**
 * Parse page/limit from query params with safe defaults.
 */
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build the meta object included in paginated responses.
 */
export function buildMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}
