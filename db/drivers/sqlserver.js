import mssql from "mssql";
import BaseDriver from "./BaseDriver.js";

export default class SQLServerDriver extends BaseDriver {
  constructor(config) {
    super(config);
    this.pool = null;
  }

  async connect() {
    // Check existing pool health
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    // Close stale pool if exists
    if (this.pool) {
      try {
        await this.pool.close();
      } catch (e) {
        // Ignore close errors
      }
      this.pool = null;
    }

    // Configure pool settings
    const poolConfig = {
      ...this.config,
      pool: {
        max: 5,
        min: 1,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
      },
      options: {
        ...this.config.options,
        // Connection stability options
        connectTimeout: 30000,
        requestTimeout: 30000,
      },
    };

    this.pool = await mssql.connect(poolConfig);

    // Handle pool errors
    this.pool.on("error", (err) => {
      console.error("[DB MCP] SQL Server Pool error:", err.message);
    });

    console.error(
      `[DB MCP] SQL Server Pool created: ${
        this.config.server || this.config.host
      }:${this.config.port}`
    );
    return this.pool;
  }

  async query(queryText) {
    const pool = await this.connect();
    const result = await pool.request().query(queryText);
    return {
      results: result.recordset || [],
      fields: result.recordset ? result.recordset.columns : {},
      rowsAffected: result.rowsAffected,
      type: "sqlserver",
    };
  }

  async listTables() {
    const sql = `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME;
    `;
    const { results } = await this.query(sql);
    return results.map((row) => row.TABLE_NAME);
  }

  async describeTable(tableName) {
    const columnsSql = `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION;
    `;

    const indexesSql = `
      SELECT 
        i.name AS index_name,
        i.type_desc AS index_type,
        c.name AS column_name,
        ic.is_included_column
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      WHERE t.name = @tableName
      ORDER BY i.name, ic.key_ordinal;
    `;

    const pool = await this.connect();

    const colsReq = pool.request();
    colsReq.input("tableName", mssql.NVarChar, tableName);
    const colsResult = await colsReq.query(columnsSql);

    const idxReq = pool.request();
    idxReq.input("tableName", mssql.NVarChar, tableName);
    const idxResult = await idxReq.query(indexesSql);

    return {
      columns: colsResult.recordset,
      indexes: idxResult.recordset,
    };
  }

  async healthCheck() {
    try {
      const pool = await this.connect();
      await pool.request().query("SELECT 1");
      return true;
    } catch (e) {
      console.error("[DB MCP] SQL Server health check failed:", e.message);
      return false;
    }
  }

  async close() {
    if (!this.pool) return;
    await this.pool.close();
    this.pool = null;
    console.error("[DB MCP] SQL Server Pool closed");
  }
}
