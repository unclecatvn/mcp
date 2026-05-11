import {
  ListConnectionsInputSchema,
  FieldsGetInputSchema,
  SearchReadInputSchema,
  SearchCountInputSchema,
  NameSearchInputSchema,
  ReadGroupInputSchema,
  CreateInputSchema,
  WriteInputSchema,
  UnlinkInputSchema,
  CallMethodInputSchema,
  parseOrThrow,
} from "./validators.js";
import { formatErrorForMcp } from "./errors.js";

function ok(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export class ToolHandlers {
  /** @param {import("./clientRegistry.js").ClientRegistry} registry */
  constructor(registry) {
    this.registry = registry;
  }

  toolDescriptors() {
    return [
      {
        name: "list_connections",
        description: [
          "WHEN: Call once at the start of a session to discover which Odoo instances are reachable.",
          "WHAT: Returns the configured connections with their URL, database, user, and auth type.",
          "      Secrets (API key / password) are never returned.",
          "",
          "EXAMPLE INPUT:  {}",
          "EXAMPLE OUTPUT: {",
          '  "connections": [',
          '    { "name": "prod",    "url": "https://erp.example.com", "db": "production",',
          '      "username": "admin", "authType": "apikey",  "authenticated": false, "timeoutMs": 60000 },',
          '    { "name": "staging", "url": "https://staging.example.com", "db": "staging",',
          '      "username": "admin", "authType": "password","authenticated": false, "timeoutMs": 60000 }',
          "  ]",
          "}",
          "",
          "Use the `name` value as the `connection` argument on every other tool.",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "fields_get",
        description: [
          "WHEN: Before any create/write, or whenever you need to know what fields a model has.",
          "WHY:  Tells you which fields are required, each field's type (char, integer, date,",
          "      monetary, selection, many2one, ...), selection options, relational targets,",
          "      and read-only/computed flags. Lets you build correct payloads on the first try.",
          "",
          "PERFORMANCE: Results are cached per (model, fields, attributes) for the server lifetime —",
          "             calling this repeatedly for the same model is free.",
          "",
          "PARAMETERS:",
          "  • fields      (optional) Restrict which field names to return. Use this if you only",
          "                care about a handful of fields — huge models (account.move, sale.order)",
          "                otherwise return ~200 fields and bloat the response.",
          "  • attributes  (optional) Restrict which metadata keys come back per field.",
          "                Recommended trim: ['string','type','required','readonly','relation','selection','help']",
          "",
          "EXAMPLE INPUT (trimmed):",
          '  { "connection": "prod", "model": "sale.order",',
          '    "fields": ["name","state","partner_id","amount_total","date_order"],',
          '    "attributes": ["type","required","relation","selection"] }',
          "",
          "EXAMPLE OUTPUT:",
          '  { "model": "sale.order", "fields": {',
          '      "name":         { "type": "char",     "required": true },',
          '      "state":        { "type": "selection","selection": [["draft","Quotation"],["sale","Sales Order"],...] },',
          '      "partner_id":   { "type": "many2one", "relation": "res.partner", "required": true },',
          '      "amount_total": { "type": "monetary" },',
          '      "date_order":   { "type": "datetime" }',
          "  } }",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string", description: "Connection name from list_connections." },
            model: {
              type: "string",
              description: "Odoo model technical name (e.g. 'sale.order').",
            },
            fields: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description:
                "Optional whitelist of field names to return. Strongly recommended for large models.",
            },
            attributes: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description: "Optional whitelist of attribute keys to return per field.",
            },
          },
          required: ["connection", "model"],
          additionalProperties: false,
        },
      },
      {
        name: "search_read",
        description: [
          "WHEN: For any query — listing, filtering, reporting. Always preferred over search+read.",
          "WHAT: Combines search() and read() into a single round-trip.",
          "",
          "DOMAIN SYNTAX (Polish prefix; default operator between leaves is AND):",
          '  [["state","=","sale"]]                                       single leaf',
          '  [["state","=","sale"], ["amount_total",">",100]]             implicit AND',
          '  ["&", ["state","=","sale"], ["amount_total",">",100]]        explicit AND',
          '  ["|", ["partner_id","=",5], ["partner_id","=",7]]            OR',
          '  ["!", ["active","=",true]]                                   NOT',
          "  Operators: = != > >= < <= =like like ilike =ilike in 'not in' child_of parent_of =?",
          "",
          "ALWAYS pass `fields` — omitting it returns every column including heavy binary/HTML",
          'fields. Many2one values come back as [id, "display_name"]; selection as the technical key.',
          "",
          "EXAMPLE INPUT:",
          '  { "connection": "prod", "model": "sale.order",',
          '    "domain":  [["state","=","sale"], ["date_order",">=","2026-01-01"]],',
          '    "fields":  ["name","partner_id","amount_total","state","date_order"],',
          '    "limit":   20,',
          '    "order":   "date_order desc, id desc" }',
          "",
          "EXAMPLE OUTPUT:",
          '  { "model": "sale.order", "count": 2, "records": [',
          '      { "id": 17, "name": "S00017", "partner_id": [42,"Acme"], "amount_total": 1250.0,',
          '        "state": "sale", "date_order": "2026-02-08 09:14:00" },',
          '      { "id": 16, "name": "S00016", ... } ] }',
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string", description: "e.g. 'res.partner', 'sale.order'." },
            domain: {
              type: "array",
              description: "Odoo domain (Polish prefix). Use [] for no filter.",
            },
            fields: {
              type: "array",
              items: { type: "string" },
              description: "Field names to read. Strongly recommended — omitting is expensive.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 10000,
              description: "Page size. Default unlimited — set this for safety.",
            },
            offset: {
              type: "integer",
              minimum: 0,
              description: "Pagination offset, combined with limit.",
            },
            order: {
              type: "string",
              description: "SQL-style ORDER BY, e.g. 'date_order desc, id desc'.",
            },
          },
          required: ["connection", "model"],
          additionalProperties: false,
        },
      },
      {
        name: "search_count",
        description: [
          "WHEN: You only need a count — 'how many partners in Vietnam', 'is the inbox empty', 'count overdue invoices'.",
          "WHY:  Far cheaper than search_read + counting client-side: no rows transferred.",
          "",
          "EXAMPLE INPUT:",
          '  { "connection": "prod", "model": "res.partner",',
          '    "domain": [["country_id.code","=","VN"]] }',
          'EXAMPLE OUTPUT: { "model": "res.partner", "count": 1247 }',
          "",
          "TIP: For 'is there at least one' checks, pass limit:1 — Odoo short-circuits at one match.",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            domain: {
              type: "array",
              description: "Odoo domain (Polish prefix). Use [] for total count.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 1000000,
              description: "Optional ceiling; useful for 'has any?' (limit:1).",
            },
          },
          required: ["connection", "model"],
          additionalProperties: false,
        },
      },
      {
        name: "name_search",
        description: [
          "WHEN: Looking up a record by partial name — autocomplete, 'find the Acme partner', 'which user is named Alice'.",
          'WHAT: Returns [[id, "display_name"], ...] sorted by relevance.',
          "",
          "DEFAULT OPERATOR: 'ilike' (case-insensitive substring). Use '=' for an exact match.",
          "OPTIONAL DOMAIN: Restrict the search universe — e.g. only customers, only active records.",
          "",
          "EXAMPLE — fuzzy partner lookup, customers only:",
          '  { "connection": "prod", "model": "res.partner",',
          '    "name":     "acme",',
          '    "domain":   [["customer_rank",">",0]],',
          '    "limit":    5 }',
          "EXAMPLE OUTPUT:",
          '  { "model": "res.partner", "results": [[142,"Acme Co"], [156,"Acme Logistics"]] }',
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            name: {
              type: "string",
              description:
                "Substring to match against the model's display name. Empty string returns the first N records.",
            },
            domain: {
              type: "array",
              description: "Optional extra filter applied on top of the name match.",
            },
            operator: {
              type: "string",
              enum: ["ilike", "like", "=ilike", "=like", "="],
              description:
                "Match operator. Default 'ilike' (case-insensitive substring); use '=' for exact.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 1000,
              description: "Max results, default 100.",
            },
          },
          required: ["connection", "model"],
          additionalProperties: false,
        },
      },
      {
        name: "read_group",
        description: [
          "WHEN: For any aggregation, dashboard, report, or 'group X by Y and sum Z' question.",
          "WHAT: Runs SQL GROUP BY on the server — way more efficient than search_read + client-side aggregation.",
          "",
          'AGGREGATES (`aggregates` arg): array of "field:func" or "alias:func(field)" strings.',
          "  Functions: sum | avg | min | max | count | count_distinct | array_agg | bool_and | bool_or",
          '  Examples: "amount_total:sum", "id:count", "days_open:avg", "closed_count:count(id)"',
          "",
          "GROUPBY (`groupby` arg): array of field names. Date fields support granularity suffix.",
          "  Granularities: hour | day | week | month | quarter | year",
          "  Integer date parts: year_number | quarter_number | month_number | iso_week_number",
          "                      | day_of_year | day_of_month | day_of_week | hour_number | minute_number",
          '  Example: "date_order:month"  → groups every month.',
          "",
          "LAZY (`lazy` arg, default true — Odoo's default):",
          "  • lazy:true  → groups only by the FIRST groupby field; the rest are stuffed into __context",
          "                 (drill-down style; you call read_group again with the returned __domain).",
          "  • lazy:false → groups by ALL groupby fields at once (flat table, recommended for AI reports).",
          "",
          "EXAMPLE — monthly revenue by salesperson:",
          '  { "connection": "prod", "model": "sale.order",',
          '    "domain":     [["state","in",["sale","done"]], ["date_order",">=","2026-01-01"]],',
          '    "aggregates": ["amount_total:sum","id:count"],',
          '    "groupby":    ["user_id","date_order:month"],',
          '    "lazy":       false,',
          '    "orderby":    "user_id, date_order" }',
          "",
          "EXAMPLE OUTPUT (lazy:false):",
          '  { "model": "sale.order", "groups": [',
          '      { "user_id": [5,"Alice"], "date_order:month": "January 2026",',
          '        "amount_total": 125000.0, "id": 42,',
          '        "__domain": [["user_id","=",5],["date_order",">=","2026-01-01"],["date_order","<","2026-02-01"]] },',
          '      { "user_id": [5,"Alice"], "date_order:month": "February 2026",',
          '        "amount_total": 98000.0, "id": 31, ... },',
          "      ...] }",
          "",
          "Each group includes `__domain` you can pass directly to search_read for a drill-down list.",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            domain: {
              type: "array",
              description: "Filter applied before grouping. [] to include everything.",
            },
            aggregates: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description:
                "Aggregate specs: 'field:func' or 'alias:func(field)'. At least one required.",
            },
            groupby: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description:
                "Group fields. Date fields accept ':granularity' suffix (e.g. 'date_order:month').",
            },
            offset: { type: "integer", minimum: 0 },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 10000,
              description: "Max groups returned.",
            },
            orderby: {
              type: "string",
              description: "ORDER BY clause for groups, e.g. 'amount_total desc'.",
            },
            lazy: {
              type: "boolean",
              description: "Default true (Odoo native). Set false for flat multi-level groupby.",
            },
          },
          required: ["connection", "model", "aggregates", "groupby"],
          additionalProperties: false,
        },
      },
      {
        name: "create",
        description: [
          "WHEN: To insert one or more new records.",
          "PRECONDITION: Call fields_get(model) first to know required fields, types, and selection keys.",
          "",
          "PAYLOAD SHAPES:",
          "  • Single dict  → returns { id: number }",
          "  • Array of dicts (bulk) → returns { ids: number[] }",
          "",
          "RELATIONAL FIELDS:",
          "  • Many2one:   write the integer id of the target.",
          "  • One2many / Many2many: use command tuples — see the server instructions.",
          "    Most common: [[0, 0, {values}], ...]  to create inline children,",
          "                 [[6, 0, [ids]]]          to set a Many2many to an exact set.",
          "",
          "EXAMPLE — partner with an inline contact:",
          '  { "connection": "prod", "model": "res.partner",',
          '    "values": {',
          '      "name": "Acme Co",',
          '      "is_company": true,',
          '      "email": "billing@acme.com",',
          '      "child_ids": [[0, 0, { "name": "Jane Doe", "function": "CFO" }]]',
          "  } }",
          'EXAMPLE OUTPUT: { "model": "res.partner", "id": 142 }',
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            values: {
              description: "Record values, or array of records for bulk create.",
              oneOf: [
                { type: "object" },
                { type: "array", items: { type: "object" }, minItems: 1 },
              ],
            },
          },
          required: ["connection", "model", "values"],
          additionalProperties: false,
        },
      },
      {
        name: "write",
        description: [
          "WHEN: To update existing records.",
          "PRECONDITION: You already have ids (from a prior search_read). Never invent ids.",
          "",
          "All ids receive the same `values` patch. To set different values per record, call write multiple times.",
          "Same value-format rules as create (Many2one = int, O2m/M2m = command tuples).",
          "",
          "EXAMPLE — archive two partners:",
          '  { "connection": "prod", "model": "res.partner", "ids": [142,143], "values": { "active": false } }',
          'EXAMPLE OUTPUT: { "model": "res.partner", "ids": [142,143], "success": true }',
          "",
          "If the update is blocked by a business rule you will see ODOO_USER_ERROR — read the message,",
          "it usually explains the state transition you need to perform first via call_method.",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            ids: { type: "array", items: { type: "integer", minimum: 1 }, minItems: 1 },
            values: { type: "object" },
          },
          required: ["connection", "model", "ids", "values"],
          additionalProperties: false,
        },
      },
      {
        name: "unlink",
        description: [
          "WHEN: To permanently delete records. Use sparingly — most Odoo records should be archived",
          "(write active=false) rather than deleted, since posted/confirmed documents block unlink.",
          "",
          'EXAMPLE: { "connection": "prod", "model": "res.partner", "ids": [142] }',
          'EXAMPLE OUTPUT: { "model": "res.partner", "ids": [142], "success": true }',
          "",
          "Common reasons unlink fails:",
          "  • ODOO_USER_ERROR  — record is posted/confirmed; cancel or reverse it instead.",
          "  • ODOO_ACCESS_DENIED — the user lacks delete permission on this model.",
          "  • ODOO_MISSING_RECORD — the id was already deleted; safe to ignore.",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            ids: { type: "array", items: { type: "integer", minimum: 1 }, minItems: 1 },
          },
          required: ["connection", "model", "ids"],
          additionalProperties: false,
        },
      },
      {
        name: "call_method",
        description: [
          "WHEN: For anything that isn't plain CRUD — business actions, wizards, fuzzy lookups,",
          "      computed defaults, or any custom RPC method exposed by a model.",
          "WHAT: Generic wrapper over Odoo's execute_kw — calls `model.method(*args, **kwargs)`.",
          "",
          "RECIPES (the most useful ones):",
          "",
          "  Find by name (fuzzy):",
          "    model='res.partner', method='name_search',",
          "    kwargs={ name: 'Acme', limit: 5 }",
          "    → returns [[id, 'display_name'], ...]",
          "",
          "  Confirm a sale order:",
          "    model='sale.order', method='action_confirm', args=[[order_id]]",
          "",
          "  Post a customer invoice:",
          "    model='account.move', method='action_post', args=[[move_id]]",
          "",
          "  Validate a stock picking:",
          "    model='stock.picking', method='button_validate', args=[[picking_id]]",
          "",
          "  Get computed defaults before create:",
          "    model='sale.order', method='default_get', args=[['partner_id','currency_id','company_id']]",
          "",
          "  Duplicate a record:",
          "    model='product.template', method='copy', args=[[template_id]], kwargs={ default: { name: 'Copy of X' } }",
          "",
          "  Read with id list when you already have ids and just need fields:",
          "    model='res.partner', method='read', args=[[1,2,3]], kwargs={ fields: ['name','email'] }",
          "",
          "RETURNS: whatever the method returns — bool, dict, id list, action descriptor.",
          "The result is passed through verbatim under the `result` key.",
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {
            connection: { type: "string" },
            model: { type: "string" },
            method: {
              type: "string",
              description: "Method name, e.g. 'action_confirm', 'name_search'.",
            },
            args: {
              type: "array",
              description:
                "Positional args. For action methods this is [[ids]] (note the double-wrap).",
            },
            kwargs: {
              type: "object",
              description:
                "Keyword args. Frequently used: { context: { lang: 'en_US' } }, { limit: 5 }.",
            },
          },
          required: ["connection", "model", "method"],
          additionalProperties: false,
        },
      },
    ];
  }

  async dispatch(toolName, args) {
    try {
      switch (toolName) {
        case "list_connections":
          return await this._listConnections(args);
        case "fields_get":
          return await this._fieldsGet(args);
        case "search_read":
          return await this._searchRead(args);
        case "search_count":
          return await this._searchCount(args);
        case "name_search":
          return await this._nameSearch(args);
        case "read_group":
          return await this._readGroup(args);
        case "create":
          return await this._create(args);
        case "write":
          return await this._write(args);
        case "unlink":
          return await this._unlink(args);
        case "call_method":
          return await this._callMethod(args);
        default:
          return formatErrorForMcp(new Error(`Unknown tool: ${toolName}`));
      }
    } catch (err) {
      return formatErrorForMcp(err);
    }
  }

  async _listConnections(args) {
    await parseOrThrow(ListConnectionsInputSchema, args, "list_connections");
    return ok({ connections: this.registry.list() });
  }

  async _fieldsGet(args) {
    const { connection, model, fields, attributes } = await parseOrThrow(
      FieldsGetInputSchema,
      args,
      "fields_get",
    );
    const client = this.registry.get(connection);
    const result = await client.fieldsGet(model, { fields, attributes });
    return ok({ model, fields: result });
  }

  async _searchRead(args) {
    const input = await parseOrThrow(SearchReadInputSchema, args, "search_read");
    const client = this.registry.get(input.connection);
    const records = await client.searchRead(input.model, {
      domain: input.domain ?? [],
      fields: input.fields,
      limit: input.limit,
      offset: input.offset,
      order: input.order,
    });
    return ok({ model: input.model, count: records.length, records });
  }

  async _searchCount(args) {
    const { connection, model, domain, limit } = await parseOrThrow(
      SearchCountInputSchema,
      args,
      "search_count",
    );
    const client = this.registry.get(connection);
    const count = await client.searchCount(model, domain ?? [], limit);
    return ok({ model, count });
  }

  async _nameSearch(args) {
    const { connection, model, name, domain, operator, limit } = await parseOrThrow(
      NameSearchInputSchema,
      args,
      "name_search",
    );
    const client = this.registry.get(connection);
    const results = await client.nameSearch(model, { name, domain, operator, limit });
    return ok({ model, results });
  }

  async _readGroup(args) {
    const input = await parseOrThrow(ReadGroupInputSchema, args, "read_group");
    const client = this.registry.get(input.connection);
    const groups = await client.readGroup(input.model, {
      domain: input.domain ?? [],
      aggregates: input.aggregates,
      groupby: input.groupby,
      offset: input.offset,
      limit: input.limit,
      orderby: input.orderby,
      lazy: input.lazy,
    });
    return ok({ model: input.model, count: groups.length, groups });
  }

  async _create(args) {
    const { connection, model, values } = await parseOrThrow(CreateInputSchema, args, "create");
    const client = this.registry.get(connection);
    const result = await client.create(model, values);
    return ok(Array.isArray(values) ? { model, ids: result } : { model, id: result });
  }

  async _write(args) {
    const { connection, model, ids, values } = await parseOrThrow(WriteInputSchema, args, "write");
    const client = this.registry.get(connection);
    const result = await client.write(model, ids, values);
    return ok({ model, ids, success: result });
  }

  async _unlink(args) {
    const { connection, model, ids } = await parseOrThrow(UnlinkInputSchema, args, "unlink");
    const client = this.registry.get(connection);
    const result = await client.unlink(model, ids);
    return ok({ model, ids, success: result });
  }

  async _callMethod(args) {
    const {
      connection,
      model,
      method,
      args: methodArgs,
      kwargs,
    } = await parseOrThrow(CallMethodInputSchema, args, "call_method");
    const client = this.registry.get(connection);
    const result = await client.callKw(model, method, methodArgs ?? [], kwargs ?? {});
    return ok({ model, method, result });
  }
}
