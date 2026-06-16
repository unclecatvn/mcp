import {
  ALIAS_DEFAULTS,
  DEFAULT_PORTS,
  HARD_CAPS,
  VALID_MODES,
  VALID_SSL,
  VALID_TYPES,
} from "./aliasConstants.js";

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return Number(value);
}

function mergeUrl(raw, fail) {
  let { host, port, user, password, database } = raw;
  if (!raw.url) {
    return { host, port, user, password, database };
  }
  try {
    const u = new URL(raw.url);
    host ??= u.hostname;
    port ??= u.port ? Number(u.port) : undefined;
    user ??= u.username ? decodeURIComponent(u.username) : undefined;
    password ??= u.password ? decodeURIComponent(u.password) : undefined;
    database ??= u.pathname ? u.pathname.slice(1) || undefined : undefined;
    return { host, port, user, password, database };
  } catch (err) {
    fail("invalid_url", { cause: err.message });
  }
}

function pickMetadata(raw) {
  const metadata = {};
  if (raw.displayName !== undefined) metadata.displayName = raw.displayName;
  if (raw.description !== undefined) metadata.description = raw.description;
  if (raw.tablesHint !== undefined) metadata.tablesHint = raw.tablesHint;
  if (raw.defaultSchema !== undefined) metadata.defaultSchema = raw.defaultSchema;
  return metadata;
}

/**
 * @param {string} alias
 * @param {object} raw
 * @param {object} opts
 * @param {object} [opts.defaults]
 * @param {(code: string, detail?: object) => never} opts.fail
 */
export function normalizeAliasConfig(alias, raw, { defaults = ALIAS_DEFAULTS, fail }) {
  if (!raw.type || !VALID_TYPES.includes(raw.type)) {
    fail("invalid_type", { got: raw.type });
  }

  const merged = mergeUrl(raw, fail);
  const { host, user, password, database } = merged;
  let { port } = merged;

  if (!host) {
    fail("missing_host");
  }

  port = toNumber(port, DEFAULT_PORTS[raw.type]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("invalid_port", { got: port });
  }

  const mode = raw.mode ?? defaults.mode ?? ALIAS_DEFAULTS.mode;
  if (!VALID_MODES.includes(mode)) {
    fail("invalid_mode", { got: mode });
  }

  const ssl = raw.ssl ?? defaults.ssl ?? ALIAS_DEFAULTS.ssl;
  if (!VALID_SSL.includes(ssl)) {
    fail("invalid_ssl", { got: ssl });
  }

  const timeoutMs = toNumber(raw.timeoutMs, defaults.timeoutMs ?? ALIAS_DEFAULTS.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > HARD_CAPS.timeoutMs) {
    fail("invalid_timeout_ms", { got: timeoutMs });
  }

  const maxRows = toNumber(raw.maxRows, defaults.maxRows ?? ALIAS_DEFAULTS.maxRows);
  if (!Number.isFinite(maxRows) || maxRows <= 0 || maxRows > HARD_CAPS.maxRows) {
    fail("invalid_max_rows", { got: maxRows });
  }

  const poolMax = toNumber(raw.poolMax, defaults.poolMax ?? ALIAS_DEFAULTS.poolMax);
  if (!Number.isFinite(poolMax) || poolMax <= 0 || poolMax > HARD_CAPS.poolMax) {
    fail("invalid_pool_max", { got: poolMax });
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
    ...pickMetadata(raw),
  };
}

export { VALID_TYPES, VALID_MODES, VALID_SSL, HARD_CAPS, DEFAULT_PORTS, ALIAS_DEFAULTS };
