/**
 * Filesystem operations on one vault. Every path a caller passes in is
 * vault-relative and goes through `notePath`/`folderPath` + `checkReal`, which
 * together refuse "..", hidden folders (.obsidian, .trash, .git) and symlinks
 * that resolve outside the vault.
 */
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

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

function splitNote(text) {
  const fm = text.match(FRONTMATTER_RE);
  // Blank code blocks but keep their newlines, so body line numbers still line up.
  const body = (fm ? text.slice(fm[0].length) : text)
    .replace(FENCE_RE, (m) => m.replace(/[^\n]/g, ""))
    .replace(INLINE_CODE_RE, "");
  return { fm, body };
}

/** Yield { target, embed } for every wikilink and relative markdown link in `text`. */
function* linksIn(text) {
  for (const [, bang, target] of text.matchAll(WIKILINK_RE)) {
    if (target.trim()) yield { target: target.trim(), embed: !!bang };
  }
  for (const [, bang, raw] of text.matchAll(MDLINK_RE)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) continue; // external URL or same-note anchor
    let target = raw.split("#")[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      // keep the raw form if it is not valid percent-encoding
    }
    if (target) yield { target, embed: !!bang };
  }
}

/** `tags: [a, "#b"]` or `tags: a, b` → ["a", "b"]. */
function frontmatterTags(fm) {
  const raw = fm?.tags;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
  return list.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
}

/**
 * Extract parsed frontmatter, outgoing links, embeds and tags (frontmatter + inline).
 * Invalid YAML does not throw: `frontmatter` is null and `frontmatterError` says why.
 */
export function parseNote(text) {
  const { fm, body } = splitNote(text);
  let frontmatter = null;
  let frontmatterError;
  if (fm) {
    try {
      frontmatter = YAML.parse(fm[1] ?? "") ?? {};
      if (typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
        throw new Error("Frontmatter is not a key/value map");
      }
    } catch (e) {
      frontmatter = null;
      frontmatterError = e.message;
    }
  }

  const links = new Set();
  const embeds = new Set();
  for (const { target, embed } of linksIn(body)) (embed ? embeds : links).add(target);
  const tags = new Set([
    ...frontmatterTags(frontmatter),
    ...[...body.matchAll(TAG_RE)].map((m) => m[1]),
  ]);

  return {
    frontmatter,
    frontmatterError,
    links: [...links],
    embeds: [...embeds],
    tags: [...tags],
  };
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

/** `tag` also matches nested tags (project → project/alpha); `frontmatter` values match a scalar or any list item. */
function matchesFilters(note, tag, frontmatter) {
  if (tag) {
    const want = tag.replace(/^#/, "").toLowerCase();
    const has = note.tags.some((t) => {
      const l = t.toLowerCase();
      return l === want || l.startsWith(want + "/");
    });
    if (!has) return false;
  }
  return Object.entries(frontmatter ?? {}).every(([k, want]) =>
    [note.frontmatter?.[k]]
      .flat()
      .some((v) => v !== undefined && v !== null && String(v) === String(want)),
  );
}

export async function searchNotes(
  root,
  { query, regex, caseSensitive, folder, limit, tag, frontmatter },
) {
  if (!query && !tag && !frontmatter) throw new Error("Pass query, tag or frontmatter");
  let test;
  if (!query) {
    test = () => false;
  } else if (regex) {
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
    const text = await fs.readFile(abs, "utf8");
    if ((tag || frontmatter) && !matchesFilters(parseNote(text), tag, frontmatter)) continue;
    const lines = text.split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_NOTE; i++) {
      if (test(lines[i]))
        matches.push({ line: i + 1, text: lines[i].slice(0, MAX_MATCH_LINE_CHARS) });
    }
    const pathMatch = test(rel);
    if (matches.length || pathMatch || !query) {
      results.push({ path: rel, pathMatch, matches });
      if (results.length >= limit) return { results, truncated: true };
    }
  }
  return { results, truncated: false };
}

/**
 * Notes that link to or embed `rel`, resolved like Obsidian: a bare [[Name]] matches the basename
 * case-insensitively; a link with "/" matches the vault path or a path relative to the linking note.
 * ponytail: when two notes share a basename, [[Name]] counts for both (Obsidian picks the closest one).
 */
export async function getBacklinks(root, { path: rel, limit }) {
  const abs = notePath(root, rel);
  await checkReal(root, abs);
  const target = relOf(root, abs).replace(/\.md$/i, "").toLowerCase();
  const base = path.posix.basename(target);
  const resolves = (link, from) => {
    const l = link.toLowerCase().replace(/\.md$/, "").replace(/^\/+/, "");
    if (!l.includes("/")) return l === base;
    return l === target || path.posix.join(path.posix.dirname(from.toLowerCase()), l) === target;
  };

  const backlinks = [];
  for await (const src of walk(root, root)) {
    const file = path.join(root, src);
    if ((await fs.stat(file)).size > MAX_NOTE_BYTES) continue;
    const text = await fs.readFile(file, "utf8");
    const { fm, body } = splitNote(text);
    const offset = fm ? fm[0].split("\n").length - 1 : 0;
    const lines = text.split("\n");
    const matches = [];
    body.split("\n").forEach((line, i) => {
      if (![...linksIn(line)].some((l) => resolves(l.target, src))) return;
      const n = offset + i;
      matches.push({
        line: n + 1,
        text: lines[n].replace(/\r$/, "").slice(0, MAX_MATCH_LINE_CHARS),
      });
    });
    if (matches.length) {
      backlinks.push({ path: src, matches });
      if (backlinks.length >= limit) return { path: relOf(root, abs), backlinks, truncated: true };
    }
  }
  return { path: relOf(root, abs), backlinks, truncated: false };
}

/** Write-then-rename so a crash never leaves a half-written note. Dot-prefixed so Obsidian ignores it. */
async function atomicWrite(abs, content) {
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.tmp`);
  try {
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, abs);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
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
    await atomicWrite(abs, content);
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

const HEADING_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*\r?$/;
const FENCE_LINE_RE = /^(```|~~~)/;

/**
 * Replace or append to the lines under `heading`, up to the next heading of the same or higher level.
 * Blank lines before the next heading stay put, and every other byte of `body` is left as it was.
 * ponytail: ATX (#) headings only; setext (===) headings are not recognised.
 */
function patchSection(body, heading, content, mode) {
  const want = heading.replace(/^#+\s*/, "").trim();
  const cr = body.includes("\r\n") ? "\r" : "";
  const bare = !body.endsWith("\n"); // give the last line a newline while editing, strip it after
  const lines = (bare ? body + cr + "\n" : body).split("\n");

  const headings = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    if (fence) {
      if (lines[i].startsWith(fence)) fence = null;
      continue;
    }
    fence = lines[i].match(FENCE_LINE_RE)?.[1] ?? null;
    const m = !fence && lines[i].match(HEADING_RE);
    if (m) headings.push({ i, level: m[1].length, text: m[2] });
  }

  const hits = headings.filter((h) => h.text === want);
  if (hits.length !== 1) {
    throw new Error(
      hits.length
        ? `Heading "${want}" appears ${hits.length} times; use write_note to edit this note`
        : `Heading "${want}" not found. Headings: ${headings.map((h) => h.text).join(", ") || "(none)"}`,
    );
  }
  const h = hits[0];
  let end = headings.find((x) => x.i > h.i && x.level <= h.level)?.i ?? lines.length;
  while (end > h.i + 1 && !lines[end - 1].trim()) end--;

  const text = content.replace(/(\r?\n)+$/, "");
  const add = text ? text.split(/\r?\n/).map((l) => l + cr) : [];
  const start = mode === "replace" ? h.i + 1 : end;
  lines.splice(start, end - start, ...add);
  const out = lines.join("\n");
  return bare ? out.slice(0, -(cr.length + 1)) : out;
}

/** Set keys (null deletes) via the YAML document API so untouched keys keep their formatting and comments. */
function patchFrontmatter(fm, changes, eol) {
  const doc = YAML.parseDocument(fm?.[1] ?? "");
  if (doc.errors.length) throw new Error(`Frontmatter is not valid YAML: ${doc.errors[0].message}`);
  if (doc.contents !== null && !YAML.isMap(doc.contents)) {
    throw new Error("Frontmatter is not a key/value map");
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) doc.delete(k);
    else doc.set(k, v);
  }
  if (!doc.contents?.items.length) return ""; // every key deleted: drop the block, as Obsidian does
  return `---${eol}${doc.toString({ lineWidth: 0 }).replace(/\n/g, eol)}---${eol}`;
}

export async function patchNote(
  root,
  { path: rel, heading, content, mode = "append", frontmatter },
) {
  if (heading === undefined && frontmatter === undefined) {
    throw new Error("Pass heading + content, frontmatter, or both");
  }
  if (heading !== undefined && content === undefined)
    throw new Error("content is required with heading");
  const { path: relPath, content: text } = await readNote(root, { path: rel });

  const fm = text.match(FRONTMATTER_RE);
  let head = fm ? fm[0] : "";
  let body = fm ? text.slice(head.length) : text;
  if (heading !== undefined) body = patchSection(body, heading, content, mode);
  if (frontmatter) head = patchFrontmatter(fm, frontmatter, text.includes("\r\n") ? "\r\n" : "\n");

  const out = head + body;
  await atomicWrite(path.join(root, relPath), out);
  return { path: relPath, bytes: Buffer.byteLength(out) };
}

// ---- Daily notes -------------------------------------------------------------

const DATE_TOKEN_RE = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|mm|[A-Za-z]+/g;
const TEMPLATE_VAR_RE = /\{\{(date|time|title)(?::([^}]*))?\}\}/g;

/**
 * Format `d` with the common moment.js tokens. Any other token is refused rather than guessed.
 * ponytail: English month/day names; moment would follow Obsidian's display language.
 */
export function formatDate(d, fmt) {
  const pad = (n) => String(n).padStart(2, "0");
  const name = (opt) => d.toLocaleString("en-US", opt);
  const map = {
    YYYY: d.getFullYear(),
    YY: pad(d.getFullYear() % 100),
    MMMM: name({ month: "long" }),
    MMM: name({ month: "short" }),
    MM: pad(d.getMonth() + 1),
    M: d.getMonth() + 1,
    DD: pad(d.getDate()),
    D: d.getDate(),
    dddd: name({ weekday: "long" }),
    ddd: name({ weekday: "short" }),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
  };
  return fmt.replace(DATE_TOKEN_RE, (t, literal) => {
    if (literal !== undefined) return literal;
    if (Object.hasOwn(map, t)) return String(map[t]);
    throw new Error(
      `Unsupported date token "${t}" in "${fmt}". Supported: ${Object.keys(map).join(" ")} [literal]`,
    );
  });
}

/**
 * Find (or, with `create`, make) the daily note for `date` (YYYY-MM-DD, default today) using
 * .obsidian/daily-notes.json: folder, format, template. Missing settings fall back to Obsidian's defaults.
 */
export async function dailyNote(root, { date, create }) {
  const cfgPath = path.join(root, ".obsidian", "daily-notes.json");
  await checkReal(root, cfgPath);
  const cfg = JSON.parse(
    await fs
      .readFile(cfgPath, "utf8")
      .catch((e) => (e.code === "ENOENT" ? "{}" : Promise.reject(e))),
  );

  let d = new Date();
  if (date) {
    const [y, m, day] = date.split("-").map(Number);
    d = new Date(y, m - 1, day, d.getHours(), d.getMinutes());
    if (d.getMonth() !== m - 1 || d.getDate() !== day) throw new Error(`Invalid date "${date}"`);
  }
  const name = formatDate(d, cfg.format || "YYYY-MM-DD");
  const rel = cfg.folder ? `${cfg.folder}/${name}` : name;

  const abs = notePath(root, rel);
  await checkReal(root, abs);
  const exists = await fs.stat(abs).then(
    () => true,
    () => false,
  );
  if (!exists) {
    if (!create) return { path: relOf(root, abs), exists: false };
    let content = "";
    if (cfg.template) {
      const title = path.posix.basename(name);
      content = (await readNote(root, { path: cfg.template })).content.replace(
        TEMPLATE_VAR_RE,
        (_, key, fmt) =>
          key === "title" ? title : formatDate(d, fmt ?? (key === "date" ? "YYYY-MM-DD" : "HH:mm")),
      );
    }
    await writeNote(root, { path: rel, content, mode: "create" });
  }
  return { ...(await readNote(root, { path: rel })), created: !exists };
}
