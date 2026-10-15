# unclecat MCP servers

A monorepo of MCP (Model Context Protocol) servers by [@unclecatvn](https://github.com/unclecatvn).

## Packages

| Package | Description |
|---------|-------------|
| [`@unclecat/mcp-multi-db`](./db) | MCP server for MySQL/MariaDB, PostgreSQL, and SQL Server with parameterized queries and per-alias safety modes. |
| [`@unclecat/mcp-obsidian`](./obsidian) | MCP server for Obsidian vaults via the filesystem. Works without Obsidian running, multi-vault, per-vault readonly/readwrite. |
| [`@unclecat/mcp-odoo`](./odoo) | MCP server for Odoo v18+ via JSON-RPC. Multi-instance support, API key or password auth, generic CRUD tools. |

## Repository

- Releases: [Releases](https://github.com/unclecatvn/mcp/releases)
- Security policy: [`SECURITY.md`](./SECURITY.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Adding a new MCP package: [`docs/ADDING_A_NEW_MCP.md`](./docs/ADDING_A_NEW_MCP.md)
- License: [MIT](./LICENSE)

## Workspace layout

```
.
├── db/                            # @unclecat/mcp-multi-db
├── obsidian/                      # @unclecat/mcp-obsidian
├── odoo/                          # @unclecat/mcp-odoo
├── .changeset/                    # release-flow state (Changesets)
├── .github/workflows/             # ci.yml, release.yml
├── docs/                          # repo-level docs
├── pnpm-workspace.yaml            # workspace package list
└── package.json                   # private root, scripts only
```

Each package is independently versioned and published to npm.
