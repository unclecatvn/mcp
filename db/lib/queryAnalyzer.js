/**
 * Query analyzer.
 *
 * Public:
 *   analyzeQuery(sql) -> {
 *     statements: Array<{ type: string, raw: string }>,
 *     primaryType: string,    // strictest mode required
 *     hasLimit: boolean,
 *     isMultiStatement: boolean,
 *   }
 *
 * The classifier uses leading-keyword detection on each statement after
 * stripping comments and string literals. CTE prefixes (WITH ...) are
 * unwrapped to find the actual operation.
 */

const STATEMENT_RANK = {
  SELECT: 1,
  EXPLAIN: 1,
  DESCRIBE: 1,
  SHOW: 1,
  USE: 1,
  INSERT: 2,
  UPDATE: 2,
  DELETE: 2,
  MERGE: 2,
  CREATE: 3,
  DROP: 3,
  TRUNCATE: 3,
  ALTER: 3,
  RENAME: 3,
  GRANT: 3,
  REVOKE: 3,
  UNKNOWN: 3, // conservative: unknown requires the strictest mode
};

const KEYWORD_RE = /^(SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|TRUNCATE|ALTER|RENAME|GRANT|REVOKE|EXPLAIN|DESCRIBE|DESC|SHOW|USE|WITH)\b/i;

const LIMIT_RE = /\b(LIMIT\s+\d+|TOP\s*\(?\s*\d+|FETCH\s+(FIRST|NEXT)\s+\d+\s+ROWS?)\b/i;

/**
 * Strip block comments and line comments and contents of '...' / "..." string literals,
 * preserving the SQL structure for keyword matching.
 */
function stripCommentsAndStrings(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (c === "-" && c2 === "-") {
      while (i < n && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      out += " ";
      i++;
      while (i < n) {
        if (sql[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function splitStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function classifyStatement(stmt) {
  let s = stmt;
  // Unwrap leading WITH ... <main verb>: scan for first non-WITH/SELECT keyword
  // pattern after CTE close. Easiest: drop leading "WITH ... )" segments.
  while (/^WITH\b/i.test(s)) {
    // find balanced parens after WITH alias AS (...)
    const asMatch = s.match(/\bAS\s*\(/i);
    if (!asMatch) break;
    let depth = 0;
    let i = s.indexOf("(", asMatch.index);
    if (i === -1) break;
    for (; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    let rest = s.slice(i).replace(/^[\s,]+/, "");
    if (/^,/.test(rest)) {
      // another CTE follows; loop continues stripping
      s = `WITH ${rest.replace(/^,\s*/, "")}`;
      continue;
    }
    s = rest;
    break;
  }
  const m = s.match(KEYWORD_RE);
  if (!m) return "UNKNOWN";
  const kw = m[1].toUpperCase();
  if (kw === "DESC") return "DESCRIBE";
  if (kw === "WITH") return "UNKNOWN"; // unwrap failed
  return kw;
}

export function analyzeQuery(sql) {
  if (typeof sql !== "string" || sql.trim() === "") {
    return { statements: [], primaryType: "UNKNOWN", hasLimit: false, isMultiStatement: false };
  }
  const cleaned = stripCommentsAndStrings(sql);
  const parts = splitStatements(cleaned);
  const statements = parts.map((p) => ({ type: classifyStatement(p), raw: p }));

  let primaryType = "SELECT";
  let primaryRank = 0;
  for (const s of statements) {
    const r = STATEMENT_RANK[s.type] ?? 3;
    if (r > primaryRank) {
      primaryRank = r;
      primaryType = s.type;
    }
  }
  if (statements.length === 0) primaryType = "UNKNOWN";

  const hasLimit = LIMIT_RE.test(cleaned);

  return {
    statements,
    primaryType,
    hasLimit,
    isMultiStatement: statements.length > 1,
  };
}

export const STATEMENT_RANK_EXPORT = STATEMENT_RANK;
