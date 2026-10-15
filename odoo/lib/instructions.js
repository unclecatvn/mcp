/**
 * Sent once per session via `serverInfo.instructions`. Hosts truncate this at
 * about 2 KB (Claude Code does), so keep it under that — tool-specific detail
 * belongs in the tool descriptions, not here.
 */
export const INSTRUCTIONS = `Connected to Odoo v18+ (JSON-2 on 19+, JSON-RPC on 18). Every tool except list_connections needs a "connection" name from list_connections.

Workflow:
- fields_get before create/write (required fields, types, selection keys).
- search_read / name_search to get ids; never invent ids.
- call_method for business actions (action_confirm, action_post, button_validate, ...).
- read_group for totals and reports instead of summing rows yourself.

Write formats:
- Many2one: integer id (reads return [id, "display_name"]).
- One2many / Many2many: list of command tuples
  [0,0,{vals}] create · [1,id,{vals}] update · [2,id,0] delete · [3,id,0] unlink
  [4,id,0] link existing · [5,0,0] clear · [6,0,[ids]] replace with exactly these
- Date "YYYY-MM-DD"; Datetime "YYYY-MM-DD HH:MM:SS" in UTC; Selection = technical key; Binary = base64.

Errors start with "[CODE]":
- ODOO_UNKNOWN_CONNECTION  run list_connections.
- ODOO_AUTH_FAILED         bad API key/password (2FA users need an API key). Stop and ask the user.
- ODOO_ACCESS_DENIED       missing permission. Do not retry.
- ODOO_MISSING_RECORD      the id no longer exists. Search again.
- ODOO_FIELD_INVALID       bad value or missing required field. Fix the payload.
- ODOO_USER_ERROR          a business rule blocked it; the message says what must happen first.
- ODOO_SERVER_ERROR        other Odoo exception.
- ODOO_TRANSPORT_FAILED    network/HTTP/timeout. Retry once, then report.
"Input validation error" means the tool arguments are wrong — fix the call.`;
