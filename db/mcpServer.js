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
              connection: { type: 'object', description: 'Connection (optional)' }
            },
            required: ['type', 'query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      if (req.params.name !== 'db_query') throw new Error('Tool không tồn tại');
      const { type, query, connection } = req.params.arguments;
      if (!type || !query) throw new Error('type & query bắt buộc');

      // Build config
      let cfg;
      if (connection?.connectionString) {
        cfg = this.parseConnectionString(connection.connectionString, type);
      } else {
        const envPrefix = type.toUpperCase();
        cfg = {
          host: connection?.host || process.env[`${envPrefix}_HOST`] || 'localhost',
          port: connection?.port || parseInt(process.env[`${envPrefix}_PORT`]) || this.getDefaultPort(type),
          user: connection?.user || process.env[`${envPrefix}_USER`] || 'root',
          password: connection?.password || process.env[`${envPrefix}_PASSWORD`] || '',
          database: connection?.database || process.env[`${envPrefix}_DATABASE`]
        };
        if (type === 'sqlserver') {
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