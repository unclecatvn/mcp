import mysql from "mysql2/promise";
import BaseDriver from "./BaseDriver.js";

export default class MySQLDriver extends BaseDriver {
  async connect() {
    // Check if connection exists and is still connected
    if (this.connection && this.connection.threadId) {
      return this.connection;
    }

    // Close stale connection if exists
    if (this.connection) {
      try {
        await this.connection.end();
      } catch (e) {
        // Ignore close errors
      }
    }

    this.connection = await mysql.createConnection({
      ...this.config,
      multipleStatements: false,
      timezone: "Z",
    });
    console.error(
      `[DB MCP] Đã kết nối MySQL: ${this.config.host}:${this.config.port}`
    );
    return this.connection;
  }

  async query(queryText) {
    const conn = await this.connect();
    const [results, fields] = await conn.execute(queryText);
    return { results, fields, type: "mysql" };
  }

  async listTables() {
    const sql = "SHOW TABLES";
    const { results } = await this.query(sql);
    // results is array of objects like { 'Tables_in_dbname': 'tablename' }
    return results.map(row => Object.values(row)[0]);
  }

  async describeTable(tableName) {
    const conn = await this.connect();
    
    // Use parameterized queries to prevent injection
    const [columns] = await conn.query(`DESCRIBE ??`, [tableName]);
    const [indexes] = await conn.query(`SHOW INDEX FROM ??`, [tableName]);

    return {
      columns,
      indexes
    };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.end();
    this.connection = null;
    console.error("[DB MCP] Đã đóng kết nối MySQL");
  }
}
