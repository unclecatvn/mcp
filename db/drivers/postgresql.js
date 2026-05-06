import pg from "pg";
import { BaseDriver } from "./BaseDriver.js";
import { ConnectionError, TimeoutError, QueryError } from "../lib/errors.js";

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
      // Per-statement timeout.
      await client.query(`SET LOCAL statement_timeout = ${Number(timeoutMs)}`);
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
      if (/canceling statement due to statement timeout/i.test(err.message)) {
        throw new TimeoutError(
          `Query exceeded ${timeoutMs}ms timeout for alias '${this.config.alias}'.`,
          { alias: this.config.alias, timeoutMs },
          err,
        );
      }
      if (RETRYABLE_RE.test(err.message)) {
        throw new ConnectionError(
          `PostgreSQL connection error: ${err.message}`,
          {
            alias: this.config.alias,
          },
          err,
        );
      }
      throw new QueryError(
        `PostgreSQL query failed: ${err.message}`,
        {
          alias: this.config.alias,
        },
        err,
      );
    } finally {
      client.release();
    }
  }

  async listTables({ schema } = {}) {
    const sql = schema
      ? `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_schema, table_name`
      : `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name`;
    const params = schema ? [schema] : [];
    const r = await this.executeQuery({ sql, params, timeoutMs: this.config.timeoutMs });
    return r.rows.map((row) => ({ name: row.table_name, schema: row.table_schema }));
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

  async healthCheck() {
    try {
      const r = await this.executeQuery({
        sql: "SELECT 1 AS ok",
        params: [],
        timeoutMs: 5000,
      });
      return r.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async close() {
    await this.pool.end();
  }
}
