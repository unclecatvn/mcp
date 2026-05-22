# @unclecat/mcp-multi-db

> MCP server for MySQL/MariaDB, PostgreSQL, and SQL Server — with parameterized queries, per-alias safety modes, query timeouts, and row caps.

[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@unclecat/mcp-multi-db.svg)](https://www.npmjs.com/package/@unclecat/mcp-multi-db)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

📖 Tiếng Việt: [README.vi.md](./README.vi.md) · 🛡️ [Security policy](../SECURITY.md)

## Features

- **Parameterized queries only** — eliminates SQL injection at the API layer.
- **Per-alias modes** — `readonly` (default), `readwrite`, `readwrite+ddl`.
- **Query timeouts** — driver-native, with a hard cap of 600 s.
- **Row cap with overflow detection** — default 10 000, configurable per alias and per request.
- **SSL/TLS** — `disable` / `prefer` / `require` / `verify` (custom CA).
- **Multi-database** — MySQL, MariaDB, PostgreSQL, SQL Server side by side, in any combination.
- **Connection pooling, retries with exponential backoff, structured logging.**

## Install

```bash
npx @unclecat/mcp-multi-db
```

Requires Node ≥ 18.

---

## Quick start

A minimal working config for Claude Desktop with one read-only PostgreSQL database:

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "DB_PROD_TYPE": "postgresql",
        "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname"
      }
    }
  }
}
```

That's it. With no `DB_PROD_MODE` set, the alias defaults to **`readonly`** — only SELECT/EXPLAIN/DESCRIBE/SHOW/USE are allowed. INSERT/UPDATE/DELETE/DDL are blocked with a clear error message that tells you exactly which env var to set if you want to allow them.

When the server starts, it logs which aliases were loaded:

```
[info] event="loaded_aliases" count=1 aliases="prod(postgresql,readonly)"
[info] event="ready"
```

---

## Configure via JSON file (recommended for multi-DB)

If you have more than one database — or you want the AI client to know what each one is *for* — point the server at a JSON config file with the `MCP_DB_CONFIG` env var. This replaces the `DB_<ALIAS>_*` env block with a compact, block-per-alias file.

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "MCP_DB_CONFIG": "/Users/you/mcp-db.config.json"
      }
    }
  }
}
```

The config file lists each alias once, with all its fields nested in a single block:

```json
{
  "$schema": "https://unpkg.com/@unclecat/mcp-multi-db/schema/config.schema.json",
  "defaultAlias": "unleashed",
  "aliases": {
    "unleashed": {
      "type": "postgresql",
      "url": "postgresql://ro:pw@host:5432/main",
      "mode": "readonly",
      "displayName": "Unleashed — TMĐT Đài Loan",
      "description": "Production DB for the Taiwan market. Orders, products, customers.",
      "tablesHint": ["orders", "products", "customers"]
    },
    "staging": {
      "type": "mysql",
      "host": "staging.example.com", "user": "app", "password": "pw", "database": "appdb",
      "mode": "readwrite",
      "displayName": "Staging",
      "description": "Test environment. Allows INSERT/UPDATE/DELETE."
    }
  }
}
```

### Metadata fields (make the AI pick the right alias)

| Field | Purpose |
|-------|---------|
| `displayName` | Short human-readable label shown next to the alias name in tool descriptions. |
| `description` | One-line explanation of what the database is for. Shown in tool descriptions so the AI routes queries to the right alias. |
| `tablesHint` | Optional list of likely table names — gives the AI a starting point for schema discovery. |
| `defaultAlias` (top-level) | Hint shown in tool descriptions when the user doesn't specify a database. `databaseAlias` is still required at the schema level — this is a routing hint, not a server-side default. |

At startup the server injects this metadata into every database tool's description, and adds an `enum` constraint to `databaseAlias` listing the loaded aliases — so the AI cannot hallucinate an alias name that doesn't exist.

### Loader priority

- `MCP_DB_CONFIG` set → file loader is used; **`DB_*` env vars are ignored**.
- `MCP_DB_CONFIG` unset → falls back to the env-var loader (documented below).
- Both empty → server exits with code 1.

A copyable example lives at [`mcp-db.config.example.json`](./mcp-db.config.example.json).

---

## Configuration model

Configuration is via environment variables. The mental model:

> **Each database you want to access is a named *alias*. Each alias is a group of `DB_<ALIAS>_*` env vars.**

Alias names are uppercase letters, digits, and underscores, starting with a letter (e.g., `PROD`, `DEV`, `DB1`, `LEGACY_2024`). When calling a tool, you pass the alias in lowercase (`databaseAlias: "prod"`).

### Required for every alias

You must set the type, plus enough connection info to reach the database:

| Variable | What it is | Example |
|----------|------------|---------|
| `DB_<ALIAS>_TYPE` | Driver to use | `postgresql` \| `mysql` \| `mariadb` \| `sqlserver` |
| `DB_<ALIAS>_URL` | Full connection URL (one-shot) | `postgresql://user:pass@host:5432/dbname` |

Or instead of `_URL`, set the fields explicitly:

| Variable | Example |
|----------|---------|
| `DB_<ALIAS>_HOST` | `localhost` |
| `DB_<ALIAS>_PORT` | `5432` (defaults to driver standard if omitted) |
| `DB_<ALIAS>_USER` | `appuser` |
| `DB_<ALIAS>_PASSWORD` | `secret` |
| `DB_<ALIAS>_DATABASE` | `mydb` |

You can mix: set `_URL` and override individual fields (`DB_PROD_URL` + `DB_PROD_PASSWORD`).

### Optional, default-safe

All optional vars have safe defaults; you only set what you want to change.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_<ALIAS>_MODE` | `readonly` | What operations the alias allows. See [Security model](#security-model) below. |
| `DB_<ALIAS>_SSL` | `prefer` | TLS behavior: `disable` / `prefer` / `require` / `verify`. |
| `DB_<ALIAS>_CA_CERT` | — | PEM cert as a string; used when `SSL=verify` with a custom CA. |
| `DB_<ALIAS>_TIMEOUT_MS` | `30000` | Per-query timeout in ms. Hard cap: 600 000. |
| `DB_<ALIAS>_MAX_ROWS` | `10000` | Default row cap for SELECTs without explicit LIMIT. Hard cap: 1 000 000. |
| `DB_<ALIAS>_POOL_MAX` | `5` | Max pool connections. Hard cap: 100. |

### Server-wide

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_DB_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |

See [.env.example](./.env.example) for a complete annotated template.

---

## Multiple databases

You configure additional databases by adding more `DB_<ALIAS>_*` blocks with different alias names. The server loads all of them at startup, each with its own connection pool, mode, timeout, and row cap. You can mix database types freely.

### Example — three databases with different roles

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "DB_PROD_TYPE": "postgresql",
        "DB_PROD_URL": "postgresql://ro_user:ro_pass@prod-db.example.com:5432/main",
        "DB_PROD_MODE": "readonly",

        "DB_STAGING_TYPE": "mysql",
        "DB_STAGING_HOST": "staging-db.example.com",
        "DB_STAGING_PORT": "3306",
        "DB_STAGING_USER": "appuser",
        "DB_STAGING_PASSWORD": "stagingpass",
        "DB_STAGING_DATABASE": "appdb",
        "DB_STAGING_MODE": "readwrite",

        "DB_LOCAL_TYPE": "postgresql",
        "DB_LOCAL_URL": "postgresql://postgres:postgres@localhost:5432/devdb",
        "DB_LOCAL_MODE": "readwrite+ddl"
      }
    }
  }
}
```

The server loads three aliases — `prod` (read-only Postgres), `staging` (read-write MySQL), `local` (full-access dev Postgres). Tools are routed by alias:

```js
// Forced read-only on production
db_query({ databaseAlias: "prod",    sql: "SELECT * FROM users WHERE id = ?", params: [42] })

// Allowed because staging is readwrite
db_query({ databaseAlias: "staging", sql: "INSERT INTO logs(msg) VALUES (?)", params: ["test"] })

// Allowed because local is readwrite+ddl
db_query({ databaseAlias: "local",   sql: "CREATE TABLE t (id INT)" })

// Blocked — readonly does not allow DELETE; the error tells you which env var to set
db_query({ databaseAlias: "prod",    sql: "DELETE FROM users WHERE id = ?", params: [42] })
```

### Per-alias overrides

Different databases often need different timeouts, row caps, or pool sizes. Each alias has independent settings:

```json
{
  "DB_PROD_TYPE": "postgresql",
  "DB_PROD_URL": "...",
  "DB_PROD_MODE": "readonly",
  "DB_PROD_TIMEOUT_MS": "60000",
  "DB_PROD_MAX_ROWS": "5000",
  "DB_PROD_POOL_MAX": "10",
  "DB_PROD_SSL": "verify",
  "DB_PROD_CA_CERT": "-----BEGIN CERTIFICATE-----\n...",

  "DB_LOGS_TYPE": "mysql",
  "DB_LOGS_URL": "...",
  "DB_LOGS_MODE": "readwrite",
  "DB_LOGS_MAX_ROWS": "100000"
}
```

### Alias name rules

- Pattern: `^[A-Z][A-Z0-9_]*$` — uppercase letter first, then letters/digits/underscores.
- Valid: `PROD`, `DB1`, `MAIN_RO`, `ANALYTICS_2024`.
- Invalid: `1prod` (starts with digit), `prod-db` (hyphen), `prod.staging` (dot), `Prod` (lowercase letters).
- In tool calls the alias is lowercase: `DB_PROD_*` ⇒ `databaseAlias: "prod"`.

### What if one alias is misconfigured?

Bad aliases are skipped with a logged error; the rest still load. Example: if `DB_BAD_MODE=godmode` is invalid, you'll see:

```
[error] event="config_error" alias="bad" message="DB_BAD_MODE must be one of: readonly, readwrite, readwrite+ddl"
[info]  event="loaded_aliases" count=2 aliases="prod(postgresql,readonly), staging(mysql,readwrite)"
```

If **no** alias is valid, the server exits with code 1 and an error.

### Inspecting loaded aliases

- Log line on startup (above) shows every loaded alias with its type and mode.
- Read the resource `db://aliases` for a JSON summary (no secrets).
- Run `db_test_connection({ databaseAlias: "prod" })` to verify connectivity.

---

## Security model

The server runs with database credentials. To minimize blast radius, every alias has a **mode** that gates which SQL operations are allowed.

| Mode | Allows |
|------|--------|
| `readonly` *(default)* | SELECT, EXPLAIN, DESCRIBE, SHOW, USE |
| `readwrite` | All readonly + INSERT, UPDATE, DELETE, MERGE |
| `readwrite+ddl` | All readwrite + CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, RENAME |

**The default is `readonly`.** If you don't set `DB_<ALIAS>_MODE`, writes and DDL are blocked. You opt into write/DDL per alias by setting it explicitly. This protects production from accidental mutations by an AI client.

Unknown statement types are rejected even at `readwrite+ddl` (deny-by-default).

When a query is blocked, the error message includes the exact env var to set to allow it:

```
[DB_PERMISSION_DENIED] Database 'prod' is in readonly mode. Operation 'DELETE'
requires 'readwrite' mode. To allow: set DB_PROD_MODE=readwrite in environment.
```

For multi-statement queries (e.g., `SELECT ...; DELETE ...;`), the strictest mode required by any statement is enforced.

### Parameterized queries

The `db_query` tool requires SQL with placeholders and a separate `params` value. Never concatenate user input into SQL.

```js
// Positional placeholders — params is an array
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = ?", params: [42] }

// Named placeholders — params is an object
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = :id", params: { id: 42 } }
```

The server translates `?` and `:name` into the dialect-native placeholder shape:

| Dialect | `?` becomes | `:name` becomes |
|---------|-------------|-----------------|
| PostgreSQL | `$1, $2, ...` | `$1, $2, ...` (deduped by name) |
| MySQL / MariaDB | `?` (passthrough) | `?` with reordered values |
| SQL Server | `@p1, @p2, ...` | `@name` (passthrough) |

Placeholders inside string literals (`'...'`, `"..."`) and comments (`-- ...`, `/* ... */`) are ignored. The PostgreSQL `::` cast operator is recognized and not treated as a named placeholder. Mismatched placeholder/param count throws a validation error.

### Row caps and timeouts

By default, SELECT statements without an explicit `LIMIT`/`TOP`/`FETCH` are capped at 10 000 rows. The server fetches `maxRows + 1` to detect overflow; if hit, the response includes `truncated: true` and a hint to add LIMIT or pass a higher `maxRows`.

Per-query overrides:

```js
db_query({
  databaseAlias: "prod",
  sql: "SELECT * FROM big_table",
  maxRows: 50,
  timeoutMs: 5000
})
```

Overrides are bounded by the alias config and global hard caps (1 000 000 rows, 600 000 ms).

---

## Tools

| Tool | Inputs | Description |
|------|--------|-------------|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` | Execute a parameterized SQL query. |
| `db_list_tables` | `databaseAlias`, `schema?` | List tables in the database (filter by schema if provided). |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` | Show columns and indexes for a table. |
| `db_test_connection` | `databaseAlias` | Run a healthcheck against the alias. |
| `db_query_history` | `databaseAlias?`, `limit?` | Return the last N executed queries (sanitized; max 50 retained). |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` | Run EXPLAIN-equivalent and return the plan rows. |

## Resources

- `db://security-guide` — Markdown explanation of modes and parameterized queries.
- `db://aliases` — JSON summary of loaded aliases (no secrets).

---

## Migration from v1

This is the first public release. The unpublished v1.x raw-query API has been replaced. Map your old configuration:

| v1 (removed) | v2 |
|--------------|----|
| `db_query({ type, query: 'SELECT...' })` | `db_query({ databaseAlias, sql, params })` |
| `MYSQL_CONNECTIONS="prod=mysql://..."` | `DB_PROD_TYPE=mysql` + `DB_PROD_URL=mysql://...` |
| `MYSQL_DB1_HOST=h1` (numbered) | `DB_DB1_TYPE=mysql` + `DB_DB1_HOST=h1` |
| `MYSQL_HOST=...` (single legacy) | `DB_PROD_TYPE=mysql` + `DB_PROD_HOST=...` |
| `connection: {...}` tool override | Removed. Configure via env only. |

Default behavior also changed: v2 is **read-only by default** — you must explicitly set `DB_<ALIAS>_MODE=readwrite` (or `readwrite+ddl`) to allow mutations.

---

## Troubleshooting

| Error code | What it means | How to fix |
|------------|---------------|------------|
| `DB_PERMISSION_DENIED` | Alias mode does not permit this operation. | Set `DB_<ALIAS>_MODE` to a permissive mode. The error message names the exact var. |
| `DB_TIMEOUT` | Query exceeded its timeout. | Pass a higher `timeoutMs` per request, or raise `DB_<ALIAS>_TIMEOUT_MS`. Hard cap is 600 000. |
| `DB_RESULT_TOO_LARGE` | Row cap was exceeded. | Add LIMIT to your query, or pass a higher `maxRows` per request, or raise `DB_<ALIAS>_MAX_ROWS`. |
| `DB_CONNECTION_FAILED` | Cannot reach the database. | Verify host/port/credentials. The server retries up to 3 times with backoff. |
| `DB_VALIDATION_FAILED` on identifier | `databaseAlias`, `tableName`, or `schema` does not match `^[A-Za-z_][A-Za-z0-9_]*$`. | Use plain identifiers (no quotes, dashes, dots). |
| `DB_CONFIG_INVALID` (in startup logs) | One alias has bad env vars. | Read the message — it names the field and acceptable values. The other aliases still work. |
| `event="no_valid_aliases"` (server exits 1) | No alias was configured. | Set at least one `DB_<ALIAS>_TYPE` and host/URL. |

If you're not sure your config is correct, check the startup log line `event="loaded_aliases"` or read the `db://aliases` resource — both list every loaded alias.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) at the monorepo root.

## License

MIT — see [LICENSE](./LICENSE).
