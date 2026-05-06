import { describe, it, expect } from "vitest";
import { convertParams } from "../../lib/paramConverter.js";
import { ValidationError } from "../../lib/errors.js";

describe("convertParams — positional ?", () => {
  it("passthrough for mysql", () => {
    const r = convertParams("SELECT * FROM t WHERE a=? AND b=?", [1, 2], "mysql");
    expect(r.sql).toBe("SELECT * FROM t WHERE a=? AND b=?");
    expect(r.params).toEqual([1, 2]);
  });

  it("converts ? to $N for postgresql", () => {
    const r = convertParams("SELECT * FROM t WHERE a=? AND b=?", [1, 2], "postgresql");
    expect(r.sql).toBe("SELECT * FROM t WHERE a=$1 AND b=$2");
    expect(r.params).toEqual([1, 2]);
  });

  it("converts ? to @pN for sqlserver", () => {
    const r = convertParams("SELECT * FROM t WHERE a=? AND b=?", [1, 2], "sqlserver");
    expect(r.sql).toBe("SELECT * FROM t WHERE a=@p1 AND b=@p2");
    expect(r.params).toEqual({ p1: 1, p2: 2 });
  });

  it("ignores ? inside a string literal", () => {
    const r = convertParams("SELECT 'a?b' FROM t WHERE x=?", [1], "postgresql");
    expect(r.sql).toBe("SELECT 'a?b' FROM t WHERE x=$1");
    expect(r.params).toEqual([1]);
  });

  it("ignores ? inside a -- comment", () => {
    const r = convertParams("SELECT 1 -- ?\n WHERE x=?", [1], "postgresql");
    expect(r.sql).toBe("SELECT 1 -- ?\n WHERE x=$1");
  });

  it("ignores ? inside a /* */ comment", () => {
    const r = convertParams("SELECT 1 /* ? */ WHERE x=?", [1], "postgresql");
    expect(r.sql).toBe("SELECT 1 /* ? */ WHERE x=$1");
  });

  it("rejects mismatched param count (too few)", () => {
    expect(() => convertParams("WHERE a=? AND b=?", [1], "postgresql")).toThrow(ValidationError);
  });

  it("rejects mismatched param count (too many)", () => {
    expect(() => convertParams("WHERE a=?", [1, 2], "postgresql")).toThrow(ValidationError);
  });
});

describe("convertParams — named :name", () => {
  it("converts :name to $N for postgresql, reordering params", () => {
    const r = convertParams("WHERE a=:x AND b=:y AND c=:x", { x: 1, y: 2 }, "postgresql");
    expect(r.sql).toBe("WHERE a=$1 AND b=$2 AND c=$1");
    expect(r.params).toEqual([1, 2]);
  });

  it("converts :name to ? for mysql with reordered values", () => {
    const r = convertParams("WHERE a=:x AND b=:y AND c=:x", { x: 1, y: 2 }, "mysql");
    expect(r.sql).toBe("WHERE a=? AND b=? AND c=?");
    expect(r.params).toEqual([1, 2, 1]);
  });

  it("keeps @name native for sqlserver", () => {
    const r = convertParams("WHERE a=:x AND b=:y", { x: 1, y: 2 }, "sqlserver");
    expect(r.sql).toBe("WHERE a=@x AND b=@y");
    expect(r.params).toEqual({ x: 1, y: 2 });
  });

  it("rejects :name when params is array", () => {
    expect(() => convertParams("WHERE a=:x", [1], "postgresql")).toThrow(ValidationError);
  });

  it("rejects unknown :name", () => {
    expect(() => convertParams("WHERE a=:x AND b=:y", { x: 1 }, "postgresql")).toThrow(
      ValidationError,
    );
  });

  it("ignores :foo inside a string literal", () => {
    const r = convertParams("SELECT ':x' FROM t WHERE a=:x", { x: 1 }, "postgresql");
    expect(r.sql).toBe("SELECT ':x' FROM t WHERE a=$1");
    expect(r.params).toEqual([1]);
  });

  it("does not match :: cast operator", () => {
    const r = convertParams("SELECT id::text FROM t WHERE id=:id", { id: 5 }, "postgresql");
    expect(r.sql).toBe("SELECT id::text FROM t WHERE id=$1");
    expect(r.params).toEqual([5]);
  });
});

describe("convertParams — empty params", () => {
  it("works with no placeholders and no params", () => {
    const r = convertParams("SELECT 1", undefined, "postgresql");
    expect(r.sql).toBe("SELECT 1");
    expect(r.params).toEqual([]);
  });
  it("rejects placeholder when no params provided", () => {
    expect(() => convertParams("WHERE a=?", undefined, "postgresql")).toThrow(ValidationError);
  });
});

describe("convertParams — mariadb routes through mysql logic", () => {
  it("passthrough ?", () => {
    expect(convertParams("WHERE a=?", [1], "mariadb").sql).toBe("WHERE a=?");
  });
});
