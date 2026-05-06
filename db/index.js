#!/usr/bin/env node
import { MultiDatabaseMCPServer } from "./mcpServer.js";

const server = new MultiDatabaseMCPServer();
server.run().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] [error] event=startup_failed message=${err.message}`,
  );
  process.exit(1);
});
