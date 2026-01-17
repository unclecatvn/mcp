/**
 * Connection Management Module
 * Handles database connection parsing, validation, and caching
 * @module lib/connectionManager
 */

import { DEFAULT_PORTS, SQLSERVER_OPTIONS, VALID_SQLSERVER_OPTIONS } from "./constants.js";

/**
 * Generate a unique connection key
 * @param {string} type - Database type
 * @param {Object} cfg - Connection config
 * @returns {string} Connection key
 */
export function getConnectionKey(type, cfg) {
  const host = cfg.host || cfg.server || "localhost";
  const port = cfg.port || getDefaultPort(type);
  const db = cfg.database || "no_database";
  const user = cfg.user || "no_user";
  const options = cfg.options ? JSON.stringify(cfg.options) : "{}";
  return `${type}_${host}_${port}_${db}_${user}_${options}`;
}

/**
 * Get default port for database type
 * @param {string} type - Database type
 * @returns {number} Default port
 */
export function getDefaultPort(type) {
  return DEFAULT_PORTS[type] || DEFAULT_PORTS.mysql;
}

/**
 * Parse connection string to config object
 * @param {string} str - Connection string (e.g., "mysql://user:pass@host:port/db")
 * @param {string} type - Database type
 * @returns {Object} Connection config
 * @throws {Error} If connection string is invalid
 */
export function parseConnectionString(str, type) {
  try {
    const url = new URL(str);
    const cfg = {
      host: url.hostname,
      port: parseInt(url.port) || getDefaultPort(type),
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    };
    const normalizedCfg = normalizeSqlServerConfig(cfg, type);
    return validateConnectionConfig(normalizedCfg, type);
  } catch (err) {
    throw new Error(`Invalid connection string: ${err.message}`);
  }
}

/**
 * Normalize SQL Server config (host -> server)
 * @param {Object} cfg - Connection config
 * @param {string} type - Database type
 * @returns {Object} Normalized config
 */
export function normalizeSqlServerConfig(cfg, type = "sqlserver") {
  if (type === "sqlserver" && cfg.host) {
    cfg.server = cfg.host;
    delete cfg.host;
    cfg.options = { ...SQLSERVER_OPTIONS };
  }
  return cfg;
}

/**
 * Validate connection configuration
 * @param {Object} cfg - Connection config
 * @param {string} type - Database type
 * @returns {Object} Validated config
 * @throws {Error} If config is invalid
 */
export function validateConnectionConfig(cfg, type) {
  if (!cfg) {
    throw new Error("Connection config cannot be empty");
  }

  const host = cfg.host || cfg.server;
  if (!host) {
    throw new Error(`Host/Server is required for ${type}`);
  }

  if (
    cfg.port &&
    (typeof cfg.port !== "number" || cfg.port <= 0 || cfg.port > 65535)
  ) {
    throw new Error(
      `Port must be a positive number between 1-65535, received: ${cfg.port}`
    );
  }

  if (type === "sqlserver" && cfg.options) {
    const invalidOptions = Object.keys(cfg.options).filter(
      (key) => !VALID_SQLSERVER_OPTIONS.includes(key)
    );
    if (invalidOptions.length > 0) {
      throw new Error(
        `Invalid SQL Server options: ${invalidOptions.join(", ")}`
      );
    }
  }

  return cfg;
}

/**
 * Parse connection strings from environment variable
 * @param {string} type - Database type
 * @param {Object} connections - Connections object to populate
 * @param {string[]} parseErrors - Array to collect parse errors
 */
export function parseConnectionStringEnv(type, connections, parseErrors) {
  const envPrefix = type.toUpperCase();
  const connectionsEnv = process.env[`${envPrefix}_CONNECTIONS`];
  if (connectionsEnv) {
    const connStrings = connectionsEnv
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s);
    for (const connStr of connStrings) {
      const [alias, url] = connStr.split("=");
      if (alias && url) {
        try {
          connections[alias.trim()] = parseConnectionString(url.trim(), type);
        } catch (e) {
          const errorMsg = `Invalid connection string for ${alias}: ${e.message}`;
          console.error(`[DB MCP] ${errorMsg}`);
          parseErrors.push(errorMsg);
        }
      }
    }
  }
}

/**
 * Parse numbered environment variables (e.g., MYSQL_DB1_HOST)
 * @param {string} type - Database type
 * @param {Object} connections - Connections object to populate
 * @returns {Object} Parsed connections
 */
export function parseNumberedEnv(type, connections) {
  const envPrefix = type.toUpperCase();
  let dbIndex = 1;
  while (true) {
    const alias = `db${dbIndex}`;
    const host = process.env[`${envPrefix}_DB${dbIndex}_HOST`];
    const port = process.env[`${envPrefix}_DB${dbIndex}_PORT`];
    const user = process.env[`${envPrefix}_DB${dbIndex}_USER`];
    const password = process.env[`${envPrefix}_DB${dbIndex}_PASSWORD`];
    const database = process.env[`${envPrefix}_DB${dbIndex}_DATABASE`];

    if (!host) break;

    let cfg = {
      host,
      port: parseInt(port) || getDefaultPort(type),
      user: user || "root",
      password: password || "",
      database,
    };

    cfg = normalizeSqlServerConfig(cfg, type);
    cfg = validateConnectionConfig(cfg, type);

    connections[alias] = cfg;
    dbIndex++;
  }
}

/**
 * Parse legacy environment variables (e.g., MYSQL_HOST)
 * @param {string} type - Database type
 * @param {Object} connections - Connections object to populate
 * @returns {Object} Parsed connections
 */
export function parseLegacyEnv(type, connections) {
  if (Object.keys(connections).length > 0) return;

  const envPrefix = type.toUpperCase();
  const host = process.env[`${envPrefix}_HOST`];
  const port = process.env[`${envPrefix}_PORT`];
  const user = process.env[`${envPrefix}_USER`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  const database = process.env[`${envPrefix}_DATABASE`];

  if (host || database) {
    let cfg = {
      host: host || "localhost",
      port: parseInt(port) || getDefaultPort(type),
      user: user || "root",
      password: password || "",
      database,
    };

    cfg = normalizeSqlServerConfig(cfg, type);
    cfg = validateConnectionConfig(cfg, type);

    connections["default"] = cfg;
  }
}

/**
 * Parse all connection configurations from environment
 * @param {string} type - Database type
 * @returns {Object} Parsed connections
 * @throws {Error} If no valid connections found
 */
export function parseMultipleConnections(type) {
  const connections = {};
  const parseErrors = [];

  parseConnectionStringEnv(type, connections, parseErrors);
  parseNumberedEnv(type, connections);
  parseLegacyEnv(type, connections);

  if (Object.keys(connections).length === 0 && parseErrors.length > 0) {
    const errorMsg = `❌ No valid connections found for ${type.toUpperCase()}:\n${parseErrors
      .map((err) => `• ${err}`)
      .join("\n")}`;
    throw new Error(errorMsg);
  }

  return connections;
}

/**
 * Get list of available database aliases
 * @param {string} type - Database type
 * @returns {string[]} Array of database aliases
 */
export function getAvailableDatabases(type) {
  const connections = parseMultipleConnections(type);
  return Object.keys(connections);
}

/**
 * Resolve database connection from alias or override
 * @param {string} type - Database type
 * @param {string} databaseAlias - Database alias (optional)
 * @param {Object} connection - Connection override (optional)
 * @returns {Object} Resolved config and alias
 * @throws {Error} If connection not found
 */
export function resolveDatabaseConnection(type, databaseAlias, connection) {
  const availableConnections = parseMultipleConnections(type);
  const availableAliases = Object.keys(availableConnections);

  let cfg;
  let usedAlias;

  if (connection?.connectionString) {
    cfg = parseConnectionString(connection.connectionString, type);
    usedAlias = "custom_connection_string";
  } else if (databaseAlias && availableConnections[databaseAlias]) {
    cfg = availableConnections[databaseAlias];
    usedAlias = databaseAlias;
  } else if (availableAliases.length > 0) {
    if (databaseAlias && !availableConnections[databaseAlias]) {
      const errorMsg = `❌ Database alias "${databaseAlias}" not found.

📋 Available ${type.toUpperCase()} databases:
${availableAliases
  .map(
    (alias) =>
      `• ${alias}: ${availableConnections[alias].database || "N/A"} (${
        availableConnections[alias].host || availableConnections[alias].server
      }:${availableConnections[alias].port})`
  )
  .join("\n")}

💡 To use the default database, don't specify databaseAlias.`;
      throw new Error(errorMsg);
    }

    usedAlias = availableAliases[0];
    cfg = availableConnections[usedAlias];
  } else {
    const errorMsg = `❌ No database configuration found for ${type.toUpperCase()}.

🔧 Please configure using one of these methods:

1️⃣ **Connection String:**
   ${type.toUpperCase()}_CONNECTIONS="alias1=${type}://user:pass@host:port/db1;alias2=${type}://user:pass@host:port/db2"

2️⃣ **Multiple DB vars:**
   ${type.toUpperCase()}_DB1_HOST=host1
   ${type.toUpperCase()}_DB1_DATABASE=db1
   ${type.toUpperCase()}_DB2_HOST=host2
   ${type.toUpperCase()}_DB2_DATABASE=db2

3️⃣ **Single DB (backward compatibility):**
   ${type.toUpperCase()}_HOST=host
   ${type.toUpperCase()}_DATABASE=db`;
    throw new Error(errorMsg);
  }

  return { cfg, usedAlias };
}

/**
 * Apply connection overrides to base config
 * @param {Object} cfg - Base connection config
 * @param {string} type - Database type
 * @param {Object} connection - Override config
 * @returns {Object} Merged config
 */
export function applyConnectionOverrides(cfg, type, connection) {
  if (!connection || connection.connectionString) {
    return cfg;
  }

  const newCfg = {
    ...cfg,
    host: connection.host || cfg.host,
    port: connection.port || cfg.port,
    user: connection.user || cfg.user,
    password: connection.password || cfg.password,
    database: connection.database || cfg.database,
  };

  return normalizeSqlServerConfig(newCfg, type);
}

/**
 * Sleep utility for retry delay
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (connection-related)
 * @param {Error} err - Error object
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(err) {
  const retryablePatterns = [
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /PROTOCOL_CONNECTION_LOST/i,
    /connection.*lost/i,
    /connection.*closed/i,
    /connection.*terminated/i,
    /Connection is not connected/i,
    /Cannot enqueue Query after fatal error/i,
    /Cannot enqueue Query after invoking quit/i,
    /EPIPE/i,
    /socket hang up/i,
    /Client has encountered a connection error/i,
  ];

  const errorMessage = err.message || "";
  const errorCode = err.code || "";

  return retryablePatterns.some(
    (pattern) => pattern.test(errorMessage) || pattern.test(errorCode)
  );
}

/**
 * Execute operation with retry logic
 * @param {Function} operation - Async operation to execute
 * @param {string} type - Database type
 * @param {Object} cfg - Connection config
 * @param {Function} removeConnection - Function to remove stale connection
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<*>} Operation result
 * @throws {Error} If all retries fail
 */
export async function executeWithRetry(operation, type, cfg, removeConnection, retryConfig) {
  let lastError;
  let delay = retryConfig.initialDelayMs;

  for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // Check if retryable
      if (
        !isRetryableError(err) ||
        attempt === retryConfig.maxRetries
      ) {
        throw err;
      }

      console.error(
        `[DB MCP] Query failed (attempt ${attempt}/${retryConfig.maxRetries}): ${err.message}. Retrying in ${delay}ms...`
      );

      // Remove cached connection to force reconnect
      removeConnection(type, cfg);

      await sleep(delay);
      delay = Math.min(
        delay * retryConfig.backoffMultiplier,
        retryConfig.maxDelayMs
      );
    }
  }

  throw lastError;
}
