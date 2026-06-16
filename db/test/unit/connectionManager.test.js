import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionRegistry } from "../../lib/connectionManager.js";
import { ConnectionError } from "../../lib/errors.js";

const mockDriver = {
  executeQuery: vi.fn(),
  listTables: vi.fn(),
  describeTable: vi.fn(),
  healthCheck: vi.fn(),
  close: vi.fn(),
};

vi.mock("../../drivers/index.js", () => ({
  createDriver: vi.fn(() => mockDriver),
}));

describe("ConnectionRegistry", () => {
  const aliases = {
    prod: {
      alias: "prod",
      type: "postgresql",
      host: "localhost",
      port: 5432,
      database: "app",
      mode: "readonly",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDriver.executeQuery.mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1, columns: [] });
  });

  it("throws ConnectionError for unknown alias", () => {
    const reg = new ConnectionRegistry(aliases);
    expect(() => reg.getConfig("missing")).toThrow(ConnectionError);
  });

  it("creates driver lazily and reuses it", async () => {
    const reg = new ConnectionRegistry(aliases);
    await reg.withRetry("prod", (d) => d.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 1000 }));
    await reg.withRetry("prod", (d) => d.executeQuery({ sql: "SELECT 2", params: [], timeoutMs: 1000 }));
    expect(mockDriver.executeQuery).toHaveBeenCalledTimes(2);
  });

  it("retries on retryable errors and recreates driver", async () => {
    const reg = new ConnectionRegistry(aliases);
    const err = new ConnectionError("boom", { alias: "prod" });
    mockDriver.executeQuery
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1, columns: [] });

    const { result, retries } = await reg.withRetry("prod", (d) =>
      d.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 1000 }),
    );

    expect(retries).toBe(1);
    expect(result.rows).toEqual([{ ok: 1 }]);
    expect(mockDriver.close).toHaveBeenCalledTimes(1);
  });

  it("closeAll closes every driver", async () => {
    const reg = new ConnectionRegistry(aliases);
    await reg.withRetry("prod", (d) => d.executeQuery({ sql: "SELECT 1", params: [], timeoutMs: 1000 }));
    await reg.closeAll();
    expect(mockDriver.close).toHaveBeenCalledTimes(1);
  });
});
