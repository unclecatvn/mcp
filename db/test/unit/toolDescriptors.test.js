import { describe, it, expect } from "vitest";
import { ToolDescriptorBuilder } from "../../lib/toolDescriptors.js";

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
    const builder = new ToolDescriptorBuilder(reg, { defaultAlias: "unleashed" });
    const tools = builder.build();
    const dbQuery = tools.find((t) => t.name === "db_query");

    expect(dbQuery.description).toContain("Available aliases");
    expect(dbQuery.description).toContain("unleashed");
    expect(dbQuery.description).toContain("Unleashed");
    expect(dbQuery.description).toContain("Production DB");
    expect(dbQuery.description).toContain("orders");
    expect(dbQuery.description).toContain("staging");
    expect(dbQuery.description).toContain("Default alias when databaseAlias is omitted: unleashed");
  });

  it("falls back to `<name> [<type>, <mode>]` when metadata is absent", () => {
    const reg = fakeRegistry({
      prod: { alias: "prod", type: "postgresql", mode: "readonly" },
    });
    const handlers = new ToolDescriptorBuilder(reg, {});
    const tools = handlers.build();
    const dbQuery = tools.find((t) => t.name === "db_query");
    expect(dbQuery.description).toMatch(/prod\s+\[postgresql,\s*readonly\]/);
    expect(dbQuery.description).not.toContain("Default alias");
  });

  it("sets databaseAlias.enum to the alias roster on every tool that accepts it", () => {
    const reg = fakeRegistry({
      a: { alias: "a", type: "postgresql", mode: "readonly" },
      b: { alias: "b", type: "mysql", mode: "readwrite" },
    });
    const handlers = new ToolDescriptorBuilder(reg, {});
    const tools = handlers.build();

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

  it("omits databaseAlias from required when defaultAlias is set", () => {
    const reg = fakeRegistry({
      unleashed: {
        alias: "unleashed",
        type: "postgresql",
        mode: "readonly",
      },
    });
    const builder = new ToolDescriptorBuilder(reg, { defaultAlias: "unleashed" });
    const tools = builder.build();
    const dbQuery = tools.find((t) => t.name === "db_query");
    expect(dbQuery.inputSchema.required).toEqual(["sql"]);
  });

  it("requires databaseAlias when no defaultAlias is configured", () => {
    const reg = fakeRegistry({
      prod: { alias: "prod", type: "postgresql", mode: "readonly" },
    });
    const dbQuery = new ToolDescriptorBuilder(reg, {}).build().find((t) => t.name === "db_query");
    expect(dbQuery.inputSchema.required).toEqual(["databaseAlias", "sql"]);
  });
});
