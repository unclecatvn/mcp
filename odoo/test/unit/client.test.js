import { describe, it, expect, vi } from "vitest";
import { OdooClient } from "../../lib/client.js";

const NOT_FOUND = {
  ok: false,
  status: 404,
  statusText: "NOT FOUND",
  json: async () => {
    throw new SyntaxError("Unexpected token '<'");
  },
};

/** GET /web/version answer: Odoo 19+ reports version_info, Odoo <= 18 has no such route. */
function versionResponse(version) {
  if (!version) return NOT_FOUND;
  return {
    ok: true,
    status: 200,
    json: async () => ({ version_info: [version, 0, 0, "final", 0, ""], version: `${version}.0` }),
  };
}

/**
 * Scripted fetch stub. The /web/version probe is answered from `version`
 * (default: none → 404, i.e. Odoo 18) and kept out of `calls`/the queue.
 */
function makeFetch(scriptedResponses, { version } = {}) {
  const calls = [];
  const probes = [];
  const queue = [...scriptedResponses];
  const fn = vi.fn(async (url, init) => {
    if (url.endsWith("/web/version")) {
      probes.push(url);
      return versionResponse(version);
    }
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
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
  return { fn, calls, probes };
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
      if (url.endsWith("/web/version")) return NOT_FOUND;
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
      ([, init]) => init.body && JSON.parse(init.body).params.method === "authenticate",
    );
    expect(authCalls).toHaveLength(1);
  });

  it("throws ODOO_AUTH_FAILED when authenticate returns false", async () => {
    const { fn } = makeFetch([{ json: { result: false } }]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      code: "ODOO_AUTH_FAILED",
    });
  });

  it.each([
    ["odoo.exceptions.UserError", "ODOO_USER_ERROR"],
    ["odoo.exceptions.RedirectWarning", "ODOO_USER_ERROR"],
    ["odoo.exceptions.ValidationError", "ODOO_FIELD_INVALID"],
    ["odoo.exceptions.MissingError", "ODOO_MISSING_RECORD"],
    ["odoo.exceptions.AccessError", "ODOO_ACCESS_DENIED"],
    ["odoo.exceptions.AccessDenied", "ODOO_AUTH_FAILED"],
    ["some.weird.exception", "ODOO_SERVER_ERROR"],
  ])("maps %s → %s with a [CODE]-prefixed message", async (name, code) => {
    const { fn } = makeFetch([
      { json: { result: 1 } },
      { json: { error: { message: "Odoo Server Error", data: { name, message: "boom" } } } },
    ]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      name: "OdooError",
      code,
      message: `[${code}] boom`,
    });
  });

  it("translates non-2xx HTTP responses into ODOO_TRANSPORT_FAILED", async () => {
    const { fn } = makeFetch([{ ok: false, status: 502, statusText: "Bad Gateway", json: {} }]);
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      code: "ODOO_TRANSPORT_FAILED",
      message: expect.stringContaining("HTTP 502"),
    });
  });

  it("translates fetch failures into ODOO_TRANSPORT_FAILED", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const client = mkClient({}, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      code: "ODOO_TRANSPORT_FAILED",
      message: expect.stringContaining("network down"),
    });
  });

  // Bug fixed: the old setTimeout was cleared once headers arrived, so a stalled body hung forever.
  it("times out while reading a stalled response body", async () => {
    const fn = vi.fn(async (url, init) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_, reject) =>
          init.signal.addEventListener("abort", () => reject(init.signal.reason)),
        ),
    }));
    const client = mkClient({ timeoutMs: 20, authType: "password" }, fn);
    await expect(client.searchRead("res.partner")).rejects.toMatchObject({
      code: "ODOO_TRANSPORT_FAILED",
      message: expect.stringContaining("timed out after 20ms"),
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

  // Bug fixed: Odoo 19 renamed name_search's `args` kwarg to `domain`; positional works on 18 and 19.
  it("nameSearch sends name and domain positionally", async () => {
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
    expect(args).toEqual(["acme", [["customer_rank", ">", 0]]]);
    expect(kwargs).toEqual({ operator: "ilike", limit: 5 });
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

describe("OdooClient server version probe", () => {
  it("probes /web/version once and caches the major version", async () => {
    const { fn, probes } = makeFetch([{ json: { result: 1 } }, { json: { result: 3 } }], {
      version: 19,
    });
    const client = mkClient({ authType: "password" }, fn);
    const [a, b] = await Promise.all([client.getServerVersion(), client.getServerVersion()]);
    expect([a, b]).toEqual([19, 19]);
    await client.searchCount("res.partner");
    expect(probes).toEqual(["https://odoo.example.com/web/version"]);
    expect(client.describe().serverVersion).toBe(19);
  });

  it("treats a missing /web/version (Odoo 18) as version 0", async () => {
    const { fn } = makeFetch([]);
    expect(await mkClient({}, fn).getServerVersion()).toBe(0);
  });

  it("parses SaaS versions like 'saas~19'", async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version_info: ["saas~19", 1, 0, "final", 0, ""] }),
    }));
    expect(await mkClient({}, fn).getServerVersion()).toBe(19);
  });

  it("does not cache a network failure", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(versionResponse(19));
    const client = mkClient({}, fn);
    await expect(client.getServerVersion()).rejects.toMatchObject({
      code: "ODOO_TRANSPORT_FAILED",
    });
    expect(await client.getServerVersion()).toBe(19);
  });

  it("answers 0 on a 5xx without caching it", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ...NOT_FOUND, status: 502, statusText: "Bad Gateway" })
      .mockResolvedValueOnce(versionResponse(19));
    const client = mkClient({}, fn);
    expect(await client.getServerVersion()).toBe(0);
    expect(client.serverVersion).toBeNull();
    expect(await client.getServerVersion()).toBe(19);
  });
});

describe("OdooClient JSON-2 transport (Odoo 19+, API key)", () => {
  const json2 = (responses) => makeFetch(responses, { version: 19 });

  it("POSTs named params to /json/2/<model>/<method> with bearer auth, no authenticate()", async () => {
    const { fn, calls } = json2([{ json: [{ id: 1, name: "Acme" }] }]);
    const client = mkClient({}, fn);
    const out = await client.searchRead("res.partner", {
      domain: [["is_company", "=", true]],
      fields: ["name"],
      limit: 5,
    });
    expect(out).toEqual([{ id: 1, name: "Acme" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://odoo.example.com/json/2/res.partner/search_read");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers).toMatchObject({
      Authorization: "bearer k-secret",
      "X-Odoo-Database": "demo",
    });
    expect(calls[0].body).toEqual({
      domain: [["is_company", "=", true]],
      fields: ["name"],
      limit: 5,
    });
    expect(client.uid).toBeNull();
    expect(client.describe()).toMatchObject({ authenticated: true, serverVersion: 19 });
  });

  it("maps every typed method to its named params", async () => {
    const { fn, calls } = json2([
      { json: 7 }, // search_count
      { json: [[10, "Acme"]] }, // name_search
      { json: { name: { type: "char" } } }, // fields_get
      { json: [17] }, // create single
      { json: [21, 22] }, // create bulk
      { json: true }, // write
      { json: true }, // unlink
    ]);
    const client = mkClient({}, fn);
    expect(await client.searchCount("res.partner", [["active", "=", true]], 100)).toBe(7);
    await client.nameSearch("res.partner", { name: "acme", domain: [["id", ">", 0]], limit: 5 });
    await client.fieldsGet("res.partner", { fields: ["name"], attributes: ["type"] });
    expect(await client.create("res.partner", { name: "A" })).toBe(17);
    expect(await client.create("res.partner", [{ name: "B" }, { name: "C" }])).toEqual([21, 22]);
    expect(await client.write("res.partner", [1, 2], { active: false })).toBe(true);
    expect(await client.unlink("res.partner", [3])).toBe(true);

    expect(calls.map((c) => [c.url.split("/json/2/")[1], c.body])).toEqual([
      ["res.partner/search_count", { domain: [["active", "=", true]], limit: 100 }],
      ["res.partner/name_search", { name: "acme", domain: [["id", ">", 0]], limit: 5 }],
      ["res.partner/fields_get", { allfields: ["name"], attributes: ["type"] }],
      ["res.partner/create", { vals_list: [{ name: "A" }] }],
      ["res.partner/create", { vals_list: [{ name: "B" }, { name: "C" }] }],
      ["res.partner/write", { ids: [1, 2], vals: { active: false } }],
      ["res.partner/unlink", { ids: [3] }],
    ]);
  });

  it("callKw sends kwargs as-is and args[0] int list as ids", async () => {
    const { fn, calls } = json2([{ json: { name: "x" } }, { json: true }]);
    const client = mkClient({}, fn);
    await client.callKw("res.partner", "default_get", [], { fields: ["name"] });
    await client.callKw("sale.order", "action_confirm", [[5]], { context: { lang: "en_US" } });
    expect(calls[0].url).toMatch(/\/json\/2\/res\.partner\/default_get$/);
    expect(calls[0].body).toEqual({ fields: ["name"] });
    expect(calls[1].url).toMatch(/\/json\/2\/sale\.order\/action_confirm$/);
    expect(calls[1].body).toEqual({ ids: [5], context: { lang: "en_US" } });
  });

  it("callKw falls back to /jsonrpc when extra positional args can't be named", async () => {
    const { fn, calls } = json2([{ json: { result: 9 } }, { json: { result: [{ id: 5 }] } }]);
    const client = mkClient({}, fn);
    await client.callKw("res.partner", "read", [[5], ["name"]]);
    expect(calls.map((c) => c.url)).toEqual([
      "https://odoo.example.com/jsonrpc",
      "https://odoo.example.com/jsonrpc",
    ]);
    const [, , , model, method, args] = calls[1].body.params.args;
    expect([model, method, args]).toEqual(["res.partner", "read", [[5], ["name"]]]);
  });

  it("password auth stays on /jsonrpc even on Odoo 19", async () => {
    const { fn, calls } = json2([{ json: { result: 1 } }, { json: { result: 3 } }]);
    const client = mkClient({ authType: "password" }, fn);
    expect(await client.searchCount("res.partner")).toBe(3);
    expect(calls.every((c) => c.url.endsWith("/jsonrpc"))).toBe(true);
  });

  it("maps HTTP 401 (bad API key) to ODOO_AUTH_FAILED", async () => {
    const { fn } = json2([
      {
        ok: false,
        status: 401,
        json: { name: "werkzeug.exceptions.Unauthorized", message: "Invalid apikey" },
      },
    ]);
    await expect(mkClient({}, fn).searchCount("res.partner")).rejects.toMatchObject({
      code: "ODOO_AUTH_FAILED",
      message: expect.stringContaining("Invalid apikey"),
    });
  });

  it.each([
    [422, "odoo.exceptions.UserError", "ODOO_USER_ERROR"],
    [403, "odoo.exceptions.AccessError", "ODOO_ACCESS_DENIED"],
    [404, "odoo.exceptions.MissingError", "ODOO_MISSING_RECORD"],
    [500, "builtins.KeyError", "ODOO_SERVER_ERROR"],
  ])("maps HTTP %i %s error body → %s", async (status, name, code) => {
    const { fn } = json2([
      { ok: false, status, json: { name, message: "boom", arguments: ["boom"], debug: "Tb" } },
    ]);
    await expect(mkClient({}, fn).searchCount("res.partner")).rejects.toMatchObject({
      name: "OdooError",
      code,
      message: `[${code}] boom`,
    });
  });

  it("maps a non-JSON HTTP error (e.g. proxy HTML page) to ODOO_TRANSPORT_FAILED", async () => {
    const fn = vi.fn(async (url) =>
      url.endsWith("/web/version")
        ? versionResponse(19)
        : { ...NOT_FOUND, status: 502, statusText: "Bad Gateway" },
    );
    await expect(mkClient({}, fn).searchCount("res.partner")).rejects.toMatchObject({
      code: "ODOO_TRANSPORT_FAILED",
      message: expect.stringContaining("HTTP 502"),
    });
  });
});

describe("OdooClient readGroup on Odoo 19 (formatted_read_group)", () => {
  it("translates args and reshapes rows to read_group's shape (lazy:false)", async () => {
    const { fn, calls } = makeFetch(
      [
        {
          json: [
            {
              user_id: [5, "Alice"],
              "date_order:month": ["2026-01-01", "January 2026"],
              __count: 42,
              "amount_total:sum": 125000,
              "amount_untaxed:max": 9000,
              __extra_domain: ["&", ["user_id", "=", 5], ["date_order", ">=", "2026-01-01"]],
            },
          ],
        },
      ],
      { version: 19 },
    );
    const out = await mkClient({}, fn).readGroup("sale.order", {
      domain: [["state", "=", "sale"]],
      aggregates: ["amount_total:sum", "biggest:max(amount_untaxed)", "__count"],
      groupby: ["user_id", "date_order:month"],
      orderby: "amount_total desc, date_order",
      lazy: false,
      limit: 10,
    });

    expect(calls[0].url).toBe("https://odoo.example.com/json/2/sale.order/formatted_read_group");
    expect(calls[0].body).toEqual({
      domain: [["state", "=", "sale"]],
      groupby: ["user_id", "date_order:month"],
      aggregates: ["__count", "amount_total:sum", "amount_untaxed:max"],
      limit: 10,
      order: "amount_total:sum desc, date_order:month",
    });
    expect(out).toEqual([
      {
        user_id: [5, "Alice"],
        "date_order:month": ["2026-01-01", "January 2026"],
        __count: 42,
        amount_total: 125000,
        biggest: 9000,
        __domain: [
          ["state", "=", "sale"],
          "&",
          ["user_id", "=", 5],
          ["date_order", ">=", "2026-01-01"],
        ],
      },
    ]);
  });

  it("emulates lazy (default) mode: first groupby only, <field>_count, __context", async () => {
    const { fn, calls } = makeFetch(
      [{ json: [{ user_id: false, __count: 3, __extra_domain: [["user_id", "=", false]] }] }],
      { version: 19 },
    );
    const out = await mkClient({}, fn).readGroup("sale.order", {
      aggregates: ["id:count"],
      groupby: ["user_id", "team_id"],
    });
    expect(calls[0].body).toEqual({
      domain: [],
      groupby: ["user_id"],
      aggregates: ["__count", "id:count"],
    });
    expect(out).toEqual([
      {
        user_id: false,
        user_id_count: 3,
        id: undefined,
        __domain: [["user_id", "=", false]],
        __context: { group_by: ["team_id"] },
      },
    ]);
  });

  it("uses /jsonrpc formatted_read_group with password auth", async () => {
    const { fn, calls } = makeFetch([{ json: { result: 1 } }, { json: { result: [] } }], {
      version: 19,
    });
    const client = mkClient({ authType: "password" }, fn);
    await client.readGroup("sale.order", {
      aggregates: ["amount_total:sum"],
      groupby: ["user_id"],
      lazy: false,
      offset: 5,
    });
    const [, , , model, method, args, kwargs] = calls[1].body.params.args;
    expect(calls[1].url).toBe("https://odoo.example.com/jsonrpc");
    expect([model, method]).toEqual(["sale.order", "formatted_read_group"]);
    expect(args).toEqual([[], ["user_id"], ["__count", "amount_total:sum"]]);
    expect(kwargs).toEqual({ offset: 5 });
  });
});
