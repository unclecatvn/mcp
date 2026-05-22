import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadConfig } from "../../lib/loader.js";

describe("loadConfig", () => {
  let tmp;
  let savedEnv;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "mcp-db-loader-"));
    savedEnv = { ...process.env };
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("DB_") || k === "MCP_DB_CONFIG" || k === "MCP_DB_LOG_LEVEL") {
        delete process.env[k];
      }
    }
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("DB_") || k === "MCP_DB_CONFIG" || k === "MCP_DB_LOG_LEVEL") {
        delete process.env[k];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it("uses env loader when MCP_DB_CONFIG is not set", () => {
    process.env.DB_PROD_TYPE = "postgresql";
    process.env.DB_PROD_URL = "postgresql://u:p@h:5432/db";
    const out = loadConfig(process.env);
    expect(out.source).toBe("env");
    expect(out.aliases.prod).toBeDefined();
  });

  it("uses file loader when MCP_DB_CONFIG is set and ignores DB_* env vars", () => {
    const cfgPath = join(tmp, "config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        aliases: { fromfile: { type: "postgresql", host: "h", database: "d" } },
      }),
    );
    process.env.MCP_DB_CONFIG = cfgPath;
    process.env.DB_FROMENV_TYPE = "postgresql";
    process.env.DB_FROMENV_HOST = "h";
    process.env.DB_FROMENV_DATABASE = "d";
    const out = loadConfig(process.env);
    expect(out.source).toBe("config_file");
    expect(Object.keys(out.aliases)).toEqual(["fromfile"]);
    expect(out.aliases.fromenv).toBeUndefined();
  });

  it("throws ConfigError when MCP_DB_CONFIG points to a missing file", () => {
    process.env.MCP_DB_CONFIG = join(tmp, "does-not-exist.json");
    expect(() => loadConfig(process.env)).toThrow(/not readable/i);
  });

  it("propagates defaultAlias and logLevel from file loader", () => {
    const cfgPath = join(tmp, "config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        defaultAlias: "prod",
        logLevel: "debug",
        aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
      }),
    );
    process.env.MCP_DB_CONFIG = cfgPath;
    const out = loadConfig(process.env);
    expect(out.defaultAlias).toBe("prod");
    expect(out.logLevel).toBe("debug");
  });

  it("env loader output has no defaultAlias/logLevel fields", () => {
    process.env.DB_PROD_TYPE = "postgresql";
    process.env.DB_PROD_HOST = "h";
    process.env.DB_PROD_DATABASE = "d";
    const out = loadConfig(process.env);
    expect(out.defaultAlias).toBeUndefined();
    expect(out.logLevel).toBeUndefined();
  });
});
