import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import driverMap from "./drivers/index.js";

class DatabaseConnection {
  constructor(type, config) {
    const DriverClass = driverMap[type];
    if (!DriverClass)
      throw new Error(`Database type không được hỗ trợ: ${type}`);
    this.driver = new DriverClass(config);
    this.type = type;
  }

  connect() {
    return this.driver.connect();
  }
  query(q) {
    return this.driver.query(q);
  }
  listTables() {
    return this.driver.listTables();
  }
  describeTable(tableName) {
    return this.driver.describeTable(tableName);
  }
  healthCheck() {
    return this.driver.healthCheck();
  }
  close() {
    return this.driver.close();
  }
  get currentDatabase() {
    return this.driver.currentDatabase;
  }
  set currentDatabase(db) {
    this.driver.currentDatabase = db;
  }
}

// Constants
const DEFAULT_PORTS = {
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  sqlserver: 1433,
};

const SQLSERVER_OPTIONS = {
  encrypt: true,
  trustServerCertificate: true,
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

export default class MultiDatabaseMCPServer {
  constructor() {
    this.server = new Server(
      { name: "@mcp/database", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.connections = new Map();
    this.setupToolHandlers();
    this.server.onerror = (e) => console.error("[MCP Error]", e);
    process.on("SIGINT", async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  getConnectionKey(type, cfg) {
    const host = cfg.host || cfg.server || "localhost";
    const port = cfg.port || this.getDefaultPort(type);
    const db = cfg.database || "no_database";
    const user = cfg.user || "no_user";
    const options = cfg.options ? JSON.stringify(cfg.options) : "{}";
    return `${type}_${host}_${port}_${db}_${user}_${options}`;
  }

  async getConnection(type, cfg) {
    const key = this.getConnectionKey(type, cfg);

    if (!this.connections.has(key)) {
      const conn = new DatabaseConnection(type, cfg);
      this.connections.set(key, conn);
    }

    return this.connections.get(key);
  }

  // Remove stale connection from cache (for reconnect scenarios)
  removeConnection(type, cfg) {
    const key = this.getConnectionKey(type, cfg);
    if (this.connections.has(key)) {
      const conn = this.connections.get(key);
      // Try to close gracefully
      conn.close().catch(() => {});
      this.connections.delete(key);
    }
  }

  parseConnectionString(str, type) {
    try {
      const url = new URL(str);
      const cfg = {
        host: url.hostname,
        port: parseInt(url.port) || this.getDefaultPort(type),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
      };
      const normalizedCfg = this.normalizeSqlServerConfig(cfg, type);
      return this.validateConnectionConfig(normalizedCfg, type);
    } catch (err) {
      throw new Error(`Invalid connection string: ${err.message}`);
    }
  }

  getDefaultPort(type) {
    return DEFAULT_PORTS[type] || DEFAULT_PORTS.mysql;
  }

  normalizeSqlServerConfig(cfg, type = "sqlserver") {
    if (type === "sqlserver" && cfg.host) {
      cfg.server = cfg.host;
      delete cfg.host;
      cfg.options = { ...SQLSERVER_OPTIONS };
    }
    return cfg;
  }

  validateConnectionConfig(cfg, type) {
    if (!cfg) {
      throw new Error("Connection config không được để trống");
    }

    const host = cfg.host || cfg.server;
    if (!host) {
      throw new Error(`Host/Server không được để trống cho ${type}`);
    }

    if (
      cfg.port &&
      (typeof cfg.port !== "number" || cfg.port <= 0 || cfg.port > 65535)
    ) {
      throw new Error(
        `Port phải là số dương từ 1-65535, nhận được: ${cfg.port}`
      );
    }

    if (type === "sqlserver" && cfg.options) {
      const validOptions = [
        "encrypt",
        "trustServerCertificate",
        "enableArithAbort",
      ];
      const invalidOptions = Object.keys(cfg.options).filter(
        (key) => !validOptions.includes(key)
      );
      if (invalidOptions.length > 0) {
        throw new Error(
          `SQL Server options không hợp lệ: ${invalidOptions.join(", ")}`
        );
      }
    }

    return cfg;
  }

  parseConnectionStringEnv(type, connections, parseErrors) {
    const envPrefix = type.toUpperCase();
    const connectionsEnv = process.env[`${envPrefix}_CONNECTIONS`];
    if (connectionsEnv) {
      const connStrings = connectionsEnv
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s);
      for (const connStr of connStrings) {
        const [alias, url] = connStr.split("=");
        if (alias && url) {
          try {
            connections[alias.trim()] = this.parseConnectionString(
              url.trim(),
              type
            );
          } catch (e) {
            const errorMsg = `Invalid connection string for ${alias}: ${e.message}`;
            console.error(`[DB MCP] ${errorMsg}`);
            parseErrors.push(errorMsg);
          }
        }
      }
    }
  }

  parseNumberedEnv(type, connections) {
    const envPrefix = type.toUpperCase();
    let dbIndex = 1;
    while (true) {
      const alias = `db${dbIndex}`;
      const host = process.env[`${envPrefix}_DB${dbIndex}_HOST`];
      const port = process.env[`${envPrefix}_DB${dbIndex}_PORT`];
      const user = process.env[`${envPrefix}_DB${dbIndex}_USER`];
      const password = process.env[`${envPrefix}_DB${dbIndex}_PASSWORD`];
      const database = process.env[`${envPrefix}_DB${dbIndex}_DATABASE`];

      if (!host) break;

      let cfg = {
        host,
        port: parseInt(port) || this.getDefaultPort(type),
        user: user || "root",
        password: password || "",
        database,
      };

      cfg = this.normalizeSqlServerConfig(cfg, type);
      cfg = this.validateConnectionConfig(cfg, type);

      connections[alias] = cfg;
      dbIndex++;
    }
  }

  parseLegacyEnv(type, connections) {
    if (Object.keys(connections).length > 0) return;

    const envPrefix = type.toUpperCase();
    const host = process.env[`${envPrefix}_HOST`];
    const port = process.env[`${envPrefix}_PORT`];
    const user = process.env[`${envPrefix}_USER`];
    const password = process.env[`${envPrefix}_PASSWORD`];
    const database = process.env[`${envPrefix}_DATABASE`];

    if (host || database) {
      let cfg = {
        host: host || "localhost",
        port: parseInt(port) || this.getDefaultPort(type),
        user: user || "root",
        password: password || "",
        database,
      };

      cfg = this.normalizeSqlServerConfig(cfg, type);
      cfg = this.validateConnectionConfig(cfg, type);

      connections["default"] = cfg;
    }
  }

  parseMultipleConnections(type) {
    const connections = {};
    const parseErrors = [];

    this.parseConnectionStringEnv(type, connections, parseErrors);
    this.parseNumberedEnv(type, connections);
    this.parseLegacyEnv(type, connections);

    if (Object.keys(connections).length === 0 && parseErrors.length > 0) {
      const errorMsg = `❌ Không có connection nào hợp lệ cho ${type.toUpperCase()}:\n${parseErrors
        .map((err) => `• ${err}`)
        .join("\n")}`;
      throw new Error(errorMsg);
    }

    return connections;
  }

  getAvailableDatabases(type) {
    const connections = this.parseMultipleConnections(type);
    return Object.keys(connections);
  }

  createToolDefinitions() {
    return [
      {
        name: "db_query",
        description: `Thực thi SQL query trên database.

🎯 HỖ TRỢ: MySQL, PostgreSQL, SQL Server
🔥 ĐÃ SETUP SẴN: env vars có sẵn

📋 CÁCH SỬ DỤNG:
• Không chỉ định databaseAlias: sử dụng database mặc định
• Chỉ định databaseAlias: chọn database cụ thể từ env vars`,
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
              description: "Database type (BẮT BUỘC)",
            },
            query: {
              type: "string",
              description: "SQL query",
            },
            databaseAlias: {
              type: "string",
              description:
                "Alias của database (optional). Để trống sẽ dùng database mặc định. Các alias có sẵn sẽ được liệt kê nếu không tìm thấy database.",
            },
            connection: {
              type: "object",
              description:
                "Connection config override (optional - sẽ override env vars)",
            },
          },
          required: ["type", "query"],
        },
      },
      {
        name: "db_list_tables",
        description: "Liệt kê tất cả các bảng trong database.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
              description: "Database type (BẮT BUỘC)",
            },
            databaseAlias: {
              type: "string",
              description: "Alias của database (optional)",
            },
            connection: {
              type: "object",
              description: "Connection config override (optional)",
            },
          },
          required: ["type"],
        },
      },
      {
        name: "db_describe_table",
        description:
          "Xem cấu trúc chi tiết của bảng (cột, kiểu dữ liệu, index).",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["mysql", "mariadb", "postgresql", "sqlserver"],
              description: "Database type (BẮT BUỘC)",
            },
            tableName: {
              type: "string",
              description: "Tên bảng cần xem chi tiết",
            },
            databaseAlias: {
              type: "string",
              description: "Alias của database (optional)",
            },
            connection: {
              type: "object",
              description: "Connection config override (optional)",
            },
          },
          required: ["type", "tableName"],
        },
      },
    ];
  }

  validateQueryRequest(args) {
    const { type, query } = args;
    if (!type || !query) {
      throw new Error("type & query bắt buộc");
    }

    const supportedTypes = ["mysql", "mariadb", "postgresql", "sqlserver"];
    if (!supportedTypes.includes(type)) {
      throw new Error(`Database type không được hỗ trợ: ${type}`);
    }

    return args;
  }

  validateCommonRequest(args) {
    const { type } = args;
    if (!type) {
      throw new Error("type bắt buộc");
    }
    const supportedTypes = ["mysql", "mariadb", "postgresql", "sqlserver"];
    if (!supportedTypes.includes(type)) {
      throw new Error(`Database type không được hỗ trợ: ${type}`);
    }
    return args;
  }

  resolveDatabaseConnection(type, databaseAlias, connection) {
    const availableConnections = this.parseMultipleConnections(type);
    const availableAliases = Object.keys(availableConnections);

    let cfg;
    let usedAlias;

    if (connection?.connectionString) {
      cfg = this.parseConnectionString(connection.connectionString, type);
      usedAlias = "custom_connection_string";
    } else if (databaseAlias && availableConnections[databaseAlias]) {
      cfg = availableConnections[databaseAlias];
      usedAlias = databaseAlias;
    } else if (availableAliases.length > 0) {
      if (databaseAlias && !availableConnections[databaseAlias]) {
        const errorMsg = `❌ Database alias "${databaseAlias}" không tìm thấy.

📋 Các database ${type.toUpperCase()} có sẵn:
${availableAliases
  .map(
    (alias) =>
      `• ${alias}: ${availableConnections[alias].database || "N/A"} (${
        availableConnections[alias].host || availableConnections[alias].server
      }:${availableConnections[alias].port})`
  )
  .join("\n")}

💡 Để sử dụng database mặc định, không cần chỉ định databaseAlias.`;
        throw new Error(errorMsg);
      }

      usedAlias = availableAliases[0];
      cfg = availableConnections[usedAlias];
    } else {
      const errorMsg = `❌ Không tìm thấy cấu hình database cho ${type.toUpperCase()}.

🔧 Vui lòng cấu hình một trong các cách sau:

1️⃣ **Connection String:**
   ${type.toUpperCase()}_CONNECTIONS="alias1=mysql://user:pass@host:port/db1;alias2=mysql://user:pass@host:port/db2"

2️⃣ **Multiple DB vars:**
   ${type.toUpperCase()}_DB1_HOST=host1
   ${type.toUpperCase()}_DB1_DATABASE=db1
   ${type.toUpperCase()}_DB2_HOST=host2
   ${type.toUpperCase()}_DB2_DATABASE=db2

3️⃣ **Single DB (backward compatibility):**
   ${type.toUpperCase()}_HOST=host
   ${type.toUpperCase()}_DATABASE=db`;
      throw new Error(errorMsg);
    }

    return { cfg, usedAlias };
  }

  applyConnectionOverrides(cfg, type, connection) {
    if (!connection || connection.connectionString) {
      return cfg;
    }

    const newCfg = {
      ...cfg,
      host: connection.host || cfg.host,
      port: connection.port || cfg.port,
      user: connection.user || cfg.user,
      password: connection.password || cfg.password,
      database: connection.database || cfg.database,
    };

    return this.normalizeSqlServerConfig(newCfg, type);
  }

  // Utility: Sleep for retry delay
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Check if error is retryable (connection-related)
  isRetryableError(err) {
    const retryablePatterns = [
      /ECONNRESET/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /PROTOCOL_CONNECTION_LOST/i,
      /connection.*lost/i,
      /connection.*closed/i,
      /connection.*terminated/i,
      /Connection is not connected/i,
      /Cannot enqueue Query after fatal error/i,
      /Cannot enqueue Query after invoking quit/i,
      /EPIPE/i,
      /socket hang up/i,
      /Client has encountered a connection error/i,
    ];

    const errorMessage = err.message || "";
    const errorCode = err.code || "";

    return retryablePatterns.some(
      (pattern) => pattern.test(errorMessage) || pattern.test(errorCode)
    );
  }

  // Execute with retry logic
  async executeWithRetry(operation, type, cfg) {
    let lastError;
    let delay = RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;

        // Check if retryable
        if (
          !this.isRetryableError(err) ||
          attempt === RETRY_CONFIG.maxRetries
        ) {
          throw err;
        }

        console.error(
          `[DB MCP] Query failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${err.message}. Retrying in ${delay}ms...`
        );

        // Remove cached connection to force reconnect
        this.removeConnection(type, cfg);

        await this.sleep(delay);
        delay = Math.min(
          delay * RETRY_CONFIG.backoffMultiplier,
          RETRY_CONFIG.maxDelayMs
        );
      }
    }

    throw lastError;
  }

  async executeDatabaseQuery(type, cfg, query) {
    const safeLog = query.replace(
      /password\s*=\s*['"][^'"]*['"]/gi,
      "password='***'"
    );
    console.error(
      `[DB MCP] Executing ${type}: ${safeLog.slice(0, 200)}${
        safeLog.length > 200 ? "..." : ""
      }`
    );

    try {
      const res = await this.executeWithRetry(
        async () => {
          const db = await this.getConnection(type, cfg);
          return await db.query(query);
        },
        type,
        cfg
      );

      if (!res || typeof res !== "object") {
        return {
          content: [
            {
              type: "text",
              text: "❌ Database driver trả về result không hợp lệ",
            },
          ],
          isError: true,
        };
      }

      if (Array.isArray(res.results) && res.results.length === 0) {
        return {
          content: [{ type: "text", text: "[]" }],
        };
      }

      if (!Array.isArray(res.results)) {
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(res.results, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ ${err.message}` }],
        isError: true,
      };
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.createToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const { name, arguments: args } = req.params;

        if (name === "db_query") {
          const { type, query, databaseAlias, connection } =
            this.validateQueryRequest(args);
          const { cfg: baseCfg } = this.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = this.applyConnectionOverrides(baseCfg, type, connection);
          return await this.executeDatabaseQuery(type, cfg, query);
        }

        if (name === "db_list_tables") {
          const { type, databaseAlias, connection } =
            this.validateCommonRequest(args);
          const { cfg: baseCfg } = this.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = this.applyConnectionOverrides(baseCfg, type, connection);

          const tables = await this.executeWithRetry(
            async () => {
              const db = await this.getConnection(type, cfg);
              return await db.listTables();
            },
            type,
            cfg
          );

          return {
            content: [{ type: "text", text: JSON.stringify(tables, null, 2) }],
          };
        }

        if (name === "db_describe_table") {
          const { type, tableName, databaseAlias, connection } =
            this.validateCommonRequest(args);
          if (!tableName) throw new Error("tableName bắt buộc");

          const { cfg: baseCfg } = this.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = this.applyConnectionOverrides(baseCfg, type, connection);

          const details = await this.executeWithRetry(
            async () => {
              const db = await this.getConnection(type, cfg);
              return await db.describeTable(tableName);
            },
            type,
            cfg
          );

          return {
            content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
          };
        }

        throw new Error(`Tool không tồn tại: ${name}`);
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ ${err.message}` }],
          isError: true,
        };
      }
    });
  }

  async cleanup() {
    const closePromises = [...this.connections.values()].map(async (c) => {
      try {
        await c.close();
      } catch (err) {
        console.error("[DB MCP] Error closing connection:", err.message);
      }
    });
    await Promise.allSettled(closePromises);
    this.connections.clear();
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      "[DB MCP] Multi-Database Server started (with connection pooling)"
    );
  }
}
