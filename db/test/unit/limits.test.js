import { describe, it, expect } from "vitest";
import { applyRowLimit, resolveTimeout, resolveMaxRows } from "../../lib/limits.js";

describe("applyRowLimit", () => {
  it("appends LIMIT to a SELECT without one", () => {
    const r = applyRowLimit(
      { primaryType: "SELECT", hasLimit: false, isMultiStatement: false },
      "SELECT * FROM users",
      100,
      "postgresql",
    );
    expect(r.sql).toMatch(/LIMIT 101$/);
    expect(r.fetchPlusOne).toBe(true);
  });

  it("does not modify SELECT that already has LIMIT", () => {
    const r = applyRowLimit(
      { primaryType: "SELECT", hasLimit: true, isMultiStatement: false },
      "SELECT * FROM t LIMIT 5",
      100,
      "postgresql",
    );
    expect(r.sql).toBe("SELECT * FROM t LIMIT 5");
    expect(r.fetchPlusOne).toBe(false);
  });

  it("does not modify non-SELECT", () => {
    const r = applyRowLimit(
      { primaryType: "INSERT", hasLimit: false, isMultiStatement: false },
      "INSERT INTO t VALUES (1)",
      100,
      "postgresql",
    );
    expect(r.sql).toBe("INSERT INTO t VALUES (1)");
    expect(r.fetchPlusOne).toBe(false);
  });

  it("does not modify multi-statement queries", () => {
    const r = applyRowLimit(
      { primaryType: "SELECT", hasLimit: false, isMultiStatement: true },
      "SELECT 1; SELECT 2",
      100,
      "postgresql",
    );
    expect(r.sql).toBe("SELECT 1; SELECT 2");
    expect(r.fetchPlusOne).toBe(false);
  });

  it("uses TOP for sqlserver instead of LIMIT", () => {
    const r = applyRowLimit(
      { primaryType: "SELECT", hasLimit: false, isMultiStatement: false },
      "SELECT * FROM t",
      100,
      "sqlserver",
    );
    expect(r.sql).toMatch(/^SELECT TOP 101 \* FROM t$/);
    expect(r.fetchPlusOne).toBe(true);
  });

  it("strips trailing semicolons before appending LIMIT", () => {
    const r = applyRowLimit(
      { primaryType: "SELECT", hasLimit: false, isMultiStatement: false },
      "SELECT * FROM t;",
      100,
      "mysql",
    );
    expect(r.sql).toBe("SELECT * FROM t LIMIT 101");
  });
});

describe("resolveTimeout", () => {
  it("uses request override if present and within hard cap", () => {
    expect(resolveTimeout(5000, 30000)).toBe(5000);
  });
  it("falls back to alias default when override missing", () => {
    expect(resolveTimeout(undefined, 30000)).toBe(30000);
  });
  it("clamps override to hard cap of 600000", () => {
    expect(resolveTimeout(900_000, 30000)).toBe(600_000);
  });
});

describe("resolveMaxRows", () => {
  it("uses request override when smaller than alias", () => {
    expect(resolveMaxRows(50, 10000)).toBe(50);
  });
  it("falls back to alias default", () => {
    expect(resolveMaxRows(undefined, 10000)).toBe(10000);
  });
  it("clamps to hard cap of 1_000_000", () => {
    expect(resolveMaxRows(2_000_000, 10000)).toBe(1_000_000);
  });
});
