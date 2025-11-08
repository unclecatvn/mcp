import pg from "pg";
import BaseDriver from "./BaseDriver.js";

export default class PostgreSQLDriver extends BaseDriver {
  async connect() {
    // Check if connection exists and is still connected
    if (this.connection && !this.connection.end) {
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

    const { Client } = pg;
    this.connection = new Client(this.config);
    await this.connection.connect();
    console.info(
      `[DB MCP] Đã kết nối PostgreSQL: ${this.config.host}:${this.config.port}`
    );
    return this.connection;
  }

  async query(queryText) {
    const conn = await this.connect();
    const result = await conn.query(queryText);
    return {
      results: result.rows,
      fields: result.fields,
      rowCount: result.rowCount,
      type: "postgresql",
    };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.end();
    this.connection = null;
    console.error("[DB MCP] Đã đóng kết nối PostgreSQL");
  }
}
