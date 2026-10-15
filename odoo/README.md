# @unclecat/mcp-odoo

> MCP server for [Odoo](https://www.odoo.com) 18+ over JSON-RPC. It lets an AI assistant search, report on, create and update records, and run business actions on any model.

[![npm](https://img.shields.io/npm/v/@unclecat/mcp-odoo.svg)](https://www.npmjs.com/package/@unclecat/mcp-odoo)
[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

**English** · [Tiếng Việt](./README.vi.md) · [Security policy](../SECURITY.md)

The server exposes Odoo's ORM through ten generic tools, so it works with every standard and custom model without per-model code. One server can talk to several Odoo instances, such as production, staging and a client's database, and the model picks one per call.

## Features

- **The whole ORM surface:**
  - schema discovery;
  - searches, counts and fuzzy name lookup;
  - `read_group` aggregates for reports;
  - create, write and unlink;
  - a `call_method` escape hatch for business actions such as confirming orders, posting invoices or running wizards.
- **Several instances.** Configure any number of instances, each with its own credentials and timeout.
- **API-key auth** (recommended) or a password, chosen per instance.
- **Built-in Odoo cheatsheet.** On `initialize` the model receives notes on domain syntax, x2many command tuples, field formats and error codes, so it builds correct calls without trial and error.
- **Stable error codes.** Odoo exceptions are mapped to codes such as `ODOO_ACCESS_DENIED` and `ODOO_USER_ERROR`, so the model knows whether to fix the call, retry or stop.

## Quick start

Requires **Node.js 20+** and an Odoo 18+ user with an API key. To create one, open your avatar menu → **My Profile → Account Security → New API Key**. If the API Keys section is hidden, enable developer mode first.

### Claude Code

```bash
claude mcp add odoo \
  -e ODOO_PROD_URL=https://erp.example.com \
  -e ODOO_PROD_DB=production \
  -e ODOO_PROD_USERNAME=admin@example.com \
  -e ODOO_PROD_API_KEY=your-api-key \
  -- npx -y @unclecat/mcp-odoo
```

### Claude Desktop, Cursor, Windsurf

Add the server to `claude_desktop_config.json`, `.cursor/mcp.json` or the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-odoo"],
      "env": {
        "ODOO_PROD_URL": "https://erp.example.com",
        "ODOO_PROD_DB": "production",
        "ODOO_PROD_USERNAME": "admin@example.com",
        "ODOO_PROD_API_KEY": "your-api-key"
      }
    }
  }
}
```

### VS Code

In `.vscode/mcp.json` (VS Code 1.102+), use the same block under a top-level `servers` key and add `"type": "stdio"`.

## Configuration

Each instance is a block of environment variables named `ODOO_<NAME>_<FIELD>`. `<NAME>` becomes the lowercase `connection` argument that tools take: `ODOO_PROD_*` becomes `"prod"`, and `ODOO_MY_PROD_*` becomes `"my_prod"`.

| Field | Required | Description |
|---|---|---|
| `URL` | yes | Base URL, e.g. `https://erp.example.com` |
| `DB` | yes | Database name |
| `USERNAME` | yes | Login (email or username) |
| `API_KEY` | one of these two | Recommended. You can rotate and revoke it independently of the password. |
| `PASSWORD` | one of these two | Fallback when API keys are not available |
| `TIMEOUT_MS` | no | Request timeout. Default `60000`, clamped to the range 1,000–600,000 ms. |

A second instance is simply another block:

```json
"env": {
  "ODOO_PROD_URL": "https://erp.example.com",
  "ODOO_PROD_DB": "production",
  "ODOO_PROD_USERNAME": "admin@example.com",
  "ODOO_PROD_API_KEY": "key-prod",

  "ODOO_STAGING_URL": "https://staging.example.com",
  "ODOO_STAGING_DB": "staging",
  "ODOO_STAGING_USERNAME": "admin@example.com",
  "ODOO_STAGING_PASSWORD": "password-staging"
}
```

- An invalid block is logged to stderr and skipped. The server keeps running with the other instances.
- If a block sets both `API_KEY` and `PASSWORD`, the API key is used and a warning is logged.

> **Two-factor authentication.** Password login is rejected for users who have 2FA enabled. Use an API key, which works with 2FA by design.

## Tools

Every tool except `list_connections` takes a `connection` argument.

| Tool | Use it to | Returns |
|---|---|---|
| `list_connections` | Discover the configured instances, once per session | `{ connections: [{ name, url, db, username, authType, ... }] }` |
| `fields_get` | Inspect a model's fields before writing. Results are cached. | `{ model, fields: { name: { type, required, relation, ... } } }` |
| `search_read` | Query records with a domain, fields, limit and order | `{ model, count, records: [...] }` |
| `search_count` | Count records without fetching them | `{ model, count }` |
| `name_search` | Fuzzy lookup by display name | `{ model, results: [[id, "name"], ...] }` |
| `read_group` | Group by fields and aggregate, for reports and KPIs | `{ model, count, groups: [...] }` |
| `create` | Insert one record or a batch | `{ model, id }` or `{ model, ids }` |
| `write` | Update records by id | `{ model, ids, success }` |
| `unlink` | Delete records by id. Archiving with `active: false` is often safer. | `{ model, ids, success }` |
| `call_method` | Run any other model method: business actions, wizards, `copy`, `default_get`, custom RPCs | `{ model, method, result }` |

### Example prompts

- *"How many confirmed sales orders did we have last month, grouped by salesperson?"*
- *"Find the partner Acme and list their unpaid invoices."*
- *"Create a quotation for Acme with 10 office chairs and confirm it."*
- *"Compare product prices between prod and staging."*

## Error codes

Errors are returned as `[CODE] message` inside an MCP `isError` result.

| Code | Meaning | What the model should do |
|---|---|---|
| `ODOO_INPUT_INVALID` | Arguments failed schema validation | Fix the call |
| `ODOO_UNKNOWN_CONNECTION` | Unknown `connection` | Call `list_connections` again |
| `ODOO_AUTH_FAILED` | Bad credentials, or a password login for a 2FA user | Stop and ask the operator |
| `ODOO_ACCESS_DENIED` | The user lacks rights on the model or record | Do not retry |
| `ODOO_MISSING_RECORD` | The record was deleted in the meantime | Search again |
| `ODOO_FIELD_INVALID` | A constraint failed, e.g. a missing required field or a wrong type | Fix the payload |
| `ODOO_USER_ERROR` | A business rule blocked the action | Usually another state transition is needed first |
| `ODOO_SERVER_ERROR` | Unexpected Odoo exception | Treat as fatal for this call |
| `ODOO_TRANSPORT_FAILED` | Network, HTTP or timeout error | Safe to retry once |

## Security

- **Least privilege.** The model can do anything the configured Odoo user can do. Connect it as a dedicated user whose access rights match what you want the assistant to touch.
- **Prefer API keys.** You can revoke an API key without changing the user's password.
- **Plain HTTP.** `http://` URLs are accepted but trigger a startup warning, because credentials would travel in clear text.
- **No secret leaks.** `list_connections` reports the auth *type*, never the key or password.
- **Host visibility.** The MCP host sees every tool input and output, so avoid production credentials in shared or demo sessions.

## Logging

Logs are structured key-value lines on **stderr**, because stdout carries the MCP protocol. Set the level with `MCP_ODOO_LOG_LEVEL`: `debug`, `info` (the default), `warn` or `error`.

## Development

```bash
pnpm install
pnpm --filter @unclecat/mcp-odoo test
pnpm --filter @unclecat/mcp-odoo test:coverage
ODOO_PROD_URL=... ODOO_PROD_DB=... ODOO_PROD_USERNAME=... ODOO_PROD_API_KEY=... node odoo/index.js
```

Architecture notes for contributors are in [CLAUDE.md](./CLAUDE.md). The branch and release flow is described in [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

[MIT](./LICENSE)
