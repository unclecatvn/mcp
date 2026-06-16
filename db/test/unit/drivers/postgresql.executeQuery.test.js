import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresqlDriver } from "../../../drivers/postgresql.js";
import { TimeoutError, ConnectionError, QueryError } from "../../../lib/errors.js";

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

describe("PostgresqlDriver.executeQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
  });

  it("applies the timeout with a session-level SET, not SET LOCAL", async () => {
    // SET statement_timeout, then the query, then the reset in finally.
    mockQuery
      .mockResolvedValueOnce({}) // SET statement_timeout
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1, fields: [{ name: "ok" }] })
      .mockResolvedValueOnce({}); // SET ... DEFAULT (finally)

    const driver = new PostgresqlDriver(baseConfig);
    await driver.executeQuery({ sql: "SELECT 1 AS ok", params: [], timeoutMs: 12345 });

    const sets = mockQuery.mock.calls.map((c) => c[0]);
    // SET LOCAL would not survive autocommit — the fix must use a session SET.
    expect(sets[0]).toBe("SET statement_timeout = 12345");
    expect(sets[0]).not.toMatch(/SET LOCAL/i);
    // The pooled connection is reset before being released.
    expect(sets).toContain("SET statement_timeout = DEFAULT");
    expect(mockRelease).toHaveBeenCalledOnce();
    await driver.close();
  });

  it("maps a statement-timeout error to TimeoutError", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // SET
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"))
      .mockResolvedValueOnce({}); // reset

    const driver = new PostgresqlDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT pg_sleep(99)", params: [], timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(mockRelease).toHaveBeenCalledOnce();
    await driver.close();
  });

  it("maps a connection-reset error to a retryable ConnectionError", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockResolvedValueOnce({});

    const driver = new PostgresqlDriver(baseConfig);
    const err = await driver
      .executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 100 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.retryable).toBe(true);
    await driver.close();
  });

  it("maps any other error to a non-retryable QueryError", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('relation "nope" does not exist'))
      .mockResolvedValueOnce({});

    const driver = new PostgresqlDriver(baseConfig);
    const err = await driver
      .executeQuery({ sql: "SELECT * FROM nope", params: [], timeoutMs: 100 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(QueryError);
    expect(err.retryable).toBe(false);
    await driver.close();
  });

  it("releases the connection even when the timeout reset throws", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
      .mockRejectedValueOnce(new Error("connection already closed")); // reset fails

    const driver = new PostgresqlDriver(baseConfig);
    await expect(
      driver.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 100 }),
    ).resolves.toBeTruthy();
    expect(mockRelease).toHaveBeenCalledOnce();
    await driver.close();
  });
});
