import { describe, it, expect } from "vitest";
import { ResourceHandlers } from "../../lib/resourceHandlers.js";

function fakeRegistry(configs) {
  return {
    listAliases: () => Object.keys(configs),
    getConfig: (a) => configs[a],
  };
}

describe("ResourceHandlers", () => {
  it("lists security guide and aliases resources", () => {
    const handlers = new ResourceHandlers(fakeRegistry({}));
    const resources = handlers.list();
    expect(resources.map((r) => r.uri)).toEqual(["db://security-guide", "db://aliases"]);
  });

  it("returns alias metadata without secrets", () => {
    const handlers = new ResourceHandlers(
      fakeRegistry({
        odoo: {
          alias: "odoo",
          type: "postgresql",
          mode: "readonly",
          ssl: "prefer",
          host: "localhost",
          port: 5432,
          database: "odoo",
          maxRows: 10000,
          timeoutMs: 30000,
          displayName: "Odoo",
          defaultSchema: "public",
          tablesHint: ["sale_order"],
        },
      }),
    );
    const { contents } = handlers.read("db://aliases");
    const summary = JSON.parse(contents[0].text);
    expect(summary).toEqual([
      {
        alias: "odoo",
        type: "postgresql",
        mode: "readonly",
        ssl: "prefer",
        host: "localhost",
        port: 5432,
        database: "odoo",
        maxRows: 10000,
        timeoutMs: 30000,
        displayName: "Odoo",
        tablesHint: ["sale_order"],
        defaultSchema: "public",
      },
    ]);
    expect(summary[0].password).toBeUndefined();
  });

  it("throws for unknown resource", () => {
    const handlers = new ResourceHandlers(fakeRegistry({}));
    expect(() => handlers.read("db://missing")).toThrow(/Unknown resource/);
  });
});
