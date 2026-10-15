# @unclecat/mcp-odoo

## 1.0.0

### Major Changes

- [#31](https://github.com/unclecatvn/mcp/pull/31) [`0b9d8da`](https://github.com/unclecatvn/mcp/commit/0b9d8da2bf6bc1fd375dbb7d4d7f709ff0bc3aff) Thanks [@unclecatvn](https://github.com/unclecatvn)! - Breaking: `ODOO_INPUT_INVALID` is gone (validation errors now read `Input validation error: ...`) and `search_read` defaults to `limit: 100`.
  - Fix `name_search` with a `domain` on Odoo 19 (`unexpected keyword argument 'args'`): name and domain are now sent positionally, which works on 18 and 19.
  - Fix the request timeout not covering the response body read; a stalled body now fails with `ODOO_TRANSPORT_FAILED` instead of hanging.
  - `search_read` defaults to `limit: 100` and returns `limit_reached: true` when a page is full.
  - Tools carry MCP annotations (`readOnlyHint` on reads, `destructiveHint` on `write` / `unlink` / `call_method`).
  - Move to `McpServer.registerTool` with zod schemas (single source of truth); unknown arguments are still rejected. Validation failures now read `Input validation error: ...` instead of `[ODOO_INPUT_INVALID]`.
  - Trim tool descriptions and instructions (~5.8k → ~3.3k tokens per session); instructions now fit under the ~2 KB hosts truncate at.
  - Remove the unused `index.d.ts` (it declared exports `index.js` never had).

### Minor Changes

- [#32](https://github.com/unclecatvn/mcp/pull/32) [`d320447`](https://github.com/unclecatvn/mcp/commit/d320447ee58c99dfbfe3ce20f34a0b4bfef1239c) Thanks [@unclecatvn](https://github.com/unclecatvn)! - Odoo 19+ support without the deprecated APIs:
  - Connections with an API key on Odoo 19+ use the JSON-2 API (`POST /json/2/<model>/<method>`, bearer auth) instead of `/jsonrpc`, which Odoo 19 deprecates (removal planned for Odoo 22) and logs a warning for on every call. Odoo 18 and password auth keep using `/jsonrpc`.
  - `read_group` on Odoo 19+ calls `formatted_read_group` instead of the deprecated `read_group`, and reshapes the result to the same output shape (differences are listed in the README).
  - The server version is detected once per connection via `GET /web/version` and shown as `serverVersion` in `list_connections`.

## 0.0.3

### Patch Changes

- 6156855: docs: rewrite the README (English + Vietnamese) with a consistent structure: quick start for Claude Code, Claude Desktop/Cursor and VS Code, configuration and tool reference, safety notes, troubleshooting. `@unclecat/mcp-obsidian` now ships `README.vi.md`. db docs now cover `defaultAlias` (optional `databaseAlias`), `defaultSchema` and `db_list_tables` pagination.

## 0.0.2

### Patch Changes

- 51f748f: fix(deps): bump `@modelcontextprotocol/sdk` to ^1.31.0 (GHSA-6qxp-vccf-f47h) and patch vulnerable transitive dependencies (hono, proxy-addr, fast-uri, ip-address) via pnpm overrides.

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
