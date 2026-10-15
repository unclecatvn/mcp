---
"@unclecat/mcp-obsidian": patch
---

feat(obsidian): initial release — MCP server for Obsidian vaults via the filesystem.

- Multi-vault via `OBSIDIAN_<NAME>_PATH` / `OBSIDIAN_<NAME>_MODE` (readonly by default).
- Tools: `list_vaults`, `list_notes`, `read_note`, `search_notes`, `write_note`, `delete_note`.
- `read_note` returns raw frontmatter, wikilinks/markdown links, embeds and inline tags.
- Safety: vault-relative paths only; `..`, hidden folders and escaping symlinks refused; atomic overwrite; delete moves to `.trash/`.
