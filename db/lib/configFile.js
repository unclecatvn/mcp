import { readFileSync } from "node:fs";
import { z } from "zod";
import { ConfigError } from "./errors.js";

const VALID_TYPES = ["mysql", "mariadb", "postgresql", "sqlserver"];
const VALID_MODES = ["readonly", "readwrite", "readwrite+ddl"];
const VALID_SSL = ["disable", "prefer", "require", "verify"];
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"];

const ALIAS_KEY_RE = /^[a-z][a-z0-9_]*$/;
const DEFAULT_PORTS = { postgresql: 5432, mysql: 3306, mariadb: 3306, sqlserver: 1433 };
const DEFAULTS = { mode: "readonly", ssl: "prefer", timeoutMs: 30000, maxRows: 10000, poolMax: 5 };

const AliasSchema = z
  .object({
    type: z.enum(VALID_TYPES),
    url: z.string().min(1).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    database: z.string().optional(),
    mode: z.enum(VALID_MODES).optional(),
    ssl: z.enum(VALID_SSL).optional(),
    caCert: z.string().optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    maxRows: z.number().int().positive().max(1_000_000).optional(),
    poolMax: z.number().int().positive().max(100).optional(),
    displayName: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    tablesHint: z.array(z.string().min(1).max(128)).max(50).optional(),
  })
  .strict();

// Root is .passthrough() so unknown top-level keys (e.g. future fields,
// $schema in older versions) don't break older loaders — forward-compat.
// Alias schema above stays .strict() so typos like `tablehint` get flagged.
const RootSchema = z
  .object({
    $schema: z.string().optional(),
    logLevel: z.enum(VALID_LOG_LEVELS).optional(),
    defaultAlias: z.string().optional(),
    aliases: z.record(z.string(), z.unknown()),
  })
  .passthrough();

/**
 * Parse a JSON config string. Returns the same shape as parseEnv plus
 * optional defaultAlias and logLevel. Per-alias failures are skipped and
 * reported via `errors` (mirror of env loader behavior).
 */
export function parseConfigJson(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new ConfigError(`Config file is not valid JSON: ${err.message}`, {
      field: "(root)",
    });
  }

  const rootResult = RootSchema.safeParse(parsed);
  if (!rootResult.success) {
    const issues = rootResult.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`Config schema error: ${issues}`, { issues });
  }

  const root = rootResult.data;
  const aliases = {};
  const errors = [];

  for (const [aliasKey, rawAlias] of Object.entries(root.aliases)) {
    if (!ALIAS_KEY_RE.test(aliasKey)) {
      errors.push({
        alias: aliasKey,
        message: `alias key '${aliasKey}' must match ^[a-z][a-z0-9_]*$`,
      });
      continue;
    }
    const aliasResult = AliasSchema.safeParse(rawAlias);
    if (!aliasResult.success) {
      const msg = aliasResult.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      errors.push({ alias: aliasKey, message: msg });
      continue;
    }
    try {
      aliases[aliasKey] = normalizeAlias(aliasKey, aliasResult.data);
    } catch (err) {
      errors.push({ alias: aliasKey, message: err.message });
    }
  }

  let defaultAlias = root.defaultAlias;
  if (defaultAlias !== undefined && !Object.prototype.hasOwnProperty.call(aliases, defaultAlias)) {
    errors.push({
      alias: "(root)",
      message: `defaultAlias '${defaultAlias}' does not reference a loaded alias`,
    });
    defaultAlias = undefined;
  }

  return { aliases, errors, defaultAlias, logLevel: root.logLevel };
}

function normalizeAlias(alias, raw) {
  let { host, port, user, password, database } = raw;
  if (raw.url) {
    try {
      const u = new URL(raw.url);
      host ??= u.hostname;
      port ??= u.port ? Number(u.port) : undefined;
      user ??= u.username ? decodeURIComponent(u.username) : undefined;
      password ??= u.password ? decodeURIComponent(u.password) : undefined;
      database ??= u.pathname ? u.pathname.slice(1) || undefined : undefined;
    } catch (err) {
      throw new Error(`url: not a valid URL (${err.message})`);
    }
  }
  if (!host) throw new Error("host: required (set directly or via url)");
  port ??= DEFAULT_PORTS[raw.type];

  return {
    alias,
    type: raw.type,
    host,
    port,
    user,
    password,
    database,
    mode: raw.mode ?? DEFAULTS.mode,
    ssl: raw.ssl ?? DEFAULTS.ssl,
    caCert: raw.caCert,
    timeoutMs: raw.timeoutMs ?? DEFAULTS.timeoutMs,
    maxRows: raw.maxRows ?? DEFAULTS.maxRows,
    poolMax: raw.poolMax ?? DEFAULTS.poolMax,
    ...(raw.displayName !== undefined && { displayName: raw.displayName }),
    ...(raw.description !== undefined && { description: raw.description }),
    ...(raw.tablesHint !== undefined && { tablesHint: raw.tablesHint }),
  };
}

/**
 * IO wrapper — read file from disk then parse.
 * @throws ConfigError on missing file or invalid content.
 */
export function parseConfigFile(filePath) {
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new ConfigError(`Config file not readable at '${filePath}': ${err.message}`, {
      field: "(root)",
      path: filePath,
    });
  }
  return parseConfigJson(contents);
}
