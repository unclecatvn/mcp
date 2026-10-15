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
  getBacklinks,
  patchNote,
  dailyNote,
  formatDate,
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
    expect(n.frontmatter).toEqual({ tags: ["project"], status: "active" });
    expect(n.links).toEqual(["Roadmap", "People/Alice", "Specs", "Finance/Budget 2026.md"]);
    expect(n.embeds).toEqual(["diagram.png"]);
    expect(n.tags).toEqual(["project", "project/alpha", "todo"]);
  });

  it("handles empty, missing and invalid frontmatter", () => {
    expect(parseNote("---\n---\nbody").frontmatter).toEqual({});
    expect(parseNote("no fm here").frontmatter).toBeNull();
    expect(parseNote("text\n---\nnot: fm\n---\n").frontmatter).toBeNull();
    const bad = parseNote("---\na: 1\na: 2\n---\n#ok");
    expect(bad.frontmatter).toBeNull();
    expect(bad.frontmatterError).toMatch(/unique/);
    expect(bad.tags).toEqual(["ok"]);
    expect(parseNote("---\n- a\n---\n").frontmatterError).toMatch(/key\/value/);
  });

  it("merges string-form frontmatter tags", () => {
    expect(parseNote("---\ntags: '#a, b c'\n---\n#d").tags).toEqual(["a", "b", "c", "d"]);
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
    expect(n.tags).toEqual(["project", "project/alpha", "todo"]);
    expect(n.frontmatter.status).toBe("active");
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

  it("filters by tag (including nested) and frontmatter values", async () => {
    put("Other.md", "---\nstatus: [active, old]\npriority: 1\n---\n#Project/beta meeting");
    const paths = async (args) =>
      (await searchNotes(root, { ...base, ...args })).results.map((r) => r.path);
    expect(await paths({ tag: "#project" })).toEqual(["Other.md", "Projects/Plan.md"]);
    expect(await paths({ tag: "project/alpha" })).toEqual(["Projects/Plan.md"]);
    expect(await paths({ frontmatter: { status: "active" } })).toEqual([
      "Other.md",
      "Projects/Plan.md",
    ]);
    expect(await paths({ frontmatter: { status: "active", priority: 1 } })).toEqual(["Other.md"]);
    expect(await paths({ query: "meeting", tag: "project" })).toEqual(["Other.md"]);
    expect(await paths({ query: "meeting", tag: "nope" })).toEqual([]);
    const listed = await searchNotes(root, { ...base, tag: "todo" });
    expect(listed.results).toEqual([{ path: "Projects/Plan.md", pathMatch: false, matches: [] }]);
    await expect(searchNotes(root, base)).rejects.toThrow(/Pass query, tag or frontmatter/);
  });
});

describe("getBacklinks", () => {
  it("finds wikilinks, embeds, path and relative links with line numbers", async () => {
    put(
      "Daily/2026-10-16.md",
      "---\nrel: x\n---\nreview [[plan#Scope|the plan]]\n```\n[[Plan]]\n```\n![[Projects/Plan.md]]\r\n`[[Plan]]`",
    );
    put(
      "Projects/Notes.md",
      "see [it](Plan.md) and [up](../Projects/Plan) and [x](/Projects/Plan)",
    );
    put("Archive/Plan.md", "same basename, no links");
    put("Misc.md", "[[Other/Plan]] [[Planner]] [web](https://x.com/Plan.md)");

    const r = await getBacklinks(root, { path: "Projects/Plan", limit: 100 });
    expect(r).toEqual({
      path: "Projects/Plan.md",
      truncated: false,
      backlinks: [
        {
          path: "Daily/2026-10-16.md",
          matches: [
            { line: 4, text: "review [[plan#Scope|the plan]]" },
            { line: 8, text: "![[Projects/Plan.md]]" },
          ],
        },
        { path: "Projects/Notes.md", matches: [{ line: 1, text: expect.stringMatching(/^see/) }] },
      ],
    });
  });

  it("stops at limit and works for notes that do not exist yet", async () => {
    put("A.md", "[[Ghost]]");
    put("B.md", "[[ghost]]");
    const r = await getBacklinks(root, { path: "Ghost", limit: 1 });
    expect(r.truncated).toBe(true);
    expect(r.backlinks.map((b) => b.path)).toEqual(["A.md"]);
  });

  it("skips oversized notes and refuses escaping paths", async () => {
    put("Big.md", "[[Inbox]] " + "x".repeat(MAX_NOTE_BYTES));
    expect((await getBacklinks(root, { path: "Inbox", limit: 10 })).backlinks).toEqual([]);
    await expect(getBacklinks(root, { path: "linkdir/secret", limit: 10 })).rejects.toThrow(
      /outside the vault/,
    );
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

describe("patchNote", () => {
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const DOC = [
    "---",
    "status: active # keep",
    "tags: [a]",
    "---",
    "# Title",
    "intro",
    "## Tasks",
    "- one",
    "### Sub",
    "- sub",
    "",
    "## Notes",
    "```sh",
    "## not a heading",
    "```",
    "",
  ].join("\n");

  it("appends to and replaces a section, leaving the rest byte-identical", async () => {
    put("Doc.md", DOC);
    expect(await patchNote(root, { path: "Doc", heading: "Tasks", content: "- two\n" })).toEqual({
      path: "Doc.md",
      bytes: Buffer.byteLength(read("Doc.md")),
    });
    expect(read("Doc.md")).toBe(DOC.replace("- sub\n", "- sub\n- two\n"));

    // "- two" landed at the end of Tasks, which is inside its ### Sub.
    await patchNote(root, { path: "Doc", heading: "### Sub", content: "- new", mode: "replace" });
    expect(read("Doc.md")).toBe(DOC.replace("- sub\n", "- new\n"));

    await patchNote(root, { path: "Doc", heading: "Notes", content: "end" });
    expect(read("Doc.md")).toBe(DOC.replace("- sub\n", "- new\n").replace(/```\n$/, "```\nend\n"));

    await patchNote(root, { path: "Doc", heading: "Tasks", content: "", mode: "replace" });
    expect(read("Doc.md")).toMatch(/## Tasks\n\n## Notes/);
    expect(fs.readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps CRLF and a missing final newline", async () => {
    put("Crlf.md", "# A\r\nold\r\n# B\r\nlast");
    await patchNote(root, { path: "Crlf", heading: "B", content: "x\ny" });
    expect(read("Crlf.md")).toBe("# A\r\nold\r\n# B\r\nlast\r\nx\r\ny");
    await patchNote(root, { path: "Crlf", heading: "A", content: "new", mode: "replace" });
    expect(read("Crlf.md")).toBe("# A\r\nnew\r\n# B\r\nlast\r\nx\r\ny");
  });

  it("sets and deletes frontmatter keys, keeping comments and the body", async () => {
    put("Doc.md", DOC);
    const body = DOC.slice(DOC.indexOf("# Title"));
    await patchNote(root, { path: "Doc", frontmatter: { tags: null, due: "2026-11-01" } });
    expect(read("Doc.md")).toBe("---\nstatus: active # keep\ndue: 2026-11-01\n---\n" + body);

    await patchNote(root, { path: "Doc", frontmatter: { status: null, due: null } });
    expect(read("Doc.md")).toBe(body);

    await patchNote(root, { path: "Doc", frontmatter: { list: ["x"] } });
    expect(read("Doc.md")).toBe("---\nlist:\n  - x\n---\n" + body);

    put("Crlf.md", "---\r\na: 1\r\n---\r\nbody");
    await patchNote(root, { path: "Crlf", frontmatter: { b: true } });
    expect(read("Crlf.md")).toBe("---\r\na: 1\r\nb: true\r\n---\r\nbody");
  });

  it("reports bad input, unknown and duplicate headings, and broken YAML", async () => {
    put("Doc.md", DOC);
    put("Dup.md", "## X\n## X\n");
    put("Bad.md", "---\na: [\n---\n");
    put("List.md", "---\n- a\n---\n");
    await expect(patchNote(root, { path: "Doc" })).rejects.toThrow(/Pass heading/);
    await expect(patchNote(root, { path: "Doc", heading: "Tasks" })).rejects.toThrow(
      /content is required/,
    );
    await expect(patchNote(root, { path: "Doc", heading: "Nope", content: "x" })).rejects.toThrow(
      /not found\. Headings: Title, Tasks, Sub, Notes/,
    );
    await expect(patchNote(root, { path: "Dup", heading: "X", content: "x" })).rejects.toThrow(
      /appears 2 times/,
    );
    await expect(patchNote(root, { path: "Inbox", heading: "X", content: "x" })).rejects.toThrow(
      /Headings: \(none\)/,
    );
    await expect(patchNote(root, { path: "Bad", frontmatter: { a: 1 } })).rejects.toThrow(
      /not valid YAML/,
    );
    await expect(patchNote(root, { path: "List", frontmatter: { a: 1 } })).rejects.toThrow(
      /key\/value/,
    );
    await expect(patchNote(root, { path: "Nope", frontmatter: { a: 1 } })).rejects.toThrow(
      /Note not found/,
    );
    expect(read("Doc.md")).toBe(DOC);
  });
});

describe("dailyNote", () => {
  it("formats common moment tokens and refuses the rest", () => {
    const d = new Date(2026, 9, 5, 7, 3);
    expect(formatDate(d, "YYYY-MM-DD")).toBe("2026-10-05");
    expect(formatDate(d, "YY/M/D [Week] ddd dddd MMM MMMM HH:mm")).toBe(
      "26/10/5 Week Mon Monday Oct October 07:03",
    );
    expect(() => formatDate(d, "Do MMMM")).toThrow(/Unsupported date token "o"/);
    expect(() => formatDate(d, "constructor")).toThrow(/Unsupported/);
  });

  it("uses Obsidian's defaults when there are no settings", async () => {
    expect(await dailyNote(root, { date: "2026-10-15" })).toMatchObject({
      path: "2026-10-15.md",
      exists: false,
    });
    const today = await dailyNote(root, { create: true });
    expect(today.created).toBe(true);
    expect(today.content).toBe("");
    expect(today.path).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("follows folder, format and template settings", async () => {
    put(
      ".obsidian/daily-notes.json",
      JSON.stringify({ folder: "Daily", format: "YYYY/MM/YYYY-MM-DD", template: "Templates/Day" }),
    );
    put("Templates/Day.md", "# {{title}}\n{{date:dddd}} {{date}} {{time:HH}} {{other}}");
    const r = await dailyNote(root, { date: "2026-10-15", create: true });
    expect(r).toMatchObject({ path: "Daily/2026/10/2026-10-15.md", created: true });
    expect(r.content).toMatch(/^# 2026-10-15\nThursday 2026-10-15 \d\d \{\{other\}\}$/);

    put("Daily/2026/10/2026-10-15.md", "edited");
    expect(await dailyNote(root, { date: "2026-10-15", create: true })).toMatchObject({
      content: "edited",
      created: false,
    });
  });

  it("returns an existing note and rejects impossible dates", async () => {
    put(".obsidian/daily-notes.json", JSON.stringify({ folder: "Daily", format: "" }));
    expect(await dailyNote(root, { date: "2026-10-15" })).toMatchObject({
      path: "Daily/2026-10-15.md",
      created: false,
      content: "Meeting with Alice\nnothing else",
    });
    await expect(dailyNote(root, { date: "2026-02-30" })).rejects.toThrow(/Invalid date/);
    await expect(dailyNote(root, { date: "2026-13-01" })).rejects.toThrow(/Invalid date/);
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
