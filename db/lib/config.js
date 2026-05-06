import { ConfigError } from "./errors.js";

const VALID_TYPES = ["mysql", "mariadb", "postgresql", "sqlserver"];
const VALID_MODES = ["readonly", "readwrite", "readwrite+ddl"];
const VALID_SSL = ["disable", "prefer", "require", "verify"];

const DEFAULTS = {
  mode: "readonly",
  ssl: "prefer",
  timeoutMs: 30000,
  maxRows: 10000,
  poolMax: 5,
};

const DEFAULT_PORTS = {
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  sqlserver: 1433,
};

const HARD_CAPS = {
  timeoutMs: 600_000,
  maxRows: 1_000_000,
  poolMax: 100,
};

const ALIAS_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Parse environment variables into per-alias connection configs.
 * Discovery: any env var matching DB_<ALIAS>_TYPE defines an alias.
 * Returns { aliases, errors }; never throws on per-alias failure.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string>} env
 * @returns {{ aliases: Record<string, object>, errors: Array<{ alias: string, message: string }> }}
 */
export function parseEnv(env) {
  const aliases = {};
  const errors = [];
  const aliasNames = new Set();

  for (const key of Object.keys(env)) {
    const m = key.match(/^DB_([A-Z][A-Z0-9_]*)_TYPE$/);
    if (m) aliasNames.add(m[1]);
  }

  for (const ALIAS of aliasNames) {
    if (!ALIAS_RE.test(ALIAS)) {
      errors.push({ alias: ALIAS.toLowerCase(), message: `Invalid alias name: ${ALIAS}` });
      continue;
    }
    const raw = readAliasEnv(ALIAS, env);
    try {
      const cfg = validateAliasConfig(ALIAS.toLowerCase(), raw, DEFAULTS);
      aliases[ALIAS.toLowerCase()] = cfg;
    } catch (err) {
      errors.push({ alias: ALIAS.toLowerCase(), message: err.message });
    }
  }

  return { aliases, errors };
}

function readAliasEnv(ALIAS, env) {
  const get = (suffix) => env[`DB_${ALIAS}_${suffix}`];
  return {
    type: get("TYPE"),
    url: get("URL"),
    host: get("HOST"),
    port: get("PORT"),
    user: get("USER"),
    password: get("PASSWORD"),
    database: get("DATABASE"),
    mode: get("MODE"),
    ssl: get("SSL"),
    caCert: get("CA_CERT"),
    timeoutMs: get("TIMEOUT_MS"),
    maxRows: get("MAX_ROWS"),
    poolMax: get("POOL_MAX"),
  };
}

/**
 * Validate and normalize a single alias config.
 * @throws ConfigError on invalid input.
 * @returns A normalized config object.
 */
export function validateAliasConfig(alias, raw, defaults = DEFAULTS) {
  if (!raw.type || !VALID_TYPES.includes(raw.type)) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_TYPE must be one of: ${VALID_TYPES.join(", ")}`,
      { alias, field: "type", got: raw.type }
    );
  }

  let host = raw.host;
  let port = raw.port ? Number(raw.port) : undefined;
  let user = raw.user;
  let password = raw.password;
  let database = raw.database;

  if (raw.url) {
    try {
      const u = new URL(raw.url);
      host ??= u.hostname;
      port ??= u.port ? Number(u.port) : undefined;
      user ??= u.username ? decodeURIComponent(u.username) : undefined;
      password ??= u.password ? decodeURIComponent(u.password) : undefined;
      database ??= u.pathname ? u.pathname.slice(1) : undefined;
    } catch (err) {
      throw new ConfigError(`DB_${alias.toUpperCase()}_URL is not a valid URL: ${err.message}`, {
        alias,
        field: "url",
      });
    }
  }

  if (!host) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_HOST (or _URL) is required`,
      { alias, field: "host" }
    );
  }
  port ??= DEFAULT_PORTS[raw.type];
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`DB_${alias.toUpperCase()}_PORT must be an integer 1-65535`, {
      alias,
      field: "port",
      got: port,
    });
  }

  const mode = raw.mode ?? defaults.mode ?? DEFAULTS.mode;
  if (!VALID_MODES.includes(mode)) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_MODE must be one of: ${VALID_MODES.join(", ")}`,
      { alias, field: "mode", got: mode }
    );
  }

  const ssl = raw.ssl ?? defaults.ssl ?? DEFAULTS.ssl;
  if (!VALID_SSL.includes(ssl)) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_SSL must be one of: ${VALID_SSL.join(", ")}`,
      { alias, field: "ssl", got: ssl }
    );
  }

  const timeoutMs = raw.timeoutMs ? Number(raw.timeoutMs) : (defaults.timeoutMs ?? DEFAULTS.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > HARD_CAPS.timeoutMs) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_TIMEOUT_MS must be a positive integer ≤ ${HARD_CAPS.timeoutMs}`,
      { alias, field: "timeoutMs", got: timeoutMs }
    );
  }

  const maxRows = raw.maxRows ? Number(raw.maxRows) : (defaults.maxRows ?? DEFAULTS.maxRows);
  if (!Number.isFinite(maxRows) || maxRows <= 0 || maxRows > HARD_CAPS.maxRows) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_MAX_ROWS must be a positive integer ≤ ${HARD_CAPS.maxRows}`,
      { alias, field: "maxRows", got: maxRows }
    );
  }

  const poolMax = raw.poolMax ? Number(raw.poolMax) : (defaults.poolMax ?? DEFAULTS.poolMax);
  if (!Number.isFinite(poolMax) || poolMax <= 0 || poolMax > HARD_CAPS.poolMax) {
    throw new ConfigError(
      `DB_${alias.toUpperCase()}_POOL_MAX must be a positive integer ≤ ${HARD_CAPS.poolMax}`,
      { alias, field: "poolMax", got: poolMax }
    );
  }

  return {
    alias,
    type: raw.type,
    host,
    port,
    user,
    password,
    database,
    mode,
    ssl,
    caCert: raw.caCert,
    timeoutMs,
    maxRows,
    poolMax,
  };
}

export const VALID_TYPES_EXPORT = VALID_TYPES;
export const VALID_MODES_EXPORT = VALID_MODES;
export const VALID_SSL_EXPORT = VALID_SSL;
export const DEFAULT_PORTS_EXPORT = DEFAULT_PORTS;
