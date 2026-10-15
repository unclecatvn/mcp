# @unclecat/mcp-obsidian

## 0.0.2

### Patch Changes

- 6156855: docs: rewrite the README (English + Vietnamese) with a consistent structure: quick start for Claude Code, Claude Desktop/Cursor and VS Code, configuration and tool reference, safety notes, troubleshooting. `@unclecat/mcp-obsidian` now ships `README.vi.md`. db docs now cover `defaultAlias` (optional `databaseAlias`), `defaultSchema` and `db_list_tables` pagination.

## 0.0.1

### Patch Changes

- e0e50d3: feat(obsidian): initial release — MCP server for Obsidian vaults via the filesystem.
  - Multi-vault via `OBSIDIAN_<NAME>_PATH` / `OBSIDIAN_<NAME>_MODE` (readonly by default).
  - Read tools: `list_vaults`, `list_notes`, `read_note`, `search_notes`, `get_backlinks`, `daily_note`.
  - Write tools (readwrite vaults only): `write_note`, `patch_note`, `delete_note`.
  - `read_note` returns parsed frontmatter, wikilinks/markdown links, embeds, and tags (frontmatter + inline).
  - `search_notes` filters by `tag` (nested included) and `frontmatter` values.
  - `get_backlinks` resolves `[[Name]]`, `[[Folder/Name]]` and relative `.md` links like Obsidian, with line numbers.
  - `patch_note` appends to or replaces the section under a heading and sets/deletes frontmatter keys; the rest of the note stays byte-identical.
  - `daily_note` follows `.obsidian/daily-notes.json` (folder, date format, template).
  - Safety: vault-relative paths only; `..`, hidden folders and escaping symlinks refused; atomic overwrite; delete moves to `.trash/`.
