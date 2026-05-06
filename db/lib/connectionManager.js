import { createDriver } from "../drivers/index.js";
import { ConnectionError } from "./errors.js";

/**
 * Owns the alias → driver instance map and provides a retrying execute helper.
 */
export class ConnectionRegistry {
  /** @param {Record<string, object>} aliases  alias name → validated config */
  constructor(aliases) {
    this.aliases = aliases;
    this.drivers = new Map();
  }

  hasAlias(alias) {
    return Object.prototype.hasOwnProperty.call(this.aliases, alias);
  }

  getConfig(alias) {
    const cfg = this.aliases[alias];
    if (!cfg) {
      throw new ConnectionError(`Unknown database alias: '${alias}'.`, { alias });
    }
    return cfg;
  }

  getOrCreateDriver(alias) {
    let d = this.drivers.get(alias);
    if (!d) {
      d = createDriver(this.getConfig(alias));
      this.drivers.set(alias, d);
    }
    return d;
  }

  /**
   * Execute with up to maxRetries on retryable errors. Recreates the driver
   * after a connection-level failure.
   */
  async withRetry(alias, fn, maxRetries = 3) {
    let attempt = 0;
    let lastErr;
    let delay = 100;
    while (attempt <= maxRetries) {
      try {
        const driver = this.getOrCreateDriver(alias);
        const result = await fn(driver);
        return { result, retries: attempt };
      } catch (err) {
        lastErr = err;
        if (!err || !err.retryable || attempt === maxRetries) break;
        await this._closeDriver(alias);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 2000);
        attempt++;
      }
    }
    throw lastErr;
  }

  async _closeDriver(alias) {
    const d = this.drivers.get(alias);
    if (!d) return;
    this.drivers.delete(alias);
    try {
      await d.close();
    } catch {
      // ignore close errors during retry
    }
  }

  async closeAll() {
    const ds = [...this.drivers.values()];
    this.drivers.clear();
    await Promise.allSettled(ds.map((d) => d.close()));
  }

  listAliases() {
    return Object.keys(this.aliases);
  }
}
