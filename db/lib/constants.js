/**
 * Constants for MCP Database Server
 * @module lib/constants
 */

export const DEFAULT_PORTS = {
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  sqlserver: 1433,
};

export const SQLSERVER_OPTIONS = {
  encrypt: true,
  trustServerCertificate: true,
};

export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

export const MAX_HISTORY_SIZE = 50;

// Database-specific features configuration
export const DATABASE_FEATURES = {
  mysql: {
    name: "MySQL/MariaDB",
    limitSyntax: "LIMIT offset, count",
    topLevelSort: false,
    supportsCTE: true,
    supportsWindow: true,
    supportsJSON: true,
    supportsFullText: true,
    autoIncrement: "AUTO_INCREMENT",
    quoting: ["`", "`"],
    indexHint: "USE INDEX / FORCE INDEX",
    explainSyntax: "EXPLAIN FORMAT=JSON",
    stringFunctions: ["CONCAT", "GROUP_CONCAT", "SUBSTRING", "CONCAT_WS"],
    dateFunctions: ["NOW", "CURDATE", "DATE_FORMAT", "DATEDIFF"],
    antiPatterns: [
      { pattern: "SELECT \\*", issue: "Retrieves all columns", fix: "Specify columns" },
      { pattern: "GROUP BY .*? ORDER BY", issue: "May cause filesort", fix: "Use index on GROUP BY columns" },
    ],
  },
  postgresql: {
    name: "PostgreSQL",
    limitSyntax: "LIMIT count OFFSET offset",
    topLevelSort: true,
    supportsCTE: true,
    supportsWindow: true,
    supportsJSON: true,
    supportsFullText: true,
    autoIncrement: "SERIAL / BIGSERIAL",
    quoting: ['"', '"'],
    indexHint: "N/A (uses statistics)",
    explainSyntax: "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)",
    stringFunctions: ["CONCAT", "STRING_AGG", "SUBSTRING", "|| operator"],
    dateFunctions: ["NOW", "CURRENT_DATE", "TO_CHAR", "AGE"],
    antiPatterns: [
      { pattern: "LIKE '%.-%'", issue: "Leading wildcard prevents index", fix: "Use pg_trgm or full-text search" },
      { pattern: "OFFSET \\d+", issue: "High OFFSET is slow", fix: "Use keyset pagination" },
    ],
  },
  sqlserver: {
    name: "SQL Server",
    limitSyntax: "OFFSET offset ROWS FETCH NEXT count ROWS ONLY",
    topLevelSort: true,
    supportsCTE: true,
    supportsWindow: true,
    supportsJSON: true,
    supportsFullText: true,
    autoIncrement: "IDENTITY(1,1)",
    quoting: ["[", "]"],
    indexHint: "WITH (INDEX=index_name)",
    explainSyntax: "SET SHOWPLAN_ALL ON",
    stringFunctions: ["CONCAT", "STRING_AGG", "SUBSTRING", "+"],
    dateFunctions: ["GETDATE", "CAST AS DATE", "DATEDIFF", "DATEADD"],
    antiPatterns: [
      { pattern: "SELECT \\*", issue: "Retrieves all columns", fix: "Specify columns" },
      { pattern: "TOP \\d+ WITHOUT ORDER BY", issue: "Non-deterministic TOP", fix: "Always use ORDER BY with TOP" },
      { pattern: "SUBSTRING.*?1.*?LEN", issue: "SQL Server SUBSTRING is 1-based", fix: "Ensure correct indexing" },
    ],
  },
};

// Supported database types
export const SUPPORTED_DATABASE_TYPES = ["mysql", "mariadb", "postgresql", "sqlserver"];

// Table extraction patterns by database type
export const TABLE_PATTERNS = {
  mysql: [
    /FROM\s+([`"']?[\w.]+[`"']?)/gi,
    /JOIN\s+([`"']?[\w.]+[`"']?)/gi,
    /UPDATE\s+([`"']?[\w.]+[`"']?)/gi,
    /INTO\s+([`"']?[\w.]+[`"']?)/gi,
    /TABLE\s+([`"']?[\w.]+[`"']?)/gi,
  ],
  postgresql: [
    /FROM\s+(["']?[\w.]+["']?)/gi,
    /JOIN\s+(["']?[\w.]+["']?)/gi,
    /UPDATE\s+(["']?[\w.]+["']?)/gi,
    /INTO\s+(["']?[\w.]+["']?)/gi,
  ],
  sqlserver: [
    /FROM\s+([[]"?[\w.]+[]"?)/gi,
    /JOIN\s+([[]"?[\w.]+[]"?)/gi,
    /UPDATE\s+([[]"?[\w.]+[]"?)/gi,
  ],
};

// Retryable error patterns
export const RETRYABLE_PATTERNS = [
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

// Valid SQL Server options
export const VALID_SQLSERVER_OPTIONS = [
  "encrypt",
  "trustServerCertificate",
  "enableArithAbort",
];
