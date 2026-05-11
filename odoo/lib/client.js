import { AuthError, TransportError, fromOdooError } from "./errors.js";

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res;
    try {
      res = await this._fetch(`${this.url}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (e?.name === "AbortError") {
        throw new TransportError(
          `Odoo request timed out after ${this.timeoutMs}ms (connection=${this.name})`,
          { connection: this.name, timeoutMs: this.timeoutMs },
          e,
        );
      }
      throw new TransportError(
        `Failed to reach Odoo at ${this.url} (connection=${this.name}): ${e.message}`,
        { connection: this.name, url: this.url },
        e,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new TransportError(
        `Odoo HTTP ${res.status} ${res.statusText} (connection=${this.name})`,
        { connection: this.name, status: res.status },
      );
    }

    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new TransportError(
        `Odoo returned non-JSON response (connection=${this.name}): ${e.message}`,
        { connection: this.name },
        e,
      );
    }

    if (json.error) {
      throw fromOdooError(json.error, { connection: this.name });
    }

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
        throw new AuthError(
          `Authentication failed for connection "${this.name}" (db=${this.db}, user=${this.username}). ` +
            `Check the ${this.authType === "apikey" ? "API key" : "password"} and database name. ` +
            `Note: users with 2FA enabled cannot authenticate with their password — use an API key instead.`,
          { connection: this.name, db: this.db, username: this.username, authType: this.authType },
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

  /** Drop the fields_get cache (test helper / future invalidation hook). */
  clearFieldsCache(model) {
    if (model === undefined) {
      this._fieldsCache.clear();
      return;
    }
    for (const key of this._fieldsCache.keys()) {
      if (key.startsWith(`${model}|`)) this._fieldsCache.delete(key);
    }
  }

  async searchRead(model, { domain = [], fields, limit, offset, order } = {}) {
    const kwargs = omitUndefined({ domain, fields, limit, offset, order });
    return this.callKw(model, "search_read", [], kwargs);
  }

  async searchCount(model, domain = [], limit) {
    return this.callKw(model, "search_count", [domain], omitUndefined({ limit }));
  }

  async nameSearch(model, { name = "", domain, operator, limit } = {}) {
    const kwargs = omitUndefined({ name, args: domain, operator, limit });
    return this.callKw(model, "name_search", [], kwargs);
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
