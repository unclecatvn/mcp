# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the MCP server (reads config from MCP_DB_CONFIG or DB_* env vars)
npm start            # node index.js
npm run dev          # node --inspect index.js (Node inspector)

# Quality
npm run lint         # eslint .
npm run format       # prettier --check .
npm run format:fix   # prettier --write .

# Tests (Vitest)
npm test             # vitest run
npm run test:watch   # vitest
npm run test:coverage
```

## Architecture

An MCP (Model Context Protocol) server providing parameterized SQL access to MySQL/MariaDB, PostgreSQL, and SQL Server, with per-alias safety modes.

### Entry point flow

`index.js` → `MultiDatabaseMCPServer` (`mcpServer.js`) → `lib/` modules → drivers (`drivers/`).

The bulk of the logic lives in focused `lib/` modules; `mcpServer.js` (~126 lines) only wires them together, registers MCP request handlers, and installs shutdown handlers.

### Startup sequence (`mcpServer.js`)

1. `loadConfig(process.env)` (via `lib/loader.js`) returns `{ aliases, errors, defaultAlias, logLevel, source }`.
2. Config-file `logLevel` overrides the `MCP_DB_LOG_LEVEL` env var only when the env var is unset.
3. Per-alias config errors are logged but non-fatal — other aliases still load. Zero valid aliases → log `event="no_valid_aliases"` and `process.exit(1)`.
4. Build `ConnectionRegistry`, `ToolHandlers`, `ResourceHandlers`; connect over stdio.
5. SIGINT/SIGTERM trigger graceful `closeAll()` with a 5s force-exit guard.

Logging is structured JSON-ish key=value lines on **stderr** (MCP stdio convention) via `makeLogger()`.

### Configuration (`lib/loader.js`)

Two mutually-exclusive loaders, selected by whether `MCP_DB_CONFIG` is set:

1. **JSON config file** (preferred for multi-DB) — `MCP_DB_CONFIG=/abs/path/config.json`. Parsed/validated by `lib/configFile.js`. Top-level keys: `aliases` (required), `defaultAlias` (optional AI routing hint), `logLevel` (optional). Each alias carries connection fields **plus** metadata (`displayName`, `description`, `tablesHint`) used by tool-description injection.
2. **Env vars** (`DB_<ALIAS>_*`) — used only when `MCP_DB_CONFIG` is unset. Parsed by `lib/config.js`. Same connection shape, **no metadata support**.

When `MCP_DB_CONFIG` is set, `DB_*` env vars are ignored entirely. Alias keys are lowercase in JSON, uppercase in env vars; tool calls always use lowercase.

### `lib/` modules

- **aliasConstants.js** — shared VALID_TYPES, modes, defaults, caps, alias key patterns.
- **normalizeAlias.js** — single alias normalization path for env + JSON loaders.
- **loader.js** — picks the JSON vs env loader.
- **configFile.js** / **config.js** — validate JSON-file config / env-var config respectively.
- **connectionManager.js** — `ConnectionRegistry`: owns the alias → driver `Map`, lazily creates drivers on first use, and provides `withRetry()` (≤3 retries, exponential backoff 100ms→2s, recreates the driver after a connection-level failure).
- **toolDescriptors.js** — `ToolDescriptorBuilder`: builds MCP tool schemas with alias roster injection.
- **toolHandlers.js** — `ToolHandlers`: dispatches tool calls, runs the query pipeline, keeps in-memory history.
- **instructions.js** — server-level MCP instructions (initialize).
- **logger.js** — structured stderr logger.
- **tableListing.js** / **tableListingSql.js** — pagination helpers and dialect-specific list-tables SQL.
- **resourceHandlers.js** — `ResourceHandlers`: serves the `db://aliases` and `db://security-guide` resources.
- **queryAnalyzer.js** — classifies SQL statements (statement type, LIMIT/TOP/FETCH presence).
- **modeEnforcer.js** — gates statements against the alias `mode`; strictest mode wins for multi-statement.
- **paramConverter.js** — converts `?` / `:named` placeholders to the dialect's native form (`$1` / `?` / `@p1`), ignoring placeholders inside string literals and comments.
- **limits.js** — `resolveTimeout`, `resolveMaxRows`, `applyRowLimit` (caps unbounded SELECTs); enforces global hard caps.
- **validators.js** — Zod input schemas + `parseOrThrow` for each tool.
- **errors.js** — typed errors and `formatErrorForMcp` (maps to `DB_*` error codes).

### Query pipeline (`ToolHandlers._runQuery`)

`analyzeQuery(sql)` → `enforceMode(analysis, cfg.mode, alias)` → `applyRowLimit(...)` → `convertParams(...)` → `registry.withRetry(driver => driver.query(...))`. Result includes `truncated: true` when the row cap is hit. History (last 50, no SQL text) is recorded per call.

### Drivers (`drivers/`)

- `BaseDriver.js` — abstract interface: `query()`, `listTables()`, `describeTable()`, `healthCheck()`, `close()`.
- `mysql.js` (`mysql2`), `postgresql.js` (`pg`), `sqlserver.js` (`mssql`) — all pooled (default max 5).
- `index.js` — `createDriver(config)` registry; **mariadb reuses the mysql driver**.

### MCP tools (registered in `lib/toolHandlers.js`)

All accept `databaseAlias` (exposed as a JSON-Schema `enum` of loaded aliases so clients can't pass an unknown one).

| Tool | Required extras | Purpose |
|---|---|---|
| `db_query` | `sql` (+ `params?`, `maxRows?`, `timeoutMs?`) | Execute parameterized SQL. |
| `db_list_tables` | — (`schema?`) | List tables, optionally schema-filtered. |
| `db_describe_table` | `tableName` (`schema?`) | Columns + indexes for one table. |
| `db_test_connection` | — | `SELECT 1` healthcheck. |
| `db_query_history` | — (`databaseAlias?`, `limit?`) | Recent in-memory query metadata (no SQL text). |
| `db_explain_query` | `sql` (+ `params?`) | Dialect-specific EXPLAIN. |

When aliases carry metadata, `toolDescriptors()` prepends an "Available aliases" block (from `_buildRoster()`) to each tool description and to the `databaseAlias` field so the AI routes to the right DB.

### MCP resources (`lib/resourceHandlers.js`)

- `db://aliases` — JSON summary of loaded aliases (includes metadata when set; no secrets).
- `db://security-guide` — Markdown reference for modes + parameterized queries.

### Security model

- **Parameterized queries only** — SQL injection is eliminated at the API layer.
- **Per-alias mode**: `readonly` (default) → `readwrite` → `readwrite+ddl`. Unknown statement types are rejected even at `readwrite+ddl`. Blocked ops return `DB_PERMISSION_DENIED` naming the setting to change.
- Row caps (default 10 000, hard cap 1 000 000) and timeouts (default 30 000 ms, hard cap 600 000 ms), bounded per alias and globally.
- MySQL runs with `multipleStatements: false`.

## Important notes

- MariaDB shares the mysql driver (`drivers/index.js`).
- SQL Server config normalizes `host` → `server` and adds default options.
- Logging is on **stderr** (`console.error`) — stdout is reserved for the MCP protocol.
