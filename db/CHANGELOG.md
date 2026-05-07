# @unclecat/mcp-multi-db

## 3.0.1

### Patch Changes

- 13ac8d9: Expand MCP tool descriptions to give AI clients clearer guidance.

  Each tool now documents purpose, when to use it, mode/permission constraints, and the response shape. Per-property descriptions explain expected formats (placeholder syntax, schema filters, etc.).
  - `db_query` — placeholder examples, mode → operation matrix, auto-LIMIT behavior, return shape.
  - `db_list_tables` — schema filter behavior across drivers, return shape.
  - `db_describe_table` — driver-specific index shapes, identifier validation.
  - `db_test_connection` — when to use (troubleshoot, audit), return shape.
  - `db_query_history` — privacy note (only metadata stored, no SQL/params), retention cap.
  - `db_explain_query` — dialect-specific handling, mode requirements.

  No API changes — descriptive metadata only.

- ca4628c: Expand MCP tool descriptions with purpose, constraints, and return shapes for better AI client guidance.

## 3.0.0

### Major Changes

- bcef4d3: First public release. Hardened, parameterized MCP server for MySQL/MariaDB, PostgreSQL, and SQL Server.
  - New parameterized API (`db_query` requires `sql` + `params`); raw-query API removed.
  - Per-alias safety modes: `readonly` (default), `readwrite`, `readwrite+ddl`.
  - Query timeout, row cap with overflow detection, and proper SSL/TLS modes.
  - Strict zod validation of all tool inputs; unknown statements rejected by default.
  - New env config schema: `DB_<ALIAS>_*`.
  - Bilingual docs (EN canonical, VI sync), `SECURITY.md`, `.env.example`.
