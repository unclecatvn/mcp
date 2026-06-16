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
      "-- DROP TABLE bait\n/* DELETE FROM bait */ SELECT 'DROP TABLE bait' AS s",
    );
    expect(r.primaryType).toBe("SELECT");
  });

  it("handles WITH ... DELETE (CTE with DML)", () => {
    const r = analyzeQuery(
      "WITH x AS (SELECT id FROM users WHERE inactive) DELETE FROM users WHERE id IN (SELECT id FROM x)",
    );
    expect(r.primaryType).toBe("DELETE");
  });

  it("trims trailing semicolons and whitespace", () => {
    expect(analyzeQuery("  SELECT 1 ;  ").primaryType).toBe("SELECT");
  });

  describe("EXPLAIN effectiveType (mode-bypass guard)", () => {
    it("surfaces EXPLAIN as type but the inner verb as effectiveType", () => {
      const r = analyzeQuery("EXPLAIN SELECT * FROM t");
      expect(r.statements[0].type).toBe("EXPLAIN");
      expect(r.statements[0].effectiveType).toBe("SELECT");
      expect(r.primaryType).toBe("EXPLAIN");
    });

    it("classifies EXPLAIN ANALYZE DELETE as a write via effectiveType", () => {
      const r = analyzeQuery("EXPLAIN ANALYZE DELETE FROM t");
      expect(r.statements[0].type).toBe("EXPLAIN");
      expect(r.statements[0].effectiveType).toBe("DELETE");
    });

    it("sees through the Postgres parenthesized option list", () => {
      const r = analyzeQuery("EXPLAIN (ANALYZE, BUFFERS) UPDATE t SET x = 1");
      expect(r.statements[0].effectiveType).toBe("UPDATE");
    });

    it("sees through VERBOSE and MySQL FORMAT=JSON wrappers", () => {
      expect(analyzeQuery("EXPLAIN VERBOSE INSERT INTO t VALUES (1)").statements[0].effectiveType).toBe(
        "INSERT",
      );
      expect(analyzeQuery("EXPLAIN FORMAT=JSON DROP TABLE t").statements[0].effectiveType).toBe("DROP");
    });

    it("unwraps EXPLAIN over a data-modifying CTE", () => {
      const r = analyzeQuery(
        "EXPLAIN ANALYZE WITH x AS (SELECT id FROM t) DELETE FROM t WHERE id IN (SELECT id FROM x)",
      );
      expect(r.statements[0].effectiveType).toBe("DELETE");
    });

    it("keeps bare EXPLAIN readonly via effectiveType", () => {
      expect(analyzeQuery("EXPLAIN").statements[0].effectiveType).toBe("EXPLAIN");
    });
  });
});
