# @unclecat/mcp-multi-db

> MCP server for MySQL/MariaDB, PostgreSQL, and SQL Server — parameterized queries, per-alias safety modes, query timeouts, row caps.

[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@unclecat/mcp-multi-db.svg)](https://www.npmjs.com/package/@unclecat/mcp-multi-db)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

📖 Tiếng Việt: [README.vi.md](./README.vi.md) · 🛡️ [Security policy](../SECURITY.md)

## Features

- **Parameterized queries only** — eliminates SQL injection at the API layer.
- **Per-alias modes** — `readonly` (default), `readwrite`, `readwrite+ddl`.
- **Multi-database** — MySQL, MariaDB, PostgreSQL, SQL Server side by side.
- **Metadata-aware tool descriptions** — alias `description` + `tablesHint` are injected into MCP tool schemas so the AI picks the right database instead of guessing.
- Query timeouts, row caps with overflow detection, SSL/TLS (`disable`/`prefer`/`require`/`verify`), connection pooling, retries with exponential backoff, structured logging.

## Install

```bash
npx @unclecat/mcp-multi-db
```

Requires **Node ≥ 20**.

---

## Quick start (recommended: JSON config)

Point the server at a single JSON file with `MCP_DB_CONFIG` (use an **absolute path** — the MCP process's working directory is set by the client):

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

`mcp-db.config.json`:

```jsonc
{
  "$schema": "https://unpkg.com/@unclecat/mcp-multi-db/schema/config.schema.json",
  "defaultAlias": "prod",
  "aliases": {
    "prod": {
      "type": "postgresql",
      "url": "postgresql://ro:pw@host:5432/main",
      "mode": "readonly",
      "displayName": "Production",
      "description": "Read-only mirror of production. Orders, customers, products.",
      "tablesHint": ["orders", "customers", "products"]
    },
    "staging": {
      "type": "mysql",
      "host": "stg.example.com", "user": "app", "password": "pw", "database": "appdb",
      "mode": "readwrite"
    }
  }
}
```

Startup log:

```
[info] event="loaded_aliases" source="config_file" count=2 \
       aliases="prod(postgresql,readonly), staging(mysql,readwrite)" defaultAlias="prod"
```

> **Why JSON over env vars?** One block per alias instead of `DB_<ALIAS>_*` × 6+ variables, and you can attach `displayName`/`description`/`tablesHint` — those go into the AI's tool description so it routes queries to the right alias.

Copy [`mcp-db.config.example.json`](./mcp-db.config.example.json) to start.

---

## Configuration reference

### Required per alias

| Field | What |
|---|---|
| `type` | `postgresql` \| `mysql` \| `mariadb` \| `sqlserver` |
| `url` **or** `host` | Connection URL, OR explicit `host` (+ `port`, `user`, `password`, `database` as the driver needs) |

Set both → explicit fields override the URL's components.

### Optional per alias (all default-safe)

| Field | Default | Hard cap |
|---|---|---|
| `mode` | `readonly` | — |
| `ssl` | `prefer` | — |
| `caCert` | — | — |
| `timeoutMs` | `30000` | `600000` |
| `maxRows` | `10000` | `1000000` |
| `poolMax` | `5` | `100` |

### Metadata (JSON only — drives AI routing)

| Field | Effect |
|---|---|
| `displayName` | Short label next to the alias name in tool descriptions. |
| `description` | One-line "what this DB is for". Goes into tool descriptions so the AI knows which alias to call. |
| `tablesHint` | Likely table names — gives the AI a starting point. |
| `defaultAlias` (top-level) | Hint shown in tool descriptions when the user doesn't name a DB. `databaseAlias` is still **required** at the schema level — this is a routing hint, not a server-side default. |

At startup the server injects this metadata into every tool's description, and adds a JSON-Schema `enum` to `databaseAlias` listing loaded aliases — clients cannot pass an alias that doesn't exist.

### Server-wide

| Setting | Default | How to set |
|---|---|---|
| Log level | `info` | env: `MCP_DB_LOG_LEVEL=debug` &nbsp;**or**&nbsp; JSON: `"logLevel": "debug"` (top-level) |

### Alias name rules

| Source | Pattern | Example |
|---|---|---|
| JSON `aliases` key | `^[a-z][a-z0-9_]*$` *(lowercase)* | `prod`, `db1`, `analytics_2024` |
| Env var `DB_<ALIAS>_*` | `^[A-Z][A-Z0-9_]*$` *(uppercase)* | `PROD`, `DB1`, `ANALYTICS_2024` |
| Tool call `databaseAlias` | always lowercase | `"prod"` |

---

## Alternative: env-var configuration

When `MCP_DB_CONFIG` is **not** set, the server falls back to `DB_<ALIAS>_*` env vars. Use this for a simple single-DB case or when the client can't reference a file path.

```json
"env": {
  "DB_PROD_TYPE": "postgresql",
  "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname"
}
```

Field name mapping = SCREAMING_SNAKE_CASE of the JSON field. The full list: `DB_<ALIAS>_TYPE`, `_URL`, `_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_DATABASE`, `_MODE`, `_SSL`, `_CA_CERT`, `_TIMEOUT_MS`, `_MAX_ROWS`, `_POOL_MAX`. Env-var loader does **not** support metadata (`displayName`/`description`/`tablesHint`) — JSON-only.

**Loader priority (exclusive):**

- `MCP_DB_CONFIG` set → JSON loader, `DB_*` env vars ignored entirely.
- `MCP_DB_CONFIG` unset → env-var loader.
- Both empty → server exits with code 1.

See [.env.example](./.env.example) for the full env template.

---

## Security model

Every alias has a **mode** gating which SQL operations are allowed:

| Mode | Allows |
|---|---|
| `readonly` *(default)* | SELECT, EXPLAIN, DESCRIBE, SHOW, USE |
| `readwrite` | + INSERT, UPDATE, DELETE, MERGE |
| `readwrite+ddl` | + CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, RENAME |

Default is `readonly` — writes are blocked unless you opt in. Unknown statement types are rejected even at `readwrite+ddl`. For multi-statement queries the strictest mode wins. Blocked operations return `DB_PERMISSION_DENIED` naming the exact setting to change.

### Parameterized queries

```js
// Positional — params is an array
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = ?", params: [42] }

// Named — params is an object
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = :id", params: { id: 42 } }
```

The server translates placeholders to the dialect's native form (`$1`/`?`/`@p1`). Placeholders inside string literals and comments are ignored. Mismatched placeholder/param count throws a validation error.

### Row caps

SELECT without `LIMIT`/`TOP`/`FETCH` is capped at `maxRows` (default 10 000). Response includes `truncated: true` when the cap is hit. Per-query override:

```js
db_query({ databaseAlias: "prod", sql: "SELECT * FROM big_table", maxRows: 50, timeoutMs: 5000 })
```

Override is bounded by alias config and the global hard caps (1 000 000 rows, 600 000 ms).

---

## Tools

Tool descriptions are rebuilt at startup to embed the loaded alias roster — so the AI sees what each DB is for, not just a list of names.

| Tool | Inputs | Description |
|---|---|---|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` | Execute parameterized SQL. |
| `db_list_tables` | `databaseAlias`, `schema?` | List tables (optionally schema-filtered). |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` | Columns + indexes for one table. |
| `db_test_connection` | `databaseAlias` | Lightweight `SELECT 1` healthcheck. |
| `db_query_history` | `databaseAlias?`, `limit?` | Recent in-memory query metadata (last 50, no SQL text). |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` | Dialect-specific EXPLAIN. |

## Resources

- `db://aliases` — JSON summary of loaded aliases. Includes `displayName`/`description`/`tablesHint` when set. No secrets.
- `db://security-guide` — Markdown reference for modes + parameterized queries.

---

## Troubleshooting

| Code / event | Meaning | Fix |
|---|---|---|
| `DB_PERMISSION_DENIED` | Operation not permitted by alias mode | Raise `mode` in JSON (or `DB_<ALIAS>_MODE` env). |
| `DB_TIMEOUT` | Query exceeded timeout | Raise alias `timeoutMs` or pass per-request `timeoutMs`. |
| `DB_RESULT_TOO_LARGE` | Row cap exceeded | Add `LIMIT`, or raise `maxRows`. |
| `DB_CONNECTION_FAILED` | Cannot reach DB | Verify host/port/credentials. Server retries 3× with backoff. |
| `DB_VALIDATION_FAILED` | Bad identifier | `databaseAlias` / `tableName` / `schema` must match `^[A-Za-z_][A-Za-z0-9_]*$`. |
| `DB_CONFIG_INVALID` | Bad env-var alias config | Message names the field + valid values. Other aliases still load. |
| `Config file not readable at '...'` | `MCP_DB_CONFIG` path missing or unreadable | Use an **absolute** path; check file permissions. |
| `Config file is not valid JSON: ...` | JSON syntax error | Validate the file (editors flag this when `$schema` is set). |
| `Config schema error: aliases.<a>.<field>: ...` | JSON field invalid | Message names field + reason; fix or remove that alias entry. |
| `defaultAlias '...' does not reference a loaded alias` | Top-level `defaultAlias` typo | Match an existing key under `aliases`. Server still starts; hint just ignored. |
| `event="no_valid_aliases"` (exit 1) | No alias loaded | Set at least one alias in JSON or env. |

Verify what loaded: read the startup log (`event="loaded_aliases" source="..." count=..."`) or the `db://aliases` resource.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) at the monorepo root.

## License

MIT — see [LICENSE](./LICENSE).
