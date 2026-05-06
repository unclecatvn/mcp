import sql from "mssql";
import { BaseDriver } from "./BaseDriver.js";
import { ConnectionError, TimeoutError, QueryError } from "../lib/errors.js";

const RETRYABLE_RE = /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ConnectionError|Connection is closed)/i;

function buildSslOptions(cfg) {
  switch (cfg.ssl) {
    case "disable":
      return { encrypt: false, trustServerCertificate: true };
    case "prefer":
      return { encrypt: true, trustServerCertificate: true };
    case "require":
      return { encrypt: true, trustServerCertificate: false };
    case "verify":
      return {
        encrypt: true,
        trustServerCertificate: false,
        cryptoCredentialsDetails: cfg.caCert ? { ca: cfg.caCert } : undefined,
      };
    default:
      return { encrypt: true, trustServerCertificate: true };
  }
}

export class SqlServerDriver extends BaseDriver {
  constructor(config) {
    super(config);
    this.poolPromise = new sql.ConnectionPool({
      server: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      pool: { max: config.poolMax, min: 1, idleTimeoutMillis: 30000 },
      requestTimeout: config.timeoutMs,
      connectionTimeout: 10000,
      options: {
        ...buildSslOptions(config),
        enableArithAbort: true,
      },
    })
      .connect()
      .catch((err) => {
        throw new ConnectionError(
          `Cannot connect to SQL Server: ${err.message}`,
          {
            alias: this.config.alias,
          },
          err,
        );
      });
  }

  async _pool() {
    try {
      return await this.poolPromise;
    } catch (err) {
      throw err instanceof ConnectionError
        ? err
        : new ConnectionError(
            `SQL Server pool error: ${err.message}`,
            {
              alias: this.config.alias,
            },
            err,
          );
    }
  }

  async executeQuery({ sql: text, params, timeoutMs }) {
    const pool = await this._pool();
    const req = pool.request();
    req.timeout = timeoutMs;
    if (params && !Array.isArray(params)) {
      for (const [k, v] of Object.entries(params)) req.input(k, v);
    }
    try {
      const r = await req.query(text);
      const recordset = r.recordset ?? [];
      return {
        rows: recordset,
        rowCount: r.rowsAffected?.[0] ?? recordset.length,
        columns: r.recordset?.columns
          ? Object.entries(r.recordset.columns).map(([name, meta]) => ({
              name,
              type: meta.type?.declaration ?? String(meta.type),
            }))
          : [],
      };
    } catch (err) {
      if (/Timeout/i.test(err.message ?? "") || err.code === "ETIMEOUT") {
        throw new TimeoutError(
          `Query exceeded ${timeoutMs}ms timeout for alias '${this.config.alias}'.`,
          { alias: this.config.alias, timeoutMs },
          err,
        );
      }
      if (RETRYABLE_RE.test(err.message ?? "")) {
        throw new ConnectionError(
          `SQL Server connection error: ${err.message}`,
          {
            alias: this.config.alias,
          },
          err,
        );
      }
      throw new QueryError(
        `SQL Server query failed: ${err.message}`,
        {
          alias: this.config.alias,
        },
        err,
      );
    }
  }

  async listTables({ schema } = {}) {
    const text = schema
      ? "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema ORDER BY TABLE_SCHEMA, TABLE_NAME"
      : "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME";
    const params = schema ? { schema } : undefined;
    const r = await this.executeQuery({ sql: text, params, timeoutMs: this.config.timeoutMs });
    return r.rows.map((row) => ({ name: row.TABLE_NAME, schema: row.TABLE_SCHEMA }));
  }

  async describeTable({ tableName, schema }) {
    const cols = await this.executeQuery({
      sql: `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @table ${schema ? "AND TABLE_SCHEMA = @schema" : ""}
            ORDER BY ORDINAL_POSITION`,
      params: schema ? { table: tableName, schema } : { table: tableName },
      timeoutMs: this.config.timeoutMs,
    });
    const idx = await this.executeQuery({
      sql: `SELECT i.name AS index_name, c.name AS column_name, i.is_unique
            FROM sys.indexes i
            JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE i.object_id = OBJECT_ID(@qname)`,
      params: { qname: schema ? `${schema}.${tableName}` : tableName },
      timeoutMs: this.config.timeoutMs,
    });
    return { columns: cols.rows, indexes: idx.rows };
  }

  async healthCheck() {
    try {
      const r = await this.executeQuery({
        sql: "SELECT 1 AS ok",
        params: undefined,
        timeoutMs: 5000,
      });
      return r.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async close() {
    try {
      const pool = await this.poolPromise;
      await pool.close();
    } catch {
      // already closed
    }
  }
}
