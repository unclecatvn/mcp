import pg from 'pg';
import BaseDriver from './BaseDriver.js';

export default class PostgreSQLDriver extends BaseDriver {
  async connect() {
    if (this.connection) return this.connection;
    const { Client } = pg;
    this.connection = new Client(this.config);
    await this.connection.connect();
    console.log(`[DB MCP] Đã kết nối PostgreSQL: ${this.config.host}:${this.config.port}`);
    return this.connection;
  }

  async query(queryText) {
    const conn = await this.connect();
    const result = await conn.query(queryText);
    return {
      results: result.rows,
      fields: result.fields,
      rowCount: result.rowCount,
      type: 'postgresql'
    };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.end();
    this.connection = null;
    console.log('[DB MCP] Đã đóng kết nối PostgreSQL');
  }
} 