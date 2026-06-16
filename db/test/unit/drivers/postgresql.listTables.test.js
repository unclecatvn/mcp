import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresqlDriver } from "../../../drivers/postgresql.js";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockEnd = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(() => ({
      connect: mockConnect,
      on: vi.fn(),
      end: mockEnd,
    })),
  },
}));

const baseConfig = {
  alias: "prod",
  type: "postgresql",
  host: "localhost",
  port: 5432,
  user: "u",
  password: "p",
  database: "app",
  mode: "readonly",
  ssl: "prefer",
  timeoutMs: 30000,
  maxRows: 10000,
  poolMax: 5,
};

describe("PostgresqlDriver.listTables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
    mockQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({
      rows: [
        { table_schema: "public", table_name: "sale_order" },
        { table_schema: "public", table_name: "sale_order_line" },
        { table_schema: "public", table_name: "extra" },
      ],
      rowCount: 3,
      fields: [],
    });
  });

  it("paginates and filters by schema and name pattern", async () => {
    const driver = new PostgresqlDriver(baseConfig);
    const page = await driver.listTables({
      schema: "public",
      limit: 2,
      offset: 0,
      namePattern: "sale_%",
    });

    expect(page).toEqual({
      tables: [
        { name: "sale_order", schema: "public" },
        { name: "sale_order_line", schema: "public" },
      ],
      limit: 2,
      offset: 0,
      hasMore: true,
    });
    // Not "last" call: executeQuery resets `statement_timeout` after the query.
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("table_schema = $1"),
      ["public", "sale_%", 3, 0],
    );
    await driver.close();
  });
});
