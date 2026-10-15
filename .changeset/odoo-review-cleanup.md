---
"@unclecat/mcp-odoo": major
---

Breaking: `ODOO_INPUT_INVALID` is gone (validation errors now read `Input validation error: ...`) and `search_read` defaults to `limit: 100`.

- Fix `name_search` with a `domain` on Odoo 19 (`unexpected keyword argument 'args'`): name and domain are now sent positionally, which works on 18 and 19.
- Fix the request timeout not covering the response body read; a stalled body now fails with `ODOO_TRANSPORT_FAILED` instead of hanging.
- `search_read` defaults to `limit: 100` and returns `limit_reached: true` when a page is full.
- Tools carry MCP annotations (`readOnlyHint` on reads, `destructiveHint` on `write` / `unlink` / `call_method`).
- Move to `McpServer.registerTool` with zod schemas (single source of truth); unknown arguments are still rejected. Validation failures now read `Input validation error: ...` instead of `[ODOO_INPUT_INVALID]`.
- Trim tool descriptions and instructions (~5.8k → ~3.3k tokens per session); instructions now fit under the ~2 KB hosts truncate at.
- Remove the unused `index.d.ts` (it declared exports `index.js` never had).
