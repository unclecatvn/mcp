import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import driverMap from './drivers/index.js';

class DatabaseConnection {
  constructor(type, config) {
    const DriverClass = driverMap[type];
    if (!DriverClass) throw new Error(`Database type không được hỗ trợ: ${type}`);
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

export default class MultiDatabaseMCPServer {
  constructor() {
    this.server = new Server(
      { name: '@mcp/database', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.connections = new Map();
    this.setupToolHandlers();
    this.server.onerror = (e) => console.error('[MCP Error]', e);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  getConnectionKey(type, cfg) {
    return `${type}_${cfg.host || cfg.server}_${cfg.port}_${cfg.database || cfg.user}`;
  }
  async getConnection(type, cfg) {
    const key = this.getConnectionKey(type, cfg);
    if (!this.connections.has(key)) {
      this.connections.set(key, new DatabaseConnection(type, cfg));
    }
    return this.connections.get(key);
  }

  parseConnectionString(str, type) {
    const url = new URL(str);
    const cfg = {
      host: url.hostname,
      port: parseInt(url.port) || this.getDefaultPort(type),
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1)
    };
    if (type === 'sqlserver') {
      cfg.server = cfg.host;
      delete cfg.host;
      cfg.options = { encrypt: true, trustServerCertificate: true };
    }
    return cfg;
  }
  getDefaultPort(type) {
    switch (type) {
      case 'mysql':
      case 'mariadb':
        return 3306;
      case 'postgresql':
        return 5432;
      case 'sqlserver':
        return 1433;
      default:
        return 3306;
    }
  }

  // Parse multiple database connections from environment variables
  parseMultipleConnections(type) {
    const envPrefix = type.toUpperCase();
    const connections = {};

    // Method 1: Parse from CONNECTIONS env var (format: alias1=url1;alias2=url2)
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
            console.warn(
              `[DB MCP] Invalid connection string for ${alias}: ${e.message}`
            );
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

      const cfg = {
        host,
        port: parseInt(port) || this.getDefaultPort(type),
        user: user || "root",
        password: password || "",
        database,
      };

      if (type === "sqlserver") {
        cfg.server = cfg.host;
        delete cfg.host;
        cfg.options = { encrypt: true, trustServerCertificate: true };
      }

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
        const cfg = {
          host: host || "localhost",
          port: parseInt(port) || this.getDefaultPort(type),
          user: user || "root",
          password: password || "",
          database,
        };

        if (type === "sqlserver") {
          cfg.server = cfg.host;
          delete cfg.host;
          cfg.options = { encrypt: true, trustServerCertificate: true };
        }

        connections["default"] = cfg;
      }
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
      'INSERT', 'UPDATE', 'DELETE', 'MERGE',
      'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
      'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK'
    ];
    
    return dmlDdlKeywords.some(keyword => 
      normalizedQuery.startsWith(keyword + ' ') || 
      normalizedQuery.startsWith(keyword + '\n') ||
      normalizedQuery.startsWith(keyword + '\t')
    );
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'db_query',
          description: `Thực thi SQL query trên database.

🎯 HỖ TRỢ: MySQL, PostgreSQL, SQL Server
🔥 ĐÃ SETUP SẴN: env vars có sẵn

📋 CÁCH SỬ DỤNG:
• Không chỉ định databaseAlias: sử dụng database mặc định
• Chỉ định databaseAlias: chọn database cụ thể từ env vars

⚠️  CẢNH BÁO: AI KHÔNG ĐƯỢC tự ý thực hiện DML/DDL (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.) - cần xin phép người dùng trước!`,
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['mysql', 'mariadb', 'postgresql', 'sqlserver'],
                description: 'Database type (BẮT BUỘC)'
              },
              query: {
                type: 'string',
                description: 'SQL query'
              },
              databaseAlias: {
                type: 'string',
                description:
                  'Alias của database (optional). Để trống sẽ dùng database mặc định. Các alias có sẵn sẽ được liệt kê nếu không tìm thấy database.'
              },
              connection: {
                type: 'object',
                description:
                  'Connection config override (optional - sẽ override env vars)'
              },
            },
            required: ['type', 'query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      if (req.params.name !== 'db_query') throw new Error('Tool không tồn tại');
      const { type, query, databaseAlias, connection } = req.params.arguments;
      if (!type || !query) throw new Error('type & query bắt buộc');

      // Parse available connections
      const availableConnections = this.parseMultipleConnections(type);
      const availableAliases = Object.keys(availableConnections);

      // Determine which database to use
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
          return { content: [{ type: "text", text: errorMsg }], isError: true };
        }

        // Use default (first available)
        usedAlias = availableAliases[0];
        cfg = availableConnections[usedAlias];
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Không tìm thấy cấu hình database cho ${type.toUpperCase()}.

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
   ${type.toUpperCase()}_DATABASE=db`,
            },
          ],
          isError: true,
        };
      }

      // Apply connection overrides if provided
      if (connection && !connection.connectionString) {
        cfg = {
          ...cfg,
          host: connection.host || cfg.host,
          port: connection.port || cfg.port,
          user: connection.user || cfg.user,
          password: connection.password || cfg.password,
          database: connection.database || cfg.database,
        };
        if (type === "sqlserver" && cfg.host) {
          cfg.server = cfg.host;
          delete cfg.host;
          cfg.options = { encrypt: true, trustServerCertificate: true };
        }
      }

      const safeLog = query.replace(/password\s*=\s*['"][^'"]*['"]/gi, "password='***'");
      console.log(`[DB MCP] Executing ${type}: ${safeLog.slice(0, 200)}${safeLog.length > 200 ? '...' : ''}`);

      // Check for DML/DDL operations and warn
//       if (this.isDMLDDLQuery(query)) {
//         const warningMsg = `⚠️  DML/DDL DETECTED: ${query.trim().split('\n')[0]}

// ❌ AI không được tự ý thực hiện thao tác này
// ✅ Cần xin phép người dùng trước khi tiếp tục`;
        
//         return { 
//           content: [{ type: 'text', text: warningMsg }], 
//           isError: true 
//         };
//       }

      try {
        const db = await this.getConnection(type, cfg);
        const res = await db.query(query);
        if (Array.isArray(res.results) && res.results.length === 0) {
          return { content: [{ type: 'text', text: 'Query không trả về record nào' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(res.results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `❌ ${err.message}` }], isError: true };
      }
    });
  }

  async cleanup() {
    await Promise.all([...this.connections.values()].map((c) => c.close()));
  }
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[DB MCP] Multi-Database Server started');
  }
} 