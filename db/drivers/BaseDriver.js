import { ConnectionError, TimeoutError, QueryError } from "../lib/errors.js";
import { buildPageResponse } from "../lib/tableListing.js";
import { buildListTablesQuery, mapListTablesRow } from "../lib/tableListingSql.js";

/**
 * Abstract base for database drivers.
 *
 * Implementations are constructed once per alias and own a connection pool.
 * The MCP server caches the instance keyed by alias.
 *
 * Subclasses MUST implement {@link executeQuery}, {@link describeTable}, and
 * {@link close}. {@link listTables} and {@link healthCheck} are dialect-agnostic
 * and provided here on top of `executeQuery`. To customise error mapping a
 * subclass overrides {@link _dialectLabel}, {@link _isRetryableError}, and
 * {@link _isTimeoutError}, then routes its `catch` through {@link _classifyError}.
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

  /** @returns {Promise<{ columns: any[], indexes: any[] }>} */
  async describeTable(_opts) {
    throw new Error("describeTable() not implemented");
  }

  async close() {
    throw new Error("close() not implemented");
  }

  /**
   * List tables with pagination + optional schema/name filtering.
   * Dialect-agnostic: builds the dialect SQL from `this.config.type`, runs it
   * through the subclass `executeQuery`, and maps rows to the page response.
   * @returns {Promise<{tables: Array<{name: string, schema?: string}>, limit: number, offset: number, hasMore: boolean}>}
   */
  async listTables(opts = {}) {
    const dialect = this.config.type;
    const { sql, params, paging } = buildListTablesQuery(dialect, opts);
    const r = await this.executeQuery({ sql, params, timeoutMs: this.config.timeoutMs });
    const rows = r.rows.map((row) => mapListTablesRow(dialect, row));
    return buildPageResponse(rows, paging);
  }

  /** @returns {Promise<boolean>} `SELECT 1` round-trip; false on any error. */
  async healthCheck() {
    try {
      const r = await this.executeQuery({ sql: "SELECT 1 AS ok", params: [], timeoutMs: 5000 });
      return r.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  // --- Error mapping (overridable per dialect) -----------------------------

  /** Human-readable dialect name used in error messages. */
  get _dialectLabel() {
    return this.config.type;
  }

  /** @returns {boolean} whether a query error message is a transient connection failure. */
  _isRetryableError(_message) {
    return false;
  }

  /** @returns {boolean} whether an error represents a query/statement timeout. */
  _isTimeoutError(_err) {
    return false;
  }

  /**
   * Map a raw driver error onto a typed McpDb error. Shared by all dialects:
   * timeout → TimeoutError, transient connection failure → (retryable)
   * ConnectionError, everything else → QueryError.
   *
   * @param {Error} err
   * @param {{ timeoutMs: number, forceTimeout?: boolean }} ctx
   * @returns {ConnectionError|TimeoutError|QueryError}
   */
  _classifyError(err, { timeoutMs, forceTimeout = false }) {
    const message = err?.message ?? "";
    if (forceTimeout || this._isTimeoutError(err)) {
      return new TimeoutError(
        `Query exceeded ${timeoutMs}ms timeout for alias '${this.config.alias}'.`,
        { alias: this.config.alias, timeoutMs },
        err,
      );
    }
    if (this._isRetryableError(message)) {
      return new ConnectionError(
        `${this._dialectLabel} connection error: ${message}`,
        { alias: this.config.alias },
        err,
      );
    }
    return new QueryError(
      `${this._dialectLabel} query failed: ${message}`,
      { alias: this.config.alias },
      err,
    );
  }
}
