/**
 * Cheatsheet shipped via `serverInfo.instructions` on initialize. Loaded once
 * per session — keep it tight but cover the Odoo-specific gotchas Claude needs
 * to compose CRUD calls correctly.
 */
export const INSTRUCTIONS = `You are connected to one or more Odoo v18+ instances via JSON-RPC. Every tool requires a "connection" name as its first argument.

================================================================================
TOOL CATALOGUE (pick the right one)
================================================================================
  list_connections   Discover instances. Call once per session.
  fields_get         Inspect a model's schema (cached). Call BEFORE create/write.

  -- READ --
  search_read        Fetch records with a domain (the workhorse).
  search_count       Just count matching records. Cheaper than search_read.
  name_search        Fuzzy lookup by display name → [[id,"name"], ...].
  read_group         GROUP BY + aggregates. For reports / dashboards / KPIs.

  -- WRITE --
  create             Insert one or many records.
  write              Update records by id list.
  unlink             Delete records by id list.

  -- ESCAPE HATCH --
  call_method        Generic execute_kw — business actions, wizards, copy,
                     default_get, custom RPCs, anything else.

================================================================================
RECOMMENDED WORKFLOWS
================================================================================

  Read / report:
      fields_get → know what to ask for
      search_read with explicit \`fields\` and \`limit\`

  Create:
      fields_get          → required fields, types, selection options
      [call_method default_get] → computed defaults (optional but cheap)
      create

  Update:
      search_read         → get the ids
      [fields_get]        → confirm field is writable (not readonly)
      write

  Business action (confirm order, post invoice, validate picking, ...):
      search_read         → get the id
      call_method         → action_confirm / action_post / button_validate / ...

  Find a record by name (autocomplete-style):
      name_search       → [[id, "display_name"], ...]

  Count without fetching rows:
      search_count(domain)            → integer
      search_count(domain, limit=1)   → "is there at least one?" check

  Report / dashboard / KPI:
      read_group        with aggregates=["amount_total:sum","id:count"]
                        and  groupby=["user_id","date_order:month"]
                        and  lazy=false  (flat multi-level groupby)
      → each row carries __domain for drill-down via search_read.

================================================================================
DOMAIN SYNTAX (Polish prefix; default operator between leaves is AND)
================================================================================
  [["state","=","done"]]                                      single leaf
  [["state","=","done"], ["amount_total",">",100]]            implicit AND
  ["&", ["state","=","done"], ["amount_total",">",100]]       explicit AND
  ["|", ["partner_id","=",5], ["partner_id","=",7]]           OR
  ["!", ["active","=",true]]                                  NOT

  Operators: = != > >= < <= =like like ilike =ilike in "not in" child_of parent_of =?

================================================================================
FIELD TYPES & WRITE FORMATS
================================================================================
  Many2one          write integer id; reads return [id, "display_name"].
  One2many / M2m    use command tuples:
                      [0, 0, {values}]  create a new linked record
                      [1, id, {values}] update an existing linked record
                      [2, id, 0]        delete the linked record
                      [3, id, 0]        unlink (drop the relation only)
                      [4, id, 0]        add an existing record
                      [5, 0, 0]         remove all links
                      [6, 0, [ids]]     replace the relation with this exact set
  Date              "YYYY-MM-DD"
  Datetime          "YYYY-MM-DD HH:MM:SS"    UTC — Odoo stores datetimes in UTC.
  Monetary          write a currency_id sibling on the same record.
  Binary            base64-encoded string.
  Selection         use the technical key, not the display label.

================================================================================
FREQUENTLY USED MODELS
================================================================================
  res.partner, res.users, res.company, res.currency
  product.template, product.product, product.category
  sale.order, sale.order.line, purchase.order, purchase.order.line
  account.move, account.move.line, account.journal
  stock.picking, stock.move, stock.quant
  crm.lead, hr.employee, project.project, project.task

================================================================================
COMMON BUSINESS METHODS (use via call_method)
================================================================================
  sale.order        action_confirm, action_cancel, action_draft, action_quotation_sent
  purchase.order    button_confirm, button_cancel, button_draft
  account.move      action_post, button_draft, button_cancel
  stock.picking     action_confirm, action_assign, button_validate
  crm.lead          action_set_won, action_set_lost

================================================================================
ERROR CODES YOU WILL SEE (in the "[CODE] message" prefix)
================================================================================
  ODOO_INPUT_INVALID       Your tool arguments failed schema validation. Fix the call.
  ODOO_UNKNOWN_CONNECTION  Unknown \`connection\`. Run list_connections again.
  ODOO_AUTH_FAILED         Bad API key / password, or 2FA on a password user. Stop, ask the user.
  ODOO_ACCESS_DENIED       The user lacks permission for this model/operation. Do not retry.
  ODOO_MISSING_RECORD      An id was deleted between your search and your call. Re-search.
  ODOO_FIELD_INVALID       A field constraint failed — bad value, missing required field, wrong type.
                           Read the message; usually fixable by adjusting the payload.
  ODOO_USER_ERROR          A business rule blocks the action (e.g. "cannot delete posted invoice").
                           The message tells you which state transition you need first.
  ODOO_SERVER_ERROR        Unknown Odoo exception. Treat as fatal for this call.
  ODOO_TRANSPORT_FAILED    Network/HTTP/timeout. Safe to retry once; if it persists, report it.

================================================================================
EFFICIENCY
================================================================================
  • Always pass an explicit \`fields\` list to search_read — omitting it returns
    every column including heavy binary/HTML fields and wastes tokens.
  • fields_get is cached per (connection, model, fields, attributes) — repeat calls are free.
  • Prefer search_read over search + read (one round-trip instead of two).
  • For pagination use limit + offset, or use an \`order\` clause + filter on id.
`;
