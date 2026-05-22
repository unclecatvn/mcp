import { describe, it, expect } from "vitest";
import { ToolHandlers } from "../../lib/toolHandlers.js";

function fakeRegistry(configs) {
  return {
    listAliases: () => Object.keys(configs),
    getConfig: (a) => configs[a],
  };
}

describe("ToolHandlers.toolDescriptors metadata injection", () => {
  it("injects an Available aliases block with displayName + description", () => {
    const reg = fakeRegistry({
      unleashed: {
        alias: "unleashed",
        type: "postgresql",
        mode: "readonly",
        displayName: "Unleashed",
        description: "Production DB",
        tablesHint: ["orders"],
      },
      staging: { alias: "staging", type: "mysql", mode: "readwrite" },
    });
    const handlers = new ToolHandlers(reg, { defaultAlias: "unleashed" });
    const tools = handlers.toolDescriptors();
    const dbQuery = tools.find((t) => t.name === "db_query");

    expect(dbQuery.description).toContain("Available aliases");
    expect(dbQuery.description).toContain("unleashed");
    expect(dbQuery.description).toContain("Unleashed");
    expect(dbQuery.description).toContain("Production DB");
    expect(dbQuery.description).toContain("orders");
    expect(dbQuery.description).toContain("staging");
    expect(dbQuery.description).toContain("Default alias if unspecified: unleashed");
  });

  it("falls back to `<name> [<type>, <mode>]` when metadata is absent", () => {
    const reg = fakeRegistry({
      prod: { alias: "prod", type: "postgresql", mode: "readonly" },
    });
    const handlers = new ToolHandlers(reg, {});
    const tools = handlers.toolDescriptors();
    const dbQuery = tools.find((t) => t.name === "db_query");
    expect(dbQuery.description).toMatch(/prod\s+\[postgresql,\s*readonly\]/);
    expect(dbQuery.description).not.toContain("Default alias");
  });

  it("sets databaseAlias.enum to the alias roster on every tool that accepts it", () => {
    const reg = fakeRegistry({
      a: { alias: "a", type: "postgresql", mode: "readonly" },
      b: { alias: "b", type: "mysql", mode: "readwrite" },
    });
    const handlers = new ToolHandlers(reg, {});
    const tools = handlers.toolDescriptors();

    const aliasTakingTools = [
      "db_query",
      "db_list_tables",
      "db_describe_table",
      "db_test_connection",
      "db_query_history",
      "db_explain_query",
    ];
    for (const name of aliasTakingTools) {
      const t = tools.find((x) => x.name === name);
      expect(t, `tool ${name} not found`).toBeDefined();
      const prop = t.inputSchema.properties.databaseAlias;
      expect(prop.enum, `${name}.databaseAlias.enum missing`).toEqual(["a", "b"]);
    }
  });

  it("does not break when registry has zero aliases (defensive)", () => {
    const reg = fakeRegistry({});
    const handlers = new ToolHandlers(reg, {});
    const tools = handlers.toolDescriptors();
    const dbQuery = tools.find((t) => t.name === "db_query");
    expect(dbQuery.inputSchema.properties.databaseAlias.enum).toEqual([]);
  });
});
