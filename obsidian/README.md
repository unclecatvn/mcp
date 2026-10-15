# @unclecat/mcp-obsidian

MCP server for [Obsidian](https://obsidian.md) vaults. It reads and writes the `.md` files in the vault folder directly, so Obsidian does not need to be running and no plugin is required. Obsidian picks up changes on its own.

## Setup

```bash
claude mcp add obsidian-fs \
  -e OBSIDIAN_MAIN_PATH=/absolute/path/to/Vault \
  -e OBSIDIAN_MAIN_MODE=readwrite \
  -- npx -y @unclecat/mcp-obsidian
```

Claude Desktop / `.mcp.json`:

```json
{
  "mcpServers": {
    "obsidian-fs": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-obsidian"],
      "env": {
        "OBSIDIAN_MAIN_PATH": "/absolute/path/to/Vault",
        "OBSIDIAN_MAIN_MODE": "readwrite"
      }
    }
  }
}
```

### Configuration

One block per vault; `<NAME>` becomes the vault name (lowercased).

| Variable | Required | Description |
|---|---|---|
| `OBSIDIAN_<NAME>_PATH` | yes | Absolute path to the vault folder. |
| `OBSIDIAN_<NAME>_MODE` | no | `readonly` (default) or `readwrite`. |

With a single vault, the `vault` argument can be omitted from every tool.

## Tools

| Tool | Description |
|---|---|
| `list_vaults` | Configured vaults with their path and mode. |
| `list_notes` | Note paths in a vault or folder, sorted. |
| `read_note` | Content plus raw frontmatter, links, embeds and inline tags. |
| `search_notes` | Plain-text or regex search over contents and paths. |
| `write_note` | `create` (default), `overwrite` (atomic) or `append`. Only listed when a vault is `readwrite`. |
| `delete_note` | Moves the note to `<vault>/.trash/`. Only listed when a vault is `readwrite`. |

## Safety

- Paths are vault-relative. `..`, hidden folders (`.obsidian`, `.trash`, `.git`) and symlinks that resolve outside the vault are refused.
- Only `.md` files are read or written. Reads are capped at 2 MiB per note.
- Vaults are `readonly` unless configured otherwise; nothing is ever hard-deleted.

## Development

```bash
pnpm --filter @unclecat/mcp-obsidian test
OBSIDIAN_MAIN_PATH=/path/to/Vault node obsidian/index.js
```
