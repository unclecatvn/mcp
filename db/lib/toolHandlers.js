/**
 * Tool Handlers Module
 * Implements MCP tool handlers for database operations
 * @module lib/toolHandlers
 */

import { SUPPORTED_DATABASE_TYPES } from "./constants.js";
import {
  detectQueryType,
  extractTableNames,
  analyzeQueryPerformance,
} from "./queryAnalyzer.js";

/**
 * Create tool definitions for MCP server
 * @returns {Object[]} Array of tool definitions
 */
export function createToolDefinitions() {
  return [
    {
      name: "db_query",
      description: `Execute SQL query on database with performance tracking and metadata.

Returns query results WITH execution metadata including:
- Query type (SELECT/INSERT/UPDATE/DELETE/DDL)
- Execution time in milliseconds
- Number of rows affected/returned
- Tables involved in the query
- Connection info (host, port, database)

This metadata helps AI assistants review and optimize query performance.

Supported: MySQL, MariaDB, PostgreSQL, SQL Server`,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
            description: "Database type (required)",
          },
          query: {
            type: "string",
            description: "SQL query to execute",
          },
          databaseAlias: {
            type: "string",
            description:
              "Database alias from env vars (optional). If not specified, uses default database.",
          },
          connection: {
            type: "object",
            description:
              "Connection config override (optional - overrides env vars)",
          },
        },
        required: ["type", "query"],
      },
    },
    {
      name: "db_list_tables",
      description: "List all tables in the current database.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
            description: "Database type (required)",
          },
          databaseAlias: {
            type: "string",
            description: "Database alias (optional)",
          },
          connection: {
            type: "object",
            description: "Connection config override (optional)",
          },
        },
        required: ["type"],
      },
    },
    {
      name: "db_describe_table",
      description:
        "Get detailed table structure including columns, data types, indexes, and constraints. Use this to understand table schema before writing queries.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
            description: "Database type (required)",
          },
          tableName: {
            type: "string",
            description: "Name of the table to describe",
          },
          databaseAlias: {
            type: "string",
            description: "Database alias (optional)",
          },
          connection: {
            type: "object",
            description: "Connection config override (optional)",
          },
        },
        required: ["type", "tableName"],
      },
    },
    {
      name: "db_explain_query",
      description: `Get the query execution plan (EXPLAIN) to analyze how the database will execute the query.

This helps identify:
- Whether indexes are being used
- Join order and strategies
- Potential performance bottlenecks
- Full table scans

Use this BEFORE running expensive queries on large datasets.

Supported: MySQL (EXPLAIN), PostgreSQL (EXPLAIN ANALYZE), SQL Server (EXECUTION PLAN)`,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
            description: "Database type (required)",
          },
          query: {
            type: "string",
            description: "SQL query to explain (SELECT queries recommended)",
          },
          databaseAlias: {
            type: "string",
            description: "Database alias (optional)",
          },
          connection: {
            type: "object",
            description: "Connection config override (optional)",
          },
        },
        required: ["type", "query"],
      },
    },
    {
      name: "db_analyze_query",
      description: `AI-powered query analysis that reviews a SQL query and provides optimization suggestions.

Returns analysis including:
- Query type classification (SELECT/INSERT/UPDATE/DELETE/DDL)
- Read/write safety assessment
- Tables and columns involved
- Performance considerations
- Best practice recommendations
- Suggested optimizations if applicable

Use this to review queries before execution or to understand why a query might be slow.`,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
            description: "Database type (required)",
          },
          query: {
            type: "string",
            description: "SQL query to analyze",
          },
        },
        required: ["type", "query"],
      },
    },
    {
      name: "db_query_history",
      description: `Get recent query execution history with performance metrics.

This helps:
- Track slow queries
- Review query patterns
- Debug performance issues
- Understand what queries have been executed recently

Returns the last 50 queries with metadata (execution time, rows affected, success status).`,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of history entries to return (default: 10, max: 50)",
          },
        },
      },
    },
  ];
}

/**
 * Validate query request parameters
 * @param {Object} args - Request arguments
 * @returns {Object} Validated arguments
 * @throws {Error} If validation fails
 */
export function validateQueryRequest(args) {
  const { type, query } = args;
  if (!type || !query) {
    throw new Error("type & query are required");
  }

  if (!SUPPORTED_DATABASE_TYPES.includes(type)) {
    throw new Error(`Unsupported database type: ${type}`);
  }

  return args;
}

/**
 * Validate common request parameters
 * @param {Object} args - Request arguments
 * @returns {Object} Validated arguments
 * @throws {Error} If validation fails
 */
export function validateCommonRequest(args) {
  const { type } = args;
  if (!type) {
    throw new Error("type is required");
  }

  if (!SUPPORTED_DATABASE_TYPES.includes(type)) {
    throw new Error(`Unsupported database type: ${type}`);
  }

  return args;
}

/**
 * Execute database query with metadata tracking
 * @param {string} type - Database type
 * @param {Object} cfg - Connection config
 * @param {string} query - SQL query
 * @param {Function} getConnection - Function to get database connection
 * @param {Function} executeWithRetry - Function to execute with retry
 * @param {Function} addToHistory - Function to add query to history
 * @returns {Promise<Object>} Query result with metadata
 */
export async function executeDatabaseQuery(
  type,
  cfg,
  query,
  getConnection,
  executeWithRetry,
  addToHistory
) {
  const safeLog = query.replace(
    /password\s*=\s*['"][^'"]*['"]/gi,
    "password='***'"
  );
  console.error(
    `[DB MCP] Executing ${type}: ${safeLog.slice(0, 200)}${
      safeLog.length > 200 ? "..." : ""
    }`
  );

  const startTime = Date.now();
  const queryInfo = detectQueryType(query, type);
  const tables = extractTableNames(query, type);

  const queryMetadata = {
    databaseType: type,
    host: cfg.host || cfg.server,
    port: cfg.port,
    database: cfg.database,
    queryType: queryInfo.type,
    isReadOnly: queryInfo.readOnly,
    tables,
    queryPreview: query.slice(0, 100),
  };

  try {
    const res = await executeWithRetry(
      async () => {
        const db = await getConnection(type, cfg);
        return await db.query(query);
      },
      type,
      cfg
    );

    const executionTime = Date.now() - startTime;

    if (!res || typeof res !== "object") {
      const errorResult = {
        content: [
          {
            type: "text",
            text: "Invalid result from database driver",
          },
        ],
        isError: true,
        _metadata: {
          ...queryMetadata,
          executionTime,
          success: false,
          error: "Invalid result from driver",
        },
      };
      addToHistory(errorResult._metadata);
      return errorResult;
    }

    let resultData;
    let rowCount = 0;

    if (Array.isArray(res.results) && res.results.length === 0) {
      resultData = [];
      rowCount = 0;
    } else if (!Array.isArray(res.results)) {
      resultData = res;
      rowCount = res.rowsAffected || res.rowCount || 0;
    } else {
      resultData = res.results;
      rowCount = res.results.length;
    }

    const metadata = {
      ...queryMetadata,
      executionTime,
      success: true,
      rowCount,
      hasResults: Array.isArray(resultData) ? resultData.length > 0 : true,
    };

    addToHistory(metadata);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(resultData, null, 2),
        },
        {
          type: "text",
          text: `\n--- Query Metadata ---\nDatabase: ${type} @ ${cfg.host || cfg.server}:${cfg.port}/${cfg.database}\nQuery Type: ${queryInfo.type}\nExecution Time: ${executionTime}ms\nRows Affected/Returned: ${rowCount}\nTables: ${tables.join(", ") || "N/A"}`,
        },
      ],
      _metadata: metadata,
    };
  } catch (err) {
    const executionTime = Date.now() - startTime;
    const errorMetadata = {
      ...queryMetadata,
      executionTime,
      success: false,
      error: err.message,
      errorCode: err.code,
    };
    addToHistory(errorMetadata);

    return {
      content: [{ type: "text", text: `❌ ${err.message}` }],
      isError: true,
      _metadata: errorMetadata,
    };
  }
}

/**
 * Get query history
 * @param {Array} queryHistory - Query history array
 * @param {number} limit - Maximum number of entries
 * @returns {Object} Tool response with history
 */
export function getQueryHistory(queryHistory, limit = 10) {
  const historyLimit = Math.min(Math.max(1, limit), 50);
  const history = queryHistory.slice(-historyLimit).reverse();

  return {
    content: [
      {
        type: "text",
        text: `## Query Execution History (Last ${history.length} queries)\n\n${history.length === 0
          ? "No queries executed yet."
          : history.map((h, i) => `
### ${i + 1}. ${h.queryType} - ${h.success ? "✅" : "❌"}
- **Database:** ${h.databaseType} @ ${h.host}:${h.port}/${h.database}
- **Tables:** ${h.tables?.join(", ") || "N/A"}
- **Execution Time:** ${h.executionTime}ms
- **Rows:** ${h.rowCount ?? "N/A"}
- **Timestamp:** ${h.timestamp}
- **Query Preview:** \`${h.queryPreview}\`
${h.error ? `- **Error:** ${h.error}` : ""}`).join("\n")
          }`,
      },
    ],
  };
}

/**
 * Analyze query without executing
 * @param {string} type - Database type
 * @param {string} query - SQL query
 * @returns {Object} Tool response with analysis
 */
export function analyzeQuery(type, query) {
  if (!type || !query) {
    throw new Error("type and query are required");
  }

  const queryInfo = detectQueryType(query);
  const tables = extractTableNames(query, type);
  const analysis = analyzeQueryPerformance(query, queryInfo, tables, type);

  return {
    content: [
      {
        type: "text",
        text: `## SQL Query Analysis\n\n**Query Type:** \`${queryInfo.type}\`\n**Read-Only:** ${queryInfo.readOnly ? "Yes" : "No"}\n**DDL Operation:** ${queryInfo.isDDL ? "Yes" : "No"}\n\n**Tables Involved:**\n${tables.length > 0 ? tables.map(t => `- ${t}`).join("\n") : "- None detected"}\n\n---\n\n${analysis}`,
      },
    ],
  };
}

/**
 * Explain query execution plan
 * @param {string} type - Database type
 * @param {Object} cfg - Connection config
 * @param {string} query - SQL query
 * @param {Function} getConnection - Function to get database connection
 * @param {Function} executeWithRetry - Function to execute with retry
 * @returns {Promise<Object>} Tool response with execution plan
 */
export async function explainQuery(type, cfg, query, getConnection, executeWithRetry) {
  // Build EXPLAIN query based on database type
  let explainQuery;
  if (type === "postgresql") {
    explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
  } else if (type === "sqlserver") {
    explainQuery = `SET SHOWPLAN_ALL ON; ${query}; SET SHOWPLAN_ALL OFF;`;
  } else {
    // MySQL/MariaDB
    explainQuery = `EXPLAIN FORMAT=JSON ${query}`;
  }

  const result = await executeWithRetry(
    async () => {
      const db = await getConnection(type, cfg);
      return await db.query(explainQuery);
    },
    type,
    cfg
  );

  return {
    content: [
      {
        type: "text",
        text: `## Query Execution Plan (EXPLAIN)\n\n**Original Query:**\n\`\`\`sql\n${query}\n\`\`\`\n\n**Execution Plan:**\n\`\`\`json\n${JSON.stringify(result.results || result, null, 2)}\n\`\`\`\n\n**Key Analysis Points:**\n- Check for "ALL" type scans (indicates full table scan - bad for large tables)\n- Look for "key" column usage (indicates index usage)\n- Note "rows" estimation (lower is better)\n- Check for "Using filesort" or "Using temporary" (may indicate optimization needed)`,
      },
    ],
  };
}

/**
 * List all tables in database
 * @param {string} type - Database type
 * @param {Object} cfg - Connection config
 * @param {Function} getConnection - Function to get database connection
 * @param {Function} executeWithRetry - Function to execute with retry
 * @returns {Promise<Object>} Tool response with table list
 */
export async function listTables(type, cfg, getConnection, executeWithRetry) {
  const tables = await executeWithRetry(
    async () => {
      const db = await getConnection(type, cfg);
      return await db.listTables();
    },
    type,
    cfg
  );

  return {
    content: [{ type: "text", text: JSON.stringify(tables, null, 2) }],
  };
}

/**
 * Describe table structure
 * @param {string} type - Database type
 * @param {string} tableName - Table name
 * @param {Object} cfg - Connection config
 * @param {Function} getConnection - Function to get database connection
 * @param {Function} executeWithRetry - Function to execute with retry
 * @returns {Promise<Object>} Tool response with table details
 */
export async function describeTable(type, tableName, cfg, getConnection, executeWithRetry) {
  if (!tableName) throw new Error("tableName is required");

  const details = await executeWithRetry(
    async () => {
      const db = await getConnection(type, cfg);
      return await db.describeTable(tableName);
    },
    type,
    cfg
  );

  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
  };
}
