# @unclecat/mcp-odoo

> MCP server that exposes any Odoo v18+ instance to an MCP-compatible client (Claude Desktop, Claude Code, etc.) over JSON-RPC.

📖 Tiếng Việt: [README.vi.md](./README.vi.md) · 🛡️ [Security policy](../SECURITY.md)

- Multi-instance: configure as many Odoo servers as you like and route per call via a `connection` argument.
- Auth: API key (preferred) or password — per connection.
- 10 first-class tools covering the full read/write surface:
  - Read: `search_read`, `search_count`, `name_search`, `read_group` (aggregates / GROUP BY for dashboards), `fields_get` (cached schema discovery).
  - Write: `create`, `write`, `unlink`.
  - Discovery: `list_connections`. Escape hatch: `call_method` for business actions, wizards, copy, default_get, custom RPCs.
- Built-in instructions: a cheatsheet about Odoo domains, command tuples, common models, business actions, and stable error codes is sent on `initialize`, so the model knows how to compose calls without trial-and-error.

## Install / run

No install needed — `npx` will fetch the latest published version.

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-odoo"],
      "env": {
        "ODOO_PROD_URL": "https://erp.example.com",
        "ODOO_PROD_DB": "production",
        "ODOO_PROD_USERNAME": "admin",
        "ODOO_PROD_API_KEY": "replace-with-your-api-key"
      }
    }
  }
}
```

For Claude Code, the same config goes in `~/.claude/claude_code_config.json` (or use `claude mcp add`).

## Configuring connections

Pattern: `ODOO_<NAME>_<FIELD>`.

| Field        | Required        | Description                                                                          |
| ------------ | --------------- | ------------------------------------------------------------------------------------ |
| `URL`        | yes             | Base URL of the Odoo instance, e.g. `https://erp.example.com`                        |
| `DB`         | yes             | Database name                                                                        |
| `USERNAME`   | yes             | Login (email or username)                                                            |
| `API_KEY`    | one-of required | Recommended. Create at Settings → Users → API Keys.                                  |
| `PASSWORD`   | one-of required | Fallback when API keys aren't available.                                             |
| `TIMEOUT_MS` | no              | Per-connection request timeout in ms. Default `60000`, clamped to `[1000, 600000]`.  |

`<NAME>` becomes the lowercase `connection` argument passed to every tool — `ODOO_PROD_*` → `"prod"`. Underscores in `<NAME>` are preserved (so `ODOO_MY_PROD_*` → `"my_prod"`).

> **2FA gotcha:** if the Odoo user has two-factor authentication enabled, `PASSWORD` auth **will not work** — `authenticate()` rejects it. Use an API key instead; API keys bypass 2FA by design.

A second connection is just another block:

```jsonc
"env": {
  "ODOO_PROD_URL":      "https://erp.example.com",
  "ODOO_PROD_DB":       "production",
  "ODOO_PROD_USERNAME": "admin",
  "ODOO_PROD_API_KEY":  "k-prod...",

  "ODOO_STAGING_URL":      "https://staging.example.com",
  "ODOO_STAGING_DB":       "staging",
  "ODOO_STAGING_USERNAME": "admin",
  "ODOO_STAGING_PASSWORD": "p-staging..."
}
```

Bad entries are logged on stderr and skipped — they never crash the server. A connection with both `API_KEY` and `PASSWORD` set will use `API_KEY` and warn.

## Tools

| Tool               | When to use                                                                    | Returns                                       |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------- |
| `list_connections` | Once per session — discover available instances                                | `{ connections: [{ name, url, db, ... }] }`   |
| `fields_get`       | Before any create/write, or when you need a model's schema (cached)            | `{ model, fields: { fieldName: {...} } }`     |
| `search_read`      | Any query — combines search + read in one round-trip                           | `{ model, count, records: [...] }`            |
| `search_count`     | Just a count — cheaper than search_read when rows aren't needed                | `{ model, count }`                            |
| `name_search`      | Fuzzy lookup by display name — autocomplete, "find the Acme partner"           | `{ model, results: [[id, "name"], ...] }`    |
| `read_group`       | GROUP BY + aggregates — dashboards, reports, KPIs ("monthly revenue by user")  | `{ model, count, groups: [...] }`             |
| `create`           | Insert one record (dict) or many (array of dicts)                              | `{ model, id }` or `{ model, ids }`           |
| `write`            | Update existing records (you must already have their ids)                      | `{ model, ids, success }`                     |
| `unlink`           | Permanently delete records (most Odoo records prefer `active=false`)           | `{ model, ids, success }`                     |
| `call_method`      | Everything else — business actions, wizards, copy, default_get, custom RPCs    | `{ model, method, result }`                   |

Every tool takes `connection` as its first argument. The server-info `instructions` block (see [`lib/instructions.js`](lib/instructions.js)) tells the model the recommended workflows, domain syntax, command tuples, field-type rules, and the meaning of every error code it can return.

### Error codes Claude will see

Errors come back as the text `[CODE] message` inside an MCP `isError` envelope. Codes are stable:

| Code                       | Meaning                                                        | What the model should do                    |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `ODOO_INPUT_INVALID`       | Tool args failed schema validation                             | Fix the call                                 |
| `ODOO_UNKNOWN_CONNECTION`  | Unknown `connection` arg                                       | Re-run `list_connections`                    |
| `ODOO_AUTH_FAILED`         | Bad credentials, or 2FA on a password user                     | Stop. Ask the operator.                      |
| `ODOO_ACCESS_DENIED`       | User lacks permission for this model/operation                 | Do not retry                                 |
| `ODOO_MISSING_RECORD`      | Id was deleted between search and call                         | Re-search                                    |
| `ODOO_FIELD_INVALID`       | Field constraint failed (missing required, bad type, etc.)     | Read message, fix payload                    |
| `ODOO_USER_ERROR`          | Business rule blocks the action                                | Usually a state transition is needed first   |
| `ODOO_SERVER_ERROR`        | Unknown Odoo exception                                         | Treat as fatal for this call                 |
| `ODOO_TRANSPORT_FAILED`    | Network/HTTP/timeout                                           | Safe to retry once                           |

## How the client model is supposed to use this

The server's `initialize` response includes an instruction block that teaches the model about:

- Odoo domain syntax (Polish prefix, leaf format, operators).
- Many2one / One2many / Many2many write commands.
- Date/datetime/monetary/binary/selection serialization rules.
- The most commonly used models and business action methods.
- Error categories (`AccessError`, `ValidationError`, `MissingError`, ...).

Read [`lib/instructions.js`](lib/instructions.js) for the exact text.

## Logging

The server logs structured key/value lines to **stderr** (the only stream stdio MCP allows). Set `MCP_ODOO_LOG_LEVEL=debug|info|warn|error` to filter (default: `info`).

## Security notes

- Use API keys over passwords whenever possible — they can be rotated/revoked independently of the user's main credential.
- The server only speaks `https:` and `http:`; `http:` triggers a startup warning since credentials would be sent in clear text.
- Secrets are never echoed back to the model — `list_connections` returns auth *type* but never the secret itself.
- The MCP host (Claude Desktop / Code) sees the tool input/output. Don't pass production secrets through demos / shared sessions.

## Development

```bash
pnpm --filter @unclecat/mcp-odoo test          # run unit tests
pnpm --filter @unclecat/mcp-odoo test:watch    # watch mode
pnpm --filter @unclecat/mcp-odoo test:coverage # coverage report
pnpm --filter @unclecat/mcp-odoo start         # run the server (stdio)
```

## License

MIT — see [`LICENSE`](./LICENSE).
