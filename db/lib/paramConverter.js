import { ValidationError } from "./errors.js";

/**
 * Convert unified placeholders (? positional, :name named) into the
 * dialect-native form. Supports MySQL/MariaDB (?), PostgreSQL ($N),
 * SQL Server (@name / @pN).
 *
 * Skips placeholders inside SQL string literals, line comments, and block
 * comments. Recognizes the PostgreSQL `::` cast operator and does not match
 * it as a named placeholder.
 *
 * Validates: placeholder count must match params length (positional);
 * every :name must have a key in record params (named).
 *
 * @param {string} sql
 * @param {Array<unknown> | Record<string, unknown> | undefined} params
 * @param {"mysql"|"mariadb"|"postgresql"|"sqlserver"} dialect
 * @returns {{ sql: string, params: Array<unknown> | Record<string, unknown> }}
 */
export function convertParams(sql, params, dialect) {
  const isNamed = params && !Array.isArray(params) && typeof params === "object";
  const isPositional = Array.isArray(params);

  // Walk the SQL with a tiny state machine.
  let out = "";
  let i = 0;
  const n = sql.length;
  let posIndex = 0;
  const collectedNames = []; // ordered unique names for positional dialects
  const nameIndexMap = new Map(); // name -> 1-based index
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  function emitForPositional() {
    posIndex++;
    if (dialect === "postgresql") return `$${posIndex}`;
    if (dialect === "sqlserver") return `@p${posIndex}`;
    return "?"; // mysql/mariadb
  }

  function emitForNamed(name) {
    if (!nameIndexMap.has(name)) {
      nameIndexMap.set(name, nameIndexMap.size + 1);
      collectedNames.push(name);
    }
    if (dialect === "postgresql") return `$${nameIndexMap.get(name)}`;
    if (dialect === "sqlserver") return `@${name}`;
    return "?"; // mysql/mariadb: emit ? and let the post-pass reorder
  }

  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];

    if (inLineComment) {
      out += c;
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      out += c;
      if (c === "*" && c2 === "/") {
        out += c2;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      out += c;
      if (c === "\\" && i + 1 < n) {
        out += c2;
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      out += c;
      if (c === "\\" && i + 1 < n) {
        out += c2;
        i += 2;
        continue;
      }
      if (c === '"') inDouble = false;
      i++;
      continue;
    }

    if (c === "-" && c2 === "-") {
      inLineComment = true;
      out += c + c2;
      i += 2;
      continue;
    }
    if (c === "/" && c2 === "*") {
      inBlockComment = true;
      out += c + c2;
      i += 2;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      out += c;
      i++;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      out += c;
      i++;
      continue;
    }
    if (c === ":" && c2 === ":") {
      // PostgreSQL cast operator
      out += "::";
      i += 2;
      continue;
    }
    if (c === "?") {
      if (!isPositional) {
        throw new ValidationError(
          "SQL contains positional ? placeholders but params is not an array."
        );
      }
      out += emitForPositional();
      i++;
      continue;
    }
    if (c === ":") {
      const m = sql.slice(i).match(/^:([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) {
        if (!isNamed) {
          throw new ValidationError(
            `SQL contains named placeholder :${m[1]} but params is not an object.`
          );
        }
        if (!Object.prototype.hasOwnProperty.call(params, m[1])) {
          throw new ValidationError(
            `SQL references named placeholder :${m[1]} but params has no key '${m[1]}'.`
          );
        }
        out += emitForNamed(m[1]);
        i += m[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }

  if (isPositional) {
    if (params.length !== posIndex) {
      throw new ValidationError(
        `Param count mismatch: SQL has ${posIndex} positional placeholders but params has ${params.length}.`
      );
    }
    if (dialect === "sqlserver") {
      const obj = {};
      for (let k = 0; k < params.length; k++) obj[`p${k + 1}`] = params[k];
      return { sql: out, params: obj };
    }
    return { sql: out, params };
  }

  if (isNamed) {
    if (dialect === "sqlserver") {
      // Native @name; pass-through the original record (only keys actually used)
      const used = {};
      for (const name of collectedNames) used[name] = params[name];
      return { sql: out, params: used };
    }
    if (dialect === "postgresql") {
      // Build positional array in encounter order
      const arr = collectedNames.map((n2) => params[n2]);
      return { sql: out, params: arr };
    }
    // mysql/mariadb: emit values in the order the placeholders appear in SQL
    const arr = [];
    let scanIdx = 0;
    let inS = false,
      inD = false,
      inLC = false,
      inBC = false;
    for (let k = 0; k < sql.length; k++) {
      const ch = sql[k];
      const ch2 = sql[k + 1];
      if (inLC) {
        if (ch === "\n") inLC = false;
        continue;
      }
      if (inBC) {
        if (ch === "*" && ch2 === "/") {
          inBC = false;
          k++;
        }
        continue;
      }
      if (inS) {
        if (ch === "\\" && k + 1 < sql.length) {
          k++;
          continue;
        }
        if (ch === "'") inS = false;
        continue;
      }
      if (inD) {
        if (ch === "\\" && k + 1 < sql.length) {
          k++;
          continue;
        }
        if (ch === '"') inD = false;
        continue;
      }
      if (ch === "-" && ch2 === "-") {
        inLC = true;
        k++;
        continue;
      }
      if (ch === "/" && ch2 === "*") {
        inBC = true;
        k++;
        continue;
      }
      if (ch === "'") {
        inS = true;
        continue;
      }
      if (ch === '"') {
        inD = true;
        continue;
      }
      if (ch === ":" && ch2 === ":") {
        k++;
        continue;
      }
      if (ch === ":") {
        const m = sql.slice(k).match(/^:([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) {
          arr.push(params[m[1]]);
          k += m[0].length - 1;
        }
      }
    }
    void scanIdx;
    return { sql: out, params: arr };
  }

  // No params provided
  if (posIndex > 0) {
    throw new ValidationError(
      `SQL has ${posIndex} positional placeholders but no params were provided.`
    );
  }
  return { sql: out, params: [] };
}
