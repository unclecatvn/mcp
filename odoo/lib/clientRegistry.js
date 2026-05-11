import { OdooClient } from "./client.js";
import { UnknownConnectionError } from "./errors.js";

/**
 * Holds one OdooClient per configured connection. Clients are constructed
 * eagerly (cheap — no network) but authentication is lazy on first use.
 */
export class ClientRegistry {
  /**
   * @param {Record<string, object>} connections
   * @param {object} [opts]
   * @param {(typeof fetch)} [opts.fetchImpl]  Override for tests.
   */
  constructor(connections, { fetchImpl } = {}) {
    /** @type {Map<string, OdooClient>} */
    this.clients = new Map();
    for (const cfg of Object.values(connections)) {
      this.clients.set(cfg.name, new OdooClient({ ...cfg, fetchImpl }));
    }
  }

  has(name) {
    return this.clients.has(name);
  }

  /** Returns names in registration order. */
  list() {
    return Array.from(this.clients.values()).map((c) => c.describe());
  }

  /** Resolve a client by name or throw a user-actionable error. */
  get(name) {
    const client = this.clients.get(name);
    if (!client) {
      const available = Array.from(this.clients.keys());
      throw new UnknownConnectionError(
        available.length === 0
          ? `No Odoo connections configured. Set ODOO_<NAME>_URL/DB/USERNAME and either ODOO_<NAME>_API_KEY or ODOO_<NAME>_PASSWORD.`
          : `Unknown connection "${name}". Available: ${available.join(", ")}`,
        { requested: name, available },
      );
    }
    return client;
  }
}
