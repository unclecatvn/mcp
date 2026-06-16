import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildListTablesQuery } from "../../../lib/tableListingSql.js";
import { buildPageResponse } from "../../../lib/tableListing.js";
import { mapListTablesRow } from "../../../lib/tableListingSql.js";

const mockQuery = vi.fn();
const mockInput = vi.fn().mockReturnThis();
const mockRequest = vi.fn(() => ({ input: mockInput, query: mockQuery, timeout: 0 }));
const mockClose = vi.fn();
const mockConnect = vi.fn();

vi.mock("mssql", () => ({
  default: {
    ConnectionPool: vi.fn(() => ({
      connect: mockConnect,
      request: mockRequest,
      close: mockClose,
    })),
  },
}));

const baseConfig = {
  alias: "prod",
  type: "sqlserver",
  host: "localhost",
  port: 1433,
  user: "u",
  password: "p",
  database: "app",
  mode: "readonly",
  ssl: "prefer",
  timeoutMs: 30000,
  maxRows: 10000,
  poolMax: 5,
};

describe("SqlServerDriver.listTables integration via SQL builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      request: mockRequest,
      close: mockClose,
    });
    mockQuery.mockResolvedValue({
      recordset: [
        { TABLE_SCHEMA: "dbo", TABLE_NAME: "sale_order" },
        { TABLE_SCHEMA: "dbo", TABLE_NAME: "sale_order_line" },
        { TABLE_SCHEMA: "dbo", TABLE_NAME: "extra" },
      ],
    });
  });

  it("uses named pagination params from buildListTablesQuery", async () => {
    const { SqlServerDriver } = await import("../../../drivers/sqlserver.js");
    const driver = new SqlServerDriver(baseConfig);
    await driver._pool();

    const opts = { schema: "dbo", limit: 2, offset: 0, namePattern: "sale_%" };
    const { sql, params, paging } = buildListTablesQuery("sqlserver", opts);
    const r = await driver.executeQuery({ sql, params, timeoutMs: 30000 });
    const rows = r.rows.map((row) => mapListTablesRow("sqlserver", row));
    const page = buildPageResponse(rows, paging);

    expect(page.hasMore).toBe(true);
    expect(page.tables).toEqual([
      { name: "sale_order", schema: "dbo" },
      { name: "sale_order_line", schema: "dbo" },
    ]);
    expect(mockInput).toHaveBeenCalledWith("schema", "dbo");
    expect(mockInput).toHaveBeenCalledWith("namePattern", "sale_%");
    await driver.close();
  });
});
