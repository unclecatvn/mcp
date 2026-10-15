import { z } from "zod";
import * as vault from "./vault.js";

function ok(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

const VaultArg = z
  .string()
  .optional()
  .describe("Vault name from list_vaults. Optional when only one vault is configured.");
const NotePathArg = z
  .string()
  .min(1)
  .max(1024)
  .describe('Vault-relative note path, e.g. "Projects/Plan.md". ".md" is appended if missing.');
const FolderArg = z
  .string()
  .max(1024)
  .optional()
  .describe('Vault-relative folder, e.g. "Projects". Omit for the whole vault.');

/**
 * Register every tool on an McpServer. Write tools are only exposed when at
 * least one vault is readwrite, so a readonly setup never advertises them.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {Record<string, { name: string, root: string, mode: "readonly" | "readwrite" }>} vaults
 */
export function registerTools(server, vaults) {
  const names = Object.keys(vaults);

  function pick(name) {
    if (name === undefined) {
      if (names.length === 1) return vaults[names[0]];
      throw new Error(
        names.length === 0
          ? "No vaults configured. Set OBSIDIAN_<NAME>_PATH=/absolute/path/to/vault."
          : `Pass "vault" — one of: ${names.join(", ")}`,
      );
    }
    const v = vaults[name];
    if (!v) throw new Error(`Unknown vault "${name}". Configured: ${names.join(", ") || "(none)"}`);
    return v;
  }

  function pickWritable(name) {
    const v = pick(name);
    if (v.mode !== "readwrite") {
      throw new Error(
        `Vault "${v.name}" is readonly. Set OBSIDIAN_${v.name.toUpperCase()}_MODE=readwrite to allow writes.`,
      );
    }
    return v;
  }

  server.registerTool(
    "list_vaults",
    {
      description:
        "List configured Obsidian vaults with their folder and mode (readonly/readwrite).",
      annotations: { readOnlyHint: true },
    },
    async () =>
      ok({
        vaults: Object.values(vaults).map(({ name, root, mode }) => ({ name, path: root, mode })),
      }),
  );

  server.registerTool(
    "list_notes",
    {
      description: [
        "List note paths (.md) in a vault or folder, sorted by path. Hidden folders (.obsidian, .trash) are skipped.",
        'EXAMPLE OUTPUT: { "notes": ["Daily/2026-10-15.md", "Projects/Plan.md"], "total": 2 }',
      ].join("\n"),
      inputSchema: {
        vault: VaultArg,
        folder: FolderArg,
        limit: z.number().int().min(1).max(5000).default(500),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ vault: v, ...args }) => ok(await vault.listNotes(pick(v).root, args)),
  );

  server.registerTool(
    "read_note",
    {
      description: [
        "Read one note. Returns the full content plus parsed metadata:",
        "  frontmatter  raw YAML string between the leading --- fences (null if none)",
        "  links        [[wikilink]] and relative [md](link) targets",
        "  embeds       ![[embed]] targets",
        "  tags         inline #tags in the body (frontmatter tags are inside `frontmatter`)",
      ].join("\n"),
      inputSchema: { vault: VaultArg, path: NotePathArg },
      annotations: { readOnlyHint: true },
    },
    async ({ vault: v, ...args }) => ok(await vault.readNote(pick(v).root, args)),
  );

  server.registerTool(
    "search_notes",
    {
      description: [
        "Search note contents and paths. Returns matching notes with up to 5 matching lines each.",
        "pathMatch=true means the query matched the note path (use this to find a note by title).",
        'EXAMPLE INPUT:  { "query": "meeting", "folder": "Work", "limit": 10 }',
        'EXAMPLE OUTPUT: { "results": [{ "path": "Work/Meeting 2026-10-01.md", "pathMatch": true,',
        '                  "matches": [{ "line": 3, "text": "## meeting notes" }] }], "truncated": false }',
      ].join("\n"),
      inputSchema: {
        vault: VaultArg,
        query: z.string().min(1).max(1000),
        regex: z
          .boolean()
          .default(false)
          .describe("Treat query as a JavaScript regular expression."),
        caseSensitive: z.boolean().default(false),
        folder: FolderArg,
        limit: z.number().int().min(1).max(200).default(20).describe("Max notes returned."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ vault: v, ...args }) => ok(await vault.searchNotes(pick(v).root, args)),
  );

  if (!Object.values(vaults).some((v) => v.mode === "readwrite")) return;

  server.registerTool(
    "write_note",
    {
      description: [
        "Create or change a note. Missing folders are created. Obsidian picks up the change automatically.",
        "  create     fail if the note exists (default — safest)",
        "  overwrite  replace the whole note (read it first if you only need to change part of it)",
        "  append     add to the end, creating the note if missing",
      ].join("\n"),
      inputSchema: {
        vault: VaultArg,
        path: NotePathArg,
        content: z.string().max(vault.MAX_NOTE_BYTES),
        mode: z.enum(["create", "overwrite", "append"]).default("create"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ vault: v, ...args }) => ok(await vault.writeNote(pickWritable(v).root, args)),
  );

  server.registerTool(
    "delete_note",
    {
      description:
        "Move a note to the vault's .trash/ folder (same place Obsidian's own trash uses). Nothing is permanently deleted.",
      inputSchema: { vault: VaultArg, path: NotePathArg },
      annotations: { destructiveHint: true },
    },
    async ({ vault: v, ...args }) => ok(await vault.deleteNote(pickWritable(v).root, args)),
  );
}
