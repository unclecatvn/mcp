#!/usr/bin/env node

/**
 * MCP Database Server – bootstrap
 * Khởi động MultiDatabaseMCPServer ngắn gọn nhất.
 */
import MultiDatabaseMCPServer from './mcpServer.js';

const server = new MultiDatabaseMCPServer();
server.run().catch(console.error); 