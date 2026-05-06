import { describe, it, expect } from "vitest";
import { analyzeQuery } from "../../lib/queryAnalyzer.js";

describe("analyzeQuery", () => {
  it("classifies SELECT", () => {
    const r = analyzeQuery("SELECT * FROM users");
    expect(r.primaryType).toBe("SELECT");
    expect(r.statements).toHaveLength(1);
    expect(r.statements[0].type).toBe("SELECT");
    expect(r.isMultiStatement).toBe(false);
  });

  it("detects LIMIT", () => {
    expect(analyzeQuery("SELECT * FROM t LIMIT 10").hasLimit).toBe(true);
    expect(analyzeQuery("SELECT * FROM t").hasLimit).toBe(false);
  });

  it("detects TOP (SQL Server)", () => {
    expect(analyzeQuery("SELECT TOP 10 * FROM t").hasLimit).toBe(true);
  });

  it("detects FETCH (PostgreSQL/SQL Server)", () => {
    expect(analyzeQuery("SELECT * FROM t FETCH FIRST 10 ROWS ONLY").hasLimit).toBe(true);
  });

  it("classifies INSERT/UPDATE/DELETE", () => {
    expect(analyzeQuery("INSERT INTO t VALUES (1)").primaryType).toBe("INSERT");
    expect(analyzeQuery("UPDATE t SET x = 1").primaryType).toBe("UPDATE");
    expect(analyzeQuery("DELETE FROM t").primaryType).toBe("DELETE");
  });

  it("classifies DDL", () => {
    expect(analyzeQuery("CREATE TABLE t (id INT)").primaryType).toBe("CREATE");
    expect(analyzeQuery("DROP TABLE t").primaryType).toBe("DROP");
    expect(analyzeQuery("TRUNCATE TABLE t").primaryType).toBe("TRUNCATE");
    expect(analyzeQuery("ALTER TABLE t ADD x INT").primaryType).toBe("ALTER");
    expect(analyzeQuery("GRANT SELECT ON t TO u").primaryType).toBe("GRANT");
  });

  it("returns UNKNOWN for unrecognized statement", () => {
    expect(analyzeQuery("WITH x AS (SELECT 1) SELECT * FROM x").primaryType).toBe("SELECT");
    expect(analyzeQuery("FOOBAR baz").primaryType).toBe("UNKNOWN");
  });

  it("handles multi-statement", () => {
    const r = analyzeQuery("SELECT 1; DELETE FROM t");
    expect(r.isMultiStatement).toBe(true);
    expect(r.statements.map((s) => s.type)).toEqual(["SELECT", "DELETE"]);
    // primaryType reflects the strictest required mode (DELETE > SELECT)
    expect(r.primaryType).toBe("DELETE");
  });

  it("ignores comments and string literals when classifying", () => {
    const r = analyzeQuery(
      "-- DROP TABLE bait\n/* DELETE FROM bait */ SELECT 'DROP TABLE bait' AS s"
    );
    expect(r.primaryType).toBe("SELECT");
  });

  it("handles WITH ... DELETE (CTE with DML)", () => {
    const r = analyzeQuery(
      "WITH x AS (SELECT id FROM users WHERE inactive) DELETE FROM users WHERE id IN (SELECT id FROM x)"
    );
    expect(r.primaryType).toBe("DELETE");
  });

  it("trims trailing semicolons and whitespace", () => {
    expect(analyzeQuery("  SELECT 1 ;  ").primaryType).toBe("SELECT");
  });
});
