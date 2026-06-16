import { describe, it, expect } from "vitest";
import { buildListTablesQuery, mapListTablesRow } from "../../lib/tableListingSql.js";

describe("buildListTablesQuery", () => {
  it("builds a paginated PostgreSQL query with schema and pattern", () => {
    const q = buildListTablesQuery("postgresql", {
      schema: "public",
      namePattern: "sale_%",
      limit: 2,
      offset: 1,
    });
    expect(q.paramStyle).toBe("array");
    expect(q.sql).toContain("table_schema = $1");
    expect(q.sql).toContain("table_name LIKE $2");
    expect(q.params).toEqual(["public", "sale_%", 3, 1]);
    expect(q.paging).toMatchObject({ limit: 2, offset: 1, fetchLimit: 3 });
  });

  it("builds a MySQL query using DATABASE() when schema is omitted", () => {
    const q = buildListTablesQuery("mysql", { limit: 10 });
    expect(q.sql).toContain("table_schema = DATABASE()");
    expect(q.params).toEqual([11, 0]);
  });

  it("builds a SQL Server named-parameter query", () => {
    const q = buildListTablesQuery("sqlserver", {
      schema: "dbo",
      namePattern: "sale_%",
      limit: 25,
      offset: 5,
    });
    expect(q.paramStyle).toBe("named");
    expect(q.params).toEqual({
      schema: "dbo",
      namePattern: "sale_%",
      offset: 5,
      fetchLimit: 26,
    });
  });
});

describe("mapListTablesRow", () => {
  it("normalizes PostgreSQL rows", () => {
    expect(mapListTablesRow("postgresql", { table_schema: "public", table_name: "sale_order" })).toEqual({
      name: "sale_order",
      schema: "public",
    });
  });

  it("normalizes SQL Server rows", () => {
    expect(mapListTablesRow("sqlserver", { TABLE_SCHEMA: "dbo", TABLE_NAME: "Orders" })).toEqual({
      name: "Orders",
      schema: "dbo",
    });
  });
});
