# @unclecat/mcp-odoo

## 0.0.1

### Patch Changes

- Initial public baseline release.
- MCP server for Odoo v18+ over JSON-RPC.
- Multi-instance support via `ODOO_<NAME>_*` env blocks.
- Auth via API key (preferred) or password, per connection.
- Generic CRUD tools: `search_read`, `search_count`, `name_search`, `read_group`, `create`, `write`, `unlink`.
- `fields_get` for schema discovery (cached) and `call_method` as a generic `execute_kw` escape hatch.
- `list_connections` for runtime discovery of configured instances.
- Built-in Odoo cheatsheet sent on `initialize` — domains, command tuples, common models, business actions.
- Stable error envelopes with documented codes (`ODOO_INPUT_INVALID`, `ODOO_AUTH_FAILED`, etc.).
