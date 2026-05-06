# @unclecat/mcp-multi-db

> MCP server for MySQL/MariaDB, PostgreSQL, and SQL Server — with parameterized queries, per-alias safety modes, query timeouts, and row caps.

[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@unclecat/mcp-multi-db.svg)](https://www.npmjs.com/package/@unclecat/mcp-multi-db)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

📖 Tiếng Việt: [README.vi.md](./README.vi.md) · 🛡️ [Security policy](./SECURITY.md)

## Features

- **Parameterized queries only** — eliminates SQL injection at the API layer.
- **Per-alias modes** — `readonly` (default), `readwrite`, `readwrite+ddl`.
- **Query timeouts** — driver-native, with a hard cap of 600 s.
- **Row cap with overflow detection** — default 10 000, configurable per alias and per request.
- **SSL/TLS** — `disable` / `prefer` / `require` / `verify` (custom CA).
- **Multi-database** — MySQL, MariaDB, PostgreSQL, SQL Server in the same server.
- **Connection pooling, retries with exponential backoff, structured logging.**

## Install

```bash
npx @unclecat/mcp-multi-db
```

Requires Node ≥ 18.

## Configure

Configuration is via environment variables. Each database is an *alias*. Default mode is **readonly**.

```bash
# Required
DB_PROD_TYPE=postgresql                     # mysql | mariadb | postgresql | sqlserver
DB_PROD_URL=postgresql://user:pass@host:5432/dbname

# Optional, default-safe
DB_PROD_MODE=readonly                       # readonly (default) | readwrite | readwrite+ddl
DB_PROD_SSL=prefer                          # disable | prefer (default) | require | verify
DB_PROD_TIMEOUT_MS=30000
DB_PROD_MAX_ROWS=10000
DB_PROD_POOL_MAX=5

# Server-wide
MCP_DB_LOG_LEVEL=info                       # debug | info (default) | warn | error
```

See [.env.example](./.env.example) for a complete template.

### Configuring with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "DB_PROD_TYPE": "postgresql",
        "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname",
        "DB_PROD_MODE": "readonly"
      }
    }
  }
}
```

## Security model

The server runs with database credentials. To minimize blast radius:

| Mode               | Allows                                  |
|--------------------|-----------------------------------------|
| `readonly` (default) | SELECT, EXPLAIN, DESCRIBE, SHOW, USE  |
| `readwrite`        | + INSERT, UPDATE, DELETE, MERGE         |
| `readwrite+ddl`    | + CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, RENAME |

Unknown statements are rejected even at `readwrite+ddl` (deny-by-default).

If a query is blocked, the error message includes the exact env var to set:

```
[DB_PERMISSION_DENIED] Database 'prod' is in readonly mode. Operation 'DELETE'
requires 'readwrite' mode. To allow: set DB_PROD_MODE=readwrite in environment.
```

### Parameterized queries

The `db_query` tool requires SQL with placeholders and a separate `params` value. Never concatenate user input into SQL.

```js
// Positional
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = ?", params: [42] }

// Named
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = :id", params: { id: 42 } }
```

The server translates `?` and `:name` into the dialect-native placeholder shape internally.

### Row caps and timeouts

By default, SELECT statements without an explicit `LIMIT`/`TOP`/`FETCH` are capped at 10 000 rows; the response includes `truncated: true` when the cap is hit. Per-query overrides via `maxRows` and `timeoutMs` are clamped to alias and hard-cap maxima.

## Tools

| Tool | Inputs |
|------|--------|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` |
| `db_list_tables` | `databaseAlias`, `schema?` |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` |
| `db_test_connection` | `databaseAlias` |
| `db_query_history` | `databaseAlias?`, `limit?` |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` |

## Resources

- `db://security-guide` — Markdown explanation of modes and parameterized queries.
- `db://aliases` — JSON summary of loaded aliases (no secrets).

## Migration from v1

This is the first public release. The unpublished v1.x raw-query API has been replaced. Map your old calls:

| v1 (removed)                                  | v2                                                            |
|-----------------------------------------------|---------------------------------------------------------------|
| `db_query({ type, query: 'SELECT...' })`       | `db_query({ databaseAlias, sql, params })`                    |
| `MYSQL_CONNECTIONS=...`                        | `DB_<ALIAS>_TYPE=mysql ...`                                   |
| `connection: {...}` tool override              | Removed. Use env config only.                                 |

## Troubleshooting

- **`[DB_PERMISSION_DENIED]`** — your alias mode does not permit the operation. Set `DB_<ALIAS>_MODE` accordingly.
- **`[DB_TIMEOUT]`** — increase `timeoutMs` per request, or `DB_<ALIAS>_TIMEOUT_MS` for the alias.
- **`[DB_RESULT_TOO_LARGE]`** — add a `LIMIT` to your query, or pass a higher `maxRows`.
- **`[DB_CONNECTION_FAILED]`** — verify host/port reachability and credentials. The server retries up to 3 times.
- **`[DB_VALIDATION_FAILED]` on `tableName`** — identifier must match `^[A-Za-z_][A-Za-z0-9_]*$`.
- **No aliases loaded** — server exits with code 1. Set at least one `DB_<ALIAS>_TYPE` and host.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) at the monorepo root.

## License

MIT — see [LICENSE](../LICENSE).
