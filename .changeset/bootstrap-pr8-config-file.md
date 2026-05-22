---
"@unclecat/mcp-multi-db": patch
---

feat: JSON config file support and per-alias metadata

- New `MCP_DB_CONFIG` env var points the server at a JSON config file, replacing the verbose `DB_<ALIAS>_*` env block with one nested block per alias.
- New per-alias metadata: `displayName`, `description`, `tablesHint`. These are injected into every database tool's description at startup so the AI client knows what each alias is for and routes queries correctly.
- Optional top-level `defaultAlias` hint shown in tool descriptions.
- `databaseAlias` tool input is constrained by a JSON-Schema `enum` listing the loaded aliases — clients cannot pass an alias that doesn't exist.
- The `db://aliases` resource reports the new metadata fields when present.
- Ships a JSON Schema at `schema/config.schema.json` and an example config at `mcp-db.config.example.json`.

Backward compatible: existing `DB_<ALIAS>_*` env configuration is unchanged. JSON loader only activates when `MCP_DB_CONFIG` is set; in that case `DB_*` env vars are ignored entirely.
