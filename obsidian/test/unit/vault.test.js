import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseNote,
  notePath,
  folderPath,
  listNotes,
  readNote,
  searchNotes,
  writeNote,
  deleteNote,
  MAX_NOTE_BYTES,
} from "../../lib/vault.js";

const PLAN = `---
tags: [project]
status: active
---
# Plan

See [[Roadmap]], [[People/Alice|Alice]] and [[Specs#Scope]].
![[diagram.png]]
[Budget](Finance/Budget%202026.md) and [site](https://example.com) and [top](#plan).
Work on #project/alpha and #todo, not #123.

\`\`\`js
// [[NotALink]] #notatag
\`\`\`
Inline \`#nope\` code.
`;

let tmp; // holds the vault and an "outside" folder side by side
let root;
let outside;

function put(rel, content = "") {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-obsidian-")));
  root = path.join(tmp, "vault");
  outside = path.join(tmp, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret.md"), "top secret");

  put("Projects/Plan.md", PLAN);
  put("Daily/2026-10-15.md", "Meeting with Alice\nnothing else");
  put("Inbox.md", "MEETING notes in caps");
  put(".obsidian/app.json", "{}");
  put(".obsidian/hidden.md", "meeting");
  put("image.png", "png");
  fs.symlinkSync(path.join(outside, "secret.md"), path.join(root, "Escape.md"));
  fs.symlinkSync(outside, path.join(root, "linkdir"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("parseNote", () => {
  it("extracts frontmatter, links, embeds and tags, ignoring code", () => {
    const n = parseNote(PLAN);
    expect(n.frontmatter).toBe("tags: [project]\nstatus: active");
    expect(n.links).toEqual(["Roadmap", "People/Alice", "Specs", "Finance/Budget 2026.md"]);
    expect(n.embeds).toEqual(["diagram.png"]);
    expect(n.tags).toEqual(["project/alpha", "todo"]);
  });

  it("handles empty and missing frontmatter", () => {
    expect(parseNote("---\n---\nbody").frontmatter).toBe("");
    expect(parseNote("no fm here").frontmatter).toBeNull();
    expect(parseNote("text\n---\nnot: fm\n---\n").frontmatter).toBeNull();
  });
});

describe("paths", () => {
  it("appends .md and normalises slashes", () => {
    expect(notePath(root, "/Projects\\Plan")).toBe(path.join(root, "Projects/Plan.md"));
    expect(notePath(root, "Notes/v1.2")).toBe(path.join(root, "Notes/v1.2.md"));
    expect(folderPath(root, "")).toBe(root);
    expect(folderPath(root, "/Daily/")).toBe(path.join(root, "Daily"));
  });

  it("rejects traversal, hidden folders and junk", () => {
    expect(() => notePath(root, "../outside/secret")).toThrow(/not allowed/);
    expect(() => notePath(root, "a/../../x")).toThrow(/not allowed/);
    expect(() => notePath(root, ".obsidian/hidden")).toThrow(/not allowed/);
    expect(() => folderPath(root, ".trash")).toThrow(/not allowed/);
    expect(() => notePath(root, "  ")).toThrow(/required/);
    expect(() => notePath(root, "a\0b")).toThrow(/Invalid path/);
  });
});

describe("listNotes", () => {
  it("lists .md files sorted, skipping hidden entries and symlinks", async () => {
    expect(await listNotes(root, { limit: 100 })).toEqual({
      notes: ["Daily/2026-10-15.md", "Inbox.md", "Projects/Plan.md"],
      total: 3,
    });
  });

  it("filters by folder and applies limit", async () => {
    expect(await listNotes(root, { folder: "Projects", limit: 100 })).toEqual({
      notes: ["Projects/Plan.md"],
      total: 1,
    });
    expect(await listNotes(root, { limit: 1 })).toEqual({
      notes: ["Daily/2026-10-15.md"],
      total: 3,
    });
  });

  it("errors on a missing folder or a symlinked folder", async () => {
    await expect(listNotes(root, { folder: "Nope", limit: 10 })).rejects.toThrow(
      /Folder not found: Nope/,
    );
    await expect(listNotes(root, { folder: "linkdir", limit: 10 })).rejects.toThrow(
      /outside the vault/,
    );
  });
});

describe("readNote", () => {
  it("returns content and metadata", async () => {
    const n = await readNote(root, { path: "Projects/Plan" });
    expect(n.path).toBe("Projects/Plan.md");
    expect(n.content).toBe(PLAN);
    expect(n.size).toBe(Buffer.byteLength(PLAN));
    expect(n.tags).toEqual(["project/alpha", "todo"]);
    expect(n.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refuses symlinks out of the vault", async () => {
    await expect(readNote(root, { path: "Escape.md" })).rejects.toThrow(/outside the vault/);
    await expect(readNote(root, { path: "linkdir/secret.md" })).rejects.toThrow(
      /outside the vault/,
    );
  });

  it("reports missing notes, folders and oversized notes", async () => {
    await expect(readNote(root, { path: "Nope" })).rejects.toThrow(/Note not found: Nope.md/);
    fs.mkdirSync(path.join(root, "Dir.md"));
    await expect(readNote(root, { path: "Dir.md" })).rejects.toThrow(/Not a file/);
    put("Big.md", "x".repeat(MAX_NOTE_BYTES + 1));
    await expect(readNote(root, { path: "Big" })).rejects.toThrow(/read limit/);
  });
});

describe("searchNotes", () => {
  const base = { regex: false, caseSensitive: false, limit: 20 };

  it("matches content case-insensitively and skips hidden notes", async () => {
    const { results, truncated } = await searchNotes(root, { ...base, query: "meeting" });
    expect(truncated).toBe(false);
    expect(results.map((r) => r.path)).toEqual(["Daily/2026-10-15.md", "Inbox.md"]);
    expect(results[0].matches).toEqual([{ line: 1, text: "Meeting with Alice" }]);
  });

  it("honours caseSensitive, folder and pathMatch", async () => {
    const cs = await searchNotes(root, { ...base, query: "MEETING", caseSensitive: true });
    expect(cs.results.map((r) => r.path)).toEqual(["Inbox.md"]);

    const byPath = await searchNotes(root, { ...base, query: "plan", folder: "Projects" });
    expect(byPath.results[0]).toMatchObject({ path: "Projects/Plan.md", pathMatch: true });
  });

  it("supports regex and reports invalid patterns", async () => {
    const r = await searchNotes(root, { ...base, query: "^nothing\\s", regex: true });
    expect(r.results).toEqual([
      {
        path: "Daily/2026-10-15.md",
        pathMatch: false,
        matches: [{ line: 2, text: "nothing else" }],
      },
    ]);
    await expect(searchNotes(root, { ...base, query: "(", regex: true })).rejects.toThrow(
      /Invalid regex/,
    );
  });

  it("stops at limit and caps matches per note", async () => {
    put("Many.md", Array(10).fill("meeting").join("\n"));
    const r = await searchNotes(root, { ...base, query: "meeting", limit: 2 });
    expect(r.truncated).toBe(true);
    expect(r.results).toHaveLength(2);
    const many = await searchNotes(root, { ...base, query: "meeting", folder: "", limit: 20 });
    expect(many.results.find((x) => x.path === "Many.md").matches).toHaveLength(5);
  });

  it("skips oversized notes", async () => {
    put("Big.md", "needle " + "x".repeat(MAX_NOTE_BYTES));
    expect((await searchNotes(root, { ...base, query: "needle" })).results).toEqual([]);
  });
});

describe("writeNote", () => {
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  it("creates notes and missing folders, refusing to clobber", async () => {
    expect(await writeNote(root, { path: "New/Deep/Idea", content: "hi", mode: "create" })).toEqual(
      {
        path: "New/Deep/Idea.md",
        mode: "create",
        bytes: 2,
      },
    );
    expect(read("New/Deep/Idea.md")).toBe("hi");
    await expect(writeNote(root, { path: "Inbox", content: "x", mode: "create" })).rejects.toThrow(
      /already exists/,
    );
  });

  it("overwrites atomically without leaving temp files", async () => {
    await writeNote(root, { path: "Inbox", content: "replaced", mode: "overwrite" });
    expect(read("Inbox.md")).toBe("replaced");
    expect(fs.readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("cleans up the temp file when overwrite fails", async () => {
    fs.mkdirSync(path.join(root, "Folder.md"));
    put("Folder.md/child.md", "keeps the dir non-empty");
    await expect(
      writeNote(root, { path: "Folder", content: "x", mode: "overwrite" }),
    ).rejects.toThrow();
    expect(fs.readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("appends on a new line and creates missing notes", async () => {
    await writeNote(root, { path: "Inbox", content: "- item", mode: "append" });
    expect(read("Inbox.md")).toBe("MEETING notes in caps\n- item");
    await writeNote(root, { path: "Log", content: "first\n", mode: "append" });
    await writeNote(root, { path: "Log", content: "second", mode: "append" });
    expect(read("Log.md")).toBe("first\nsecond");
  });

  it("refuses writes through symlinks and unknown modes", async () => {
    await expect(
      writeNote(root, { path: "linkdir/new", content: "x", mode: "create" }),
    ).rejects.toThrow(/outside the vault/);
    fs.symlinkSync(path.join(outside, "ghost.md"), path.join(root, "Dangling.md"));
    await expect(
      writeNote(root, { path: "Dangling", content: "x", mode: "append" }),
    ).rejects.toThrow(/outside the vault/);
    expect(fs.existsSync(path.join(outside, "ghost.md"))).toBe(false);
    await expect(writeNote(root, { path: "Inbox", content: "x", mode: "nuke" })).rejects.toThrow(
      /Unknown mode/,
    );
  });
});

describe("deleteNote", () => {
  it("moves notes into .trash keeping their folder, never overwriting trash", async () => {
    expect(await deleteNote(root, { path: "Projects/Plan" })).toEqual({
      path: "Projects/Plan.md",
      trashedTo: ".trash/Projects/Plan.md",
    });
    expect(fs.existsSync(path.join(root, "Projects/Plan.md"))).toBe(false);
    expect(fs.readFileSync(path.join(root, ".trash/Projects/Plan.md"), "utf8")).toBe(PLAN);

    put("Projects/Plan.md", "second");
    const again = await deleteNote(root, { path: "Projects/Plan" });
    expect(again.trashedTo).toMatch(/^\.trash\/Projects\/Plan \d+\.md$/);
    expect(fs.readFileSync(path.join(root, ".trash/Projects/Plan.md"), "utf8")).toBe(PLAN);
  });

  it("reports missing notes", async () => {
    await expect(deleteNote(root, { path: "Nope" })).rejects.toThrow(/Note not found/);
  });
});
