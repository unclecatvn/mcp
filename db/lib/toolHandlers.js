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
  /**
   * @param {import("./connectionManager.js").ConnectionRegistry} registry
   * @param {{ defaultAlias?: string }} [opts]
   */
  constructor(registry, opts = {}) {
    this.registry = registry;
    this.history = [];
    this.defaultAlias = opts.defaultAlias;
  }

  _buildRoster() {
    const names = this.registry.listAliases();
    return names.map((name) => {
      const c = this.registry.getConfig(name);
      return {
        name,
        type: c.type,
        mode: c.mode,
        displayName: c.displayName,
        description: c.description,
        tablesHint: c.tablesHint,
      };
    });
  }

  _rosterBlock() {
    const roster = this._buildRoster();
    if (roster.length === 0) return "";
    const lines = ["Available aliases:"];
    for (const a of roster) {
      const label = a.displayName ? ` — ${a.displayName}` : "";
      lines.push(`  • ${a.name}${label} [${a.type}, ${a.mode}]`);
      if (a.description) lines.push(`    ${a.description}`);
      if (a.tablesHint && a.tablesHint.length > 0) {
        lines.push(`    Likely tables: ${a.tablesHint.join(", ")}.`);
      }
    }
    if (this.defaultAlias) {
      lines.push("");
      lines.push(`Default alias if unspecified: ${this.defaultAlias}`);
    }
    lines.push("");
    return lines.join("\n");
  }

  _aliasEnum() {
    return this.registry.listAliases();
  }

  _aliasFieldDescription(baseText) {
    const roster = this._buildRoster();
    if (roster.length === 0) return baseText;
    const inline = roster
      .map((a) => {
        const label = a.displayName ? `=${a.displayName}` : "";
        return `${a.name}${label} (${a.mode})`;
      })
      .join(". ");
    return `${baseText} Available: ${inline}.`;
  }

  /** Tool list shipped to the MCP client. */
  toolDescriptors() {
    const rosterBlock = this._rosterBlock();
    const aliasEnum = this._aliasEnum();
    const aliasProp = (baseDescription) => ({
      type: "string",
      enum: aliasEnum,
      description: this._aliasFieldDescription(baseDescription),
    });
    const prepend = (lines) =>
      rosterBlock ? rosterBlock + "\n" + lines.join("\n") : lines.join("\n");

    return [
      {
        name: "db_query",
        description: prepend([
          "Execute a parameterized SQL query against a configured database alias.",
          "Use this for any data retrieval (SELECT) or mutation (INSERT/UPDATE/DELETE).",
          "",
          "ALWAYS use placeholders — never concatenate user input into SQL:",
          "  • Positional: sql='SELECT * FROM t WHERE id=?', params=[42]",
          "  • Named:      sql='SELECT * FROM t WHERE id=:id', params={id:42}",
          "",
          "The alias mode controls what is allowed:",
          "  • readonly       → SELECT/EXPLAIN/DESCRIBE/SHOW/USE",
          "  • readwrite      → + INSERT/UPDATE/DELETE/MERGE",
          "  • readwrite+ddl  → + CREATE/DROP/ALTER/TRUNCATE/GRANT/REVOKE/RENAME",
          "Blocked operations return DB_PERMISSION_DENIED with the exact env var to set.",
          "",
          "SELECT without LIMIT is auto-capped to alias maxRows (default 10000).",
          "Response includes truncated:true when the cap is hit.",
          "Returns: { rows, rowCount, columns, elapsedMs, retries, truncated, hint? }.",
        ]),
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: aliasProp("Alias name (lowercase) of a configured database."),
            sql: {
              type: "string",
              description:
                "SQL statement with ? (positional) or :name (named) placeholders. Identifiers, string literals, and comments are parsed safely.",
            },
            params: {
              description:
                "Array of values for positional ? placeholders, OR object keyed by name for :name placeholders. Omit when SQL has no placeholders.",
              oneOf: [{ type: "array" }, { type: "object" }],
            },
            maxRows: {
              type: "integer",
              minimum: 1,
              maximum: 1000000,
              description:
                "Override the alias default row cap for this query (clamped to alias maxRows and the 1,000,000 hard cap).",
            },
            timeoutMs: {
              type: "integer",
              minimum: 1,
              maximum: 600000,
              description:
                "Override the alias default query timeout in milliseconds (clamped to the 600,000 hard cap).",
            },
          },
          required: ["databaseAlias", "sql"],
          additionalProperties: false,
        },
      },
      {
        name: "db_list_tables",
        description: prepend([
          "List tables visible to the alias's user, optionally filtered to a single schema.",
          "Use this for schema discovery — e.g., before db_describe_table or when answering 'what tables exist'.",
          "",
          "Returns: { tables: [{ name, schema }, ...] } sorted by schema then name.",
          "Allowed in any mode (read-only metadata).",
        ]),
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: aliasProp(
              "Alias name (lowercase). The DB type is inferred from the alias.",
            ),
            schema: {
              type: "string",
              description:
                "Optional schema/owner to filter (e.g., 'public' for PostgreSQL, 'dbo' for SQL Server). When omitted: PostgreSQL excludes system schemas, MySQL uses the current DATABASE().",
            },
          },
          required: ["databaseAlias"],
          additionalProperties: false,
        },
      },
      {
        name: "db_describe_table",
        description: prepend([
          "Return the columns and indexes of a single table.",
          "Use this before writing a query to confirm column names, types, and which fields are indexed.",
          "",
          "Returns: { columns: [{column_name, data_type, is_nullable, column_default}, ...], indexes: [...] }.",
          "Index shape is driver-specific (PostgreSQL: indexname+indexdef; MySQL: index_name+column_name+non_unique; SQL Server: index_name+column_name+is_unique).",
          "Allowed in any mode.",
        ]),
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: aliasProp("Alias name (lowercase)."),
            tableName: {
              type: "string",
              description: "Plain table name without quotes. Must match ^[A-Za-z_][A-Za-z0-9_]*$.",
            },
            schema: {
              type: "string",
              description:
                "Optional schema/owner. Required if the table is not in the connection's default schema.",
            },
          },
          required: ["databaseAlias", "tableName"],
          additionalProperties: false,
        },
      },
      {
        name: "db_test_connection",
        description: prepend([
          "Verify that the alias's database is reachable and credentials are valid.",
          "Use this to troubleshoot DB_CONNECTION_FAILED errors, confirm a new alias is configured correctly, or sanity-check before a long workflow.",
          "",
          "Runs a lightweight 'SELECT 1' with a 5s timeout and returns { ok: true|false }.",
        ]),
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: aliasProp("Alias name (lowercase)."),
          },
          required: ["databaseAlias"],
          additionalProperties: false,
        },
      },
      {
        name: "db_query_history",
        description: prepend([
          "Return recent queries executed by this MCP server session, optionally filtered by alias.",
          "Use this to review what was run during the current session, audit query times, or recover the last query type when investigating an unexpected result.",
          "",
          "History is in-memory only (lost on server restart) and capped at 50 entries — no SQL text or params are stored, only metadata: { alias, type, elapsedMs, rowCount, truncated, success, ts }.",
        ]),
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: {
              type: "string",
              enum: aliasEnum,
              description: this._aliasFieldDescription(
                "Optional. Filter history to a single alias. Omit to return entries across all aliases.",
              ),
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Optional. Max entries to return (defaults to all retained, max 50).",
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: "db_explain_query",
        description: prepend([
          "Run the dialect's EXPLAIN equivalent on a parameterized query and return the plan rows.",
          "Use this to investigate why a query is slow, check whether an index is used, or estimate cost — WITHOUT executing the query for real.",
          "",
          "PostgreSQL: prepends 'EXPLAIN '. MySQL/MariaDB: prepends 'EXPLAIN '. SQL Server: passes the SQL through (use SET SHOWPLAN_TEXT ON or SET STATISTICS PROFILE manually if needed).",
          "Same parameterized API and mode rules as db_query — readonly is sufficient.",
          "Returns the plan rows formatted by the driver; structure varies by DB.",
        ]),
        inputSchema: {
          type: "object",
          properties: {
            databaseAlias: aliasProp("Alias name (lowercase)."),
            sql: {
              type: "string",
              description:
                "SQL to explain (without the EXPLAIN keyword — the server prepends it). Supports ? and :name placeholders.",
            },
            params: {
              description: "Same shape as db_query: array for ?, object for :name.",
              oneOf: [{ type: "array" }, { type: "object" }],
            },
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
