# @unclecat/mcp-multi-db

> MCP server for MySQL, MariaDB, PostgreSQL and SQL Server. It runs parameterized queries only, applies a safety mode to each database, and caps row counts and query time.

[![npm](https://img.shields.io/npm/v/@unclecat/mcp-multi-db.svg)](https://www.npmjs.com/package/@unclecat/mcp-multi-db)
[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

**English** · [Tiếng Việt](./README.vi.md) · [Security policy](../SECURITY.md)

One server gives an AI assistant controlled SQL access to as many databases as you configure, and each database (an *alias*) has its own engine, credentials, limits and permission level. Every alias is read-only until you allow more.

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Security model](#security-model)
- [Tools and resources](#tools-and-resources)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Features

- **Parameterized queries only.** SQL injection is closed off at the API layer. `?` and `:named` placeholders are translated to each dialect's native form.
- **A safety mode per alias:**
  - `readonly` (the default);
  - `readwrite`;
  - `readwrite+ddl`.

  A multi-statement query is checked against the strictest mode any of its statements needs.
- **Four engines side by side:** MySQL, MariaDB, PostgreSQL and SQL Server.
- **Routes the model to the right database.** Each alias's `description`, `tablesHint` and `defaultSchema` is written into the tool descriptions, so the model knows which database holds what.
- **Production guards:**
  - query timeouts;
  - row caps that report when results were truncated;
  - SSL/TLS (`disable` / `prefer` / `require` / `verify`);
  - connection pooling;
  - retries with exponential backoff;
  - structured logs on stderr.

## Quick start

Requires **Node.js 20+**. Nothing to install; `npx` fetches the package.

### 1. Describe your databases

Create `mcp-db.config.json`. You can start from [`mcp-db.config.example.json`](./mcp-db.config.example.json):

```jsonc
{
  "$schema": "https://unpkg.com/@unclecat/mcp-multi-db/schema/config.schema.json",
  "defaultAlias": "prod",
  "aliases": {
    "prod": {
      "type": "postgresql",
      "url": "postgresql://readonly:secret@db.example.com:5432/main",
      "mode": "readonly",
      "displayName": "Production",
      "description": "Read-only mirror of production: orders, customers, products.",
      "tablesHint": ["orders", "customers", "products"],
      "defaultSchema": "public"
    },
    "staging": {
      "type": "mysql",
      "host": "stg.example.com",
      "user": "app",
      "password": "secret",
      "database": "appdb",
      "mode": "readwrite"
    }
  }
}
```

The `$schema` line gives you autocompletion and validation in VS Code and JetBrains IDEs.

### 2. Register the server

**Claude Code**

```bash
claude mcp add multi-db -e MCP_DB_CONFIG=/absolute/path/to/mcp-db.config.json -- npx -y @unclecat/mcp-multi-db
```

**Claude Desktop, Cursor, Windsurf** (`claude_desktop_config.json`, `.cursor/mcp.json` or `.mcp.json`)

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": { "MCP_DB_CONFIG": "/absolute/path/to/mcp-db.config.json" }
    }
  }
}
```

**VS Code 1.102+** (`.vscode/mcp.json`; the top-level key is `servers`)

```json
{
  "servers": {
    "multi-db": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": { "MCP_DB_CONFIG": "${workspaceFolder}/mcp-db.config.json" }
    }
  }
}
```

Use an **absolute path** for `MCP_DB_CONFIG`, because the host decides the server's working directory. In VS Code, `${workspaceFolder}` expands to one.

On startup the server logs what it loaded:

```
[info] event="loaded_aliases" source="config_file" count=2 aliases="prod(postgresql,readonly), staging(mysql,readwrite)" defaultAlias="prod"
```

## Configuration

### Connection (per alias)

| Field | Required | Description |
|---|---|---|
| `type` | yes | `postgresql`, `mysql`, `mariadb` or `sqlserver` |
| `url` | one of `url` / `host` | Connection URL |
| `host`, `port`, `user`, `password`, `database` | one of `url` / `host` | Explicit fields. They override the matching parts of `url` when both are set. |

### Limits and transport (per alias, all optional)

| Field | Default | Hard cap | Description |
|---|---|---|---|
| `mode` | `readonly` | — | `readonly`, `readwrite` or `readwrite+ddl` |
| `ssl` | `prefer` | — | `disable`, `prefer`, `require` or `verify` |
| `caCert` | — | — | Custom CA certificate for TLS |
| `timeoutMs` | `30000` | `600000` | Query timeout |
| `maxRows` | `10000` | `1000000` | Row cap for unbounded `SELECT`s |
| `poolMax` | `5` | `100` | Connection pool size |

### Routing metadata (per alias, JSON config only)

| Field | Effect |
|---|---|
| `displayName` | Short label shown next to the alias in tool descriptions. |
| `description` | One line on what the database holds. The model uses it to pick the alias. |
| `tablesHint` | Likely table names, to give the model a starting point. |
| `defaultSchema` | Used by `db_list_tables` and `db_describe_table` when no `schema` is passed, e.g. `public`. |

### Top level

| Field | Description |
|---|---|
| `aliases` | Required. A map of alias name to config. Names must match `^[a-z][a-z0-9_]*$`. |
| `defaultAlias` | Optional. When it is set, tools can omit `databaseAlias` and this alias is used. |
| `logLevel` | `debug`, `info` (the default), `warn` or `error`. The `MCP_DB_LOG_LEVEL` environment variable takes precedence. |

The server also adds a JSON-Schema `enum` of the loaded aliases to `databaseAlias`, so clients cannot target an alias that does not exist.

### Alternative: environment variables

When `MCP_DB_CONFIG` is **not** set, aliases are read from `DB_<ALIAS>_*` variables. This is handy for a single database:

```json
"env": {
  "DB_PROD_TYPE": "postgresql",
  "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname"
}
```

Available fields: `_TYPE`, `_URL`, `_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_DATABASE`, `_MODE`, `_SSL`, `_CA_CERT`, `_TIMEOUT_MS`, `_MAX_ROWS` and `_POOL_MAX`. Alias names are uppercase in variable names (`DB_PROD_*`) and lowercase in tool calls (`"prod"`). Routing metadata is available only in the JSON config. See [`.env.example`](./.env.example).

The two loaders are exclusive:
- If `MCP_DB_CONFIG` is set, the JSON file is used and `DB_*` variables are ignored.
- If it is not set, the `DB_*` variables are used.
- If no alias loads either way, the server exits with code 1.

## Security model

### Modes

| Mode | Allowed statements |
|---|---|
| `readonly` *(default)* | `SELECT`, `EXPLAIN`, `DESCRIBE`, `SHOW`, `USE` |
| `readwrite` | everything above, plus `INSERT`, `UPDATE`, `DELETE`, `MERGE` |
| `readwrite+ddl` | everything above, plus `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `RENAME` |

Unknown statement types are rejected in every mode. A blocked statement returns `DB_PERMISSION_DENIED` together with the exact setting to change. MySQL connections run with `multipleStatements: false`.

### Parameterized queries

```js
// Positional
{ "databaseAlias": "prod", "sql": "SELECT * FROM users WHERE id = ?", "params": [42] }

// Named
{ "databaseAlias": "prod", "sql": "SELECT * FROM users WHERE id = :id", "params": { "id": 42 } }
```

Placeholders become `$1`, `?` or `@p1` depending on the dialect. Placeholders inside string literals and comments are left alone, and a mismatch between placeholders and params is rejected.

### Row caps and timeouts

A `SELECT` without `LIMIT`, `TOP` or `FETCH` is capped at `maxRows`, and the response then includes `truncated: true`. A single call can lower the limits, but never above the alias settings or the global hard caps:

```js
{ "databaseAlias": "prod", "sql": "SELECT * FROM big_table", "maxRows": 50, "timeoutMs": 5000 }
```

## Tools and resources

Tool descriptions are rebuilt at startup to include the roster of loaded aliases.

| Tool | Inputs | Description |
|---|---|---|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` | Run parameterized SQL. |
| `db_list_tables` | `databaseAlias`, `schema?`, `limit?`, `offset?`, `namePattern?` | List tables. Pages default to 100 rows (max 500), and `namePattern` takes a SQL `LIKE` pattern such as `sale_%`. |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` | Columns and indexes of one table. |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` | Dialect-specific `EXPLAIN`. |
| `db_test_connection` | `databaseAlias` | Lightweight `SELECT 1` health check. |
| `db_query_history` | `databaseAlias?`, `limit?` | Recent query metadata: the last 50 calls, without SQL text. |

`databaseAlias` is optional on every tool when `defaultAlias` is configured.

| Resource | Content |
|---|---|
| `db://aliases` | JSON summary of the loaded aliases and their metadata. No secrets. |
| `db://security-guide` | Markdown reference for modes and parameterized queries. |

## Troubleshooting

| Code or message | Meaning and fix |
|---|---|
| `DB_PERMISSION_DENIED` | The alias mode does not allow the statement. Raise `mode` in the JSON config or in `DB_<ALIAS>_MODE`. |
| `DB_TIMEOUT` | The query ran past its timeout. Raise the alias `timeoutMs` or pass `timeoutMs` on the call. |
| `DB_RESULT_TOO_LARGE` | The row cap was exceeded. Add `LIMIT` or raise `maxRows`. |
| `DB_CONNECTION_FAILED` | The database is unreachable. Check host, port and credentials. The server already retried 3 times with backoff. |
| `DB_VALIDATION_FAILED` | An identifier is invalid. `databaseAlias`, `tableName` and `schema` must match `^[A-Za-z_][A-Za-z0-9_]*$`. |
| `DB_CONFIG_INVALID` | One alias has a bad environment-variable config. The message names the field, and the other aliases still load. |
| `Config file not readable at '...'` | Use an absolute `MCP_DB_CONFIG` path and check the file permissions. |
| `Config file is not valid JSON` / `Config schema error: ...` | Fix the field the message names. With `$schema` set, your editor highlights it. |
| `defaultAlias '...' does not reference a loaded alias` | Typo in `defaultAlias`. The server still starts, but without a default. |
| `event="no_valid_aliases"` (exit 1) | No alias loaded. Configure at least one. |

To see what was loaded, read the `loaded_aliases` startup log line or the `db://aliases` resource.

## Development

```bash
pnpm install
pnpm --filter @unclecat/mcp-multi-db test
pnpm --filter @unclecat/mcp-multi-db test:coverage
MCP_DB_CONFIG=/path/to/config.json node db/index.js
```

Architecture notes for contributors are in [CLAUDE.md](./CLAUDE.md). The branch and release flow is described in [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

[MIT](./LICENSE)
