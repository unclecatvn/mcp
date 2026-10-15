---
"@unclecat/mcp-obsidian": patch
---

feat(obsidian): backlinks, section/frontmatter patching, frontmatter-aware search and daily notes.

- `get_backlinks`: notes that link to or embed a note, with line numbers; resolves `[[Name]]`, `[[Folder/Name]]` and relative `.md` links like Obsidian.
- `patch_note` (readwrite): append to or replace the section under a heading; set or delete frontmatter properties. The rest of the note stays byte-identical.
- `read_note` now returns `frontmatter` as a parsed object (was a raw YAML string) and merges frontmatter `tags` into `tags`.
- `search_notes`: optional `tag` and `frontmatter` filters; `query` is optional when a filter is given.
- `daily_note`: finds or creates the daily note using `.obsidian/daily-notes.json` (folder, date format, template).
