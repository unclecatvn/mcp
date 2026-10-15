#!/usr/bin/env node
import { ObsidianMCPServer } from "./mcpServer.js";

const server = new ObsidianMCPServer();
server.run().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] [error] event=startup_failed message=${err.message}`,
  );
  process.exit(1);
});
