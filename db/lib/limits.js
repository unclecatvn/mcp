const HARD_TIMEOUT_CAP = 600_000;
const HARD_ROWS_CAP = 1_000_000;

/**
 * Conditionally append a row-limit clause to a single SELECT statement.
 *
 * Strategy: fetch maxRows + 1 to detect overflow. The driver layer compares
 * the returned row count against maxRows to set `truncated`.
 *
 * If the query is multi-statement, already has LIMIT/TOP/FETCH, or is not a
 * SELECT, the SQL is returned unchanged and `fetchPlusOne` is false.
 *
 * @param {{primaryType: string, hasLimit: boolean, isMultiStatement: boolean}} analysis
 * @param {string} sql
 * @param {number} maxRows
 * @param {string} dialect  one of "postgresql"|"mysql"|"mariadb"|"sqlserver"
 * @returns {{ sql: string, fetchPlusOne: boolean }}
 */
export function applyRowLimit(analysis, sql, maxRows, dialect) {
  if (analysis.primaryType !== "SELECT" || analysis.hasLimit || analysis.isMultiStatement) {
    return { sql, fetchPlusOne: false };
  }
  const fetch = maxRows + 1;
  let s = sql.trim();
  while (s.endsWith(";")) s = s.slice(0, -1).trimEnd();
  if (dialect === "sqlserver") {
    // Insert TOP after first SELECT keyword. Match the leading SELECT (case-insensitive).
    s = s.replace(/^select\b/i, `SELECT TOP ${fetch}`);
  } else {
    s = `${s} LIMIT ${fetch}`;
  }
  return { sql: s, fetchPlusOne: true };
}

/**
 * Resolve the effective query timeout for a request.
 * Hard cap: 600_000 ms.
 *
 * @param {number|undefined} requestTimeoutMs  override from tool input
 * @param {number} aliasDefault               alias-config timeoutMs
 */
export function resolveTimeout(requestTimeoutMs, aliasDefault) {
  const t = requestTimeoutMs ?? aliasDefault;
  return Math.min(t, HARD_TIMEOUT_CAP);
}

/**
 * Resolve the effective max rows for a request.
 * Picks the smaller of (override, alias). Hard cap: 1_000_000.
 *
 * @param {number|undefined} requestMaxRows
 * @param {number} aliasDefault
 */
export function resolveMaxRows(requestMaxRows, aliasDefault) {
  const r = requestMaxRows !== undefined ? requestMaxRows : aliasDefault;
  return Math.min(r, HARD_ROWS_CAP);
}

export const HARD_TIMEOUT_CAP_EXPORT = HARD_TIMEOUT_CAP;
export const HARD_ROWS_CAP_EXPORT = HARD_ROWS_CAP;
