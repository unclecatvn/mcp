# @unclecat/mcp-multi-db

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
