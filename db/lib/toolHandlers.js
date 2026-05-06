import {
  DbQueryInputSchema,
  DbListTablesInputSchema,
  DbDescribeTableInputSchema,
  DbTestConnectionInputSchema,
  DbQueryHistoryInputSchema,
  DbExplainQueryInputSchema,
  parseOrThrow,
} from "./validators.js";
import { analyzeQuery } from "./queryAnalyzer.js";
import { enforceMode } from "./modeEnforcer.js";
import { applyRowLimit, resolveTimeout, resolveMaxRows } from "./limits.js";
import { convertParams } from "./paramConverter.js";
import { formatErrorForMcp } from "./errors.js";

const HISTORY_MAX = 50;

export class ToolHandlers {
  /** @param {import("./connectionManager.js").ConnectionRegistry} registry */
  constructor(registry) {
    this.registry = registry;
    this.history = [];
  }

  /** Tool list shipped to the MCP client. */
  toolDescriptors() {
    return [
      {
        name: "db_query",
        description: "Execute a parameterized SQL query against a configured database alias.",
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: { type: "string", description: "Alias from env (e.g., 'prod')." },
            sql: { type: "string", description: "SQL with ? or :name placeholders." },
            params: {
              description: "Array (positional ?) or object (named :name).",
              oneOf: [{ type: "array" }, { type: "object" }],
            },
            maxRows: { type: "integer", minimum: 1, maximum: 1000000 },
            timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
          },
          required: ["databaseAlias", "sql"],
          additionalProperties: false,
        },
      },
      {
        name: "db_list_tables",
        description: "List tables in the configured database (optionally filtered by schema).",
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: { type: "string" },
            schema: { type: "string" },
          },
          required: ["databaseAlias"],
          additionalProperties: false,
        },
      },
      {
        name: "db_describe_table",
        description: "Describe a table's columns and indexes.",
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: { type: "string" },
            tableName: { type: "string" },
            schema: { type: "string" },
          },
          required: ["databaseAlias", "tableName"],
          additionalProperties: false,
        },
      },
      {
        name: "db_test_connection",
        description: "Run a healthcheck against the alias.",
        inputSchema: {
          type: "object",
          properties: { databaseAlias: { type: "string" } },
          required: ["databaseAlias"],
          additionalProperties: false,
        },
      },
      {
        name: "db_query_history",
        description: "Return the last N executed queries (sanitized).",
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 500 },
          },
          additionalProperties: false,
        },
      },
      {
        name: "db_explain_query",
        description: "Run EXPLAIN/EXPLAIN ANALYZE-equivalent and return the plan rows.",
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: { type: "string" },
            sql: { type: "string" },
            params: { oneOf: [{ type: "array" }, { type: "object" }] },
          },
          required: ["databaseAlias", "sql"],
          additionalProperties: false,
        },
      },
    ];
  }

  /** Top-level tool dispatch with try/catch for MCP error formatting. */
  async dispatch(name, input) {
    try {
      switch (name) {
        case "db_query":
          return await this.handleQuery(input);
        case "db_list_tables":
          return await this.handleListTables(input);
        case "db_describe_table":
          return await this.handleDescribeTable(input);
        case "db_test_connection":
          return await this.handleTestConnection(input);
        case "db_query_history":
          return await this.handleHistory(input);
        case "db_explain_query":
          return await this.handleExplain(input);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return formatErrorForMcp(err);
    }
  }

  async handleQuery(input) {
    const args = await parseOrThrow(DbQueryInputSchema, input, "db_query");
    return this._runQuery(args, /*explain*/ false);
  }

  async handleExplain(input) {
    const args = await parseOrThrow(DbExplainQueryInputSchema, input, "db_explain_query");
    const cfg = this.registry.getConfig(args.databaseAlias);
    let prefix;
    switch (cfg.type) {
      case "postgresql":
        prefix = "EXPLAIN ";
        break;
      case "mysql":
      case "mariadb":
        prefix = "EXPLAIN ";
        break;
      case "sqlserver":
        // SQL Server uses SET SHOWPLAN_TEXT ON; for simplicity prefix with SET SHOWPLAN
        // here we run as-is; users can prepend SET SHOWPLAN_TEXT ON
        prefix = "";
        break;
      default:
        prefix = "EXPLAIN ";
    }
    return this._runQuery({ ...args, sql: `${prefix}${args.sql}` }, /*explain*/ true);
  }

  async _runQuery({ databaseAlias, sql, params, maxRows, timeoutMs }, isExplain) {
    const cfg = this.registry.getConfig(databaseAlias);
    const analysis = analyzeQuery(sql);
    enforceMode(analysis, cfg.mode, databaseAlias);

    const effMaxRows = resolveMaxRows(maxRows, cfg.maxRows);
    const effTimeout = resolveTimeout(timeoutMs, cfg.timeoutMs);

    const limited = applyRowLimit(analysis, sql, effMaxRows, cfg.type);
    const converted = convertParams(limited.sql, params, cfg.type);

    const start = Date.now();
    const { result, retries } = await this.registry.withRetry(databaseAlias, (driver) =>
      driver.executeQuery({
        sql: converted.sql,
        params: converted.params,
        timeoutMs: effTimeout,
      }),
    );
    const elapsedMs = Date.now() - start;

    let rows = result.rows;
    let truncated = false;
    if (limited.fetchPlusOne && rows.length > effMaxRows) {
      rows = rows.slice(0, effMaxRows);
      truncated = true;
    }
    const rowCount = truncated ? effMaxRows : result.rowCount;

    this._record({
      alias: databaseAlias,
      type: analysis.primaryType,
      elapsedMs,
      rowCount,
      truncated,
      success: true,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              rows,
              rowCount,
              columns: result.columns,
              elapsedMs,
              retries,
              truncated,
              ...(truncated
                ? {
                    hint: "Result truncated. Add LIMIT to your query or pass a higher maxRows.",
                  }
                : {}),
              ...(isExplain ? { isExplain: true } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  async handleListTables(input) {
    const args = await parseOrThrow(DbListTablesInputSchema, input, "db_list_tables");
    const { result } = await this.registry.withRetry(args.databaseAlias, (d) =>
      d.listTables({ schema: args.schema }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ tables: result }, null, 2) }],
    };
  }

  async handleDescribeTable(input) {
    const args = await parseOrThrow(DbDescribeTableInputSchema, input, "db_describe_table");
    const { result } = await this.registry.withRetry(args.databaseAlias, (d) =>
      d.describeTable({ tableName: args.tableName, schema: args.schema }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  async handleTestConnection(input) {
    const args = await parseOrThrow(DbTestConnectionInputSchema, input, "db_test_connection");
    const { result } = await this.registry.withRetry(args.databaseAlias, (d) => d.healthCheck());
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: result }, null, 2) }],
    };
  }

  async handleHistory(input) {
    const args = await parseOrThrow(DbQueryHistoryInputSchema, input, "db_query_history");
    const filtered = args.databaseAlias
      ? this.history.filter((h) => h.alias === args.databaseAlias)
      : this.history;
    const limit = args.limit ?? HISTORY_MAX;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(filtered.slice(-limit), null, 2),
        },
      ],
    };
  }

  _record(entry) {
    this.history.push({ ...entry, ts: new Date().toISOString() });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }
}
