import { OdooError, fromOdooError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/** Return a new object with any `undefined` values dropped. Preserves nulls and falsy primitives. */
function omitUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * JSON-RPC client for a single Odoo v18+ instance.
 *
 * Caches the post-auth `uid` and per-model `fields_get` results for the
 * lifetime of the process. Safe to keep one instance per configured
 * connection.
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
    this._fetch = cfg.fetchImpl ?? globalThis.fetch;
    this._authPromise = null;
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
      authenticated: this.uid !== null,
      timeoutMs: this.timeoutMs,
    };
  }

  async _rpc(service, method, args) {
    const body = {
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e9),
    };

    let json;
    try {
      const res = await this._fetch(`${this.url}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        // Unlike a setTimeout cleared after the headers, this also bounds the body read.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        throw new OdooError(
          "ODOO_TRANSPORT_FAILED",
          `Odoo HTTP ${res.status} ${res.statusText} (connection=${this.name})`,
        );
      }
      json = await res.json();
    } catch (e) {
      if (e instanceof OdooError) throw e;
      const reason = e?.name === "TimeoutError" ? `timed out after ${this.timeoutMs}ms` : e.message;
      throw new OdooError(
        "ODOO_TRANSPORT_FAILED",
        `Odoo request to ${this.url} failed (connection=${this.name}): ${reason}`,
        e,
      );
    }

    if (json.error) throw fromOdooError(json.error);
    return json.result;
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

  /** Lower-level wrapper around object.execute_kw. */
  async callKw(model, method, args = [], kwargs = {}) {
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
    const positional = fields && fields.length > 0 ? [fields] : [];
    const kwargs = attributes && attributes.length > 0 ? { attributes } : {};
    const result = await this.callKw(model, "fields_get", positional, kwargs);
    this._fieldsCache.set(cacheKey, result);
    return result;
  }

  async searchRead(model, { domain = [], fields, limit, offset, order } = {}) {
    const kwargs = omitUndefined({ domain, fields, limit, offset, order });
    return this.callKw(model, "search_read", [], kwargs);
  }

  async searchCount(model, domain = [], limit) {
    return this.callKw(model, "search_count", [domain], omitUndefined({ limit }));
  }

  async nameSearch(model, { name = "", domain = [], operator, limit } = {}) {
    // Positional on purpose: the 2nd parameter is `args` in Odoo 18 but `domain` in 19.
    return this.callKw(model, "name_search", [name, domain], omitUndefined({ operator, limit }));
  }

  async readGroup(model, { domain = [], aggregates, groupby, offset, limit, orderby, lazy } = {}) {
    const kwargs = omitUndefined({ offset, limit, orderby, lazy });
    return this.callKw(model, "read_group", [domain, aggregates, groupby], kwargs);
  }

  async create(model, values) {
    // Odoo v18 create() accepts either a single dict (returns id) or a list of
    // dicts (returns list of ids). Both shapes go through positional args.
    return this.callKw(model, "create", [values]);
  }

  async write(model, ids, values) {
    return this.callKw(model, "write", [ids, values]);
  }

  async unlink(model, ids) {
    return this.callKw(model, "unlink", [ids]);
  }
}
