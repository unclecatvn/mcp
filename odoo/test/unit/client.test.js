import { describe, it, expect, vi } from "vitest";
import { OdooClient } from "../../lib/client.js";

function makeFetch(scriptedResponses) {
  const calls = [];
  const queue = [...scriptedResponses];
  const fn = vi.fn(async (url, init) => {
    calls.push({
      url,
      method: init.method,
      body: JSON.parse(init.body),
    });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected extra fetch call to ${url}`);
    if (next.throw) throw next.throw;
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      statusText: next.statusText ?? "OK",
      json: async () => next.json,
    };
  });
  return { fn, calls };
}

function mkClient(opts, fetchImpl) {
  return new OdooClient({
    name: "test",
    url: "https://odoo.example.com",
    db: "demo",
    username: "admin",
    authType: "apikey",
    secret: "k-secret",
    fetchImpl,
    timeoutMs: 5000,
    ...opts,
  });
}

describe("OdooClient", () => {
  it("authenticates lazily and caches uid", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 42 } }, // authenticate
      { json: { result: [{ id: 1, name: "Acme" }] } }, // search_read
      { json: { result: [{ id: 2, name: "Initech" }] } }, // search_read again
    ]);
    const client = mkClient({}, fn);

    const r1 = await client.searchRead("res.partner", { fields: ["name"] });
    const r2 = await client.searchRead("res.partner", { fields: ["name"] });

    expect(r1[0].name).toBe("Acme");
    expect(r2[0].name).toBe("Initech");
    // 1 authenticate + 2 search_read = 3 total
    expect(calls).toHaveLength(3);
    expect(calls[0].body.params.method).toBe("authenticate");
    expect(calls[1].body.params.method).toBe("execute_kw");
    expect(client.uid).toBe(42);
  });

  it("dedupes concurrent authentication calls", async () => {
    let resolveAuth;
    const authPromise = new Promise((res) => {
      resolveAuth = res;
    });
    const fn = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.params.method === "authenticate") {
        await authPromise;
        return { ok: true, status: 200, json: async () => ({ result: 7 }) };
      }
      return { ok: true, status: 200, json: async () => ({ result: [] }) };
    });
    const client = mkClient({}, fn);

    const p1 = client.searchRead("res.partner");
    const p2 = client.searchRead("res.partner");
    resolveAuth();
    await Promise.all([p1, p2]);

    const authCalls = fn.mock.calls.filter(
      ([, init]) => JSON.parse(init.body).params.method === "authenticate",
    );
    expect(authCalls).toHaveLength(1);
  });

  it("throws AuthError when authenticate returns false", async () => {
    const { fn } = makeFetch([{ json: { result: false } }]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "AuthError",
      code: "ODOO_AUTH_FAILED",
    });
  });

  it("maps odoo.exceptions.UserError → OdooUserError", async () => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      {
        json: {
          error: {
            code: 200,
            message: "Odoo Server Error",
            data: { name: "odoo.exceptions.UserError", message: "Cannot delete posted invoice" },
          },
        },
      },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "OdooUserError",
      code: "ODOO_USER_ERROR",
      message: "Cannot delete posted invoice",
    });
  });

  it("maps odoo.exceptions.ValidationError → OdooFieldError", async () => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      {
        json: {
          error: {
            data: { name: "odoo.exceptions.ValidationError", message: "Field 'name' is required" },
          },
        },
      },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "OdooFieldError",
      code: "ODOO_FIELD_INVALID",
    });
  });

  it("maps odoo.exceptions.MissingError → OdooMissingRecordError", async () => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      {
        json: {
          error: {
            data: { name: "odoo.exceptions.MissingError", message: "Record does not exist" },
          },
        },
      },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "OdooMissingRecordError",
      code: "ODOO_MISSING_RECORD",
    });
  });

  it("maps odoo.exceptions.AccessError → OdooAccessError", async () => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      {
        json: {
          error: {
            data: { name: "odoo.exceptions.AccessError", message: "Permission denied on model X" },
          },
        },
      },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "OdooAccessError",
      code: "ODOO_ACCESS_DENIED",
    });
  });

  it("maps odoo.exceptions.AccessDenied → AuthError (credential failure)", async () => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      {
        json: {
          error: {
            data: { name: "odoo.exceptions.AccessDenied", message: "Access Denied" },
          },
        },
      },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "AuthError",
      code: "ODOO_AUTH_FAILED",
    });
  });

  it("falls back to OdooServerError on unknown exception names", async () => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      {
        json: {
          error: {
            data: { name: "some.weird.exception", message: "boom" },
          },
        },
      },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "OdooServerError",
      code: "ODOO_SERVER_ERROR",
    });
  });

  it("translates non-2xx HTTP responses into TransportError", async () => {
    const { fn } = makeFetch([
      { ok: false, status: 502, statusText: "Bad Gateway", json: {} },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "TransportError",
      code: "ODOO_TRANSPORT_FAILED",
    });
  });

  it("translates fetch failures into TransportError", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "TransportError",
    });
  });

  it("send well-formed JSON-RPC body for execute_kw", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 1 } },
      { json: { result: [{ id: 1 }] } },
    ]);
    const client = mkClient({}, fn);
    await client.searchRead("sale.order", {
      domain: [["state", "=", "sale"]],
      fields: ["name"],
      limit: 5,
    });

    const execCall = calls[1];
    expect(execCall.url).toBe("https://odoo.example.com/jsonrpc");
    expect(execCall.body.method).toBe("call");
    expect(execCall.body.params.service).toBe("object");
    expect(execCall.body.params.method).toBe("execute_kw");
    const [db, uid, secret, model, method, args, kwargs] = execCall.body.params.args;
    expect(db).toBe("demo");
    expect(uid).toBe(1);
    expect(secret).toBe("k-secret");
    expect(model).toBe("sale.order");
    expect(method).toBe("search_read");
    expect(args).toEqual([]);
    expect(kwargs).toEqual({
      domain: [["state", "=", "sale"]],
      fields: ["name"],
      limit: 5,
    });
  });

  it("describe() omits the secret", async () => {
    const client = mkClient({});
    const info = client.describe();
    expect(info.name).toBe("test");
    expect(info.authType).toBe("apikey");
    expect(info.authenticated).toBe(false);
    expect(info).not.toHaveProperty("secret");
  });

  it("create() returns single id for dict, list of ids for array", async () => {
    const { fn } = makeFetch([
      { json: { result: 9 } }, // authenticate
      { json: { result: 17 } }, // create single
      { json: { result: [21, 22] } }, // create bulk
    ]);
    const client = mkClient({}, fn);
    const single = await client.create("res.partner", { name: "A" });
    const bulk = await client.create("res.partner", [{ name: "B" }, { name: "C" }]);
    expect(single).toBe(17);
    expect(bulk).toEqual([21, 22]);
  });

  it("fieldsGet caches results per (model, fields, attributes)", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 1 } }, // authenticate
      { json: { result: { name: { type: "char" } } } }, // first fields_get
      { json: { result: { state: { type: "selection" } } } }, // second fields_get with different params
    ]);
    const client = mkClient({}, fn);

    const a = await client.fieldsGet("res.partner");
    const b = await client.fieldsGet("res.partner"); // cache hit
    expect(a).toEqual(b);
    expect(calls.filter((c) => c.body.params.method === "execute_kw")).toHaveLength(1);

    // Different params → new fetch
    await client.fieldsGet("res.partner", { fields: ["state"] });
    expect(calls.filter((c) => c.body.params.method === "execute_kw")).toHaveLength(2);
  });

  it("fieldsGet passes allfields positional and attributes kwarg", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 1 } },
      { json: { result: {} } },
    ]);
    const client = mkClient({}, fn);
    await client.fieldsGet("res.partner", {
      fields: ["name", "email"],
      attributes: ["type", "required"],
    });
    const exec = calls[1];
    const [, , , model, method, args, kwargs] = exec.body.params.args;
    expect(model).toBe("res.partner");
    expect(method).toBe("fields_get");
    expect(args).toEqual([["name", "email"]]);
    expect(kwargs).toEqual({ attributes: ["type", "required"] });
  });

  it("clearFieldsCache(model) drops only that model's entries", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 1 } },
      { json: { result: { id: 1 } } }, // res.partner
      { json: { result: { id: 1 } } }, // sale.order
      { json: { result: { id: 1 } } }, // res.partner after clear
    ]);
    const client = mkClient({}, fn);
    await client.fieldsGet("res.partner");
    await client.fieldsGet("sale.order");
    client.clearFieldsCache("res.partner");

    await client.fieldsGet("res.partner"); // re-fetch
    await client.fieldsGet("sale.order");  // cache hit, no new call

    const execs = calls.filter((c) => c.body.params.method === "execute_kw");
    expect(execs).toHaveLength(3);
  });

  it("respects configured timeoutMs", async () => {
    const client = mkClient({ timeoutMs: 1234 });
    expect(client.timeoutMs).toBe(1234);
    expect(client.describe().timeoutMs).toBe(1234);
  });

  it("searchCount sends domain as positional arg and limit as kwarg", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 1 } }, // authenticate
      { json: { result: 42 } }, // search_count
    ]);
    const client = mkClient({}, fn);
    const n = await client.searchCount("res.partner", [["country_id.code", "=", "VN"]], 100);
    expect(n).toBe(42);
    const [, , , model, method, args, kwargs] = calls[1].body.params.args;
    expect(model).toBe("res.partner");
    expect(method).toBe("search_count");
    expect(args).toEqual([[["country_id.code", "=", "VN"]]]);
    expect(kwargs).toEqual({ limit: 100 });
  });

  it("nameSearch maps domain→args kwarg and returns tuple list", async () => {
    const { fn, calls } = makeFetch([
      { json: { result: 1 } },
      { json: { result: [[10, "Acme"], [11, "Acme Logistics"]] } },
    ]);
    const client = mkClient({}, fn);
    const out = await client.nameSearch("res.partner", {
      name: "acme",
      domain: [["customer_rank", ">", 0]],
      operator: "ilike",
      limit: 5,
    });
    expect(out).toEqual([[10, "Acme"], [11, "Acme Logistics"]]);
    const [, , , model, method, args, kwargs] = calls[1].body.params.args;
    expect(model).toBe("res.partner");
    expect(method).toBe("name_search");
    expect(args).toEqual([]);
    expect(kwargs).toEqual({
      name: "acme",
      args: [["customer_rank", ">", 0]],
      operator: "ilike",
      limit: 5,
    });
  });

  it("readGroup sends domain/aggregates/groupby as positional and the rest as kwargs", async () => {
    const groups = [
      { user_id: [5, "Alice"], amount_total: 125000, "__count": 42 },
    ];
    const { fn, calls } = makeFetch([
      { json: { result: 1 } },
      { json: { result: groups } },
    ]);
    const client = mkClient({}, fn);
    const out = await client.readGroup("sale.order", {
      domain: [["state", "=", "sale"]],
      aggregates: ["amount_total:sum"],
      groupby: ["user_id"],
      lazy: false,
      orderby: "user_id",
      limit: 50,
    });
    expect(out).toEqual(groups);
    const [, , , model, method, args, kwargs] = calls[1].body.params.args;
    expect(model).toBe("sale.order");
    expect(method).toBe("read_group");
    expect(args).toEqual([
      [["state", "=", "sale"]],
      ["amount_total:sum"],
      ["user_id"],
    ]);
    expect(kwargs).toEqual({ lazy: false, orderby: "user_id", limit: 50 });
  });
});
