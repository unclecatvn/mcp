export const VALID_TYPES = ["mysql", "mariadb", "postgresql", "sqlserver"];
export const VALID_MODES = ["readonly", "readwrite", "readwrite+ddl"];
export const VALID_SSL = ["disable", "prefer", "require", "verify"];
export const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"];

export const ALIAS_DEFAULTS = {
  mode: "readonly",
  ssl: "prefer",
  timeoutMs: 30000,
  maxRows: 10000,
  poolMax: 5,
};

export const DEFAULT_PORTS = {
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  sqlserver: 1433,
};

export const HARD_CAPS = {
  timeoutMs: 600_000,
  maxRows: 1_000_000,
  poolMax: 100,
};

export const JSON_ALIAS_KEY_RE = /^[a-z][a-z0-9_]*$/;
export const ENV_ALIAS_RE = /^[A-Z][A-Z0-9_]*$/;
