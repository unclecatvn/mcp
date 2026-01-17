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

Three methods of configuration (parsed in order):

1. **Connection Strings** (via `{TYPE}_CONNECTIONS` env var):
   ```
   MYSQL_CONNECTIONS="prod=mysql://user:pass@host:3306/db;dev=mysql://..."
   ```

2. **Numbered Variables** (via `{TYPE}_DB{N}_*` env vars):
   ```
   MYSQL_DB1_HOST=host1
   MYSQL_DB1_DATABASE=db1
   ```

3. **Legacy Single DB** (via `{TYPE}_*` env vars):
   ```
   MYSQL_HOST=localhost
   MYSQL_DATABASE=mydb
   ```

Connection key format: `{type}_{host}_{port}_{database}_{user}_{options}`

### MCP Tools

All tools accept:
- `type` (required): "mysql" | "mariadb" | "postgresql" | "sqlserver"
- `databaseAlias` (optional): Select from configured connections
- `connection` (optional): Override with custom connection config

**db_query**: Execute raw SQL query
**db_list_tables**: List all tables in database
**db_describe_table**: Get table schema (columns + indexes), requires `tableName`

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
