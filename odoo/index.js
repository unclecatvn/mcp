#!/usr/bin/env node
import { OdooMCPServer } from "./mcpServer.js";

const server = new OdooMCPServer();
server.run().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] [error] event=startup_failed message=${err.message}`,
  );
  process.exit(1);
});
