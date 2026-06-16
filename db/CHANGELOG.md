# @unclecat/mcp-multi-db

## 0.0.6

### Patch Changes

- ae92936: refactor(db): modular lib/ architecture, driver dedup, and expanded test coverage.

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

## 0.0.5

### Patch Changes

- cd3f3bf: docs: VS Code native MCP setup + documentation refresh.

  Documentation-only release — no runtime or API changes. Existing configs keep working as-is.

  **VS Code integration (README.md + README.vi.md)**
  - New **VS Code** section under Quick start covering VS Code 1.102+ native MCP support.
  - Shows the `.vscode/mcp.json` workspace config, calling out that the top-level key is `servers` (not `mcpServers` as in Claude Desktop).
  - Uses `${workspaceFolder}` for `MCP_DB_CONFIG` so the config file can live in the repo root with no hardcoded absolute path — solving the "must be an absolute path" caveat per machine.
  - Documents the `inputs` / `promptString` pattern to prompt for the config path instead of committing it.
  - Notes per-workspace vs. global setup (`MCP: Open User Configuration` / the `mcp` key in user `settings.json`), where to view logs (MCP view in the Extensions panel), and the GitHub Copilot Agent-mode requirement.
  - Mirrored in the Vietnamese README (`README.vi.md`).

  **CLAUDE.md refresh**
  - Rewritten to match the current `lib/`-based architecture. The previous version described a monolithic `mcpServer.js` (~700 lines, 3 tools) that no longer reflects the code.
  - Documents the real layout: `mcpServer.js` (~126 lines) only wires modules, registers handlers, and manages shutdown; logic lives in the `lib/` modules.
  - Adds a module map (loader, configFile/config, connectionManager, toolHandlers, resourceHandlers, queryAnalyzer, modeEnforcer, paramConverter, limits, validators, errors).
  - Describes the startup sequence, the full query pipeline (`analyzeQuery → enforceMode → applyRowLimit → convertParams → withRetry`), all **6** tools (`db_query`, `db_list_tables`, `db_describe_table`, `db_test_connection`, `db_query_history`, `db_explain_query`), both resources (`db://aliases`, `db://security-guide`), and the security model.
  - Updates the commands section to the real Vitest test scripts (`test`, `test:watch`, `test:coverage`) and lint/format commands, replacing the old "no test framework configured" note.

## 0.0.4

### Patch Changes

- Merge pull request #15 from unclecatvn/docs/readme-restructure

## 0.0.3

### Patch Changes

- Merge pull request #11 from unclecatvn/changeset-release/master

## 0.0.2

### Patch Changes

- 00c28cb: feat: JSON config file support and per-alias metadata
  - New `MCP_DB_CONFIG` env var points the server at a JSON config file, replacing the verbose `DB_<ALIAS>_*` env block with one nested block per alias.
  - New per-alias metadata: `displayName`, `description`, `tablesHint`. These are injected into every database tool's description at startup so the AI client knows what each alias is for and routes queries correctly.
  - Optional top-level `defaultAlias` hint shown in tool descriptions.
  - `databaseAlias` tool input is constrained by a JSON-Schema `enum` listing the loaded aliases — clients cannot pass an alias that doesn't exist.
  - The `db://aliases` resource reports the new metadata fields when present.
  - Ships a JSON Schema at `schema/config.schema.json` and an example config at `mcp-db.config.example.json`.

  Backward compatible: existing `DB_<ALIAS>_*` env configuration is unchanged. JSON loader only activates when `MCP_DB_CONFIG` is set; in that case `DB_*` env vars are ignored entirely.

## 0.0.1

### Patch Changes

- Initial public baseline release.
- MCP server for MySQL, MariaDB, PostgreSQL, and SQL Server.
- Parameterized queries only — no raw SQL API exposed to the model.
- Per-alias safety modes: `readonly` (default), `readwrite`, `readwrite+ddl`.
- Alias-based configuration via `DB_<ALIAS>_*` env vars and `{TYPE}_CONNECTIONS` connection strings.
- Per-query timeout (driver-native, capped at 600 s) and row caps with overflow detection.
- SSL/TLS modes including `verify` with custom CA support.
- Connection pooling and automatic retry with exponential backoff.
