#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import mysql from 'mysql2/promise';
import pg from 'pg';
import sql from 'mssql';

/**
 * MCP Server cho Multi-Database
 * 
 * Hỗ trợ:
 * - MySQL/MariaDB
 * - PostgreSQL  
 * - SQL Server
 * 
 * Tool: db_query
 * - Thực thi SQL queries trên các loại database khác nhau
 * - Hỗ trợ SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, etc.
 * 
 * 🔥 ĐÃ CẤU HÌNH SẴN & SẴN SÀNG SỬ DỤNG:
 * ✅ Environment variables đã được set trong MCP config
 * ✅ MySQL & SQL Server credentials đã có sẵn
 * ✅ Có thể query ngay lập tức mà KHÔNG cần connection params
 * ⚠️ Chỉ database name chưa set - có thể dùng USE hoặc specify trong query
 * 
 * 🚨 YÊU CẦU BẮT BUỘC CHO LLMs:
 * ❗ Nếu user chưa cung cấp db_type → YÊU CẦU cung cấp chính xác (mysql/sqlserver)
 * ❗ Nếu cần db_name cụ thể → YÊU CẦU user cung cấp chính xác
 * ❗ KHÔNG đoán bừa type hoặc database name!
 * 
 * VÍ DỤ SỬ DỤNG ĐỠN GIẢN:
 * {
 *   "type": "mysql", 
 *   "query": "SHOW DATABASES;"
 * }
 * 
 * LƯU Ý QUAN TRỌNG:
 * - LUÔN LUÔN specify database type trong mỗi query
 * - Mỗi database type có syntax khác nhau
 * - USE statement chỉ áp dụng cho MySQL/MariaDB
 */

class DatabaseConnection {
  constructor(type, config) {
    this.type = type;
    this.config = config;
    this.connection = null;
    this.currentDatabase = null;
  }

  async connect() {
    if (this.connection) return this.connection;

    try {
      switch (this.type) {
        case 'mysql':
        case 'mariadb':
          this.connection = await mysql.createConnection({
            ...this.config,
            multipleStatements: false,
            timezone: 'Z'
          });
          break;

        case 'postgresql':
          const { Client } = pg;
          this.connection = new Client(this.config);
          await this.connection.connect();
          break;

        case 'sqlserver':
          this.connection = await sql.connect(this.config);
          break;

        default:
          throw new Error(`Database type không được hỗ trợ: ${this.type}`);
      }

      console.log(`[DB MCP] Đã kết nối ${this.type}: ${this.config.host || this.config.server}:${this.config.port}`);
      return this.connection;
    } catch (error) {
      console.error(`[DB MCP] Lỗi kết nối ${this.type}:`, error.message);
      throw error;
    }
  }

  async query(queryText) {
    const connection = await this.connect();

    switch (this.type) {
      case 'mysql':
      case 'mariadb':
        const [results, fields] = await connection.execute(queryText);
        return { results, fields, type: 'mysql' };

      case 'postgresql':
        const pgResult = await connection.query(queryText);
        return { 
          results: pgResult.rows, 
          fields: pgResult.fields,
          rowCount: pgResult.rowCount,
          type: 'postgresql' 
        };

      case 'sqlserver':
        const sqlResult = await connection.request().query(queryText);
        return { 
          results: sqlResult.recordset || [], 
          fields: sqlResult.recordset ? sqlResult.recordset.columns : {},
          rowsAffected: sqlResult.rowsAffected,
          type: 'sqlserver' 
        };

      default:
        throw new Error(`Database type không được hỗ trợ: ${this.type}`);
    }
  }

  async close() {
    if (!this.connection) return;

    try {
      switch (this.type) {
        case 'mysql':
        case 'mariadb':
          await this.connection.end();
          break;

        case 'postgresql':
          await this.connection.end();
          break;

        case 'sqlserver':
          await this.connection.close();
          break;
      }
      this.connection = null;
      console.log(`[DB MCP] Đã đóng kết nối ${this.type}`);
    } catch (error) {
      console.error(`[DB MCP] Lỗi đóng kết nối ${this.type}:`, error);
    }
  }
}

class MultiDatabaseMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: '@mcp/database',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.connections = new Map();
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  getConnectionKey(type, config) {
    return `${type}_${config.host || config.server}_${config.port}_${config.database || config.user}`;
  }

  async getConnection(type, config) {
    const key = this.getConnectionKey(type, config);
    
    if (!this.connections.has(key)) {
      const dbConnection = new DatabaseConnection(type, config);
      this.connections.set(key, dbConnection);
    }
    
    return this.connections.get(key);
  }

  parseConnectionString(connectionString, type) {
    try {
      const url = new URL(connectionString);
      const config = {
        host: url.hostname,
        port: parseInt(url.port) || this.getDefaultPort(type),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1) // Remove leading slash
      };

      // SQL Server specific adjustments
      if (type === 'sqlserver') {
        config.server = config.host;
        delete config.host;
        config.options = {
          encrypt: true,
          trustServerCertificate: true
        };
      }

      return config;
    } catch (error) {
      throw new Error(`Connection string không hợp lệ: ${error.message}`);
    }
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

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'db_query',
          description: `Thực thi SQL query trên nhiều loại database.

🎯 HỖ TRỢ DATABASE:
- MySQL/MariaDB (mysql, mariadb)
- PostgreSQL (postgresql)  
- SQL Server (sqlserver)

🔥 ĐÃ CẤU HÌNH SẴN - SẴN SÀNG SỬ DỤNG:
✅ Environment variables đã được cấu hình trong MCP config
✅ MySQL: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD (127.0.0.1:3306)
✅ SQL Server: SQLSERVER_HOST, SQLSERVER_USER, SQLSERVER_PASSWORD (127.0.0.1:1433)
✅ Có thể query ngay lập tức mà KHÔNG cần truyền connection parameters!
⚠️ Chỉ database name chưa set default - có thể dùng USE statement hoặc specify trong query

🚨 YÊU CẦU BẮT BUỘC CHO LLMs:
❗ Nếu user chưa cung cấp db_type (mysql/sqlserver) → YÊU CẦU cung cấp chính xác
❗ Nếu cần database name cụ thể → YÊU CẦU user cung cấp db_name chính xác
❗ KHÔNG đoán bừa type hoặc database name!

⚙️ CẤU HÌNH KẾT NỐI (3 cách):
1. Connection String: protocol://user:pass@host:port/database
2. Environment Variables theo pattern: {TYPE}_HOST, {TYPE}_USER, etc. (ĐÃ CẤU HÌNH)
3. Individual parameters

📝 VÍ DỤ SỬ DỤNG:
💡 ĐƠN GIẢN (dùng env vars có sẵn):
{
  "type": "mysql",
  "query": "SHOW DATABASES;"
}

📝 VÍ DỤ CONNECTION STRING:
- MySQL: mysql://user:pass@localhost:3306/mydatabase
- PostgreSQL: postgresql://user:pass@localhost:5432/mydatabase  
- SQL Server: sqlserver://user:pass@localhost:1433/mydatabase

🔧 CÁC LOẠI QUERY HỖ TRỢ:
- DDL: CREATE, DROP, ALTER
- DML: SELECT, INSERT, UPDATE, DELETE  
- DCL: GRANT, REVOKE
- Utility: SHOW, DESCRIBE, etc.

⚠️ LƯU Ý SYNTAX:
- MySQL: SHOW TABLES, USE database
- PostgreSQL: \\dt, \\d table_name, SELECT * FROM pg_tables
- SQL Server: SELECT * FROM sys.tables, USE [database]

📊 KẾT QUẢ TRẢ VỀ:
- SELECT: Trả về rows data
- INSERT/UPDATE/DELETE: Trả về affected rows count
- DDL: Trả về success message`,
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['mysql', 'mariadb', 'postgresql', 'sqlserver'],
                description: 'Loại database: mysql, mariadb, postgresql, sqlserver (BẮT BUỘC - yêu cầu user cung cấp nếu chưa có!)'
              },
              query: {
                type: 'string',
                description: 'SQL query để thực thi'
              },
              connection: {
                type: 'object',
                properties: {
                  connectionString: {
                    type: 'string',
                    description: 'Connection string đầy đủ (ưu tiên)'
                  },
                  host: {
                    type: 'string',
                    description: 'Database host/server'
                  },
                  port: {
                    type: 'integer',
                    description: 'Database port'
                  },
                  user: {
                    type: 'string',
                    description: 'Database username'
                  },
                  password: {
                    type: 'string',
                    description: 'Database password'
                  },
                  database: {
                    type: 'string',
                    description: 'Database name'
                  }
                },
                description: 'Thông tin kết nối database (OPTIONAL - đã có env vars sẵn!)'
              }
            },
            required: ['type', 'query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'db_query') {
        throw new Error(`Tool không tồn tại: ${request.params.name}`);
      }

      const { type, query, connection } = request.params.arguments;
      
      if (!type || !query) {
        throw new Error('Tham số "type" và "query" là bắt buộc');
      }

      if (!['mysql', 'mariadb', 'postgresql', 'sqlserver'].includes(type)) {
        throw new Error(`Database type không được hỗ trợ: ${type}. Hỗ trợ: mysql, mariadb, postgresql, sqlserver`);
      }

      try {
        // Xây dựng config kết nối
        let config;
        
        if (connection?.connectionString) {
          config = this.parseConnectionString(connection.connectionString, type);
        } else if (connection) {
          config = {
            host: connection.host || process.env[`${type.toUpperCase()}_HOST`] || 'localhost',
            port: connection.port || parseInt(process.env[`${type.toUpperCase()}_PORT`]) || this.getDefaultPort(type),
            user: connection.user || process.env[`${type.toUpperCase()}_USER`] || 'root',
            password: connection.password || process.env[`${type.toUpperCase()}_PASSWORD`] || '',
            database: connection.database || process.env[`${type.toUpperCase()}_DATABASE`]
          };

          // SQL Server specific adjustments
          if (type === 'sqlserver') {
            config.server = config.host;
            delete config.host;
            config.options = {
              encrypt: true,
              trustServerCertificate: true
            };
          }
        } else {
          // Fallback to environment variables
          config = {
            host: process.env[`${type.toUpperCase()}_HOST`] || 'localhost',
            port: parseInt(process.env[`${type.toUpperCase()}_PORT`]) || this.getDefaultPort(type),
            user: process.env[`${type.toUpperCase()}_USER`] || 'root',
            password: process.env[`${type.toUpperCase()}_PASSWORD`] || '',
            database: process.env[`${type.toUpperCase()}_DATABASE`]
          };

          if (type === 'sqlserver') {
            config.server = config.host;
            delete config.host;
            config.options = {
              encrypt: true,
              trustServerCertificate: true
            };
          }
        }

        // Log query (che password nếu có)
        const logQuery = query.replace(/password\s*=\s*['"][^'"]*['"]/gi, "password='***'");
        console.log(`[DB MCP] Executing ${type}: ${logQuery.substring(0, 200)}${logQuery.length > 200 ? '...' : ''}`);
        
        const dbConnection = await this.getConnection(type, config);
        const queryResult = await dbConnection.query(query);
        
        // Kiểm tra xem có phải USE statement không (chỉ MySQL/MariaDB)
        const isUseStatement = /^\s*USE\s+/i.test(query.trim());
        if (isUseStatement && (type === 'mysql' || type === 'mariadb')) {
          const dbMatch = query.trim().match(/^\s*USE\s+([^;\s]+)/i);
          if (dbMatch) {
            dbConnection.currentDatabase = dbMatch[1];
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Đã chọn database: ${dbConnection.currentDatabase}

🎯 Database type: ${type}
📝 Database hiện tại: ${dbConnection.currentDatabase}
🔗 Host: ${config.host || config.server}:${config.port}`
              }
            ]
          };
        }
        
        // Xử lý kết quả dựa trên loại database và query
        const { results, fields, rowCount, rowsAffected } = queryResult;
        
        if (Array.isArray(results)) {
          if (results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Query thực thi thành công!
📊 Không có dữ liệu trả về (0 rows)
🎯 Database type: ${type}
🔗 Host: ${config.host || config.server}:${config.port}`
                }
              ]
            };
          }
          
          // Format results cho SELECT queries
          const output = {
            type: 'select',
            databaseType: type,
            host: config.host || config.server,
            port: config.port,
            database: config.database || dbConnection.currentDatabase,
            rowCount: results.length,
            data: results.slice(0, 100), // Giới hạn 100 rows để tránh quá tải
            fields: this.formatFields(fields, type)
          };
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Query thành công!
📊 Trả về ${results.length} rows ${results.length > 100 ? '(hiển thị 100 đầu tiên)' : ''}
🎯 Database type: ${type}
🔗 Host: ${config.host || config.server}:${config.port}

${JSON.stringify(output, null, 2)}`
              }
            ]
          };
        } else {
          // Kết quả cho INSERT, UPDATE, DELETE, DDL
          const output = {
            type: 'modification',
            databaseType: type,
            host: config.host || config.server,
            port: config.port,
            database: config.database || dbConnection.currentDatabase,
            affectedRows: this.getAffectedRows(queryResult, type),
            insertId: results?.insertId || null,
            message: 'Query executed successfully'
          };
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Query thực thi thành công!
🎯 Database type: ${type}
🔗 Host: ${config.host || config.server}:${config.port}
📝 ${JSON.stringify(output, null, 2)}`
              }
            ]
          };
        }
        
      } catch (error) {
        console.error(`[DB MCP] Query error (${type}):`, error);
        
        // Xử lý các lỗi phổ biến theo từng database type
        let errorMessage = this.formatError(error, type, query);
        
        return {
          content: [
            {
              type: 'text',
              text: errorMessage
            }
          ],
          isError: true
        };
      }
    });
  }

  formatFields(fields, type) {
    if (!fields) return [];

    switch (type) {
      case 'mysql':
      case 'mariadb':
        return fields.map(f => ({
          name: f.name,
          type: f.type,
          table: f.table
        }));

      case 'postgresql':
        return fields.map(f => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
          dataTypeModifier: f.dataTypeModifier
        }));

      case 'sqlserver':
        return Object.keys(fields).map(name => ({
          name,
          type: fields[name].type
        }));

      default:
        return [];
    }
  }

  getAffectedRows(queryResult, type) {
    switch (type) {
      case 'mysql':
      case 'mariadb':
        return queryResult.results?.affectedRows || 0;

      case 'postgresql':
        return queryResult.rowCount || 0;

      case 'sqlserver':
        return queryResult.rowsAffected?.[0] || 0;

      default:
        return 0;
    }
  }

  formatError(error, type, query) {
    let errorMessage = error.message;

    // Common errors by database type
    switch (type) {
      case 'mysql':
      case 'mariadb':
        if (error.code === 'ER_NO_DB_ERROR') {
          errorMessage = `❌ Lỗi MySQL: Chưa chọn database!

🔧 GIẢI PHÁP: 
1️⃣ Sử dụng USE: "USE database_name;"
2️⃣ Hoặc specify database trong connection

Original error: ${error.message}`;
        } else if (error.code === 'ER_BAD_DB_ERROR') {
          errorMessage = `❌ Lỗi MySQL: Database không tồn tại!

🔧 GIẢI PHÁP: 
1️⃣ Kiểm tra: "SHOW DATABASES;"
2️⃣ Tạo mới: "CREATE DATABASE database_name;"

Original error: ${error.message}`;
        }
        break;

      case 'postgresql':
        if (error.code === '3D000') {
          errorMessage = `❌ Lỗi PostgreSQL: Database không tồn tại!

🔧 GIẢI PHÁP:
1️⃣ Kiểm tra: "SELECT datname FROM pg_database;"
2️⃣ Tạo mới: "CREATE DATABASE database_name;"

Original error: ${error.message}`;
        } else if (error.code === '42P01') {
          errorMessage = `❌ Lỗi PostgreSQL: Table không tồn tại!

🔧 GIẢI PHÁP:
1️⃣ Kiểm tra tables: "SELECT * FROM information_schema.tables;"
2️⃣ Hoặc: "\\dt" trong psql

Original error: ${error.message}`;
        }
        break;

      case 'sqlserver':
        if (error.message.includes('Invalid object name')) {
          errorMessage = `❌ Lỗi SQL Server: Object không tồn tại!

🔧 GIẢI PHÁP:
1️⃣ Kiểm tra tables: "SELECT * FROM sys.tables;"
2️⃣ Kiểm tra database: "SELECT name FROM sys.databases;"

Original error: ${error.message}`;
        }
        break;
    }

    return `❌ Lỗi ${type}: ${errorMessage}

🎯 Database type: ${type}
📝 Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`;
  }

  async cleanup() {
    console.log('[DB MCP] Đang đóng tất cả kết nối...');
    const closePromises = Array.from(this.connections.values()).map(conn => conn.close());
    await Promise.all(closePromises);
    this.connections.clear();
    console.log('[DB MCP] Đã đóng tất cả kết nối database');
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[DB MCP] Multi-Database Server started on stdio');
  }
}

const server = new MultiDatabaseMCPServer();
server.run().catch(console.error); 