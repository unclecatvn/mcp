import { describe, it, expect } from "vitest";
import { createDriver, DRIVERS } from "../../../drivers/index.js";

describe("createDriver", () => {
  const base = {
    alias: "x",
    host: "localhost",
    port: 5432,
    database: "db",
    mode: "readonly",
    ssl: "prefer",
    timeoutMs: 30000,
    maxRows: 10000,
    poolMax: 5,
  };

  it("routes postgresql to PostgresqlDriver", () => {
    const d = createDriver({ ...base, type: "postgresql" });
    expect(d).toBeInstanceOf(DRIVERS.postgresql);
  });

  it("routes mariadb to MysqlDriver", () => {
    const d = createDriver({ ...base, type: "mariadb", port: 3306 });
    expect(d).toBeInstanceOf(DRIVERS.mysql);
  });

  it("maps sqlserver to SqlServerDriver", () => {
    expect(DRIVERS.sqlserver.name).toBe("SqlServerDriver");
  });

  it("throws for unknown type", () => {
    expect(() => createDriver({ ...base, type: "sqlite" })).toThrow(/Unknown driver type/);
  });
});

describe("BaseDriver", () => {
  it("cannot be instantiated directly", async () => {
    const { BaseDriver } = await import("../../../drivers/BaseDriver.js");
    expect(() => new BaseDriver({})).toThrow(/abstract/);
  });
});
