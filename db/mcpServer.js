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
  }

  connect() {
    return this.driver.connect();
  }
  query(q) {
    return this.driver.query(q);
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
    return `${type}_${host}_${port}_${db}_${user}`;
  }
  async getConnection(type, cfg) {
    const key = this.getConnectionKey(type, cfg);
    if (!this.connections.has(key)) {
      this.connections.set(key, new DatabaseConnection(type, cfg));
    }
    return this.connections.get(key);
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

  // Normalize SQL Server configuration
  normalizeSqlServerConfig(cfg, type = "sqlserver") {
    // Only normalize for SQL Server type
    if (type === "sqlserver" && cfg.host) {
      cfg.server = cfg.host;
      delete cfg.host;
      cfg.options = { ...SQLSERVER_OPTIONS };
    }
    return cfg;
  }

  // Validate connection configuration
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

    // Validate SQL Server specific options
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

  // Parse multiple database connections from environment variables
  parseMultipleConnections(type) {
    const envPrefix = type.toUpperCase();
    const connections = {};

    // Method 1: Parse from CONNECTIONS env var (format: alias1=url1;alias2=url2)
    const connectionsEnv = process.env[`${envPrefix}_CONNECTIONS`];
    const parseErrors = [];

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
            console.warn(`[DB MCP] ${errorMsg}`);
            parseErrors.push(errorMsg);
          }
        }
      }
    }

    // Method 2: Parse from numbered DB vars (DB1_HOST, DB1_DATABASE, etc.)
    let dbIndex = 1;
    while (true) {
      const alias = `db${dbIndex}`;
      const host = process.env[`${envPrefix}_DB${dbIndex}_HOST`];
      const port = process.env[`${envPrefix}_DB${dbIndex}_PORT`];
      const user = process.env[`${envPrefix}_DB${dbIndex}_USER`];
      const password = process.env[`${envPrefix}_DB${dbIndex}_PASSWORD`];
      const database = process.env[`${envPrefix}_DB${dbIndex}_DATABASE`];

      // If no host found for this index, break
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

    // Method 3: Default single database (backward compatibility)
    if (Object.keys(connections).length === 0) {
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

    // If no valid connections found but there were parse errors, throw summary error
    if (Object.keys(connections).length === 0 && parseErrors.length > 0) {
      const errorMsg = `❌ Không có connection nào hợp lệ cho ${type.toUpperCase()}:\n${parseErrors
        .map((err) => `• ${err}`)
        .join("\n")}`;
      throw new Error(errorMsg);
    }

    return connections;
  }

  // Get available database aliases for a type
  getAvailableDatabases(type) {
    const connections = this.parseMultipleConnections(type);
    return Object.keys(connections);
  }

  // Helper method to detect DML/DDL operations
  isDMLDDLQuery(query) {
    const normalizedQuery = query.trim().toUpperCase();
    const dmlDdlKeywords = [
      "INSERT",
      "UPDATE",
      "DELETE",
      "MERGE",
      "CREATE",
      "ALTER",
      "DROP",
      "TRUNCATE",
      "RENAME",
      "GRANT",
      "REVOKE",
      "COMMIT",
      "ROLLBACK",
    ];

    return dmlDdlKeywords.some(
      (keyword) =>
        normalizedQuery.startsWith(keyword + " ") ||
        normalizedQuery.startsWith(keyword + "\n") ||
        normalizedQuery.startsWith(keyword + "\t")
    );
  }

  // Create tool definition
  createToolDefinition() {
    return {
      name: "db_query",
      description: `Thực thi SQL query trên database.

🎯 HỖ TRỢ: MySQL, PostgreSQL, SQL Server
🔥 ĐÃ SETUP SẴN: env vars có sẵn

📋 CÁCH SỬ DỤNG:
• Không chỉ định databaseAlias: sử dụng database mặc định
• Chỉ định databaseAlias: chọn database cụ thể từ env vars

⚠️  CẢNH BÁO: AI KHÔNG ĐƯỢC tự ý thực hiện DML/DDL (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.) - cần xin phép người dùng trước!`,
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
    };
  }

  // Validate query request parameters
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

  // Resolve which database connection to use
  resolveDatabaseConnection(type, databaseAlias, connection) {
    const availableConnections = this.parseMultipleConnections(type);
    const availableAliases = Object.keys(availableConnections);

    let cfg;
    let usedAlias;

    if (connection?.connectionString) {
      // Override with connection string
      cfg = this.parseConnectionString(connection.connectionString, type);
      usedAlias = "custom_connection_string";
    } else if (databaseAlias && availableConnections[databaseAlias]) {
      // Use specified database alias
      cfg = availableConnections[databaseAlias];
      usedAlias = databaseAlias;
    } else if (availableAliases.length > 0) {
      // Use first available database if no alias specified or alias not found
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

      // Use default (first available)
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

  // Apply connection overrides
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

  // Execute database query and return result
  async executeDatabaseQuery(type, cfg, query) {
    // Check for DML/DDL operations and warn
    if (this.isDMLDDLQuery(query)) {
      const warningMsg = `⚠️  DML/DDL DETECTED: ${query.trim().split("\n")[0]}

❌ AI không được tự ý thực hiện thao tác này
✅ Cần xin phép người dùng trước khi tiếp tục`;

      return {
        content: [{ type: "text", text: warningMsg }],
        isError: true,
      };
    }

    const safeLog = query.replace(
      /password\s*=\s*['"][^'"]*['"]/gi,
      "password='***'"
    );
    console.log(
      `[DB MCP] Executing ${type}: ${safeLog.slice(0, 200)}${
        safeLog.length > 200 ? "..." : ""
      }`
    );

    try {
      const db = await this.getConnection(type, cfg);
      const res = await db.query(query);

      // Validate result object
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
          content: [{ type: "text", text: "Query không trả về record nào" }],
        };
      }

      // Handle non-array results (like INSERT/UPDATE affected rows)
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
      tools: [this.createToolDefinition()],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      if (req.params.name !== "db_query") throw new Error("Tool không tồn tại");

      try {
        const { type, query, databaseAlias, connection } =
          this.validateQueryRequest(req.params.arguments);

        const { cfg: baseCfg } = this.resolveDatabaseConnection(
          type,
          databaseAlias,
          connection
        );
        const cfg = this.applyConnectionOverrides(baseCfg, type, connection);

        return await this.executeDatabaseQuery(type, cfg, query);
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
    console.error("[DB MCP] Multi-Database Server started");
  }
}
