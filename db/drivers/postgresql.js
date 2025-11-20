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
    console.error(
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

  async listTables() {
    const sql = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const { results } = await this.query(sql);
    return results.map((row) => row.table_name);
  }

  async describeTable(tableName) {
    const columnsSql = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `;
    
    // Get indexes to help with optimization
    const indexesSql = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1;
    `;

    const conn = await this.connect();
    const [colsResult, indexesResult] = await Promise.all([
      conn.query(columnsSql, [tableName]),
      conn.query(indexesSql, [tableName])
    ]);

    return {
      columns: colsResult.rows,
      indexes: indexesResult.rows
    };
  }

  async close() {
    if (!this.connection) return;
    await this.connection.end();
    this.connection = null;
    console.error("[DB MCP] Đã đóng kết nối PostgreSQL");
  }
}
