import sql from "mssql";
import BaseDriver from "./BaseDriver.js";

export default class SQLServerDriver extends BaseDriver {
  async connect() {
    // Check if connection exists and is still connected
    if (this.connection && this.connection.connected) {
      return this.connection;
    }

    // Close stale connection if exists
    if (this.connection) {
      try {
        await this.connection.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    this.connection = await sql.connect(this.config);
    console.error(
      `[DB MCP] Đã kết nối SQL Server: ${
        this.config.server || this.config.host
      }:${this.config.port}`
    );
    return this.connection;
  }

  async query(queryText) {
    const conn = await this.connect();
    const result = await conn.request().query(queryText);
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

    const conn = await this.connect();
    
    const colsReq = conn.request();
    colsReq.input('tableName', sql.NVarChar, tableName);
    const colsResult = await colsReq.query(columnsSql);

    const idxReq = conn.request();
    idxReq.input('tableName', sql.NVarChar, tableName);
    const idxResult = await idxReq.query(indexesSql);

    return {
      columns: colsResult.recordset,
      indexes: idxResult.recordset
    };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.close();
    this.connection = null;
    console.error("[DB MCP] Đã đóng kết nối SQL Server");
  }
}
