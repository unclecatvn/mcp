import { describe, it, expect } from "vitest";
import { normalizeAliasConfig } from "../../lib/normalizeAlias.js";
import { ConfigError } from "../../lib/errors.js";
import { validateAliasConfig } from "../../lib/config.js";

describe("normalizeAliasConfig", () => {
  it("normalizes URL-based aliases with metadata", () => {
    const cfg = normalizeAliasConfig(
      "prod",
      {
        type: "postgresql",
        url: "postgresql://u:p@host:5432/db",
        displayName: "Prod",
        defaultSchema: "public",
      },
      {
        fail(code) {
          throw new Error(code);
        },
      },
    );
    expect(cfg).toMatchObject({
      alias: "prod",
      host: "host",
      port: 5432,
      user: "u",
      password: "p",
      database: "db",
      displayName: "Prod",
      defaultSchema: "public",
    });
  });

  it("maps env loader failures to ConfigError messages", () => {
    expect(() =>
      validateAliasConfig("prod", { type: "postgresql", host: "h", mode: "godmode" }),
    ).toThrow(ConfigError);
    try {
      validateAliasConfig("prod", { type: "postgresql", host: "h", mode: "godmode" });
    } catch (err) {
      expect(err.message).toMatch(/DB_PROD_MODE/);
    }
  });
});
