export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;

/**
 * @param {{ limit?: number, offset?: number }} [opts]
 */
export function resolveListPaging(opts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);
  return { limit, offset, fetchLimit: limit + 1 };
}

/**
 * @param {Array<{ name: string, schema?: string }>} rows
 * @param {{ limit: number, offset: number }} paging
 */
export function buildPageResponse(rows, paging) {
  const hasMore = rows.length > paging.limit;
  return {
    tables: hasMore ? rows.slice(0, paging.limit) : rows,
    limit: paging.limit,
    offset: paging.offset,
    hasMore,
  };
}
