import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { OdooMCPServer } from "../../mcpServer.js";
import { registerTools } from "../../lib/toolHandlers.js";
import { OdooError } from "../../lib/errors.js";
import { INSTRUCTIONS } from "../../lib/instructions.js";

beforeAll(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterAll(() => vi.restoreAllMocks());

async function connect(server) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(b);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content[0].text;
    return r.isError ? { error: text } : JSON.parse(text);
  };
  return { client, call };
}

/** registerTools over a single stub client named "prod". */
function withStub(stub) {
  const server = new McpServer({ name: "t", version: "0" });
  registerTools(server, new Map([["prod", stub]]));
  return connect(server);
}

describe("tools", () => {
  it("exposes 10 strict tools with read/destructive annotations", async () => {
    const { client } = await withStub({});
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
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
    ]);
    for (const n of ["list_connections", "fields_get", "search_read", "search_count", "name_search", "read_group"]) {
      expect(byName[n].annotations.readOnlyHint).toBe(true);
    }
    for (const n of ["write", "unlink", "call_method"]) {
      expect(byName[n].annotations.destructiveHint).toBe(true);
    }
    expect(byName.search_read.inputSchema.additionalProperties).toBe(false);
  });

  it("keeps the instructions under the ~2 KB hosts truncate at", () => {
    expect(INSTRUCTIONS.length).toBeLessThan(2000);
  });

  it("rejects unknown arguments instead of silently ignoring them", async () => {
    const searchRead = vi.fn();
    const { call } = await withStub({ searchRead });
    const r = await call("search_read", { connection: "prod", model: "res.partner", filters: [] });
    expect(r.error).toMatch(/Input validation error.*filters/s);
    expect(searchRead).not.toHaveBeenCalled();
  });

  it("search_read defaults limit to 100 and flags a full page", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    const searchRead = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([{ id: 1 }]);
    const { call } = await withStub({ searchRead });

    const full = await call("search_read", { connection: "prod", model: "res.partner" });
    expect(searchRead).toHaveBeenLastCalledWith("res.partner", {
      domain: undefined,
      fields: undefined,
      limit: 100,
      offset: undefined,
      order: undefined,
    });
    expect(full).toMatchObject({ count: 100, limit_reached: true });

    const short = await call("search_read", { connection: "prod", model: "res.partner", limit: 5 });
    expect(short).toEqual({ model: "res.partner", count: 1, records: [{ id: 1 }] });
  });

  it("create returns {id} for a dict and {ids} for an array", async () => {
    const create = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce([8, 9]);
    const { call } = await withStub({ create });
    expect(await call("create", { connection: "prod", model: "res.partner", values: { name: "A" } })).toEqual({
      model: "res.partner",
      id: 7,
    });
    expect(
      await call("create", { connection: "prod", model: "res.partner", values: [{ name: "B" }, { name: "C" }] }),
    ).toEqual({ model: "res.partner", ids: [8, 9] });
  });

  it("forwards name_search, read_group and call_method arguments", async () => {
    const stub = {
      nameSearch: vi.fn().mockResolvedValue([[1, "Acme"]]),
      readGroup: vi.fn().mockResolvedValue([{ user_id: [5, "Alice"] }]),
      callKw: vi.fn().mockResolvedValue(true),
    };
    const { call } = await withStub(stub);

    await call("name_search", { connection: "prod", model: "res.partner", name: "ac", limit: 5 });
    expect(stub.nameSearch).toHaveBeenCalledWith("res.partner", {
      name: "ac",
      domain: undefined,
      operator: undefined,
      limit: 5,
    });

    const g = await call("read_group", {
      connection: "prod",
      model: "sale.order",
      aggregates: ["amount_total:sum"],
      groupby: ["user_id"],
      lazy: false,
    });
    expect(stub.readGroup).toHaveBeenCalledWith("sale.order", {
      aggregates: ["amount_total:sum"],
      groupby: ["user_id"],
      lazy: false,
    });
    expect(g.count).toBe(1);

    const m = await call("call_method", {
      connection: "prod",
      model: "sale.order",
      method: "action_confirm",
      args: [[17]],
    });
    expect(stub.callKw).toHaveBeenCalledWith("sale.order", "action_confirm", [[17]], undefined);
    expect(m).toEqual({ model: "sale.order", method: "action_confirm", result: true });
  });

  it("returns [CODE] errors for unknown connections and Odoo failures", async () => {
    const unlink = vi.fn().mockRejectedValue(new OdooError("ODOO_USER_ERROR", "posted"));
    const { call } = await withStub({ unlink });
    expect((await call("unlink", { connection: "nope", model: "res.partner", ids: [1] })).error).toBe(
      '[ODOO_UNKNOWN_CONNECTION] Unknown connection "nope". Available: prod',
    );
    expect((await call("unlink", { connection: "prod", model: "account.move", ids: [1] })).error).toBe(
      "[ODOO_USER_ERROR] posted",
    );
  });
});

describe("OdooMCPServer", () => {
  it("builds clients from env and never lists secrets", async () => {
    const { server } = new OdooMCPServer({
      env: {
        ODOO_PROD_URL: "https://erp.example.com/",
        ODOO_PROD_DB: "production",
        ODOO_PROD_USERNAME: "admin",
        ODOO_PROD_API_KEY: "k-secret",
      },
    });
    const { client, call } = await connect(server);
    const { connections } = await call("list_connections");
    expect(connections).toEqual([
      {
        name: "prod",
        url: "https://erp.example.com",
        db: "production",
        username: "admin",
        authType: "apikey",
        authenticated: false,
        serverVersion: null,
        timeoutMs: 60000,
      },
    ]);
    expect(JSON.stringify(connections)).not.toContain("k-secret");
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
  });

  it("explains how to configure when no connection exists", async () => {
    const { server } = new OdooMCPServer({ env: {} });
    const { call } = await connect(server);
    expect((await call("search_count", { connection: "prod", model: "res.partner" })).error).toMatch(
      /^\[ODOO_UNKNOWN_CONNECTION\] No Odoo connections configured/,
    );
  });
});
