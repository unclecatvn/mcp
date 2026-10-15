import { OdooError, fromOdooError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/** First Odoo major that serves /json/2 and deprecates /jsonrpc + read_group. */
const JSON2_MIN_VERSION = 19;

/** Return a new object with any `undefined` values dropped. Preserves nulls and falsy primitives. */
function omitUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** True for an array of integers — what Odoo treats as record ids. */
function isIdList(v) {
  return Array.isArray(v) && v.every(Number.isInteger);
}

/**
 * Translate read_group-style args into a formatted_read_group call (Odoo 19+),
 * mirroring the compatibility layer of the deprecated read_group in
 * odoo/orm/models.py. Returns the named params plus `reshape(rows)`, which
 * renames result keys back to read_group's and rebuilds `__domain`/`__context`.
 */
function toFormattedReadGroup({ domain, aggregates, groupby, offset, limit, orderby, lazy }) {
  // read_group defaults to lazy=true: group by the first field only.
  const gb = lazy === false ? groupby : groupby.slice(0, 1);

  // result key (read_group naming) → formatted_read_group aggregate spec
  const specs = { [lazy === false ? "__count" : `${gb[0].split(":")[0]}_count`]: "__count" };
  for (const agg of aggregates) {
    if (agg === "__count") continue;
    const m = agg.match(/^(\w+):(\w+)\((\w+)\)$/); // "alias:func(field)"
    if (m) specs[m[1]] = `${m[3]}:${m[2]}`;
    else specs[agg.split(":")[0]] = agg;
  }

  // ORDER BY terms must name a groupby or aggregate spec, not a result key.
  const order = orderby
    ?.split(",")
    .map((term) => {
      const [name, ...dir] = term.trim().split(/\s+/);
      const spec = gb.find((g) => g.split(":")[0] === name) ?? specs[name] ?? name;
      return [spec, ...dir].join(" ");
    })
    .join(", ");

  const params = omitUndefined({
    domain,
    groupby: gb,
    aggregates: [...new Set(Object.values(specs))],
    offset,
    limit,
    order,
  });

  const reshape = (rows) =>
    rows.map((row) => {
      const out = {};
      for (const g of gb) out[g] = row[g];
      for (const [key, spec] of Object.entries(specs)) out[key] = row[spec];
      // Two well-formed domains concatenated are implicitly AND-ed.
      out.__domain = [...domain, ...(row.__extra_domain ?? [])];
      if (gb.length < groupby.length) out.__context = { group_by: groupby.slice(gb.length) };
      return out;
    });

  return { params, reshape };
}

/**
 * Client for a single Odoo v18+ instance.
 *
 * Transport: Odoo 19+ with an API key uses JSON-2 (`POST /json/2/<model>/<method>`,
 * bearer auth, named params). Everything else — Odoo 18, password auth, or a
 * call_method whose positional args can't be named — uses `/jsonrpc` execute_kw.
 *
 * Caches the server major version, the post-auth `uid` and per-model
 * `fields_get` results for the lifetime of the process. Safe to keep one
 * instance per configured connection.
 */
export class OdooClient {
  /**
   * @param {object} cfg
   * @param {string} cfg.name
   * @param {string} cfg.url
   * @param {string} cfg.db
   * @param {string} cfg.username
   * @param {"apikey" | "password"} cfg.authType
   * @param {string} cfg.secret
   * @param {number} [cfg.timeoutMs]
   * @param {(typeof fetch)} [cfg.fetchImpl]   // for tests
   */
  constructor(cfg) {
    this.name = cfg.name;
    this.url = cfg.url.replace(/\/+$/, "");
    this.db = cfg.db;
    this.username = cfg.username;
    this.authType = cfg.authType;
    this.secret = cfg.secret;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.uid = null;
    /** Server major version: null until probed, 0 when /web/version is missing (Odoo <= 18). */
    this.serverVersion = null;
    this._fetch = cfg.fetchImpl ?? globalThis.fetch;
    this._authPromise = null;
    this._versionPromise = null;
    /** Set once a JSON-2 call succeeds (that path never calls authenticate()). */
    this._json2Ok = false;
    /** @type {Map<string, object>} fields_get cache keyed by `${model}|${attrsKey}|${fieldsKey}` */
    this._fieldsCache = new Map();
  }

  /** Public-safe summary for list_connections (no secrets). */
  describe() {
    return {
      name: this.name,
      url: this.url,
      db: this.db,
      username: this.username,
      authType: this.authType,
      authenticated: this.uid !== null || this._json2Ok,
      serverVersion: this.serverVersion,
      timeoutMs: this.timeoutMs,
    };
  }

  /**
   * fetch + JSON body read under one timeout (AbortSignal.timeout also bounds
   * the body read). Network/timeout failures become ODOO_TRANSPORT_FAILED; a
   * body that isn't JSON comes back as `json: undefined`.
   */
  async _request(path, init) {
    try {
      const res = await this._fetch(`${this.url}${path}`, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const json = await res.json().catch((e) => {
        if (e instanceof SyntaxError) return undefined;
        throw e;
      });
      return { res, json };
    } catch (e) {
      const reason = e?.name === "TimeoutError" ? `timed out after ${this.timeoutMs}ms` : e.message;
      throw new OdooError(
        "ODOO_TRANSPORT_FAILED",
        `Odoo request to ${this.url} failed (connection=${this.name}): ${reason}`,
        e,
      );
    }
  }

  /** ODOO_TRANSPORT_FAILED for an HTTP error status or a non-JSON body. */
  _transportError(res) {
    return new OdooError(
      "ODOO_TRANSPORT_FAILED",
      res.ok
        ? `Odoo returned a non-JSON response (connection=${this.name})`
        : `Odoo HTTP ${res.status} ${res.statusText} (connection=${this.name})`,
    );
  }

  async _rpc(service, method, args) {
    const { res, json } = await this._request("/jsonrpc", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: Math.floor(Math.random() * 1e9),
      }),
    });
    if (!res.ok || json === undefined) throw this._transportError(res);
    if (json.error) throw fromOdooError(json.error);
    return json.result;
  }

  /**
   * POST /json/2/<model>/<method> (Odoo 19+). `params` are the method's named
   * arguments plus the controller's own `ids` / `context`.
   */
  async _json2(model, method, params) {
    const { res, json } = await this._request(
      `/json/2/${encodeURIComponent(model)}/${encodeURIComponent(method)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `bearer ${this.secret}`,
          "X-Odoo-Database": this.db,
        },
        body: JSON.stringify(params),
      },
    );
    if (res.status === 401) {
      throw new OdooError(
        "ODOO_AUTH_FAILED",
        `Odoo rejected the API key for connection "${this.name}" (db=${this.db}): ${json?.message ?? res.statusText}`,
      );
    }
    // JSON-2 errors are the bare serialized exception: { name, message, arguments, context, debug }.
    if (!res.ok && json?.name) throw fromOdooError({ data: json });
    if (!res.ok || json === undefined) throw this._transportError(res);
    this._json2Ok = true;
    return json;
  }

  /**
   * Server major version from GET /web/version (served by Odoo 19+ only, so an
   * older server answers 404 → 0). Probed once per connection; concurrent
   * callers share one request, and network failures / 5xx are not cached.
   */
  async getServerVersion() {
    if (this.serverVersion !== null) return this.serverVersion;
    this._versionPromise ??= (async () => {
      const { res, json } = await this._request("/web/version", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      // 5xx is likely transient (gateway down): use /jsonrpc for now, re-probe next call.
      if (res.status >= 500) return 0;
      // version_info[0] is 19 on stable releases, "saas~19" on SaaS ones.
      const major = String((res.ok ? json?.version_info?.[0] : undefined) ?? "").match(/\d+/);
      this.serverVersion = major ? Number(major[0]) : 0;
      return this.serverVersion;
    })().finally(() => {
      this._versionPromise = null;
    });
    return this._versionPromise;
  }

  /** True when calls go over JSON-2: Odoo 19+ and an API key (JSON-2 has no password auth). */
  async _useJson2() {
    return this.authType === "apikey" && (await this.getServerVersion()) >= JSON2_MIN_VERSION;
  }

  /**
   * Authenticate against /jsonrpc common.authenticate. Result cached in `uid`.
   * Concurrent callers share a single in-flight promise.
   */
  async authenticate() {
    if (this.uid) return this.uid;
    if (this._authPromise) return this._authPromise;

    this._authPromise = (async () => {
      const uid = await this._rpc("common", "authenticate", [
        this.db,
        this.username,
        this.secret,
        {},
      ]);
      if (!uid || typeof uid !== "number") {
        throw new OdooError(
          "ODOO_AUTH_FAILED",
          `Authentication failed for connection "${this.name}" (db=${this.db}, user=${this.username}). ` +
            `Check the ${this.authType === "apikey" ? "API key" : "password"} and database name. ` +
            `Note: users with 2FA enabled cannot authenticate with their password — use an API key instead.`,
        );
      }
      this.uid = uid;
      return uid;
    })();

    try {
      return await this._authPromise;
    } finally {
      this._authPromise = null;
    }
  }

  /** object.execute_kw over /jsonrpc. */
  async _executeKw(model, method, args = [], kwargs = {}) {
    const uid = await this.authenticate();
    return this._rpc("object", "execute_kw", [
      this.db,
      uid,
      this.secret,
      model,
      method,
      args ?? [],
      kwargs ?? {},
    ]);
  }

  /**
   * Run one ORM call on the best transport. `args`/`kwargs` feed /jsonrpc;
   * `named` is the JSON-2 body, or null when the call has no safe named form.
   */
  async _execute(model, method, args, kwargs, named) {
    if (named && (await this._useJson2())) return this._json2(model, method, named);
    return this._executeKw(model, method, args, kwargs);
  }

  /**
   * Generic execute_kw-style call (call_method). On JSON-2, `args[0]` becomes
   * `ids` when it is an int array; any other positional args stay on /jsonrpc
   * because JSON-2 needs parameter names we can't guess.
   */
  async callKw(model, method, args = [], kwargs = {}) {
    args ??= [];
    kwargs ??= {};
    let named = null;
    if (args.length === 0) named = kwargs;
    else if (args.length === 1 && isIdList(args[0])) named = { ids: args[0], ...kwargs };
    return this._execute(model, method, args, kwargs, named);
  }

  /**
   * Fetch the field schema for a model. Cached per (model, fields, attributes)
   * since schemas are static for the server lifetime.
   *
   * @param {string} model
   * @param {object} [opts]
   * @param {string[]} [opts.fields]      Restrict which fields are returned (Odoo `allfields`).
   * @param {string[]} [opts.attributes]  Restrict which attributes of each field are returned.
   */
  async fieldsGet(model, { fields, attributes } = {}) {
    const cacheKey = `${model}|${JSON.stringify(fields ?? null)}|${JSON.stringify(attributes ?? null)}`;
    if (this._fieldsCache.has(cacheKey)) {
      return this._fieldsCache.get(cacheKey);
    }
    const allfields = fields && fields.length > 0 ? fields : undefined;
    const attrs = attributes && attributes.length > 0 ? attributes : undefined;
    const result = await this._execute(
      model,
      "fields_get",
      allfields ? [allfields] : [],
      omitUndefined({ attributes: attrs }),
      omitUndefined({ allfields, attributes: attrs }),
    );
    this._fieldsCache.set(cacheKey, result);
    return result;
  }

  async searchRead(model, { domain = [], fields, limit, offset, order } = {}) {
    const kwargs = omitUndefined({ domain, fields, limit, offset, order });
    return this._execute(model, "search_read", [], kwargs, kwargs);
  }

  async searchCount(model, domain = [], limit) {
    return this._execute(
      model,
      "search_count",
      [domain],
      omitUndefined({ limit }),
      omitUndefined({ domain, limit }),
    );
  }

  async nameSearch(model, { name = "", domain, operator, limit } = {}) {
    // name and domain go positionally on /jsonrpc: the second parameter is
    // `args` on Odoo 18 but was renamed `domain` in 19.
    return this._execute(
      model,
      "name_search",
      [name, domain ?? []],
      omitUndefined({ operator, limit }),
      omitUndefined({ name, domain, operator, limit }),
    );
  }

  /**
   * GROUP BY with read_group semantics. read_group is deprecated on Odoo 19+,
   * so there it calls formatted_read_group and reshapes the rows to match.
   */
  async readGroup(model, { domain = [], aggregates, groupby, offset, limit, orderby, lazy } = {}) {
    if ((await this.getServerVersion()) < JSON2_MIN_VERSION) {
      return this._executeKw(
        model,
        "read_group",
        [domain, aggregates, groupby],
        omitUndefined({ offset, limit, orderby, lazy }),
      );
    }
    const { params, reshape } = toFormattedReadGroup({
      domain,
      aggregates,
      groupby,
      offset,
      limit,
      orderby,
      lazy,
    });
    const { domain: d, groupby: g, aggregates: a, ...kwargs } = params;
    const rows = await this._execute(model, "formatted_read_group", [d, g, a], kwargs, params);
    return reshape(rows);
  }

  async create(model, values) {
    if (await this._useJson2()) {
      // JSON-2 create() takes `vals_list` and always returns a list of ids;
      // unwrap so a single dict yields a single id, as on /jsonrpc.
      const ids = await this._json2(model, "create", {
        vals_list: Array.isArray(values) ? values : [values],
      });
      return Array.isArray(values) ? ids : ids[0];
    }
    // /jsonrpc create() accepts a dict (returns id) or a list of dicts (returns ids).
    return this._executeKw(model, "create", [values]);
  }

  async write(model, ids, values) {
    return this._execute(model, "write", [ids, values], {}, { ids, vals: values });
  }

  async unlink(model, ids) {
    return this._execute(model, "unlink", [ids], {}, { ids });
  }
}
