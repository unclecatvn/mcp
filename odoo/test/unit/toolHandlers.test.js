import { describe, it, expect, vi } from "vitest";
import { ToolHandlers } from "../../lib/toolHandlers.js";
import { UnknownConnectionError } from "../../lib/errors.js";

function makeRegistry(stubClient) {
  return {
    list() {
      return [
        { name: "prod", url: "https://erp.example.com", db: "p", username: "admin", authType: "apikey", authenticated: false },
      ];
    },
    get(name) {
      if (name !== "prod") {
        throw new UnknownConnectionError(`Unknown connection "${name}"`);
      }
      return stubClient;
    },
    has: (n) => n === "prod",
  };
}

function payload(result) {
  return JSON.parse(result.content[0].text);
}

describe("ToolHandlers", () => {
  it("toolDescriptors exposes 10 tools with required-field metadata", () => {
    const t = new ToolHandlers(makeRegistry({}));
    const tools = t.toolDescriptors();
    const names = tools.map((d) => d.name).sort();
    expect(names).toEqual(
      [
        "call_method",
        "create",
        "fields_get",
        "list_connections",
        "name_search",
        "read_group",
        "search_count",
        "search_read",
        "unlink",
        "write",
      ].sort(),
    );
    for (const d of tools) {
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.inputSchema.type).toBe("object");
      expect(d.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("list_connections returns the registry summary", async () => {
    const t = new ToolHandlers(makeRegistry({}));
    const res = await t.dispatch("list_connections", {});
    expect(payload(res).connections[0].name).toBe("prod");
  });

  it("search_read forwards to client.searchRead", async () => {
    const client = { searchRead: vi.fn().mockResolvedValue([{ id: 1, name: "A" }]) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("search_read", {
      connection: "prod",
      model: "res.partner",
      domain: [["active", "=", true]],
      fields: ["name"],
      limit: 5,
    });
    expect(client.searchRead).toHaveBeenCalledWith("res.partner", {
      domain: [["active", "=", true]],
      fields: ["name"],
      limit: 5,
      offset: undefined,
      order: undefined,
    });
    expect(payload(res)).toEqual({ model: "res.partner", count: 1, records: [{ id: 1, name: "A" }] });
  });

  it("create returns {id} for dict and {ids} for array", async () => {
    const client = { create: vi.fn() };
    client.create.mockResolvedValueOnce(7).mockResolvedValueOnce([8, 9]);
    const t = new ToolHandlers(makeRegistry(client));

    const single = await t.dispatch("create", {
      connection: "prod",
      model: "res.partner",
      values: { name: "X" },
    });
    expect(payload(single)).toEqual({ model: "res.partner", id: 7 });

    const bulk = await t.dispatch("create", {
      connection: "prod",
      model: "res.partner",
      values: [{ name: "Y" }, { name: "Z" }],
    });
    expect(payload(bulk)).toEqual({ model: "res.partner", ids: [8, 9] });
  });

  it("write forwards ids + values to client.write", async () => {
    const client = { write: vi.fn().mockResolvedValue(true) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("write", {
      connection: "prod",
      model: "res.partner",
      ids: [1, 2],
      values: { active: false },
    });
    expect(client.write).toHaveBeenCalledWith("res.partner", [1, 2], { active: false });
    expect(payload(res).success).toBe(true);
  });

  it("unlink forwards ids to client.unlink", async () => {
    const client = { unlink: vi.fn().mockResolvedValue(true) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("unlink", {
      connection: "prod",
      model: "res.partner",
      ids: [42],
    });
    expect(client.unlink).toHaveBeenCalledWith("res.partner", [42]);
    expect(payload(res).success).toBe(true);
  });

  it("search_count forwards domain + limit", async () => {
    const client = { searchCount: vi.fn().mockResolvedValue(7) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("search_count", {
      connection: "prod",
      model: "res.partner",
      domain: [["country_id.code", "=", "VN"]],
      limit: 100,
    });
    expect(client.searchCount).toHaveBeenCalledWith(
      "res.partner",
      [["country_id.code", "=", "VN"]],
      100,
    );
    expect(payload(res)).toEqual({ model: "res.partner", count: 7 });
  });

  it("search_count with no domain forwards []", async () => {
    const client = { searchCount: vi.fn().mockResolvedValue(99) };
    const t = new ToolHandlers(makeRegistry(client));
    await t.dispatch("search_count", { connection: "prod", model: "res.partner" });
    expect(client.searchCount).toHaveBeenCalledWith("res.partner", [], undefined);
  });

  it("name_search forwards all opts", async () => {
    const client = {
      nameSearch: vi.fn().mockResolvedValue([[1, "Acme"], [2, "Acme Logistics"]]),
    };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("name_search", {
      connection: "prod",
      model: "res.partner",
      name: "acme",
      domain: [["customer_rank", ">", 0]],
      operator: "ilike",
      limit: 5,
    });
    expect(client.nameSearch).toHaveBeenCalledWith("res.partner", {
      name: "acme",
      domain: [["customer_rank", ">", 0]],
      operator: "ilike",
      limit: 5,
    });
    expect(payload(res)).toEqual({
      model: "res.partner",
      results: [[1, "Acme"], [2, "Acme Logistics"]],
    });
  });

  it("read_group forwards aggregates + groupby + lazy flag", async () => {
    const groups = [
      {
        user_id: [5, "Alice"],
        "date_order:month": "January 2026",
        amount_total: 125000,
        id: 42,
      },
    ];
    const client = { readGroup: vi.fn().mockResolvedValue(groups) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("read_group", {
      connection: "prod",
      model: "sale.order",
      domain: [["state", "in", ["sale", "done"]]],
      aggregates: ["amount_total:sum", "id:count"],
      groupby: ["user_id", "date_order:month"],
      lazy: false,
      orderby: "user_id, date_order",
      limit: 100,
    });
    expect(client.readGroup).toHaveBeenCalledWith("sale.order", {
      domain: [["state", "in", ["sale", "done"]]],
      aggregates: ["amount_total:sum", "id:count"],
      groupby: ["user_id", "date_order:month"],
      lazy: false,
      orderby: "user_id, date_order",
      limit: 100,
      offset: undefined,
    });
    expect(payload(res)).toMatchObject({
      model: "sale.order",
      count: 1,
      groups,
    });
  });

  it("call_method forwards args and kwargs", async () => {
    const client = { callKw: vi.fn().mockResolvedValue(true) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("call_method", {
      connection: "prod",
      model: "sale.order",
      method: "action_confirm",
      args: [[1]],
      kwargs: { context: { lang: "en_US" } },
    });
    expect(client.callKw).toHaveBeenCalledWith(
      "sale.order",
      "action_confirm",
      [[1]],
      { context: { lang: "en_US" } },
    );
    expect(payload(res).result).toBe(true);
  });

  it("fields_get forwards fields + attributes as opts", async () => {
    const client = { fieldsGet: vi.fn().mockResolvedValue({ name: { type: "char" } }) };
    const t = new ToolHandlers(makeRegistry(client));
    const res = await t.dispatch("fields_get", {
      connection: "prod",
      model: "res.partner",
      fields: ["name", "email"],
      attributes: ["string", "type"],
    });
    expect(client.fieldsGet).toHaveBeenCalledWith("res.partner", {
      fields: ["name", "email"],
      attributes: ["string", "type"],
    });
    expect(payload(res).fields.name.type).toBe("char");
  });

  it("fields_get works without optional filters", async () => {
    const client = { fieldsGet: vi.fn().mockResolvedValue({ name: { type: "char" } }) };
    const t = new ToolHandlers(makeRegistry(client));
    await t.dispatch("fields_get", { connection: "prod", model: "res.partner" });
    expect(client.fieldsGet).toHaveBeenCalledWith("res.partner", {
      fields: undefined,
      attributes: undefined,
    });
  });

  it("returns a formatted MCP error on validation failure", async () => {
    const t = new ToolHandlers(makeRegistry({}));
    const res = await t.dispatch("search_read", { connection: "PROD", model: "res.partner" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/ODOO_INPUT_INVALID/);
  });

  it("returns a formatted MCP error on unknown connection", async () => {
    const t = new ToolHandlers(makeRegistry({}));
    const res = await t.dispatch("fields_get", { connection: "missing", model: "res.partner" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/ODOO_UNKNOWN_CONNECTION/);
  });

  it("returns a formatted MCP error on unknown tool", async () => {
    const t = new ToolHandlers(makeRegistry({}));
    const res = await t.dispatch("nope", {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Unknown tool/);
  });
});
