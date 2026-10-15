import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";

import { parseEnv } from "./lib/config.js";
import { OdooClient } from "./lib/client.js";
import { registerTools } from "./lib/toolHandlers.js";
import { INSTRUCTIONS } from "./lib/instructions.js";

const require = createRequire(import.meta.url);
const { name: SERVER_NAME, version: SERVER_VERSION } = require("./package.json");
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export class OdooMCPServer {
  constructor({ env = process.env } = {}) {
    const min = LOG_LEVELS[(env.MCP_ODOO_LOG_LEVEL ?? "info").toLowerCase()] ?? LOG_LEVELS.info;
    // stderr only: stdout is the MCP protocol stream.
    this.log = (level, fields) => {
      if (LOG_LEVELS[level] < min) return;
      const flat = Object.entries(fields)
        .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)
        .join(" ");
      console.error(`[${new Date().toISOString()}] [${level}] ${flat}`);
    };

    const { connections, errors } = parseEnv(env);
    for (const e of errors) {
      this.log(e.severity, { event: "config_issue", connection: e.name, message: e.message });
    }

    const clients = new Map(Object.values(connections).map((c) => [c.name, new OdooClient(c)]));
    if (clients.size === 0) {
      this.log("warn", {
        event: "no_connections",
        hint: "Set ODOO_<NAME>_URL, ODOO_<NAME>_DB, ODOO_<NAME>_USERNAME, and one of ODOO_<NAME>_API_KEY / ODOO_<NAME>_PASSWORD.",
      });
    } else {
      this.log("info", {
        event: "loaded_connections",
        connections: [...clients.keys()].join(", "),
      });
    }

    this.server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { instructions: INSTRUCTIONS },
    );
    registerTools(this.server, clients);
  }

  async run() {
    await this.server.connect(new StdioServerTransport());
    this.log("info", { event: "ready" });
  }
}
