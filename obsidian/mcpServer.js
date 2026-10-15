import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";

import { parseEnv } from "./lib/config.js";
import { registerTools } from "./lib/toolHandlers.js";

const require = createRequire(import.meta.url);
const { name: SERVER_NAME, version: SERVER_VERSION } = require("./package.json");

const INSTRUCTIONS = `You are connected to one or more Obsidian vaults through their folders on disk. Obsidian does not need to be running; it reloads changed files on its own.

- Paths are vault-relative with forward slashes ("Projects/Plan.md"). ".md" is appended if missing.
- Find a note by title with search_notes (pathMatch=true), then read_note.
- Notes link with [[Note name]] (no folder, no .md); read_note returns them as "links".
- Before overwriting a note, read it and keep everything you are not meant to change. Prefer mode "append" for adding to logs or daily notes.
- delete_note moves the note to .trash/; tell the user it can be restored from there.`;

function log(level, fields) {
  const flat = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join(" ");
  console.error(`[${new Date().toISOString()}] [${level}] ${flat}`);
}

export class ObsidianMCPServer {
  constructor({ env = process.env } = {}) {
    const { vaults, errors } = parseEnv(env);
    for (const e of errors)
      log(e.severity, { event: "config_issue", vault: e.name, message: e.message });

    const list = Object.values(vaults);
    if (list.length === 0) {
      log("warn", { event: "no_vaults", hint: "Set OBSIDIAN_<NAME>_PATH=/absolute/path/to/vault" });
    } else {
      log("info", {
        event: "loaded_vaults",
        vaults: list.map((v) => `${v.name}(${v.mode})`).join(", "),
      });
    }

    this.server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { instructions: INSTRUCTIONS },
    );
    registerTools(this.server, vaults);
  }

  async run() {
    await this.server.connect(new StdioServerTransport());
    log("info", { event: "ready" });
  }
}
