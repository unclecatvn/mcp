---
"@unclecat/mcp-obsidian": patch
---

feat(obsidian): initial release — MCP server for Obsidian vaults via the filesystem.

- Multi-vault via `OBSIDIAN_<NAME>_PATH` / `OBSIDIAN_<NAME>_MODE` (readonly by default).
- Read tools: `list_vaults`, `list_notes`, `read_note`, `search_notes`, `get_backlinks`, `daily_note`.
- Write tools (readwrite vaults only): `write_note`, `patch_note`, `delete_note`.
- `read_note` returns parsed frontmatter, wikilinks/markdown links, embeds, and tags (frontmatter + inline).
- `search_notes` filters by `tag` (nested included) and `frontmatter` values.
- `get_backlinks` resolves `[[Name]]`, `[[Folder/Name]]` and relative `.md` links like Obsidian, with line numbers.
- `patch_note` appends to or replaces the section under a heading and sets/deletes frontmatter keys; the rest of the note stays byte-identical.
- `daily_note` follows `.obsidian/daily-notes.json` (folder, date format, template).
- Safety: vault-relative paths only; `..`, hidden folders and escaping symlinks refused; atomic overwrite; delete moves to `.trash/`.
