const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Structured stderr logger for MCP stdio servers.
 * @param {string} [levelEnvVar]
 * @param {string} [defaultLevel]
 */
export function makeLogger(levelEnvVar = "MCP_DB_LOG_LEVEL", defaultLevel = "info") {
  const levelName = (process.env[levelEnvVar] ?? defaultLevel).toLowerCase();
  const min = LOG_LEVELS[levelName] ?? LOG_LEVELS.info;

  function log(level, fields) {
    if (LOG_LEVELS[level] < min) return;
    const ts = new Date().toISOString();
    const flat = Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)
      .join(" ");
    console.error(`[${ts}] [${level}] ${flat}`);
  }

  return {
    debug: (fields) => log("debug", fields),
    info: (fields) => log("info", fields),
    warn: (fields) => log("warn", fields),
    error: (fields) => log("error", fields),
  };
}
