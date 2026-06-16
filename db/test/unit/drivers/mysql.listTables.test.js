import { describe, it, expect, vi, beforeEach } from "vitest";
import { MysqlDriver } from "../../../drivers/mysql.js";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockGetConnection = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: vi.fn(() => ({
      getConnection: mockGetConnection,
      end: vi.fn(),
    })),
  },
}));

const baseConfig = {
  alias: "prod",
  type: "mysql",
  host: "localhost",
  port: 3306,
  user: "u",
  password: "p",
  database: "app",
  mode: "readonly",
  ssl: "prefer",
  timeoutMs: 30000,
  maxRows: 10000,
  poolMax: 5,
};

describe("MysqlDriver.listTables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnection.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
      destroy: vi.fn(),
    });
    mockQuery.mockResolvedValue([
      [
        { table_schema: "app", table_name: "sale_order" },
        { table_schema: "app", table_name: "sale_order_line" },
        { table_schema: "app", table_name: "extra" },
      ],
      [],
    ]);
  });

  it("paginates using shared list-table SQL builder", async () => {
    const driver = new MysqlDriver(baseConfig);
    const page = await driver.listTables({
      schema: "app",
      limit: 2,
      offset: 0,
      namePattern: "sale_%",
    });

    expect(page.hasMore).toBe(true);
    expect(page.tables).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("table_schema = ?"),
      ["app", "sale_%", 3, 0],
    );
    await driver.close();
  });
});
