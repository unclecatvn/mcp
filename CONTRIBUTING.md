# Contributing

Thanks for your interest in contributing!

## Development setup

```bash
git clone https://github.com/unclecatvn/mcp.git
cd mcp
pnpm install
```

## Project layout

This is a monorepo. Each MCP server is a package under the repo root.

- `db/` — `@unclecat/mcp-multi-db`
- (more to come)

## Common commands

```bash
pnpm lint                                            # lint all packages
pnpm format                                          # check formatting
pnpm format:fix                                      # auto-fix formatting
pnpm --filter @unclecat/mcp-multi-db test            # unit tests for db
pnpm --filter @unclecat/mcp-multi-db test:coverage   # with coverage
pnpm changeset                                       # record a change for the next release
```

## Pull request flow

1. Fork or branch from `master`.
2. Make your changes in the relevant package directory.
3. **Run `pnpm changeset`** and pick the package(s), bump type (patch/minor/major), and write a clear summary. Commit the generated `.changeset/<name>.md` file.
4. Push and open a PR.
5. CI runs lint, format check, tests across Node 18/20/22, and `pnpm audit`. All must pass.
6. After review and merge, the Release workflow opens (or updates) a "Version Packages" PR aggregating pending changesets.
7. A maintainer merging the Version PR triggers automatic publish to npm and creates a GitHub Release.

## Releasing manually (maintainer)

In the rare case the bot is unavailable:

```bash
pnpm changeset version           # bumps versions, updates CHANGELOG
pnpm install --no-frozen-lockfile
git commit -am "chore: release packages"
git push
pnpm changeset publish           # publishes to npm
git push --follow-tags
```

## Required GitHub settings (maintainer)

- **Branch protection on `master`:** require PR + ≥ 1 approval, require CI checks (`db`, `audit`) passing, no force push.
- **Allow GitHub Actions to create PRs:** Settings → Actions → General → Workflow permissions.
- **Secrets:** `NPM_TOKEN` (granular access token for `@unclecat/*`, type "automation").

## Tests

We use [Vitest](https://vitest.dev). Tests live next to the package they cover (`db/test/unit/`).

Coverage gate is enforced in CI: ≥ 80 % lines/functions/statements and ≥ 75 % branches on the modules listed in `db/vitest.config.js`.

## Code style

- ESLint flat config at root, plus Prettier.
- ESM modules (`"type": "module"`).
- No global state in libraries; injected via constructor.
- Errors derive from `db/lib/errors.js`. Never throw bare `Error` for user-visible errors.

## Reporting security issues

See [`db/SECURITY.md`](./db/SECURITY.md). Do not file public issues for vulnerabilities.
