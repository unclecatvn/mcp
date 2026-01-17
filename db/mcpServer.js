/**
 * MCP Database Server - Main Entry Point
 * Multi-database MCP server with intelligent query analysis
 * @module mcpServer
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import driverMap from "./drivers/index.js";
import { RETRY_CONFIG, MAX_HISTORY_SIZE } from "./lib/constants.js";
import * as connectionManager from "./lib/connectionManager.js";
import * as toolHandlers from "./lib/toolHandlers.js";
import * as resourceHandlers from "./lib/resourceHandlers.js";

/**
 * Database Connection Wrapper
 * Wraps database driver with consistent interface
 * @class
 */
class DatabaseConnection {
  /**
   * Create a new database connection
   * @param {string} type - Database type
   * @param {Object} config - Connection configuration
   */
  constructor(type, config) {
    const DriverClass = driverMap[type];
    if (!DriverClass)
      throw new Error(`Unsupported database type: ${type}`);
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

/**
 * Multi-Database MCP Server
 * Main server class implementing MCP protocol
 * @class
 */
export default class MultiDatabaseMCPServer {
  /**
   * Create a new MCP server instance
   */
  constructor() {
    this.server = new Server(
      { name: "@mcp/database", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {} } }
    );
    this.connections = new Map();
    this.queryHistory = [];
    this.maxHistorySize = MAX_HISTORY_SIZE;
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.server.onerror = (e) => console.error("[MCP Error]", e);
    process.on("SIGINT", async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Add query to history for review context
   * @param {Object} metadata - Query metadata
   */
  addToQueryHistory(metadata) {
    this.queryHistory.push({
      ...metadata,
      timestamp: new Date().toISOString(),
    });
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }
  }

  /**
   * Get or create database connection
   * @param {string} type - Database type
   * @param {Object} cfg - Connection config
   * @returns {DatabaseConnection} Database connection
   */
  async getConnection(type, cfg) {
    const key = connectionManager.getConnectionKey(type, cfg);

    if (!this.connections.has(key)) {
      const conn = new DatabaseConnection(type, cfg);
      this.connections.set(key, conn);
    }

    return this.connections.get(key);
  }

  /**
   * Remove stale connection from cache
   * @param {string} type - Database type
   * @param {Object} cfg - Connection config
   */
  removeConnection(type, cfg) {
    const key = connectionManager.getConnectionKey(type, cfg);
    if (this.connections.has(key)) {
      const conn = this.connections.get(key);
      conn.close().catch(() => {});
      this.connections.delete(key);
    }
  }

  /**
   * Execute operation with retry logic
   * @param {Function} operation - Async operation
   * @param {string} type - Database type
   * @param {Object} cfg - Connection config
   * @returns {Promise<*>} Operation result
   */
  async executeWithRetry(operation, type, cfg) {
    return connectionManager.executeWithRetry(
      operation,
      type,
      cfg,
      this.removeConnection.bind(this),
      RETRY_CONFIG
    );
  }

  /**
   * Setup MCP tool handlers
   */
  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolHandlers.createToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const { name, arguments: args } = req.params;

        if (name === "db_query") {
          const { type, query, databaseAlias, connection } =
            toolHandlers.validateQueryRequest(args);
          const { cfg: baseCfg } = connectionManager.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = connectionManager.applyConnectionOverrides(baseCfg, type, connection);
          return await toolHandlers.executeDatabaseQuery(
            type,
            cfg,
            query,
            this.getConnection.bind(this),
            this.executeWithRetry.bind(this),
            this.addToQueryHistory.bind(this)
          );
        }

        if (name === "db_list_tables") {
          const { type, databaseAlias, connection } =
            toolHandlers.validateCommonRequest(args);
          const { cfg: baseCfg } = connectionManager.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = connectionManager.applyConnectionOverrides(baseCfg, type, connection);
          return await toolHandlers.listTables(
            type,
            cfg,
            this.getConnection.bind(this),
            this.executeWithRetry.bind(this)
          );
        }

        if (name === "db_describe_table") {
          const { type, tableName, databaseAlias, connection } =
            toolHandlers.validateCommonRequest(args);
          const { cfg: baseCfg } = connectionManager.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = connectionManager.applyConnectionOverrides(baseCfg, type, connection);
          return await toolHandlers.describeTable(
            type,
            tableName,
            cfg,
            this.getConnection.bind(this),
            this.executeWithRetry.bind(this)
          );
        }

        if (name === "db_explain_query") {
          const { type, query, databaseAlias, connection } =
            toolHandlers.validateQueryRequest(args);
          const { cfg: baseCfg } = connectionManager.resolveDatabaseConnection(
            type,
            databaseAlias,
            connection
          );
          const cfg = connectionManager.applyConnectionOverrides(baseCfg, type, connection);
          return await toolHandlers.explainQuery(
            type,
            cfg,
            query,
            this.getConnection.bind(this),
            this.executeWithRetry.bind(this)
          );
        }

        if (name === "db_analyze_query") {
          return toolHandlers.analyzeQuery(args.type, args.query);
        }

        if (name === "db_query_history") {
          return toolHandlers.getQueryHistory(this.queryHistory, args.limit);
        }

        throw new Error(`Tool not found: ${name}`);
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ ${err.message}` }],
          isError: true,
        };
      }
    });
  }

  /**
   * Setup MCP resource handlers
   */
  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: resourceHandlers.getResourceDefinitions(),
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
      return resourceHandlers.readResource(req.params.uri);
    });
  }

  /**
   * Cleanup connections on shutdown
   */
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

  /**
   * Start the MCP server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      "[DB MCP] Multi-Database Server started (with connection pooling)"
    );
  }
}
