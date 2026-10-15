/**
 * Filesystem operations on one vault. Every path a caller passes in is
 * vault-relative and goes through `notePath`/`folderPath` + `checkReal`, which
 * together refuse "..", hidden folders (.obsidian, .trash, .git) and symlinks
 * that resolve outside the vault.
 */
import fs from "node:fs/promises";
import path from "node:path";

export const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const MAX_MATCHES_PER_NOTE = 5;
const MAX_MATCH_LINE_CHARS = 300;

// ---- Paths -------------------------------------------------------------------

function clean(rel) {
  if (typeof rel !== "string" || rel.includes("\0")) throw new Error("Invalid path");
  return rel
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function safeJoin(root, rel) {
  if (rel.split("/").some((s) => s === ".." || s.startsWith("."))) {
    throw new Error(`Path "${rel}" is not allowed: no "..", no hidden folders such as .obsidian`);
  }
  return path.resolve(root, rel);
}

/** Vault-relative note path → absolute path. Appends ".md" when missing. */
export function notePath(root, rel) {
  let p = clean(rel);
  if (p === "") throw new Error("Note path is required");
  if (!p.toLowerCase().endsWith(".md")) p += ".md";
  return safeJoin(root, p);
}

/** Vault-relative folder path → absolute path. "" is the vault root. */
export function folderPath(root, rel = "") {
  const p = clean(rel ?? "");
  return p === "" ? root : safeJoin(root, p);
}

function isInside(root, abs) {
  return abs === root || abs.startsWith(root + path.sep);
}

function relOf(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

const isSymlink = (p) =>
  fs.lstat(p).then(
    (s) => s.isSymbolicLink(),
    () => false,
  );

/**
 * Refuse a path whose real location (or, if it does not exist yet, the real
 * location of its nearest existing ancestor) is outside the vault.
 */
async function checkReal(root, abs) {
  let p = abs;
  for (;;) {
    let real;
    try {
      real = await fs.realpath(p);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      // A dangling symlink would let a later write land wherever it points.
      if (await isSymlink(p)) throw new Error("Path resolves outside the vault");
      p = path.dirname(p); // root exists, so this terminates
      continue;
    }
    if (!isInside(root, real)) throw new Error("Path resolves outside the vault");
    return;
  }
}

async function statNote(root, abs) {
  let st;
  try {
    st = await fs.stat(abs);
  } catch (e) {
    if (e.code === "ENOENT") throw new Error(`Note not found: ${relOf(root, abs)}`);
    throw e;
  }
  if (!st.isFile()) throw new Error(`Not a file: ${relOf(root, abs)}`);
  return st;
}

/** Yield vault-relative paths of every .md file under `dir`, sorted, skipping hidden entries and symlinks. */
async function* walk(root, dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") throw new Error(`Folder not found: ${relOf(root, dir)}`);
    throw e;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(root, abs);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) yield relOf(root, abs);
  }
}

// ---- Parsing -----------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
const FENCE_RE = /^(```|~~~)[\s\S]*?^\1/gm;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const WIKILINK_RE = /(!?)\[\[([^[\]|#^\n]*)(?:[#^][^[\]|\n]*)?(?:\|[^[\]\n]*)?\]\]/g;
const MDLINK_RE = /(!?)\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// Obsidian tags: preceded by start/whitespace, at least one non-digit character.
const TAG_RE = /(?<=^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

/**
 * Extract raw frontmatter, outgoing links, embeds and inline tags.
 * ponytail: frontmatter is returned raw and its `tags:` are not merged in; YAML parsing lands with patch_note.
 */
export function parseNote(text) {
  const fm = text.match(FRONTMATTER_RE);
  const frontmatter = fm ? (fm[1] ?? "").replace(/\r?\n$/, "") : null;
  const body = (fm ? text.slice(fm[0].length) : text)
    .replace(FENCE_RE, "")
    .replace(INLINE_CODE_RE, "");

  const links = new Set();
  const embeds = new Set();
  for (const [, bang, target] of body.matchAll(WIKILINK_RE)) {
    if (target.trim()) (bang ? embeds : links).add(target.trim());
  }
  for (const [, bang, raw] of body.matchAll(MDLINK_RE)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) continue; // external URL or same-note anchor
    let target = raw.split("#")[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      // keep the raw form if it is not valid percent-encoding
    }
    if (target) (bang ? embeds : links).add(target);
  }
  const tags = new Set([...body.matchAll(TAG_RE)].map((m) => m[1]));

  return { frontmatter, links: [...links], embeds: [...embeds], tags: [...tags] };
}

// ---- Operations --------------------------------------------------------------

export async function listNotes(root, { folder, limit }) {
  const dir = folderPath(root, folder);
  await checkReal(root, dir);
  const notes = [];
  for await (const rel of walk(root, dir)) notes.push(rel);
  return { notes: notes.slice(0, limit), total: notes.length };
}

export async function readNote(root, { path: rel }) {
  const abs = notePath(root, rel);
  await checkReal(root, abs);
  const st = await statNote(root, abs);
  if (st.size > MAX_NOTE_BYTES) {
    throw new Error(`Note is ${st.size} bytes, over the ${MAX_NOTE_BYTES}-byte read limit`);
  }
  const content = await fs.readFile(abs, "utf8");
  return {
    path: relOf(root, abs),
    size: st.size,
    modified: st.mtime.toISOString(),
    ...parseNote(content),
    content,
  };
}

export async function searchNotes(root, { query, regex, caseSensitive, folder, limit }) {
  let test;
  if (regex) {
    let re;
    try {
      // ponytail: no timeout on user regexes; a catastrophic pattern blocks this server only.
      re = new RegExp(query, caseSensitive ? "" : "i");
    } catch (e) {
      throw new Error(`Invalid regex: ${e.message}`);
    }
    test = (s) => re.test(s);
  } else {
    const needle = caseSensitive ? query : query.toLowerCase();
    test = (s) => (caseSensitive ? s : s.toLowerCase()).includes(needle);
  }

  const dir = folderPath(root, folder);
  await checkReal(root, dir);
  const results = [];
  // ponytail: full scan per call, fine to ~10k notes; add an mtime-keyed index past that.
  for await (const rel of walk(root, dir)) {
    const abs = path.join(root, rel);
    if ((await fs.stat(abs)).size > MAX_NOTE_BYTES) continue;
    const lines = (await fs.readFile(abs, "utf8")).split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_NOTE; i++) {
      if (test(lines[i]))
        matches.push({ line: i + 1, text: lines[i].slice(0, MAX_MATCH_LINE_CHARS) });
    }
    const pathMatch = test(rel);
    if (matches.length || pathMatch) {
      results.push({ path: rel, pathMatch, matches });
      if (results.length >= limit) return { results, truncated: true };
    }
  }
  return { results, truncated: false };
}

export async function writeNote(root, { path: rel, content, mode }) {
  const abs = notePath(root, rel);
  await checkReal(root, abs);
  await fs.mkdir(path.dirname(abs), { recursive: true });

  if (mode === "create") {
    try {
      await fs.writeFile(abs, content, { flag: "wx" });
    } catch (e) {
      if (e.code === "EEXIST") {
        throw new Error(
          `Note already exists: ${relOf(root, abs)}. Use mode "overwrite" or "append".`,
        );
      }
      throw e;
    }
  } else if (mode === "overwrite") {
    // Write-then-rename so a crash never leaves a half-written note. Dot-prefixed so Obsidian ignores it.
    const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.tmp`);
    try {
      await fs.writeFile(tmp, content);
      await fs.rename(tmp, abs);
    } catch (e) {
      await fs.rm(tmp, { force: true });
      throw e;
    }
  } else if (mode === "append") {
    const prev = await fs
      .readFile(abs, "utf8")
      .catch((e) => (e.code === "ENOENT" ? "" : Promise.reject(e)));
    await fs.appendFile(abs, (prev && !prev.endsWith("\n") ? "\n" : "") + content);
  } else {
    throw new Error(`Unknown mode "${mode}"`);
  }

  return { path: relOf(root, abs), mode, bytes: Buffer.byteLength(content) };
}

/** Move a note into <vault>/.trash/ (keeping its folder layout) instead of deleting it. */
export async function deleteNote(root, { path: rel }) {
  const abs = notePath(root, rel);
  await checkReal(root, abs);
  await statNote(root, abs);

  let dest = path.join(root, ".trash", relOf(root, abs));
  if (
    await fs.stat(dest).then(
      () => true,
      () => false,
    )
  ) {
    dest = dest.replace(/\.md$/i, ` ${Date.now()}.md`);
  }
  await checkReal(root, dest);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(abs, dest);
  return { path: relOf(root, abs), trashedTo: relOf(root, dest) };
}
