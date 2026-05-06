import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseEnv, validateAliasConfig } from "../../lib/config.js";
import { ConfigError } from "../../lib/errors.js";

describe("parseEnv", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    // Wipe any DB_* keys for a clean slate
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("DB_") || k === "MCP_DB_LOG_LEVEL") delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("DB_") || k === "MCP_DB_LOG_LEVEL") delete process.env[k];
    }
    Object.assign(process.env, saved);
  });

  it("parses a single alias from URL", () => {
    process.env.DB_PROD_TYPE = "postgresql";
    process.env.DB_PROD_URL = "postgresql://u:p@h:5432/db";
    const { aliases, errors } = parseEnv(process.env);
    expect(errors).toEqual([]);
    expect(aliases.prod).toMatchObject({
      type: "postgresql",
      host: "h",
      port: 5432,
      user: "u",
      password: "p",
      database: "db",
      mode: "readonly",
      ssl: "prefer",
      timeoutMs: 30000,
      maxRows: 10000,
      poolMax: 5,
    });
  });

  it("parses an alias from explicit fields", () => {
    process.env.DB_DEV_TYPE = "mysql";
    process.env.DB_DEV_HOST = "localhost";
    process.env.DB_DEV_USER = "root";
    process.env.DB_DEV_PASSWORD = "secret";
    process.env.DB_DEV_DATABASE = "appdb";
    process.env.DB_DEV_MODE = "readwrite";
    const { aliases, errors } = parseEnv(process.env);
    expect(errors).toEqual([]);
    expect(aliases.dev.mode).toBe("readwrite");
    expect(aliases.dev.host).toBe("localhost");
    expect(aliases.dev.port).toBe(3306); // default for mysql
  });

  it("parses multiple aliases", () => {
    process.env.DB_A_TYPE = "postgresql";
    process.env.DB_A_HOST = "h1";
    process.env.DB_B_TYPE = "mysql";
    process.env.DB_B_HOST = "h2";
    const { aliases } = parseEnv(process.env);
    expect(Object.keys(aliases).sort()).toEqual(["a", "b"]);
  });

  it("collects but does not throw on invalid mode", () => {
    process.env.DB_BAD_TYPE = "postgresql";
    process.env.DB_BAD_HOST = "h";
    process.env.DB_BAD_MODE = "godmode";
    const { aliases, errors } = parseEnv(process.env);
    expect(aliases.bad).toBeUndefined();
    expect(errors[0]).toMatchObject({
      alias: "bad",
      message: expect.stringContaining("MODE"),
    });
  });

  it("rejects invalid type", () => {
    process.env.DB_X_TYPE = "oracle";
    process.env.DB_X_HOST = "h";
    const { errors } = parseEnv(process.env);
    expect(errors[0].message).toContain("TYPE");
  });

  it("rejects invalid port", () => {
    process.env.DB_X_TYPE = "postgresql";
    process.env.DB_X_HOST = "h";
    process.env.DB_X_PORT = "70000";
    const { errors } = parseEnv(process.env);
    expect(errors[0].message).toContain("PORT");
  });

  it("rejects invalid timeout", () => {
    process.env.DB_X_TYPE = "postgresql";
    process.env.DB_X_HOST = "h";
    process.env.DB_X_TIMEOUT_MS = "-1";
    const { errors } = parseEnv(process.env);
    expect(errors[0].message).toContain("TIMEOUT_MS");
  });

  it("hard-caps maxRows at 1_000_000", () => {
    process.env.DB_X_TYPE = "postgresql";
    process.env.DB_X_HOST = "h";
    process.env.DB_X_MAX_ROWS = "9999999";
    const { errors } = parseEnv(process.env);
    expect(errors[0].message).toContain("MAX_ROWS");
  });

  it("ignores non-DB_ prefixed env vars", () => {
    process.env.PATH_LIKE = "junk";
    process.env.DB_PROD_TYPE = "postgresql";
    process.env.DB_PROD_HOST = "h";
    const { aliases } = parseEnv(process.env);
    expect(Object.keys(aliases)).toEqual(["prod"]);
  });

  it("returns empty when no DB_ vars set", () => {
    const { aliases, errors } = parseEnv(process.env);
    expect(aliases).toEqual({});
    expect(errors).toEqual([]);
  });
});

describe("validateAliasConfig", () => {
  it("throws ConfigError on missing host", () => {
    expect(() =>
      validateAliasConfig("x", { type: "postgresql" }, {})
    ).toThrow(ConfigError);
  });

  it("accepts URL-only config", () => {
    const cfg = validateAliasConfig(
      "x",
      { type: "postgresql", url: "postgresql://u:p@h:5432/db" },
      {}
    );
    expect(cfg.host).toBe("h");
  });
});
