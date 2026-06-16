/**
 * Builds MCP tool descriptors with alias roster injection.
 */
export class ToolDescriptorBuilder {
  /**
   * @param {import("./connectionManager.js").ConnectionRegistry} registry
   * @param {{ defaultAlias?: string }} [opts]
   */
  constructor(registry, opts = {}) {
    this.registry = registry;
    this.defaultAlias = opts.defaultAlias;
  }

  _buildRoster() {
    return this.registry.listAliases().map((name) => {
      const c = this.registry.getConfig(name);
      return {
        name,
        type: c.type,
        mode: c.mode,
        displayName: c.displayName,
        description: c.description,
        tablesHint: c.tablesHint,
        defaultSchema: c.defaultSchema,
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
      if (a.tablesHint?.length > 0) {
        lines.push(`    Likely tables: ${a.tablesHint.join(", ")}.`);
      }
      if (a.defaultSchema) {
        lines.push(`    Default schema: ${a.defaultSchema}.`);
      }
    }
    if (this.defaultAlias) {
      lines.push("");
      lines.push(`Default alias when databaseAlias is omitted: ${this.defaultAlias}`);
    }
    lines.push("");
    return lines.join("\n");
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

  build() {
    const rosterBlock = this._rosterBlock();
    const aliasEnum = this.registry.listAliases();
    const aliasProp = (baseDescription) => ({
      type: "string",
      enum: aliasEnum,
      description: this._aliasFieldDescription(baseDescription),
    });
    const prepend = (lines) =>
      rosterBlock ? rosterBlock + "\n" + lines.join("\n") : lines.join("\n");
    const aliasRequired = this.defaultAlias ? [] : ["databaseAlias"];

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
          "Blocked operations return DB_PERMISSION_DENIED with the exact setting to change.",
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
          required: [...aliasRequired, "sql"],
          additionalProperties: false,
        },
      },
      {
        name: "db_list_tables",
        description: prepend([
          "List tables visible to the alias's user, with optional schema/name filters and pagination.",
          "Use this for schema discovery — e.g., before db_describe_table or when answering 'what tables exist'.",
          "",
          "Returns: { tables: [{ name, schema }, ...], limit, offset, hasMore } sorted by schema then name.",
          "When schema is omitted, uses the alias defaultSchema if configured (e.g. public for Odoo).",
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
                "Optional schema/owner to filter (e.g., 'public' for PostgreSQL, 'dbo' for SQL Server). Falls back to alias defaultSchema when omitted.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Max tables to return (default 100).",
            },
            offset: {
              type: "integer",
              minimum: 0,
              description: "Number of tables to skip for pagination (default 0).",
            },
            namePattern: {
              type: "string",
              description:
                "Optional SQL LIKE pattern for table_name (e.g. sale_% or %order%). Only letters, digits, _, % wildcards.",
            },
          },
          required: aliasRequired,
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
              description: "Optional schema/owner. Falls back to alias defaultSchema when omitted.",
            },
          },
          required: [...aliasRequired, "tableName"],
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
          required: aliasRequired,
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
          required: [...aliasRequired, "sql"],
          additionalProperties: false,
        },
      },
    ];
  }
}
