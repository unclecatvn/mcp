import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { parseEnv } from "./lib/config.js";
import { ClientRegistry } from "./lib/clientRegistry.js";
import { ToolHandlers } from "./lib/toolHandlers.js";
import { INSTRUCTIONS } from "./lib/instructions.js";

const require = createRequire(import.meta.url);
const { name: SERVER_NAME, version: SERVER_VERSION } = require("./package.json");
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function makeLogger() {
  const levelName = (process.env.MCP_ODOO_LOG_LEVEL ?? "info").toLowerCase();
  const min = LOG_LEVELS[levelName] ?? LOG_LEVELS.info;
  function log(level, fields) {
    if (LOG_LEVELS[level] < min) return;
    const ts = new Date().toISOString();
    const flat = Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)
      .join(" ");
    console.error(`[${ts}] [${level}] ${flat}`);
  }
  return {
    debug: (fields) => log("debug", fields),
    info: (fields) => log("info", fields),
    warn: (fields) => log("warn", fields),
    error: (fields) => log("error", fields),
  };
}

export class OdooMCPServer {
  constructor({ env = process.env } = {}) {
    this.logger = makeLogger();

    const { connections, errors } = parseEnv(env);
    for (const e of errors) {
      const level = e.severity === "warn" ? "warn" : "error";
      this.logger[level]({ event: "config_issue", connection: e.name, message: e.message });
    }

    const names = Object.keys(connections);
    if (names.length === 0) {
      this.logger.warn({
        event: "no_connections",
        hint: "Set ODOO_<NAME>_URL, ODOO_<NAME>_DB, ODOO_<NAME>_USERNAME, and one of ODOO_<NAME>_API_KEY / ODOO_<NAME>_PASSWORD.",
      });
    } else {
      this.logger.info({
        event: "loaded_connections",
        count: names.length,
        connections: names.join(", "),
      });
    }

    this.registry = new ClientRegistry(connections);
    this.tools = new ToolHandlers(this.registry);

    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        capabilities: { tools: {} },
        instructions: INSTRUCTIONS,
      },
    );

    this._registerHandlers();
    this._installShutdownHandlers();
  }

  _registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.toolDescriptors(),
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      this.tools.dispatch(req.params.name, req.params.arguments ?? {}),
    );
  }

  _installShutdownHandlers() {
    const shutdown = (sig) => {
      this.logger.info({ event: "shutdown", signal: sig });
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info({ event: "ready" });
  }
}
