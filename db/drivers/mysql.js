import mysql from 'mysql2/promise';
import BaseDriver from './BaseDriver.js';

export default class MySQLDriver extends BaseDriver {
  async connect() {
    if (this.connection) return this.connection;
    this.connection = await mysql.createConnection({
      ...this.config,
      multipleStatements: false,
      timezone: 'Z'
    });
    console.log(`[DB MCP] Đã kết nối MySQL: ${this.config.host}:${this.config.port}`);
    return this.connection;
  }

  async query(queryText) {
    const conn = await this.connect();
    const [results, fields] = await conn.execute(queryText);
    return { results, fields, type: 'mysql' };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.end();
    this.connection = null;
    console.log('[DB MCP] Đã đóng kết nối MySQL');
  }
} 