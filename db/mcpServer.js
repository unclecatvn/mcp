import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./lib/loader.js";
import { ConnectionRegistry } from "./lib/connectionManager.js";
import { ToolHandlers } from "./lib/toolHandlers.js";
import { ResourceHandlers } from "./lib/resourceHandlers.js";

const require = createRequire(import.meta.url);
const { name: SERVER_NAME, version: SERVER_VERSION } = require("./package.json");
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function makeLogger() {
  const levelName = (process.env.MCP_DB_LOG_LEVEL ?? "info").toLowerCase();
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

export class MultiDatabaseMCPServer {
  constructor() {
    this.logger = makeLogger();
    const { aliases, errors, defaultAlias, logLevel, source } = loadConfig(process.env);

    // logLevel from config file takes precedence over env var when set.
    if (logLevel && !process.env.MCP_DB_LOG_LEVEL) {
      process.env.MCP_DB_LOG_LEVEL = logLevel;
      this.logger = makeLogger();
    }

    for (const e of errors) {
      this.logger.error({ event: "config_error", alias: e.alias, message: e.message });
    }
    if (Object.keys(aliases).length === 0) {
      this.logger.error({
        event: "no_valid_aliases",
        source,
        hint:
          source === "config_file"
            ? "Add at least one entry under `aliases` in your MCP_DB_CONFIG file"
            : "Set DB_<ALIAS>_TYPE and DB_<ALIAS>_HOST (or _URL)",
      });
      process.exit(1);
    }

    const summary = Object.values(aliases)
      .map((c) => `${c.alias}(${c.type},${c.mode})`)
      .join(", ");
    this.logger.info({
      event: "loaded_aliases",
      source,
      count: Object.keys(aliases).length,
      aliases: summary,
      ...(defaultAlias ? { defaultAlias } : {}),
    });

    this.registry = new ConnectionRegistry(aliases);
    this.tools = new ToolHandlers(this.registry, { defaultAlias });
    this.resources = new ResourceHandlers(this.registry);

    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {}, resources: {} } },
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
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.resources.list(),
    }));
    this.server.setRequestHandler(ReadResourceRequestSchema, async (req) =>
      this.resources.read(req.params.uri),
    );
  }

  _installShutdownHandlers() {
    const shutdown = async (sig) => {
      this.logger.info({ event: "shutdown", signal: sig });
      const t = setTimeout(() => process.exit(1), 5000);
      try {
        await this.registry.closeAll();
      } catch (err) {
        this.logger.error({ event: "shutdown_error", message: err.message });
      } finally {
        clearTimeout(t);
        process.exit(0);
      }
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
