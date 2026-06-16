import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MysqlDriver } from "../../../drivers/mysql.js";
import { TimeoutError, ConnectionError, QueryError } from "../../../lib/errors.js";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockDestroy = vi.fn();
const mockGetConnection = vi.fn();
const mockEnd = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: vi.fn(() => ({ getConnection: mockGetConnection, end: mockEnd })),
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

function connReturning(queryImpl) {
  return { query: queryImpl, release: mockRelease, destroy: mockDestroy };
}

describe("MysqlDriver.executeQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnection.mockResolvedValue(connReturning(mockQuery));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps SELECT rows and column metadata", async () => {
    mockQuery.mockResolvedValue([
      [{ id: 1 }, { id: 2 }],
      [{ name: "id", type: 3 }],
    ]);
    const driver = new MysqlDriver(baseConfig);
    const r = await driver.executeQuery({ sql: "SELECT id FROM t", params: [], timeoutMs: 5000 });
    expect(r.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(r.rowCount).toBe(2);
    expect(r.columns).toEqual([{ name: "id", type: 3 }]);
    expect(mockRelease).toHaveBeenCalledOnce();
    await driver.close();
  });

  it("uses affectedRows as rowCount for writes", async () => {
    mockQuery.mockResolvedValue([{ affectedRows: 7 }, undefined]);
    const driver = new MysqlDriver({ ...baseConfig, mode: "readwrite" });
    const r = await driver.executeQuery({
      sql: "UPDATE t SET x = 1",
      params: [],
      timeoutMs: 5000,
    });
    expect(r.rowCount).toBe(7);
    expect(r.rows).toEqual([]);
    await driver.close();
  });

  it("injects the MAX_EXECUTION_TIME hint for SELECT only", async () => {
    mockQuery.mockResolvedValue([[], []]);
    const driver = new MysqlDriver(baseConfig);
    await driver.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 4321 });
    expect(mockQuery.mock.calls[0][0]).toMatch(/MAX_EXECUTION_TIME\(4321\)/);

    mockQuery.mockClear();
    const rw = new MysqlDriver({ ...baseConfig, mode: "readwrite" });
    await rw.executeQuery({ sql: "UPDATE t SET x = 1", params: [], timeoutMs: 4321 });
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/MAX_EXECUTION_TIME/);
    await driver.close();
    await rw.close();
  });

  it("aborts via the JS timer, raises TimeoutError, and destroys (not releases) the connection", async () => {
    vi.useFakeTimers();
    mockGetConnection.mockResolvedValue(connReturning(() => new Promise(() => {})));
    const driver = new MysqlDriver(baseConfig);
    const settled = driver
      .executeQuery({ sql: "SELECT SLEEP(99)", params: [], timeoutMs: 1000 })
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = await settled;
    expect(err).toBeInstanceOf(TimeoutError);
    expect(mockDestroy).toHaveBeenCalledOnce();
    expect(mockRelease).not.toHaveBeenCalled();
    await driver.close();
  });

  it("maps a server-side max_execution_time error to TimeoutError", async () => {
    mockQuery.mockRejectedValue(new Error("Query execution was interrupted, max_execution_time exceeded"));
    const driver = new MysqlDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    await driver.close();
  });

  it("maps PROTOCOL_CONNECTION_LOST to a retryable ConnectionError", async () => {
    mockQuery.mockRejectedValue(new Error("PROTOCOL_CONNECTION_LOST"));
    const driver = new MysqlDriver(baseConfig);
    const err = await driver
      .executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 100 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.retryable).toBe(true);
    await driver.close();
  });

  it("maps any other error to a non-retryable QueryError", async () => {
    mockQuery.mockRejectedValue(new Error("Unknown column 'nope'"));
    const driver = new MysqlDriver(baseConfig);
    const err = await driver
      .executeQuery({ sql: "SELECT nope", params: [], timeoutMs: 100 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(QueryError);
    expect(err.retryable).toBe(false);
    await driver.close();
  });

  it("raises a ConnectionError when the pool cannot hand out a connection", async () => {
    mockGetConnection.mockRejectedValue(new Error("ECONNREFUSED"));
    const driver = new MysqlDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(ConnectionError);
    await driver.close();
  });
});

describe("MysqlDriver inherited BaseDriver methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnection.mockResolvedValue(connReturning(mockQuery));
  });

  it("healthCheck returns true on SELECT 1 = 1", async () => {
    mockQuery.mockResolvedValue([[{ ok: 1 }], []]);
    const driver = new MysqlDriver(baseConfig);
    expect(await driver.healthCheck()).toBe(true);
    await driver.close();
  });

  it("healthCheck returns false when the query throws", async () => {
    mockQuery.mockRejectedValue(new Error("down"));
    const driver = new MysqlDriver(baseConfig);
    expect(await driver.healthCheck()).toBe(false);
    await driver.close();
  });

  it("describeTable returns columns and indexes", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ column_name: "id", data_type: "int" }], []])
      .mockResolvedValueOnce([[{ index_name: "PRIMARY", column_name: "id" }], []]);
    const driver = new MysqlDriver(baseConfig);
    const r = await driver.describeTable({ tableName: "t", schema: "app" });
    expect(r.columns).toEqual([{ column_name: "id", data_type: "int" }]);
    expect(r.indexes).toEqual([{ index_name: "PRIMARY", column_name: "id" }]);
    await driver.close();
  });
});
