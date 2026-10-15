---
"@unclecat/mcp-odoo": minor
---

Odoo 19+ support without the deprecated APIs:

- Connections with an API key on Odoo 19+ use the JSON-2 API (`POST /json/2/<model>/<method>`, bearer auth) instead of `/jsonrpc`, which Odoo 19 deprecates (removal planned for Odoo 22) and logs a warning for on every call. Odoo 18 and password auth keep using `/jsonrpc`.
- `read_group` on Odoo 19+ calls `formatted_read_group` instead of the deprecated `read_group`, and reshapes the result to the same output shape (differences are listed in the README).
- The server version is detected once per connection via `GET /web/version` and shown as `serverVersion` in `list_connections`.
