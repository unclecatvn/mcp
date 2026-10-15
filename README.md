# unclecat MCP servers

[Model Context Protocol](https://modelcontextprotocol.io) servers that give AI assistants such as Claude, Cursor and VS Code safe access to SQL databases, Odoo ERP and Obsidian vaults.

[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

## Packages

| Package | Connects to | Highlights |
|---|---|---|
| [**@unclecat/mcp-multi-db**](./db)<br>[![npm](https://img.shields.io/npm/v/@unclecat/mcp-multi-db.svg)](https://www.npmjs.com/package/@unclecat/mcp-multi-db) | MySQL, MariaDB, PostgreSQL, SQL Server | Parameterized queries only, read-only by default, row caps and timeouts, several databases in one server |
| [**@unclecat/mcp-odoo**](./odoo)<br>[![npm](https://img.shields.io/npm/v/@unclecat/mcp-odoo.svg)](https://www.npmjs.com/package/@unclecat/mcp-odoo) | Odoo 18+ over JSON-RPC | Several instances, API-key auth, generic CRUD on any model, business actions through `call_method` |
| [**@unclecat/mcp-obsidian**](./obsidian)<br>[![npm](https://img.shields.io/npm/v/@unclecat/mcp-obsidian.svg)](https://www.npmjs.com/package/@unclecat/mcp-obsidian) | Obsidian vaults on disk | No plugin and no running app needed, backlinks, section-level patching, daily notes |

Each package has its own README with full configuration, a tool reference and troubleshooting. Vietnamese docs are linked from each one.

## Quick start

Every server runs through `npx`, so there is nothing to install or build. With [Claude Code](https://docs.anthropic.com/en/docs/claude-code):

```bash
claude mcp add odoo -e ODOO_PROD_URL=https://erp.example.com -e ODOO_PROD_DB=production -e ODOO_PROD_USERNAME=admin -e ODOO_PROD_API_KEY=your-api-key -- npx -y @unclecat/mcp-odoo
```

```bash
claude mcp add obsidian -e OBSIDIAN_MAIN_PATH=/absolute/path/to/Vault -- npx -y @unclecat/mcp-obsidian
```

```bash
claude mcp add multi-db -e MCP_DB_CONFIG=/absolute/path/to/mcp-db.config.json -- npx -y @unclecat/mcp-multi-db
```

For Claude Desktop, Cursor and VS Code, see the configuration section of each package README.

## Design principles

All servers in this repository follow the same rules:

- **Safe by default.** Every server starts read-only, and you opt in to writes per database, instance or vault. Destructive tools are annotated so hosts can ask before running them, and secrets are never echoed back to the model.
- **Multi-target.** One server process handles any number of databases, Odoo instances or vaults, and the model picks one per call.
- **Model-friendly.** Tool descriptions include examples, errors carry stable codes, and each server sends short instructions on `initialize` so the model composes correct calls on the first try.
- **Zero install.** Plain ESM JavaScript on Node 20+, with no build step and no native dependencies.
- **Supply-chain hygiene.** Packages are published from GitHub Actions through [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) with provenance. Dependabot proposes updates weekly and skips releases younger than 14 days.

## Repository layout

```
.
├── db/                   @unclecat/mcp-multi-db
├── obsidian/             @unclecat/mcp-obsidian
├── odoo/                 @unclecat/mcp-odoo
├── .changeset/           pending release notes (Changesets)
├── .github/              CI, release workflow, Dependabot
├── pnpm-workspace.yaml   workspace package list
└── package.json          private root: shared scripts and dev tooling
```

## Development

Requires Node 20+ and pnpm 9+.

```bash
git clone https://github.com/unclecatvn/mcp.git
cd mcp
pnpm install
pnpm -r test        # unit tests in every package
pnpm -r lint        # ESLint
pnpm -r format      # Prettier check
```

Work on one package with `pnpm --filter <package-name> <script>`, for example `pnpm --filter @unclecat/mcp-obsidian test:watch`.

## Releasing

1. Open a feature branch from `master`, add a changeset (`pnpm changeset`) with the right [semver bump](./CONTRIBUTING.md#versioning), and open a PR into `master`.
2. After the merge, the release workflow opens or updates a **version packages** PR that collects every pending change.
3. Merging that PR publishes the bumped packages to npm with provenance and creates GitHub Releases with links to the PRs.

Docs- and test-only changes never publish a release.

Details are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

Please report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md). Do not open public issues for them.

## License

[MIT](./LICENSE) © UncleCat
