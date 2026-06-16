---
"@unclecat/mcp-multi-db": patch
---

refactor(db): modular lib/ architecture, driver dedup, and expanded test coverage.

Backward compatible — same MCP tools and env/JSON config shape; existing clients keep working.

**Architecture**
- Split `toolHandlers.js` (~480 → ~215 lines): extract `toolDescriptors.js`, `tableListingSql.js`, `instructions.js`, `logger.js`.
- Deduplicate config loaders via `aliasConstants.js` + `normalizeAlias.js`.
- Move shared driver logic into `BaseDriver` (`listTables`, `healthCheck`, `_classifyError`); dialect drivers implement `executeQuery` + `describeTable` only.

**Features**
- `defaultAlias` in JSON config: omit `databaseAlias` in tool calls when set.
- `defaultSchema` per alias (config schema + `db_list_tables` / `db_describe_table` fallback).
- `db_list_tables`: optional `limit`, `offset`, `namePattern` pagination/filter.
- `modeEnforcer` gates on `effectiveType` so `EXPLAIN ANALYZE <write>` cannot bypass readonly mode.

**Quality**
- 203 unit tests (was ~123); coverage thresholds enforced for all `lib/` + `drivers/` (≥88% lines).
- Driver unit tests for MySQL, PostgreSQL, SQL Server (`executeQuery`, `listTables`).
