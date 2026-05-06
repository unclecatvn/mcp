---
"@unclecat/mcp-multi-db": major
---

First public release. Hardened, parameterized MCP server for MySQL/MariaDB, PostgreSQL, and SQL Server.

- New parameterized API (`db_query` requires `sql` + `params`); raw-query API removed.
- Per-alias safety modes: `readonly` (default), `readwrite`, `readwrite+ddl`.
- Query timeout, row cap with overflow detection, and proper SSL/TLS modes.
- Strict zod validation of all tool inputs; unknown statements rejected by default.
- New env config schema: `DB_<ALIAS>_*`.
- Bilingual docs (EN canonical, VI sync), `SECURITY.md`, `.env.example`.
