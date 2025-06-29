import sql from 'mssql';
import BaseDriver from './BaseDriver.js';

export default class SQLServerDriver extends BaseDriver {
  async connect() {
    if (this.connection) return this.connection;
    this.connection = await sql.connect(this.config);
    console.log(`[DB MCP] Đã kết nối SQL Server: ${this.config.server || this.config.host}:${this.config.port}`);
    return this.connection;
  }

  async query(queryText) {
    const conn = await this.connect();
    const result = await conn.request().query(queryText);
    return {
      results: result.recordset || [],
      fields: result.recordset ? result.recordset.columns : {},
      rowsAffected: result.rowsAffected,
      type: 'sqlserver'
    };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.close();
    this.connection = null;
    console.log('[DB MCP] Đã đóng kết nối SQL Server');
  }
} 