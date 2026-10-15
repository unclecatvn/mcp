import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "../../lib/config.js";

let dir;
beforeAll(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-obsidian-cfg-")));
  fs.writeFileSync(path.join(dir, "file.md"), "");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("parseEnv", () => {
  it("loads vaults, defaulting to readonly", () => {
    const { vaults, errors } = parseEnv({
      OBSIDIAN_MAIN_PATH: ` ${dir} `,
      OBSIDIAN_WORK_PATH: dir,
      OBSIDIAN_WORK_MODE: "ReadWrite",
      UNRELATED: "x",
    });
    expect(errors).toEqual([]);
    expect(vaults).toEqual({
      main: { name: "main", root: dir, mode: "readonly" },
      work: { name: "work", root: dir, mode: "readwrite" },
    });
  });

  it("warns on unknown mode and falls back to readonly", () => {
    const { vaults, errors } = parseEnv({ OBSIDIAN_MAIN_PATH: dir, OBSIDIAN_MAIN_MODE: "yolo" });
    expect(vaults.main.mode).toBe("readonly");
    expect(errors).toEqual([expect.objectContaining({ name: "main", severity: "warn" })]);
  });

  it("skips empty, relative, missing and non-directory paths", () => {
    const { vaults, errors } = parseEnv({
      OBSIDIAN_EMPTY_PATH: "  ",
      OBSIDIAN_REL_PATH: "vault",
      OBSIDIAN_GONE_PATH: path.join(dir, "nope"),
      OBSIDIAN_FILE_PATH: path.join(dir, "file.md"),
    });
    expect(vaults).toEqual({});
    expect(errors.map((e) => [e.name, e.severity])).toEqual([
      ["rel", "error"],
      ["gone", "error"],
      ["file", "error"],
    ]);
    expect(errors[0].message).toMatch(/absolute/);
    expect(errors[2].message).toMatch(/not a directory/);
  });
});
