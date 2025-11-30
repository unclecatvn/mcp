import mysql from "mysql2/promise";
import BaseDriver from "./BaseDriver.js";

export default class MySQLDriver extends BaseDriver {
  constructor(config) {
    super(config);
    this.pool = null;
  }

  async connect() {
    // Sử dụng connection pool thay vì single connection
    if (!this.pool) {
      this.pool = mysql.createPool({
        ...this.config,
        multipleStatements: false,
        timezone: "Z",
        // Pool configuration để giữ connection alive
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000, // 10 seconds
        // Auto reconnect khi connection bị timeout
        idleTimeout: 60000, // 60 seconds
      });

      console.error(
        `[DB MCP] MySQL Pool created: ${this.config.host}:${this.config.port}`
      );
    }

    return this.pool;
  }

  async getConnection() {
    const pool = await this.connect();
    return pool.getConnection();
  }

  async query(queryText) {
    const pool = await this.connect();

    // Pool tự động handle reconnect khi connection bị stale
    const [results, fields] = await pool.execute(queryText);
    return { results, fields, type: "mysql" };
  }

  async listTables() {
    const sql = "SHOW TABLES";
    const { results } = await this.query(sql);
    return results.map((row) => Object.values(row)[0]);
  }

  async describeTable(tableName) {
    const pool = await this.connect();

    // Use parameterized queries to prevent injection
    const [columns] = await pool.query(`DESCRIBE ??`, [tableName]);
    const [indexes] = await pool.query(`SHOW INDEX FROM ??`, [tableName]);

    return {
      columns,
      indexes,
    };
  }

  async healthCheck() {
    try {
      const pool = await this.connect();
      await pool.query("SELECT 1");
      return true;
    } catch (e) {
      console.error("[DB MCP] MySQL health check failed:", e.message);
      return false;
    }
  }

  async close() {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
    console.error("[DB MCP] MySQL Pool closed");
  }
}
