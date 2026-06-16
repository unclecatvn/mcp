import { describe, it, expect } from "vitest";
import { INSTRUCTIONS } from "../../lib/instructions.js";
import { makeLogger } from "../../lib/logger.js";

describe("INSTRUCTIONS", () => {
  it("documents alias routing and safety basics", () => {
    expect(INSTRUCTIONS).toContain("databaseAlias");
    expect(INSTRUCTIONS).toContain("db_list_tables");
    expect(INSTRUCTIONS).toContain("DB_PERMISSION_DENIED");
  });
});

describe("makeLogger", () => {
  it("respects MCP_DB_LOG_LEVEL", () => {
    const prev = process.env.MCP_DB_LOG_LEVEL;
    process.env.MCP_DB_LOG_LEVEL = "error";
    const logger = makeLogger();
    expect(typeof logger.error).toBe("function");
    process.env.MCP_DB_LOG_LEVEL = prev;
  });
});
