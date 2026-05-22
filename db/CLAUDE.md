# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the MCP server
npm start
# or
node index.js

# Run with Node inspector for debugging
npm run dev
```

Note: No test framework is currently configured. The `npm test` script is a placeholder.

## Architecture

This is an MCP (Model Context Protocol) server that provides database connectivity for MySQL/MariaDB, PostgreSQL, and SQL Server.

### Entry Point Flow

`index.js` → `MultiDatabaseMCPServer` (mcpServer.js) → Drivers (drivers/)

### Core Components

**MultiDatabaseMCPServer** (`mcpServer.js`)
- Main MCP server class with ~700 lines
- Manages connection pooling and caching via `connections` Map
- Implements auto-retry with exponential backoff (3 retries, 100ms initial delay, 2s max)
- Registers 3 MCP tools: `db_query`, `db_list_tables`, `db_describe_table`

**DatabaseConnection** (mcpServer.js:9-42)
- Wrapper class around driver instances
- Delegates to driver methods: `query()`, `listTables()`, `describeTable()`, `healthCheck()`, `close()`

**Driver Architecture** (`drivers/`)
- `BaseDriver.js` - Abstract base class defining the driver interface
- `mysql.js` - MySQL/MariaDB driver using `mysql2` with pool (max 5 connections)
- `postgresql.js` - PostgreSQL driver using `pg` with pool (max 5, min 1)
- `sqlserver.js` - SQL Server driver using `mssql` with pool (max 5, min 1)
- `index.js` - Driver registry mapping (mariadb reuses mysql driver)

### Connection Configuration

Two mutually-exclusive paths:

1. **JSON config file** (preferred for multi-DB) — point at it via `MCP_DB_CONFIG=/path/to/config.json`. Schema: `lib/configFile.js`. Top-level keys: `aliases` (required), `defaultAlias` (optional hint for AI), `logLevel` (optional). Each alias block carries the same connection fields as the env path plus optional metadata (`displayName`, `description`, `tablesHint`) used by the tool-description injection.

2. **Env vars** (legacy) — `DB_<ALIAS>_TYPE` + connection fields. Schema: `lib/config.js`. Same per-alias config shape minus metadata.

Loader selection lives in `lib/loader.js`. If `MCP_DB_CONFIG` is set, the file loader is used and `DB_*` env vars are ignored entirely.

Connection key format inside the registry: alias names (lowercase) map to driver instances created lazily on first use.

### MCP Tools

All tools accept:
- `databaseAlias` (required for most tools): one of the loaded alias names, exposed as a JSON-Schema `enum` so MCP clients can't pass an alias that doesn't exist.

Tools available (registered in `lib/toolHandlers.js`):

**db_query**: Execute parameterized SQL.
**db_list_tables**: List tables (optionally filtered by schema).
**db_describe_table**: Columns + indexes for one table (requires `tableName`).
**db_test_connection**: Lightweight `SELECT 1` healthcheck.
**db_query_history**: Recent in-memory query metadata.
**db_explain_query**: EXPLAIN-equivalent for the alias's dialect.

When aliases carry metadata, `toolDescriptors()` prepends an "Available aliases" block (built from `_buildRoster()`) to each tool's description so the AI sees what each DB is for.

### Error Handling

- Retryable errors detected via regex patterns (connection lost, timeout, ECONNRESET, etc.)
- On retry, cached connection is removed and recreated
- SQL Server uses parameterized queries; MySQL uses `??` placeholder for identifiers

### Important Notes

- MariaDB shares the same driver as MySQL (see drivers/index.js)
- SQL Server config normalization: `host` → `server`, adds default options
- All drivers use connection pooling (max 5 connections)
- `multipleStatements: false` in MySQL for security
- Logging uses `console.error` (MCP stdio convention)
- Server handles SIGINT for graceful cleanup
