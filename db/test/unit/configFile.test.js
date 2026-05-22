import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseConfigJson, parseConfigFile } from "../../lib/configFile.js";

describe("parseConfigJson", () => {
  it("parses a 3-alias config with full metadata", () => {
    const json = JSON.stringify({
      aliases: {
        unleashed: {
          type: "postgresql",
          url: "postgresql://u:p@host:5432/db",
          mode: "readonly",
          displayName: "Unleashed",
          description: "Production DB",
          tablesHint: ["orders", "products"],
        },
        staging: {
          type: "mysql",
          host: "stg",
          user: "app",
          password: "secret",
          database: "appdb",
          mode: "readwrite",
        },
        local: {
          type: "postgresql",
          url: "postgresql://postgres:postgres@localhost:5432/dev",
          mode: "readwrite+ddl",
        },
      },
    });
    const { aliases, errors, defaultAlias, logLevel } = parseConfigJson(json);
    expect(errors).toEqual([]);
    expect(Object.keys(aliases).sort()).toEqual(["local", "staging", "unleashed"]);
    expect(aliases.unleashed).toMatchObject({
      alias: "unleashed",
      type: "postgresql",
      host: "host",
      port: 5432,
      user: "u",
      password: "p",
      database: "db",
      mode: "readonly",
      ssl: "prefer",
      timeoutMs: 30000,
      maxRows: 10000,
      poolMax: 5,
      displayName: "Unleashed",
      description: "Production DB",
      tablesHint: ["orders", "products"],
    });
    expect(defaultAlias).toBeUndefined();
    expect(logLevel).toBeUndefined();
  });

  it("explicit fields override URL components", () => {
    const json = JSON.stringify({
      aliases: {
        prod: {
          type: "postgresql",
          url: "postgresql://uA:pA@hA:5432/dbA",
          host: "hB",
          database: "dbB",
        },
      },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(errors).toEqual([]);
    expect(aliases.prod).toMatchObject({ host: "hB", database: "dbB", user: "uA", password: "pA" });
  });

  it("applies safe defaults when optional fields are omitted", () => {
    const json = JSON.stringify({
      aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(errors).toEqual([]);
    expect(aliases.prod).toMatchObject({
      mode: "readonly",
      ssl: "prefer",
      port: 5432,
      timeoutMs: 30000,
      maxRows: 10000,
      poolMax: 5,
    });
  });

  it("skips an alias with invalid mode and reports the error; loads the rest", () => {
    const json = JSON.stringify({
      aliases: {
        good: { type: "postgresql", host: "h", database: "d" },
        bad: { type: "postgresql", host: "h", database: "d", mode: "godmode" },
      },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(Object.keys(aliases)).toEqual(["good"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].alias).toBe("bad");
    expect(errors[0].message).toMatch(/mode/i);
  });

  it("rejects alias keys not matching ^[a-z][a-z0-9_]*$", () => {
    const json = JSON.stringify({
      aliases: { "Bad-Name": { type: "postgresql", host: "h", database: "d" } },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(aliases).toEqual({});
    expect(errors).toHaveLength(1);
    expect(errors[0].alias).toBe("Bad-Name");
  });

  it("requires host (after URL fallback)", () => {
    const json = JSON.stringify({
      aliases: { prod: { type: "postgresql", database: "d" } },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(aliases).toEqual({});
    expect(errors[0].message).toMatch(/host/i);
  });

  it("rejects an alias with an unparseable URL", () => {
    const json = JSON.stringify({
      aliases: { prod: { type: "postgresql", url: "::not a url::" } },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(aliases).toEqual({});
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/url/i);
  });

  it("propagates defaultAlias when it references a loaded alias", () => {
    const json = JSON.stringify({
      defaultAlias: "prod",
      aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
    });
    const { defaultAlias, errors } = parseConfigJson(json);
    expect(errors).toEqual([]);
    expect(defaultAlias).toBe("prod");
  });

  it("drops defaultAlias and warns when it references an unknown alias", () => {
    const json = JSON.stringify({
      defaultAlias: "ghost",
      aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
    });
    const { defaultAlias, errors } = parseConfigJson(json);
    expect(defaultAlias).toBeUndefined();
    expect(errors.some((e) => /defaultAlias.*ghost/i.test(e.message))).toBe(true);
  });

  it("propagates logLevel", () => {
    const json = JSON.stringify({
      logLevel: "debug",
      aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
    });
    const { logLevel } = parseConfigJson(json);
    expect(logLevel).toBe("debug");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseConfigJson("{not json")).toThrow(/JSON/i);
  });

  it("throws when aliases is missing entirely", () => {
    expect(() => parseConfigJson(JSON.stringify({}))).toThrow(/aliases/i);
  });

  it("rejects unknown fields inside an alias (strict — catches typos)", () => {
    const json = JSON.stringify({
      aliases: { prod: { type: "postgresql", host: "h", database: "d", tablehint: ["x"] } },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(aliases).toEqual({});
    expect(errors[0].message).toMatch(/tablehint|unrecognized/i);
  });

  it("ignores unknown top-level fields (forward-compat)", () => {
    const json = JSON.stringify({
      futureFeature: { enabled: true },
      aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
    });
    const { aliases, errors } = parseConfigJson(json);
    expect(errors).toEqual([]);
    expect(Object.keys(aliases)).toEqual(["prod"]);
  });
});

describe("parseConfigFile", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "mcp-db-cfgfile-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("reads and parses a valid config file", () => {
    const path = join(tmp, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        aliases: { prod: { type: "postgresql", host: "h", database: "d" } },
      }),
    );
    const { aliases, errors } = parseConfigFile(path);
    expect(errors).toEqual([]);
    expect(aliases.prod).toBeDefined();
  });

  it("throws ConfigError when the file is missing", () => {
    const path = join(tmp, "missing.json");
    expect(() => parseConfigFile(path)).toThrow(/not readable/i);
  });

  it("throws ConfigError when the file contains invalid JSON", () => {
    const path = join(tmp, "bad.json");
    writeFileSync(path, "{not json");
    expect(() => parseConfigFile(path)).toThrow(/JSON/i);
  });
});
