import { describe, it, expect } from "vitest";
import {
  buildPageResponse,
  resolveListPaging,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} from "../../lib/tableListing.js";

describe("resolveListPaging", () => {
  it("uses defaults", () => {
    expect(resolveListPaging()).toEqual({
      limit: DEFAULT_LIST_LIMIT,
      offset: 0,
      fetchLimit: DEFAULT_LIST_LIMIT + 1,
    });
  });

  it("clamps limit to MAX_LIST_LIMIT", () => {
    expect(resolveListPaging({ limit: 9999 }).limit).toBe(MAX_LIST_LIMIT);
  });

  it("normalizes negative offset to zero", () => {
    expect(resolveListPaging({ offset: -5 }).offset).toBe(0);
  });
});

describe("buildPageResponse", () => {
  const paging = { limit: 2, offset: 1 };

  it("detects hasMore when extra row is present", () => {
    const rows = [
      { name: "b", schema: "public" },
      { name: "c", schema: "public" },
      { name: "d", schema: "public" },
    ];
    expect(buildPageResponse(rows, paging)).toEqual({
      tables: rows.slice(0, 2),
      limit: 2,
      offset: 1,
      hasMore: true,
    });
  });

  it("returns hasMore false at end", () => {
    const rows = [{ name: "a", schema: "public" }];
    expect(buildPageResponse(rows, paging)).toEqual({
      tables: rows,
      limit: 2,
      offset: 1,
      hasMore: false,
    });
  });
});
