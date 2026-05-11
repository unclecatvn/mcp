import { describe, it, expect } from "vitest";
import { parseEnv } from "../../lib/config.js";

describe("parseEnv", () => {
  it("parses a single API-key connection with default timeout", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "https://erp.example.com",
      ODOO_PROD_DB: "production",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "secret-key",
    });
    expect(errors.filter((e) => e.severity !== "warn")).toEqual([]);
    expect(connections.prod).toMatchObject({
      name: "prod",
      url: "https://erp.example.com",
      db: "production",
      username: "admin",
      authType: "apikey",
      secret: "secret-key",
      timeoutMs: 60000,
    });
  });

  it("parses a password-auth connection", () => {
    const { connections, errors } = parseEnv({
      ODOO_DEV_URL: "https://dev.example.com",
      ODOO_DEV_DB: "dev",
      ODOO_DEV_USERNAME: "tester",
      ODOO_DEV_PASSWORD: "p4ss",
    });
    expect(errors.filter((e) => e.severity !== "warn")).toEqual([]);
    expect(connections.dev.authType).toBe("password");
    expect(connections.dev.secret).toBe("p4ss");
  });

  it("parses multiple connections in one env", () => {
    const { connections } = parseEnv({
      ODOO_PROD_URL: "https://prod.example.com",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "u1",
      ODOO_PROD_API_KEY: "k1",
      ODOO_STAGING_URL: "https://staging.example.com",
      ODOO_STAGING_DB: "staging",
      ODOO_STAGING_USERNAME: "u2",
      ODOO_STAGING_PASSWORD: "p2",
    });
    expect(Object.keys(connections).sort()).toEqual(["prod", "staging"]);
  });

  it("strips trailing slash from URL", () => {
    const { connections } = parseEnv({
      ODOO_PROD_URL: "https://erp.example.com/",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod.url).toBe("https://erp.example.com");
  });

  it("trims whitespace around env values", () => {
    const { connections } = parseEnv({
      ODOO_PROD_URL: "  https://erp.example.com  ",
      ODOO_PROD_DB: " prod ",
      ODOO_PROD_USERNAME: " admin\n",
      ODOO_PROD_API_KEY: "\tk-secret",
    });
    expect(connections.prod).toMatchObject({
      url: "https://erp.example.com",
      db: "prod",
      username: "admin",
      secret: "k-secret",
    });
  });

  it("treats whitespace-only fields as missing", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "https://erp.example.com",
      ODOO_PROD_DB: "   ",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeUndefined();
    expect(errors.find((e) => /Missing required/.test(e.message))).toBeDefined();
  });

  it("prefers API_KEY when both API_KEY and PASSWORD are set, and warns", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "https://erp.example.com",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
      ODOO_PROD_PASSWORD: "p",
    });
    expect(connections.prod.authType).toBe("apikey");
    expect(connections.prod.secret).toBe("k");
    expect(errors.some((e) => e.severity === "warn" && /both/i.test(e.message))).toBe(true);
  });

  it("rejects a connection missing DB or USERNAME", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "https://erp.example.com",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeUndefined();
    expect(errors.find((e) => /Missing required/.test(e.message))).toBeDefined();
  });

  it("rejects a connection with neither API_KEY nor PASSWORD", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "https://erp.example.com",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
    });
    expect(connections.prod).toBeUndefined();
    expect(errors.find((e) => /credentials/i.test(e.message))).toBeDefined();
  });

  it("rejects malformed URL", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "not-a-url",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeUndefined();
    expect(errors.find((e) => /Invalid URL/.test(e.message))).toBeDefined();
  });

  it("rejects non-http(s) URL", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "ftp://erp.example.com",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeUndefined();
    expect(errors.find((e) => /protocol/i.test(e.message))).toBeDefined();
  });

  it("warns when URL uses http instead of https", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_URL: "http://erp.example.com",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeDefined();
    expect(errors.some((e) => e.severity === "warn" && /http:/i.test(e.message))).toBe(true);
  });

  it("warns about orphan fields (URL empty or missing)", () => {
    const { connections, errors } = parseEnv({
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeUndefined();
    expect(errors.some((e) => /URL is empty or missing/i.test(e.message))).toBe(true);
  });

  it("handles names with underscores", () => {
    const { connections } = parseEnv({
      ODOO_MY_PROD_URL: "https://my-prod.example.com",
      ODOO_MY_PROD_DB: "my_prod",
      ODOO_MY_PROD_USERNAME: "admin",
      ODOO_MY_PROD_API_KEY: "k",
    });
    expect(connections.my_prod).toBeDefined();
    expect(connections.my_prod.name).toBe("my_prod");
  });

  it("ignores empty URL", () => {
    const { connections } = parseEnv({
      ODOO_PROD_URL: "",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    });
    expect(connections.prod).toBeUndefined();
  });

  it("returns empty result when env has no ODOO_* vars", () => {
    const { connections, errors } = parseEnv({ PATH: "/usr/bin", HOME: "/root" });
    expect(connections).toEqual({});
    expect(errors).toEqual([]);
  });

  describe("TIMEOUT_MS", () => {
    const base = {
      ODOO_PROD_URL: "https://erp.example.com",
      ODOO_PROD_DB: "prod",
      ODOO_PROD_USERNAME: "admin",
      ODOO_PROD_API_KEY: "k",
    };

    it("accepts a valid integer", () => {
      const { connections, errors } = parseEnv({ ...base, ODOO_PROD_TIMEOUT_MS: "120000" });
      expect(connections.prod.timeoutMs).toBe(120000);
      expect(errors.filter((e) => e.severity !== "warn")).toEqual([]);
    });

    it("falls back to default and warns on non-integer", () => {
      const { connections, errors } = parseEnv({ ...base, ODOO_PROD_TIMEOUT_MS: "abc" });
      expect(connections.prod.timeoutMs).toBe(60000);
      expect(errors.some((e) => e.severity === "warn" && /integer/i.test(e.message))).toBe(true);
    });

    it("clamps to [1000, 600000] and warns", () => {
      const r1 = parseEnv({ ...base, ODOO_PROD_TIMEOUT_MS: "10" });
      expect(r1.connections.prod.timeoutMs).toBe(1000);
      expect(r1.errors.some((e) => /clamping/i.test(e.message))).toBe(true);

      const r2 = parseEnv({ ...base, ODOO_PROD_TIMEOUT_MS: "999999999" });
      expect(r2.connections.prod.timeoutMs).toBe(600000);
    });
  });
});
