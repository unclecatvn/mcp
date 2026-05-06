const SECURITY_GUIDE = `# Security guide for @unclecat/mcp-multi-db

This MCP server is configured per-alias via DB_<ALIAS>_* environment variables.

Default mode is **readonly**. To allow writes or DDL, set the alias mode explicitly:

  DB_PROD_MODE=readwrite          # allows INSERT/UPDATE/DELETE
  DB_PROD_MODE=readwrite+ddl      # additionally allows CREATE/DROP/ALTER/TRUNCATE/GRANT/REVOKE

When you write SQL, ALWAYS use parameterized placeholders. Never concatenate
user-supplied values into SQL strings. Prefer:

  SELECT * FROM users WHERE id = ?         (positional, params: [42])
  SELECT * FROM users WHERE id = :id       (named,      params: { id: 42 })

Avoid wide SELECT * scans on large tables; the server will inject a default
LIMIT but the query still hits the database.

If a query is blocked by the mode enforcer, the error message includes the
exact env var to set to allow it.
`;

const ALIASES_RESOURCE_BASE = "db://aliases";

export class ResourceHandlers {
  /** @param {import("./connectionManager.js").ConnectionRegistry} registry */
  constructor(registry) {
    this.registry = registry;
  }

  list() {
    return [
      {
        uri: "db://security-guide",
        name: "Security guide",
        description: "How modes, parameterized queries, and limits work in this server.",
        mimeType: "text/markdown",
      },
      {
        uri: ALIASES_RESOURCE_BASE,
        name: "Configured database aliases",
        description: "Loaded aliases with their type and mode (no secrets).",
        mimeType: "application/json",
      },
    ];
  }

  read(uri) {
    if (uri === "db://security-guide") {
      return {
        contents: [{ uri, mimeType: "text/markdown", text: SECURITY_GUIDE }],
      };
    }
    if (uri === ALIASES_RESOURCE_BASE) {
      const summary = this.registry.listAliases().map((a) => {
        const c = this.registry.getConfig(a);
        return {
          alias: a,
          type: c.type,
          mode: c.mode,
          ssl: c.ssl,
          host: c.host,
          port: c.port,
          database: c.database,
          maxRows: c.maxRows,
          timeoutMs: c.timeoutMs,
        };
      });
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  }
}
