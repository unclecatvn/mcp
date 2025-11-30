import pg from "pg";
import BaseDriver from "./BaseDriver.js";

export default class PostgreSQLDriver extends BaseDriver {
  constructor(config) {
    super(config);
    this.pool = null;
  }

  async connect() {
    // Sử dụng connection pool thay vì single client
    if (!this.pool) {
      this.pool = new pg.Pool({
        ...this.config,
        // Pool configuration
        max: 5, // Maximum number of connections
        min: 1, // Minimum number of connections
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not obtained
        // Keep alive to prevent connection drops
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      });

      // Handle pool errors globally
      this.pool.on("error", (err) => {
        console.error("[DB MCP] PostgreSQL Pool error:", err.message);
      });

      console.error(
        `[DB MCP] PostgreSQL Pool created: ${this.config.host}:${this.config.port}`
      );
    }

    return this.pool;
  }

  async query(queryText) {
    const pool = await this.connect();

    // Pool tự động handle connection management
    const result = await pool.query(queryText);
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

    const indexesSql = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1;
    `;

    const pool = await this.connect();
    const [colsResult, indexesResult] = await Promise.all([
      pool.query(columnsSql, [tableName]),
      pool.query(indexesSql, [tableName]),
    ]);

    return {
      columns: colsResult.rows,
      indexes: indexesResult.rows,
    };
  }

  async healthCheck() {
    try {
      const pool = await this.connect();
      await pool.query("SELECT 1");
      return true;
    } catch (e) {
      console.error("[DB MCP] PostgreSQL health check failed:", e.message);
      return false;
    }
  }

  async close() {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
    console.error("[DB MCP] PostgreSQL Pool closed");
  }
}
