import { ConfigError } from "./errors.js";
import {
  ALIAS_DEFAULTS,
  ENV_ALIAS_RE,
  VALID_MODES,
  VALID_SSL,
  VALID_TYPES,
} from "./aliasConstants.js";
import { normalizeAliasConfig } from "./normalizeAlias.js";

function envFail(alias) {
  return (code, detail = {}) => {
    const upper = alias.toUpperCase();
    switch (code) {
      case "invalid_type":
        throw new ConfigError(`DB_${upper}_TYPE must be one of: ${VALID_TYPES.join(", ")}`, {
          alias,
          field: "type",
          got: detail.got,
        });
      case "invalid_url":
        throw new ConfigError(`DB_${upper}_URL is not a valid URL: ${detail.cause}`, {
          alias,
          field: "url",
        });
      case "missing_host":
        throw new ConfigError(`DB_${upper}_HOST (or _URL) is required`, {
          alias,
          field: "host",
        });
      case "invalid_port":
        throw new ConfigError(`DB_${upper}_PORT must be an integer 1-65535`, {
          alias,
          field: "port",
          got: detail.got,
        });
      case "invalid_mode":
        throw new ConfigError(`DB_${upper}_MODE must be one of: ${VALID_MODES.join(", ")}`, {
          alias,
          field: "mode",
          got: detail.got,
        });
      case "invalid_ssl":
        throw new ConfigError(`DB_${upper}_SSL must be one of: ${VALID_SSL.join(", ")}`, {
          alias,
          field: "ssl",
          got: detail.got,
        });
      case "invalid_timeout_ms":
        throw new ConfigError(`DB_${upper}_TIMEOUT_MS must be a positive integer ≤ ${600_000}`, {
          alias,
          field: "timeoutMs",
          got: detail.got,
        });
      case "invalid_max_rows":
        throw new ConfigError(`DB_${upper}_MAX_ROWS must be a positive integer ≤ ${1_000_000}`, {
          alias,
          field: "maxRows",
          got: detail.got,
        });
      case "invalid_pool_max":
        throw new ConfigError(`DB_${upper}_POOL_MAX must be a positive integer ≤ ${100}`, {
          alias,
          field: "poolMax",
          got: detail.got,
        });
      default:
        throw new ConfigError(`DB_${upper} configuration is invalid`, { alias, code });
    }
  };
}

/**
 * Parse environment variables into per-alias connection configs.
 * Discovery: any env var matching DB_<ALIAS>_TYPE defines an alias.
 * Returns { aliases, errors }; never throws on per-alias failure.
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
    if (!ENV_ALIAS_RE.test(ALIAS)) {
      errors.push({ alias: ALIAS.toLowerCase(), message: `Invalid alias name: ${ALIAS}` });
      continue;
    }
    const raw = readAliasEnv(ALIAS, env);
    try {
      const cfg = validateAliasConfig(ALIAS.toLowerCase(), raw, ALIAS_DEFAULTS);
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

/** @throws ConfigError on invalid input. */
export function validateAliasConfig(alias, raw, defaults = ALIAS_DEFAULTS) {
  return normalizeAliasConfig(alias, raw, { defaults, fail: envFail(alias) });
}

export {
  VALID_TYPES as VALID_TYPES_EXPORT,
  VALID_MODES as VALID_MODES_EXPORT,
  VALID_SSL as VALID_SSL_EXPORT,
  DEFAULT_PORTS as DEFAULT_PORTS_EXPORT,
} from "./aliasConstants.js";
