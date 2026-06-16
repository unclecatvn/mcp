import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolHandlers } from "../../lib/toolHandlers.js";
import { ValidationError } from "../../lib/errors.js";

const mockDriver = {
  executeQuery: vi.fn(),
  listTables: vi.fn(),
  describeTable: vi.fn(),
  healthCheck: vi.fn(),
};

function makeRegistry(configs) {
  return {
    listAliases: () => Object.keys(configs),
    getConfig: (a) => configs[a],
    withRetry: async (_alias, fn) => ({ result: await fn(mockDriver), retries: 0 }),
  };
}

const prodCfg = {
  alias: "prod",
  type: "postgresql",
  mode: "readonly",
  maxRows: 10000,
  timeoutMs: 30000,
  defaultSchema: "public",
};

describe("ToolHandlers dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDriver.executeQuery.mockResolvedValue({
      rows: [{ id: 1 }],
      rowCount: 1,
      columns: [{ name: "id" }],
    });
    mockDriver.listTables.mockResolvedValue({
      tables: [{ name: "sale_order", schema: "public" }],
      limit: 100,
      offset: 0,
      hasMore: false,
    });
    mockDriver.describeTable.mockResolvedValue({ columns: [], indexes: [] });
    mockDriver.healthCheck.mockResolvedValue(true);
  });

  it("uses defaultAlias when databaseAlias is omitted", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), {
      defaultAlias: "prod",
      configSource: "config_file",
    });
    const res = await handlers.handleQuery({ sql: "SELECT 1" });
    const body = JSON.parse(res.content[0].text);
    expect(body.rows).toEqual([{ id: 1 }]);
    expect(mockDriver.executeQuery).toHaveBeenCalledOnce();
  });

  it("throws ValidationError without defaultAlias", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), {});
    await expect(handlers.handleQuery({ sql: "SELECT 1" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("passes configSource to mode enforcer for JSON hint", async () => {
    const rwCfg = { ...prodCfg, mode: "readonly" };
    const handlers = new ToolHandlers(makeRegistry({ prod: rwCfg }), {
      defaultAlias: "prod",
      configSource: "config_file",
    });
    const res = await handlers.dispatch("db_query", {
      sql: "DELETE FROM t WHERE id = ?",
      params: [1],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/aliases\.prod\.mode/);
  });

  it("applies defaultSchema and pagination for listTables", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), { defaultAlias: "prod" });
    await handlers.handleListTables({ limit: 25, offset: 10, namePattern: "sale_%" });
    expect(mockDriver.listTables).toHaveBeenCalledWith({
      schema: "public",
      limit: 25,
      offset: 10,
      namePattern: "sale_%",
    });
  });

  it("applies defaultSchema for describeTable", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), { defaultAlias: "prod" });
    await handlers.handleDescribeTable({ tableName: "sale_order" });
    expect(mockDriver.describeTable).toHaveBeenCalledWith({
      tableName: "sale_order",
      schema: "public",
    });
  });

  it("records query history metadata", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), { defaultAlias: "prod" });
    await handlers.handleQuery({ sql: "SELECT 1" });
    const hist = await handlers.handleHistory({});
    const entries = JSON.parse(hist.content[0].text);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ alias: "prod", type: "SELECT", success: true });
  });

  it("formats unknown tool errors via dispatch", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), {});
    const res = await handlers.dispatch("nope", {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/DB_INTERNAL/);
  });
});

describe("ToolHandlers enforceMode integration", () => {
  it("allows readonly SELECT", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), { defaultAlias: "prod" });
    await expect(
      handlers.handleQuery({ databaseAlias: "prod", sql: "SELECT 1" }),
    ).resolves.not.toThrow();
  });

  it("blocks DELETE in readonly via dispatch", async () => {
    const handlers = new ToolHandlers(makeRegistry({ prod: prodCfg }), {});
    const res = await handlers.dispatch("db_query", {
      databaseAlias: "prod",
      sql: "DELETE FROM t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/DB_PERMISSION_DENIED/);
  });
});
