import { describe, it, expect } from "vitest";
import {
  DbQueryInputSchema,
  DbListTablesInputSchema,
  DbDescribeTableInputSchema,
  DbTestConnectionInputSchema,
  DbQueryHistoryInputSchema,
  DbExplainQueryInputSchema,
  IDENTIFIER_RE,
  resolveDatabaseAlias,
} from "../../lib/validators.js";
import { ValidationError } from "../../lib/errors.js";

describe("DbQueryInputSchema", () => {
  it("accepts minimal valid input", () => {
    const r = DbQueryInputSchema.safeParse({ databaseAlias: "prod", sql: "SELECT 1" });
    expect(r.success).toBe(true);
  });

  it("accepts omitted databaseAlias", () => {
    const r = DbQueryInputSchema.safeParse({ sql: "SELECT 1" });
    expect(r.success).toBe(true);
  });

  it("accepts params as array", () => {
    const r = DbQueryInputSchema.safeParse({
      databaseAlias: "prod",
      sql: "SELECT * FROM t WHERE id = ?",
      params: [42],
    });
    expect(r.success).toBe(true);
  });

  it("accepts params as record", () => {
    const r = DbQueryInputSchema.safeParse({
      databaseAlias: "prod",
      sql: "SELECT :id",
      params: { id: 42 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad alias", () => {
    const r = DbQueryInputSchema.safeParse({ databaseAlias: "1bad-name", sql: "SELECT 1" });
    expect(r.success).toBe(false);
  });

  it("rejects empty sql", () => {
    const r = DbQueryInputSchema.safeParse({ databaseAlias: "prod", sql: "" });
    expect(r.success).toBe(false);
  });

  it("rejects oversized sql", () => {
    const r = DbQueryInputSchema.safeParse({
      databaseAlias: "prod",
      sql: "x".repeat(100_001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-positive maxRows", () => {
    const r = DbQueryInputSchema.safeParse({ databaseAlias: "p", sql: "x", maxRows: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects maxRows above hard cap", () => {
    const r = DbQueryInputSchema.safeParse({ databaseAlias: "p", sql: "x", maxRows: 2_000_000 });
    expect(r.success).toBe(false);
  });

  it("rejects timeoutMs above hard cap", () => {
    const r = DbQueryInputSchema.safeParse({ databaseAlias: "p", sql: "x", timeoutMs: 700_000 });
    expect(r.success).toBe(false);
  });
});

describe("DbDescribeTableInputSchema", () => {
  it("accepts valid identifier", () => {
    const r = DbDescribeTableInputSchema.safeParse({
      databaseAlias: "prod",
      tableName: "users",
    });
    expect(r.success).toBe(true);
  });

  it("rejects identifier with quotes", () => {
    const r = DbDescribeTableInputSchema.safeParse({
      databaseAlias: "prod",
      tableName: "users'; DROP TABLE x;--",
    });
    expect(r.success).toBe(false);
  });
});

describe("IDENTIFIER_RE", () => {
  it("accepts ascii identifier", () => {
    expect(IDENTIFIER_RE.test("users_v2")).toBe(true);
  });
  it("rejects starting with digit", () => {
    expect(IDENTIFIER_RE.test("1users")).toBe(false);
  });
  it("rejects special chars", () => {
    expect(IDENTIFIER_RE.test("us-ers")).toBe(false);
    expect(IDENTIFIER_RE.test("us.ers")).toBe(false);
  });
});

describe("simple schemas", () => {
  it("DbListTablesInputSchema accepts alias only", () => {
    expect(DbListTablesInputSchema.safeParse({ databaseAlias: "prod" }).success).toBe(true);
  });
  it("DbListTablesInputSchema accepts pagination filters", () => {
    expect(
      DbListTablesInputSchema.safeParse({
        databaseAlias: "prod",
        limit: 50,
        offset: 10,
        namePattern: "sale_%",
      }).success,
    ).toBe(true);
  });
  it("DbListTablesInputSchema rejects invalid namePattern", () => {
    expect(
      DbListTablesInputSchema.safeParse({ databaseAlias: "prod", namePattern: "sale-*" }).success,
    ).toBe(false);
  });
  it("DbTestConnectionInputSchema accepts alias only", () => {
    expect(DbTestConnectionInputSchema.safeParse({ databaseAlias: "prod" }).success).toBe(true);
  });
  it("DbQueryHistoryInputSchema accepts empty", () => {
    expect(DbQueryHistoryInputSchema.safeParse({}).success).toBe(true);
  });
  it("DbExplainQueryInputSchema requires sql", () => {
    expect(DbExplainQueryInputSchema.safeParse({ databaseAlias: "p" }).success).toBe(false);
    expect(
      DbExplainQueryInputSchema.safeParse({ databaseAlias: "p", sql: "SELECT 1" }).success,
    ).toBe(true);
  });
});

describe("resolveDatabaseAlias", () => {
  it("falls back to defaultAlias", async () => {
    const resolved = await resolveDatabaseAlias({ sql: "SELECT 1" }, "prod", "db_query");
    expect(resolved.databaseAlias).toBe("prod");
  });

  it("throws when alias cannot be resolved", async () => {
    await expect(
      resolveDatabaseAlias({ sql: "SELECT 1" }, undefined, "db_query"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
