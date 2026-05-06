import { PermissionDeniedError } from "./errors.js";

const MODE_RANK = {
  readonly: 1,
  readwrite: 2,
  "readwrite+ddl": 3,
};

const OP_REQUIRED_MODE = {
  SELECT: "readonly",
  EXPLAIN: "readonly",
  DESCRIBE: "readonly",
  SHOW: "readonly",
  USE: "readonly",
  INSERT: "readwrite",
  UPDATE: "readwrite",
  DELETE: "readwrite",
  MERGE: "readwrite",
  CREATE: "readwrite+ddl",
  DROP: "readwrite+ddl",
  TRUNCATE: "readwrite+ddl",
  ALTER: "readwrite+ddl",
  RENAME: "readwrite+ddl",
  GRANT: "readwrite+ddl",
  REVOKE: "readwrite+ddl",
  // UNKNOWN intentionally not in this map → conservative: requires +ddl
};

/**
 * @param {{ primaryType: string, isMultiStatement: boolean, statements: Array<{type:string}> }} analysis
 * @param {"readonly"|"readwrite"|"readwrite+ddl"} aliasMode
 * @param {string} alias
 * @throws PermissionDeniedError if any statement requires a stricter mode than aliasMode.
 */
export function enforceMode(analysis, aliasMode, alias) {
  const aliasRank = MODE_RANK[aliasMode];
  if (aliasRank === undefined) {
    throw new PermissionDeniedError(
      `Internal error: invalid alias mode '${aliasMode}' for alias '${alias}'.`,
      { alias, currentMode: aliasMode },
    );
  }
  for (const stmt of analysis.statements) {
    const required = OP_REQUIRED_MODE[stmt.type] ?? "readwrite+ddl";
    const requiredRank = MODE_RANK[required];
    const isUnknown = !(stmt.type in OP_REQUIRED_MODE);
    if (requiredRank > aliasRank || isUnknown) {
      const opName = stmt.type === "UNKNOWN" ? "UNKNOWN-OPERATION" : stmt.type;
      throw new PermissionDeniedError(
        `Database '${alias}' is in ${aliasMode} mode. Operation '${opName}' requires '${required}' mode. To allow: set DB_${alias.toUpperCase()}_MODE=${required} in environment.`,
        {
          alias,
          operation: stmt.type,
          currentMode: aliasMode,
          requiredMode: required,
        },
      );
    }
  }
}
