# @unclecat/mcp-multi-db

## 0.0.4

### Patch Changes

- Merge pull request #12 from unclecatvn/changeset-release/master

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
