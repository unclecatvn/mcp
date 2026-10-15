# @unclecat/mcp-obsidian

> MCP server for [Obsidian](https://obsidian.md) vaults. It reads, searches and edits notes straight from disk, so it needs no plugin and Obsidian does not have to be running.

[![npm](https://img.shields.io/npm/v/@unclecat/mcp-obsidian.svg)](https://www.npmjs.com/package/@unclecat/mcp-obsidian)
[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

**English** · [Tiếng Việt](./README.vi.md) · [Security policy](../SECURITY.md)

The server works on the `.md` files in your vault folder. Obsidian notices changes on disk by itself, so edits made through MCP appear in the app right away, and the server keeps working while the app is closed, on a headless machine or in CI.

## Features

- **Understands Obsidian notes**:
  - parses frontmatter, `[[wikilinks]]`, `![[embeds]]`, markdown links and `#nested/tags`;
  - finds backlinks the way Obsidian resolves them.
- **Targeted edits.** You can append to or replace one section under a heading, or set and delete frontmatter properties. The rest of the note stays byte-for-byte unchanged.
- **Daily notes.** The server follows your Daily notes settings (folder, date format, template).
- **Multiple vaults** in one server, each set to `readonly` (the default) or `readwrite`.
- **Safe file handling.** Overwrites are atomic, and delete moves notes to `.trash/`. Access is confined to the vault: paths with `..`, hidden folders and symlinks that point outside are all refused.

## Requirements

- Node.js 20 or newer
- A vault folder on the local disk (iCloud, Dropbox and Syncthing folders work)

## Quick start

### Claude Code

```bash
claude mcp add obsidian -s user \
  -e OBSIDIAN_MAIN_PATH="/absolute/path/to/Vault" \
  -e OBSIDIAN_MAIN_MODE=readwrite \
  -- npx -y @unclecat/mcp-obsidian@latest
```

`@latest` makes `npx` check for a new release every time the server starts.

### Claude Desktop, Cursor, Windsurf

Add the server to `claude_desktop_config.json`, `.cursor/mcp.json` or the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-obsidian@latest"],
      "env": {
        "OBSIDIAN_MAIN_PATH": "/absolute/path/to/Vault",
        "OBSIDIAN_MAIN_MODE": "readwrite"
      }
    }
  }
}
```

### VS Code

In `.vscode/mcp.json` (VS Code 1.102+), the top-level key is `servers`:

```json
{
  "servers": {
    "obsidian": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-obsidian@latest"],
      "env": { "OBSIDIAN_MAIN_PATH": "/absolute/path/to/Vault" }
    }
  }
}
```

Restart the host after changing its MCP config so the tools load.

## Configuration

Each vault is one pair of environment variables. `<NAME>` becomes the vault name in lowercase, so `OBSIDIAN_WORK_PATH` defines the vault `work`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OBSIDIAN_<NAME>_PATH` | yes | — | Absolute path to the vault folder. Symlinks are resolved once at startup. |
| `OBSIDIAN_<NAME>_MODE` | no | `readonly` | `readonly` or `readwrite`. |

Several vaults:

```json
"env": {
  "OBSIDIAN_PERSONAL_PATH": "/Users/me/Notes",
  "OBSIDIAN_PERSONAL_MODE": "readwrite",
  "OBSIDIAN_WORK_PATH": "/Users/me/Work Vault"
}
```

With one vault, every tool works without a `vault` argument. With several, the model picks one per call from `list_vaults`. A misconfigured vault is logged to stderr and skipped, and the other vaults still load.

## Tools

### Read (always available)

| Tool | What it does |
|---|---|
| `list_vaults` | Configured vaults with their path and mode. |
| `list_notes` | Note paths in a vault or folder, sorted. Hidden folders are skipped. |
| `read_note` | Full content plus parsed `frontmatter`, `links`, `embeds` and `tags`. Tags include both frontmatter and inline tags. |
| `search_notes` | Plain-text or regex search over contents and paths. Optional filters: `tag` (nested tags match too) and `frontmatter` values. Returns up to 5 matching lines per note. |
| `get_backlinks` | Notes that link to or embed a note, with line numbers. `[[Name]]` matches by file name, while `[[Folder/Name]]` and `.md` links match by path. |
| `daily_note` | The daily note for a date (today by default), placed according to `.obsidian/daily-notes.json`. With `create: true` (readwrite only) it is created from the template, filling in `{{date}}`, `{{time}}` and `{{title}}`. |

### Write (listed only when a vault is `readwrite`)

| Tool | What it does |
|---|---|
| `write_note` | `create` (the default; fails if the note exists), `overwrite` (atomic replace) or `append`. Missing folders are created. |
| `patch_note` | Append to or replace the section under a heading, and/or set frontmatter properties. A `null` value deletes the property. |
| `delete_note` | Moves the note to `<vault>/.trash/`, keeping its folder layout. Nothing is permanently deleted. |

Tool calls take vault-relative paths such as `Projects/Plan.md`. The `.md` extension is optional.

## Example prompts

- *"Which notes tagged #project link to [[Roadmap]] but have `status: active`?"*
- *"Append today's stand-up summary under `## Log` in my daily note."*
- *"Mark every meeting note from last week as `reviewed: true`."*
- *"Find notes that mention the Acme contract and summarise the open questions."*

## Safety

| Guard | Behaviour |
|---|---|
| Vault confinement | Paths are resolved against the real vault path. `..`, hidden folders and symlinks that escape the vault are refused, and that includes dangling symlinks. |
| File types | Only `.md` notes are read or written. A single read is capped at 2 MiB. |
| Write access | Off by default. Write tools are not even advertised unless at least one vault is `readwrite`. |
| No data loss | `create` never overwrites, `overwrite` is write-then-rename, and `delete_note` moves the note to `.trash/`. |

## Limitations

- Renaming a note does not rewrite the links that point to it. Rename inside Obsidian for that.
- The server cannot run Obsidian commands or plugins, and cannot query Dataview, because it works on files rather than through the app.
- Every search reads the whole vault. That is fast up to roughly 10,000 notes.
- Notes that iCloud has offloaded (`.Note.md.icloud`) are invisible until they are downloaded again. In Finder, choose **Download Now** on the vault folder.

## Troubleshooting

| Message | Cause and fix |
|---|---|
| `No vaults configured` | `OBSIDIAN_<NAME>_PATH` is missing or empty. Check the `env` block of your host config. |
| `... is not a usable directory` (stderr at startup) | The path does not exist or is not a folder. Use an absolute path, and put it in quotes if it contains spaces. |
| `Vault "x" is readonly` | Set `OBSIDIAN_X_MODE=readwrite` and restart the host. |
| `Path "..." is not allowed` | The path uses `..` or a hidden folder such as `.obsidian`. Use a plain vault-relative path. |
| `Path resolves outside the vault` | The path goes through a symlink that points outside the vault. |
| `Pass "vault" — one of: ...` | Several vaults are configured, so the call has to name one. |
| Write tools are missing | No vault is `readwrite`, or the host was not restarted after the config change. |

## Development

```bash
pnpm install
pnpm --filter @unclecat/mcp-obsidian test          # unit tests
pnpm --filter @unclecat/mcp-obsidian test:coverage # with coverage thresholds
OBSIDIAN_MAIN_PATH=/path/to/Vault node obsidian/index.js
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the branch and release flow.

## License

[MIT](./LICENSE)
