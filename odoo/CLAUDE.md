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

`index.js` → `OdooMCPServer` (`mcpServer.js`) → `ClientRegistry` → `OdooClient`

### Modules

| File                       | Responsibility                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `index.js`                 | Shebang + spawns `OdooMCPServer.run()`                                              |
| `mcpServer.js`             | MCP wiring: parses env, registers tool handlers, sets `serverInfo.instructions`     |
| `lib/config.js`            | `parseEnv()` — discovers `ODOO_<NAME>_*` blocks; never throws on per-connection error |
| `lib/errors.js`            | `McpOdooError` subclasses + `formatErrorForMcp()` for stable tool error envelopes   |
| `lib/validators.js`        | zod schemas for every tool's input; `parseOrThrow` turns failures into `ValidationError` |
| `lib/client.js`            | `OdooClient` — JSON-RPC fetch wrapper, lazy `authenticate()` with in-flight dedup    |
| `lib/clientRegistry.js`    | One `OdooClient` per configured connection; resolves by name                        |
| `lib/toolHandlers.js`      | `ToolHandlers.toolDescriptors()` + `.dispatch(name, args)` for 7 tools              |
| `lib/instructions.js`      | The Odoo cheatsheet sent on `initialize`                                            |

### Tools registered

`list_connections`, `fields_get`, `search_read`, `create`, `write`, `unlink`, `call_method`.

### Connection configuration

`ODOO_<NAME>_<FIELD>` env vars, discovered by the `_URL` anchor. Fields: `URL`, `DB`, `USERNAME`, plus exactly one of `API_KEY` / `PASSWORD`. Bad entries are logged and skipped — server keeps running.

### Important conventions to preserve

- **MCP stdio**: never `console.log` — that corrupts the protocol stream. Logging goes to **stderr** via the structured logger in `mcpServer.js`.
- **Errors**: tool failures must come back through `formatErrorForMcp()` so the host sees `{ isError: true, content: [{ type: "text", text: "[CODE] message" }] }`.
- **Validation**: every tool handler validates with `parseOrThrow(schema, args, toolName)` before touching the registry.
- **Secrets**: `list_connections` exposes `authType` but never `secret`. `OdooClient.describe()` is the single source of truth for that contract — keep it lean.
- **Auth lazy + deduped**: don't call `_rpc("common","authenticate",...)` directly from handlers; always go through `client.callKw()` which guarantees one in-flight authenticate even under concurrent first calls.

### Adding a new tool

1. Add input schema to `lib/validators.js`.
2. Add a `case` and an `async _xxx(args)` method to `lib/toolHandlers.js`.
3. Add a descriptor to `toolDescriptors()` with a description that includes an example.
4. Add a test to `test/unit/toolHandlers.test.js`.

If the tool needs new behaviour on `OdooClient`, add a method there and unit-test it in `test/unit/client.test.js` with a stubbed `fetchImpl`.
