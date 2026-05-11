import { describe, it, expect } from "vitest";
import { ClientRegistry } from "../../lib/clientRegistry.js";

const CFG = {
  prod: {
    name: "prod",
    url: "https://erp.example.com",
    db: "prod",
    username: "admin",
    authType: "apikey",
    secret: "k",
    timeoutMs: 60000,
  },
  staging: {
    name: "staging",
    url: "https://staging.example.com",
    db: "staging",
    username: "admin",
    authType: "password",
    secret: "p",
    timeoutMs: 120000,
  },
};

describe("ClientRegistry", () => {
  it("constructs one client per configured connection", () => {
    const r = new ClientRegistry(CFG);
    expect(r.has("prod")).toBe(true);
    expect(r.has("staging")).toBe(true);
    expect(r.has("missing")).toBe(false);
  });

  it("list() exposes describe() output without secrets", () => {
    const r = new ClientRegistry(CFG);
    const list = r.list();
    expect(list).toHaveLength(2);
    for (const item of list) {
      expect(item).not.toHaveProperty("secret");
      expect(item.authType).toBeDefined();
      expect(item.authenticated).toBe(false);
      expect(typeof item.timeoutMs).toBe("number");
    }
  });

  it("propagates per-connection timeoutMs to the underlying client", () => {
    const r = new ClientRegistry(CFG);
    expect(r.get("prod").timeoutMs).toBe(60000);
    expect(r.get("staging").timeoutMs).toBe(120000);
  });

  it("get() returns the client for a known name", () => {
    const r = new ClientRegistry(CFG);
    const c = r.get("prod");
    expect(c.name).toBe("prod");
    expect(c.db).toBe("prod");
  });

  it("get() throws UnknownConnectionError with the available list", () => {
    const r = new ClientRegistry(CFG);
    expect(() => r.get("nope")).toThrowError(/Unknown connection "nope"/);
  });

  it("get() with no connections gives an actionable error", () => {
    const r = new ClientRegistry({});
    expect(() => r.get("prod")).toThrowError(/No Odoo connections configured/);
  });
});
