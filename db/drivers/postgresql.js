import pg from "pg";
import { BaseDriver } from "./BaseDriver.js";
import { ConnectionError } from "../lib/errors.js";

const RETRYABLE_RE =
  /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|connection terminated|server closed|read ECONNRESET|Connection lost)/i;

function buildSslOption(cfg) {
  switch (cfg.ssl) {
    case "disable":
      return false;
    case "prefer":
      return undefined; // let libpq decide; pg uses no TLS by default — acceptable for "prefer"
    case "require":
      return { rejectUnauthorized: false };
    case "verify":
      return {
        rejectUnauthorized: true,
        ca: cfg.caCert ? cfg.caCert : undefined,
      };
    default:
      return undefined;
  }
}

export class PostgresqlDriver extends BaseDriver {
  constructor(config) {
    super(config);
    this.pool = new pg.Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: config.poolMax,
      min: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      ssl: buildSslOption(config),
    });
    this.pool.on("error", () => {
      // Swallow; individual queries will surface their own errors.
    });
  }

  async executeQuery({ sql, params, timeoutMs }) {
    const client = await this.pool.connect().catch((err) => {
      throw new ConnectionError(
        `Cannot connect to PostgreSQL: ${err.message}`,
        {
          alias: this.config.alias,
        },
        err,
      );
    });
    try {
      // Per-statement timeout. `SET LOCAL` only lasts for the surrounding
      // transaction; in node-pg's autocommit mode the query below runs in its
      // own *separate* implicit transaction, so a LOCAL setting would never
      // apply. Use a session-level SET (reset in `finally` so the pooled
      // connection is returned clean). `timeoutMs` is always numeric here.
      await client.query(`SET statement_timeout = ${Number(timeoutMs)}`);
      const result = await client.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        columns: (result.fields ?? []).map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
      };
    } catch (err) {
      throw this._classifyError(err, { timeoutMs });
    } finally {
      // Reset the session timeout so the next borrower of this pooled
      // connection starts from the server default. Best-effort: a broken
      // connection will throw here and is disposed by release().
      try {
        await client.query("SET statement_timeout = DEFAULT");
      } catch {
        // ignore — connection unusable; release() handles disposal
      }
      client.release();
    }
  }

  get _dialectLabel() {
    return "PostgreSQL";
  }

  _isRetryableError(message) {
    return RETRYABLE_RE.test(message);
  }

  _isTimeoutError(err) {
    return /canceling statement due to statement timeout/i.test(err?.message ?? "");
  }

  async describeTable({ tableName, schema }) {
    const cols = await this.executeQuery({
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1 ${schema ? "AND table_schema = $2" : ""}
            ORDER BY ordinal_position`,
      params: schema ? [tableName, schema] : [tableName],
      timeoutMs: this.config.timeoutMs,
    });
    const idx = await this.executeQuery({
      sql: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ${schema ? "AND schemaname = $2" : ""}`,
      params: schema ? [tableName, schema] : [tableName],
      timeoutMs: this.config.timeoutMs,
    });
    return { columns: cols.rows, indexes: idx.rows };
  }

  async close() {
    await this.pool.end();
  }
}
