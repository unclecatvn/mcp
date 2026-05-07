---
"@unclecat/mcp-multi-db": patch
---

Expand MCP tool descriptions to give AI clients clearer guidance.

Each tool now documents purpose, when to use it, mode/permission constraints, and the response shape. Per-property descriptions explain expected formats (placeholder syntax, schema filters, etc.).

- `db_query` — placeholder examples, mode → operation matrix, auto-LIMIT behavior, return shape.
- `db_list_tables` — schema filter behavior across drivers, return shape.
- `db_describe_table` — driver-specific index shapes, identifier validation.
- `db_test_connection` — when to use (troubleshoot, audit), return shape.
- `db_query_history` — privacy note (only metadata stored, no SQL/params), retention cap.
- `db_explain_query` — dialect-specific handling, mode requirements.

No API changes — descriptive metadata only.
