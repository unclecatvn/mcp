import { describe, it, expect } from "vitest";
import { enforceMode } from "../../lib/modeEnforcer.js";
import { PermissionDeniedError } from "../../lib/errors.js";

const sel = { primaryType: "SELECT", isMultiStatement: false, statements: [{ type: "SELECT" }] };
const ins = { primaryType: "INSERT", isMultiStatement: false, statements: [{ type: "INSERT" }] };
const upd = { primaryType: "UPDATE", isMultiStatement: false, statements: [{ type: "UPDATE" }] };
const del = { primaryType: "DELETE", isMultiStatement: false, statements: [{ type: "DELETE" }] };
const ddl = { primaryType: "DROP", isMultiStatement: false, statements: [{ type: "DROP" }] };
const unk = { primaryType: "UNKNOWN", isMultiStatement: false, statements: [{ type: "UNKNOWN" }] };
const multi = {
  primaryType: "DELETE",
  isMultiStatement: true,
  statements: [{ type: "SELECT" }, { type: "DELETE" }],
};

describe("enforceMode — readonly", () => {
  it("allows SELECT", () => {
    expect(() => enforceMode(sel, "readonly", "prod")).not.toThrow();
  });
  it("blocks INSERT", () => {
    expect(() => enforceMode(ins, "readonly", "prod")).toThrow(PermissionDeniedError);
  });
  it("blocks UPDATE", () => {
    expect(() => enforceMode(upd, "readonly", "prod")).toThrow(PermissionDeniedError);
  });
  it("blocks DELETE", () => {
    expect(() => enforceMode(del, "readonly", "prod")).toThrow(PermissionDeniedError);
  });
  it("blocks DROP", () => {
    expect(() => enforceMode(ddl, "readonly", "prod")).toThrow(PermissionDeniedError);
  });
  it("blocks UNKNOWN (deny by default)", () => {
    expect(() => enforceMode(unk, "readonly", "prod")).toThrow(PermissionDeniedError);
  });
});

describe("enforceMode — readwrite", () => {
  it("allows SELECT", () => {
    expect(() => enforceMode(sel, "readwrite", "prod")).not.toThrow();
  });
  it("allows INSERT/UPDATE/DELETE", () => {
    expect(() => enforceMode(ins, "readwrite", "prod")).not.toThrow();
    expect(() => enforceMode(upd, "readwrite", "prod")).not.toThrow();
    expect(() => enforceMode(del, "readwrite", "prod")).not.toThrow();
  });
  it("blocks DDL", () => {
    expect(() => enforceMode(ddl, "readwrite", "prod")).toThrow(PermissionDeniedError);
  });
  it("blocks UNKNOWN", () => {
    expect(() => enforceMode(unk, "readwrite", "prod")).toThrow(PermissionDeniedError);
  });
});

describe("enforceMode — readwrite+ddl", () => {
  it("allows everything except UNKNOWN", () => {
    expect(() => enforceMode(sel, "readwrite+ddl", "prod")).not.toThrow();
    expect(() => enforceMode(ins, "readwrite+ddl", "prod")).not.toThrow();
    expect(() => enforceMode(ddl, "readwrite+ddl", "prod")).not.toThrow();
  });
  it("blocks UNKNOWN even at +ddl (defensive)", () => {
    expect(() => enforceMode(unk, "readwrite+ddl", "prod")).toThrow(PermissionDeniedError);
  });
});

describe("enforceMode — multi-statement", () => {
  it("uses strictest required mode", () => {
    expect(() => enforceMode(multi, "readonly", "prod")).toThrow(PermissionDeniedError);
    expect(() => enforceMode(multi, "readwrite", "prod")).not.toThrow();
  });
});

describe("enforceMode — EXPLAIN effectiveType", () => {
  // EXPLAIN ANALYZE <write> executes the write on PostgreSQL; the gate must use
  // effectiveType, not the readonly-looking surface type "EXPLAIN".
  const explainDelete = {
    primaryType: "EXPLAIN",
    isMultiStatement: false,
    statements: [{ type: "EXPLAIN", effectiveType: "DELETE" }],
  };
  const explainSelect = {
    primaryType: "EXPLAIN",
    isMultiStatement: false,
    statements: [{ type: "EXPLAIN", effectiveType: "SELECT" }],
  };

  it("denies an EXPLAIN-wrapped write on a readonly alias", () => {
    expect(() => enforceMode(explainDelete, "readonly", "prod")).toThrow(PermissionDeniedError);
  });

  it("reports the inner operation in the error, not EXPLAIN", () => {
    try {
      enforceMode(explainDelete, "readonly", "prod");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.details.operation).toBe("DELETE");
      expect(err.details.requiredMode).toBe("readwrite");
    }
  });

  it("still allows an EXPLAIN over a SELECT on readonly", () => {
    expect(() => enforceMode(explainSelect, "readonly", "prod")).not.toThrow();
  });
});

describe("enforceMode — error message", () => {
  it("includes alias, op, current mode, and env fix hint", () => {
    try {
      enforceMode(del, "readonly", "prod");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      expect(err.message).toMatch(/prod/);
      expect(err.message).toMatch(/DELETE/);
      expect(err.message).toMatch(/readonly/);
      expect(err.message).toMatch(/DB_PROD_MODE/);
      expect(err.details).toEqual({
        alias: "prod",
        operation: "DELETE",
        currentMode: "readonly",
        requiredMode: "readwrite",
      });
    }
  });

  it("includes JSON config fix hint when configSource is config_file", () => {
    try {
      enforceMode(del, "readonly", "prod", { configSource: "config_file" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.message).toMatch(/aliases\.prod\.mode/);
      expect(err.message).not.toMatch(/DB_PROD_MODE/);
    }
  });
});
