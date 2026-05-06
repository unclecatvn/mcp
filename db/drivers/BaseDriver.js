/**
 * Abstract base for database drivers.
 *
 * Implementations are constructed once per alias and own a connection pool.
 * The MCP server caches the instance keyed by alias.
 */
export class BaseDriver {
  /** @param {object} config Validated alias config from lib/config.js. */
  constructor(config) {
    if (new.target === BaseDriver) {
      throw new Error("BaseDriver is abstract; instantiate a concrete driver instead.");
    }
    this.config = config;
  }

  /**
   * Execute a parameterized query.
   * @param {object} req
   * @param {string} req.sql
   * @param {Array|Object} req.params
   * @param {number} req.timeoutMs
   * @returns {Promise<{ rows: any[], rowCount: number, columns: any[] }>}
   */
  async executeQuery(_req) {
    throw new Error("executeQuery() not implemented");
  }

  /** @returns {Promise<Array<{name: string, schema?: string}>>} */
  async listTables(_opts) {
    throw new Error("listTables() not implemented");
  }

  /** @returns {Promise<{ columns: any[], indexes: any[] }>} */
  async describeTable(_opts) {
    throw new Error("describeTable() not implemented");
  }

  /** @returns {Promise<boolean>} */
  async healthCheck() {
    throw new Error("healthCheck() not implemented");
  }

  async close() {
    throw new Error("close() not implemented");
  }
}
