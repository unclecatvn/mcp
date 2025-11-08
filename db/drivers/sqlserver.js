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
    console.info(
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

  async close() {
    if (!this.connection) return;
    await this.connection.close();
    this.connection = null;
    console.error("[DB MCP] Đã đóng kết nối SQL Server");
  }
}
