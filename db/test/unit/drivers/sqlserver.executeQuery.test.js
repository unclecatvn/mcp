import { describe, it, expect, vi, beforeEach } from "vitest";
import { SqlServerDriver } from "../../../drivers/sqlserver.js";
import { TimeoutError, ConnectionError, QueryError } from "../../../lib/errors.js";

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

describe("SqlServerDriver.executeQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({ request: mockRequest, close: mockClose });
  });

  it("maps recordset rows and rowsAffected", async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }], rowsAffected: [1] });
    const driver = new SqlServerDriver(baseConfig);
    const r = await driver.executeQuery({ sql: "SELECT id FROM t", params: [], timeoutMs: 5000 });
    expect(r.rows).toEqual([{ id: 1 }]);
    expect(r.rowCount).toBe(1);
    await driver.close();
  });

  it("binds named params via req.input and sets the request timeout", async () => {
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [0] });
    const req = { input: mockInput, query: mockQuery, timeout: 0 };
    mockRequest.mockReturnValue(req);
    const driver = new SqlServerDriver(baseConfig);
    await driver.executeQuery({
      sql: "SELECT * FROM t WHERE name = @name",
      params: { name: "abc" },
      timeoutMs: 1234,
    });
    expect(mockInput).toHaveBeenCalledWith("name", "abc");
    expect(req.timeout).toBe(1234);
    await driver.close();
  });

  it("maps a timeout (message) to TimeoutError", async () => {
    mockQuery.mockRejectedValue(new Error("Timeout: Request failed to complete in 100ms"));
    const driver = new SqlServerDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT 1", params: undefined, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    await driver.close();
  });

  it("maps an ETIMEOUT code to TimeoutError", async () => {
    const e = new Error("request timed out");
    e.code = "ETIMEOUT";
    mockQuery.mockRejectedValue(e);
    const driver = new SqlServerDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT 1", params: undefined, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    await driver.close();
  });

  it("maps a closed-connection error to a retryable ConnectionError", async () => {
    mockQuery.mockRejectedValue(new Error("Connection is closed"));
    const driver = new SqlServerDriver(baseConfig);
    const err = await driver
      .executeQuery({ sql: "SELECT 1", params: undefined, timeoutMs: 100 })
      .catch((x) => x);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.retryable).toBe(true);
    await driver.close();
  });

  it("maps any other error to a non-retryable QueryError", async () => {
    mockQuery.mockRejectedValue(new Error("Invalid object name 'nope'"));
    const driver = new SqlServerDriver(baseConfig);
    const err = await driver
      .executeQuery({ sql: "SELECT * FROM nope", params: undefined, timeoutMs: 100 })
      .catch((x) => x);
    expect(err).toBeInstanceOf(QueryError);
    expect(err.retryable).toBe(false);
    await driver.close();
  });

  it("surfaces a ConnectionError when the pool fails to connect", async () => {
    mockConnect.mockRejectedValue(new Error("ECONNREFUSED"));
    const driver = new SqlServerDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT 1", params: undefined, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(ConnectionError);
  });
});

describe("SqlServerDriver inherited BaseDriver methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({ request: mockRequest, close: mockClose });
    mockRequest.mockReturnValue({ input: mockInput, query: mockQuery, timeout: 0 });
  });

  it("listTables runs the inherited method end-to-end", async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { TABLE_SCHEMA: "dbo", TABLE_NAME: "sale_order" },
        { TABLE_SCHEMA: "dbo", TABLE_NAME: "sale_order_line" },
        { TABLE_SCHEMA: "dbo", TABLE_NAME: "extra" },
      ],
    });
    const driver = new SqlServerDriver(baseConfig);
    const page = await driver.listTables({ schema: "dbo", limit: 2, offset: 0, namePattern: "sale_%" });
    expect(page.hasMore).toBe(true);
    expect(page.tables).toEqual([
      { name: "sale_order", schema: "dbo" },
      { name: "sale_order_line", schema: "dbo" },
    ]);
    expect(mockInput).toHaveBeenCalledWith("namePattern", "sale_%");
    await driver.close();
  });

  it("healthCheck returns true on SELECT 1", async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ok: 1 }], rowsAffected: [1] });
    const driver = new SqlServerDriver(baseConfig);
    expect(await driver.healthCheck()).toBe(true);
    await driver.close();
  });
});
