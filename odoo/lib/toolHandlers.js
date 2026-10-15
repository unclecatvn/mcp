import { z } from "zod";
import { OdooError } from "./errors.js";

function ok(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

const SEARCH_READ_DEFAULT_LIMIT = 100;

// ponytail: no regex/length checks on names — Odoo already rejects unknown connections,
// models and (private) methods with a clear error, and each check costs schema tokens on 9 tools.
const Connection = z.string().describe("Connection name from list_connections.");
const Model = z.string().describe("Technical model name, e.g. 'sale.order'.");
// Leaf [field, operator, value] or one of the prefix operators.
const Domain = z
  .array(z.union([z.enum(["&", "|", "!"]), z.tuple([z.string(), z.string(), z.unknown()])]))
  .describe("Odoo domain (Polish prefix). Omit or [] for no filter.");
const Ids = z.array(z.number().int().positive()).min(1);
const Values = z.record(z.unknown());
const Names = z.array(z.string().min(1)).min(1);

const READ_ONLY = { readOnlyHint: true };

/**
 * Register every tool on an McpServer. Inputs are validated by the SDK against
 * the zod schemas; handlers throw OdooError, whose message already carries the
 * `[CODE]` prefix the instructions document.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {Map<string, import("./client.js").OdooClient>} clients
 */
export function registerTools(server, clients) {
  function client(name) {
    const c = clients.get(name);
    if (c) return c;
    const available = [...clients.keys()];
    throw new OdooError(
      "ODOO_UNKNOWN_CONNECTION",
      available.length === 0
        ? "No Odoo connections configured. Set ODOO_<NAME>_URL/DB/USERNAME and either ODOO_<NAME>_API_KEY or ODOO_<NAME>_PASSWORD."
        : `Unknown connection "${name}". Available: ${available.join(", ")}`,
    );
  }

  server.registerTool(
    "list_connections",
    {
      description:
        "List the configured Odoo instances (name, url, db, username, authType — never secrets). " +
        "Use `name` as the `connection` argument of every other tool.",
      annotations: READ_ONLY,
    },
    async () => ok({ connections: [...clients.values()].map((c) => c.describe()) }),
  );

  server.registerTool(
    "fields_get",
    {
      description: [
        "Schema of a model: per-field type, required, readonly, relation, selection. Call before create/write.",
        "Cached for the server lifetime, so repeats are free. Big models (account.move, sale.order) have ~200",
        "fields — pass `fields` and `attributes` to trim.",
        'EXAMPLE: { "connection": "prod", "model": "sale.order", "fields": ["state","partner_id"],',
        '           "attributes": ["type","required","relation","selection"] }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          fields: Names.optional().describe("Only these fields."),
          attributes: Names.optional().describe("Only these metadata keys per field."),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    async ({ connection, model, fields, attributes }) =>
      ok({ model, fields: await client(connection).fieldsGet(model, { fields, attributes }) }),
  );

  server.registerTool(
    "search_read",
    {
      description: [
        "Read records matching a domain in one round-trip. Always pass `fields` — omitting it returns every",
        "column, including heavy binary/HTML fields.",
        "Domain is Polish prefix; leaves are AND-ed by default:",
        '  [["state","=","sale"], ["amount_total",">",100]]',
        '  ["|", ["partner_id","=",5], ["partner_id","=",7]]     ("!" negates the next leaf)',
        "  Operators: = != > >= < <= like ilike =like =ilike in 'not in' child_of parent_of;",
        '  dotted paths work: ["partner_id.country_id.code","=","VN"].',
        'Many2one values come back as [id, "display_name"]. Default limit 100; `limit_reached: true` means',
        "there may be more — page with `offset`.",
        'EXAMPLE: { "connection": "prod", "model": "sale.order", "domain": [["state","=","sale"]],',
        '           "fields": ["name","partner_id","amount_total"], "limit": 20, "order": "date_order desc" }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          domain: Domain.optional(),
          fields: z.array(z.string()).optional().describe("Field names to read."),
          limit: z.number().int().min(1).max(10_000).default(SEARCH_READ_DEFAULT_LIMIT),
          offset: z.number().int().min(0).optional(),
          order: z.string().max(256).optional().describe("e.g. 'date_order desc, id desc'."),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    async ({ connection, model, domain, fields, limit, offset, order }) => {
      const records = await client(connection).searchRead(model, {
        domain,
        fields,
        limit,
        offset,
        order,
      });
      const more = records.length === limit ? { limit_reached: true } : {};
      return ok({ model, count: records.length, ...more, records });
    },
  );

  server.registerTool(
    "search_count",
    {
      description: [
        'Count records matching a domain without fetching them. Pass limit: 1 for an "is there any?" check.',
        'EXAMPLE: { "connection": "prod", "model": "res.partner", "domain": [["country_id.code","=","VN"]] }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          domain: Domain.optional(),
          limit: z.number().int().min(1).max(1_000_000).optional(),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    async ({ connection, model, domain, limit }) =>
      ok({ model, count: await client(connection).searchCount(model, domain, limit) }),
  );

  server.registerTool(
    "name_search",
    {
      description: [
        'Find records by display name → { results: [[id, "display_name"], ...] }. Operator defaults to',
        'ilike (substring); use "=" for an exact match. `domain` narrows the search.',
        'EXAMPLE: { "connection": "prod", "model": "res.partner", "name": "acme",',
        '           "domain": [["customer_rank",">",0]], "limit": 5 }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          name: z.string().max(256).optional(),
          domain: Domain.optional(),
          operator: z.enum(["ilike", "like", "=ilike", "=like", "="]).optional(),
          limit: z.number().int().min(1).max(1_000).optional().describe("Default 100."),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    async ({ connection, model, name, domain, operator, limit }) =>
      ok({
        model,
        results: await client(connection).nameSearch(model, { name, domain, operator, limit }),
      }),
  );

  server.registerTool(
    "read_group",
    {
      description: [
        "GROUP BY with aggregates, computed by the database — use it for totals, reports and KPIs instead",
        "of summing search_read rows.",
        'aggregates: "field:func" or "alias:func(field)"; func = sum avg min max count count_distinct',
        "            array_agg bool_and bool_or.",
        "groupby: field names; dates take a suffix: :day :week :month :quarter :year (also :hour and",
        "         integer parts such as :month_number, :day_of_week).",
        "lazy (default true) groups by the first groupby only; pass false for a flat table across all of them.",
        "Each group carries `__domain` — pass it to search_read to list that group's records.",
        'EXAMPLE: { "connection": "prod", "model": "sale.order", "domain": [["state","=","sale"]],',
        '           "aggregates": ["amount_total:sum"], "groupby": ["user_id","date_order:month"], "lazy": false }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          domain: Domain.optional(),
          aggregates: z.array(z.string().min(1).max(128)).min(1),
          groupby: z.array(z.string().min(1).max(128)).min(1),
          offset: z.number().int().min(0).optional(),
          limit: z.number().int().min(1).max(10_000).optional(),
          orderby: z.string().max(256).optional().describe("e.g. 'amount_total desc'."),
          lazy: z.boolean().optional(),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    async ({ connection, model, ...opts }) => {
      const groups = await client(connection).readGroup(model, opts);
      return ok({ model, count: groups.length, groups });
    },
  );

  server.registerTool(
    "create",
    {
      description: [
        "Create one record (values = object → { id }) or many (values = array → { ids }).",
        "Call fields_get first for required fields and selection keys. Many2one = integer id;",
        "One2many/Many2many = command tuples (see server instructions), e.g. [[0,0,{...}]] adds children.",
        'EXAMPLE: { "connection": "prod", "model": "res.partner",',
        '           "values": { "name": "Acme Co", "is_company": true, "child_ids": [[0,0,{ "name": "Jane" }]] } }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          values: z.union([Values, z.array(Values).min(1)]),
        })
        .strict(),
      annotations: { destructiveHint: false },
    },
    async ({ connection, model, values }) => {
      const result = await client(connection).create(model, values);
      return ok(Array.isArray(values) ? { model, ids: result } : { model, id: result });
    },
  );

  server.registerTool(
    "write",
    {
      description: [
        "Apply the same `values` to every id (ids come from a prior search — never invent them).",
        "Same value formats as create. ODOO_USER_ERROR usually means a state transition is needed first",
        "(via call_method).",
        'EXAMPLE (archive): { "connection": "prod", "model": "res.partner", "ids": [142,143],',
        '                     "values": { "active": false } }',
      ].join("\n"),
      inputSchema: z
        .object({ connection: Connection, model: Model, ids: Ids, values: Values })
        .strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ connection, model, ids, values }) =>
      ok({ model, ids, success: await client(connection).write(model, ids, values) }),
  );

  server.registerTool(
    "unlink",
    {
      description: [
        "Permanently delete records. Prefer archiving (write active=false): posted/confirmed documents",
        "usually refuse unlink with ODOO_USER_ERROR.",
        'EXAMPLE: { "connection": "prod", "model": "res.partner", "ids": [142] }',
      ].join("\n"),
      inputSchema: z.object({ connection: Connection, model: Model, ids: Ids }).strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ connection, model, ids }) =>
      ok({ model, ids, success: await client(connection).unlink(model, ids) }),
  );

  server.registerTool(
    "call_method",
    {
      description: [
        "Call any public model method (model.method(*args, **kwargs) via execute_kw): business actions,",
        "wizards, anything that is not plain CRUD. The return value comes back as `result`.",
        "Record methods take the ids wrapped as the first positional arg: args = [[id]].",
        "  sale.order action_confirm / action_cancel     account.move action_post / button_draft",
        "  purchase.order button_confirm                  stock.picking button_validate",
        '  default_get  args=[["partner_id","company_id"]]       defaults before create',
        '  copy         args=[[id]], kwargs={ "default": { "name": "Copy" } }',
        '  read         args=[[1,2]], kwargs={ "fields": ["name"] }',
        'EXAMPLE: { "connection": "prod", "model": "sale.order", "method": "action_confirm", "args": [[17]] }',
      ].join("\n"),
      inputSchema: z
        .object({
          connection: Connection,
          model: Model,
          method: z.string().describe("e.g. 'action_confirm'."),
          args: z.array(z.unknown()).optional(),
          kwargs: Values.optional().describe("e.g. { context: { lang: 'vi_VN' } }"),
        })
        .strict(),
      annotations: { destructiveHint: true },
    },
    async ({ connection, model, method, args, kwargs }) =>
      ok({ model, method, result: await client(connection).callKw(model, method, args, kwargs) }),
  );
}
