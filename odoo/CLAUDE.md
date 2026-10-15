# CLAUDE.md

Guidance for Claude Code working in this package.

## Commands

```bash
# Run server (stdio MCP transport)
pnpm start

# Watch + inspector
pnpm dev

# Tests
pnpm test
pnpm test:watch
pnpm test:coverage
```

## Architecture

Plain JavaScript (ESM). No build step — `bin/mcp-odoo` shells straight to `index.js`.

### Entry-point flow

`index.js` → `OdooMCPServer` (`mcpServer.js`) → `registerTools(McpServer, Map<name, OdooClient>)`

### Modules

| File                  | Responsibility                                                                         |
| --------------------- | -------------------------------------------------------------------------------------- |
| `index.js`            | Shebang + runs `OdooMCPServer.run()`                                                   |
| `mcpServer.js`        | Parses env, logs to stderr, builds one `OdooClient` per connection, creates `McpServer` |
| `lib/config.js`       | `parseEnv()` — discovers `ODOO_<NAME>_*` blocks; never throws on per-connection error  |
| `lib/errors.js`       | `OdooError(code, message)` (message pre-prefixed `[CODE]`) + `fromOdooError()`         |
| `lib/client.js`       | `OdooClient` — JSON-2 (19+, API key) or `/jsonrpc` transport, lazy `authenticate()`    |
| `lib/toolHandlers.js` | `registerTools()` — the 10 tools, their zod input schemas and annotations              |
| `lib/instructions.js` | The cheatsheet sent on `initialize` (keep under 2 KB — hosts truncate it)              |

### Tools registered

Read (`readOnlyHint`): `list_connections`, `fields_get`, `search_read`, `search_count`, `name_search`, `read_group`.
Write: `create`, `write`, `unlink`, `call_method` (the last three `destructiveHint`).

### Connection configuration

`ODOO_<NAME>_<FIELD>` env vars, discovered by the `_URL` anchor. Fields: `URL`, `DB`, `USERNAME`, plus exactly one of `API_KEY` / `PASSWORD`, optional `TIMEOUT_MS`. Bad entries are logged and skipped — server keeps running.

### Important conventions to preserve

- **MCP stdio**: never `console.log` — that corrupts the protocol stream. Logging goes to **stderr** via `this.log` in `mcpServer.js`.
- **Errors**: throw `OdooError`; the SDK turns any thrown error into `{ isError: true, content: [{ type: "text", text: err.message }] }`, and the message already starts with `[CODE]`.
- **Validation**: input schemas are `z.object({...}).strict()` so unknown keys are rejected, not silently dropped. Odoo validates model/method names itself — don't add regexes that cost schema tokens on every tool.
- **Odoo 18 vs 19 signatures**: pass parameters whose names differ between versions positionally (e.g. `name_search`'s 2nd param is `args` in 18, `domain` in 19).
- **Secrets**: `list_connections` exposes `authType` but never `secret`. `OdooClient.describe()` is the single source of truth for that contract — keep it lean.
- **Auth lazy + deduped**: don't call `_rpc("common","authenticate",...)` directly from handlers; always go through `client.callKw()` which guarantees one in-flight authenticate even under concurrent first calls.
- **Two transports**: `getServerVersion()` probes `GET /web/version` once per connection (404 on Odoo 18 → `0`). Odoo 19+ with `authType === "apikey"` uses JSON-2 (`POST /json/2/<model>/<method>`, bearer key, `X-Odoo-Database`, named params only); everything else uses `/jsonrpc` execute_kw. Typed methods pass both shapes to `_execute(model, method, args, kwargs, named)`; `named = null` forces `/jsonrpc` (e.g. `call_method` with positional args beyond `ids`).
- **read_group on 19+** goes to `formatted_read_group` and is reshaped to read_group's output (`toFormattedReadGroup` in `client.js`). Keep the documented differences in README in sync if you touch it.

### Adding a new tool

1. Add a `server.registerTool(...)` call in `lib/toolHandlers.js` with a strict zod schema, `annotations`, and a short description with one EXAMPLE.
2. Add a test to `test/unit/server.test.js` (stub client via `registerTools`).

If the tool needs new behaviour on `OdooClient`, add a method there and unit-test it in `test/unit/client.test.js` with a stubbed `fetchImpl`.
