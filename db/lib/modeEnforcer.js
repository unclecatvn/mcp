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

function modeFixHint(alias, required, configSource) {
  if (configSource === "config_file") {
    return `To allow: set "aliases.${alias}.mode": "${required}" in your MCP_DB_CONFIG file.`;
  }
  return `To allow: set DB_${alias.toUpperCase()}_MODE=${required} in environment.`;
}

/**
 * @param {{ primaryType: string, isMultiStatement: boolean, statements: Array<{type:string, effectiveType?:string}> }} analysis
 * @param {"readonly"|"readwrite"|"readwrite+ddl"} aliasMode
 * @param {string} alias
 * @param {{ configSource?: "config_file"|"env" }} [opts]
 * @throws PermissionDeniedError if any statement requires a stricter mode than aliasMode.
 */
export function enforceMode(analysis, aliasMode, alias, opts = {}) {
  const configSource = opts.configSource ?? "env";
  const aliasRank = MODE_RANK[aliasMode];
  if (aliasRank === undefined) {
    throw new PermissionDeniedError(
      `Internal error: invalid alias mode '${aliasMode}' for alias '${alias}'.`,
      { alias, currentMode: aliasMode },
    );
  }
  for (const stmt of analysis.statements) {
    // Gate on the effective (unwrapped) operation: `EXPLAIN ANALYZE <write>`
    // executes the write on PostgreSQL, so its surface type "EXPLAIN" must not
    // be trusted. Falls back to `type` for callers that predate effectiveType.
    const opType = stmt.effectiveType ?? stmt.type;
    const required = OP_REQUIRED_MODE[opType] ?? "readwrite+ddl";
    const requiredRank = MODE_RANK[required];
    const isUnknown = !(opType in OP_REQUIRED_MODE);
    if (requiredRank > aliasRank || isUnknown) {
      const opName = opType === "UNKNOWN" ? "UNKNOWN-OPERATION" : opType;
      throw new PermissionDeniedError(
        `Database '${alias}' is in ${aliasMode} mode. Operation '${opName}' requires '${required}' mode. ${modeFixHint(alias, required, configSource)}`,
        {
          alias,
          operation: opType,
          currentMode: aliasMode,
          requiredMode: required,
        },
      );
    }
  }
}
