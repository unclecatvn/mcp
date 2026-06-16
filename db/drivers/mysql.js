import mysql from "mysql2/promise";
import { BaseDriver } from "./BaseDriver.js";
import { ConnectionError, TimeoutError } from "../lib/errors.js";

const RETRYABLE_RE =
  /(ECONNRESET|ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|read ECONNRESET)/i;

function buildSslOption(cfg) {
  switch (cfg.ssl) {
    case "disable":
      return undefined;
    case "prefer":
      return {}; // let server decide
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

export class MysqlDriver extends BaseDriver {
  constructor(config) {
    super(config);
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.poolMax,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      idleTimeout: 60000,
      multipleStatements: false,
      ssl: buildSslOption(config),
    });
  }

  async executeQuery({ sql, params, timeoutMs }) {
    let conn;
    try {
      conn = await this.pool.getConnection();
    } catch (err) {
      throw new ConnectionError(
        `Cannot connect to MySQL: ${err.message}`,
        {
          alias: this.config.alias,
        },
        err,
      );
    }
    let timeoutHandle;
    let timedOut = false;
    try {
      // For SELECT we add MAX_EXECUTION_TIME hint server-side; for any statement
      // we also set up a JS abort timer that destroys the connection on timeout.
      const isSelect = /^\s*select\b/i.test(sql);
      const finalSql = isSelect ? injectMaxExecutionTime(sql, timeoutMs) : sql;
      const queryPromise = conn.query(finalSql, params);
      const abortPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          conn.destroy();
          reject(
            new TimeoutError(
              `Query exceeded ${timeoutMs}ms timeout for alias '${this.config.alias}'.`,
              { alias: this.config.alias, timeoutMs },
            ),
          );
        }, timeoutMs);
      });
      const [rows, fields] = await Promise.race([queryPromise, abortPromise]);
      const arr = Array.isArray(rows) ? rows : [];
      return {
        rows: arr,
        rowCount:
          typeof rows === "object" && "affectedRows" in rows ? rows.affectedRows : arr.length,
        columns: (fields ?? []).map((f) => ({ name: f.name, type: f.type })),
      };
    } catch (err) {
      throw this._classifyError(err, { timeoutMs, forceTimeout: timedOut });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (conn && !timedOut) conn.release();
    }
  }

  get _dialectLabel() {
    return "MySQL";
  }

  _isRetryableError(message) {
    return RETRYABLE_RE.test(message);
  }

  _isTimeoutError(err) {
    const m = err?.message ?? "";
    return /max_execution_time/i.test(m) || /timeout/i.test(m);
  }

  async describeTable({ tableName, schema }) {
    const cols = await this.executeQuery({
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = ? AND table_schema = ${schema ? "?" : "DATABASE()"}
            ORDER BY ordinal_position`,
      params: schema ? [tableName, schema] : [tableName],
      timeoutMs: this.config.timeoutMs,
    });
    const idx = await this.executeQuery({
      sql: `SELECT index_name, column_name, non_unique
            FROM information_schema.statistics
            WHERE table_name = ? AND table_schema = ${schema ? "?" : "DATABASE()"}
            ORDER BY index_name, seq_in_index`,
      params: schema ? [tableName, schema] : [tableName],
      timeoutMs: this.config.timeoutMs,
    });
    return { columns: cols.rows, indexes: idx.rows };
  }

  async close() {
    await this.pool.end();
  }
}

function injectMaxExecutionTime(sql, ms) {
  // Inject MAX_EXECUTION_TIME(<ms>) optimizer hint right after the leading SELECT.
  return sql.replace(/^\s*select\b/i, (m) => `${m} /*+ MAX_EXECUTION_TIME(${Number(ms)}) */`);
}
