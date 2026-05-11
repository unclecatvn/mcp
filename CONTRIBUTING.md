# Contributing

Thanks for your interest in contributing!

## Development setup

```bash
git clone https://github.com/unclecatvn/mcp.git
cd mcp
pnpm install
```

Node ≥ 20 required.

## Project layout

This is a pnpm monorepo. Each MCP server is its own package directory at the repo root and is published independently to npm.

- [`db/`](./db) — `@unclecat/mcp-multi-db`
- [`odoo/`](./odoo) — `@unclecat/mcp-odoo`

To add a new MCP package see [`docs/ADDING_A_NEW_MCP.md`](./docs/ADDING_A_NEW_MCP.md).

## Branches

- **`master`** — default branch. Release workflow triggers on push here. Always green.
- **`staging`** — integration branch used to assemble multiple feature branches before opening a PR into `master`. CI runs on push to `staging` too.

Direct pushes to `master` are not allowed. The normal flow is: feature branch → PR into `staging` → PR from `staging` into `master`.

## Common commands

All commands below run from the repo root.

```bash
pnpm -r lint              # lint every package
pnpm -r format            # check formatting in every package
pnpm -r format:fix        # auto-fix formatting in every package
pnpm -r test              # run unit tests in every package
pnpm -r test:coverage     # tests with coverage in every package
pnpm changeset            # record a change for the next release
```

To target a single package: `pnpm --filter <package-name> <script>`. Example:

```bash
pnpm --filter @unclecat/mcp-multi-db test:watch
```

## Pull-request flow

1. Branch from `staging` (or `master` for hotfix).
2. Make your changes in the relevant package directory.
3. **Run `pnpm changeset`** and pick the package(s), bump type (patch/minor/major), and write a clear summary. Commit the generated `.changeset/<name>.md`.
4. Push and open a PR.
5. CI runs lint, format, tests, and audit across all packages on Node 20/22. The aggregate check `ci-success` must pass.
6. After review and merge into `master`, the Release workflow opens (or updates) a **"chore(release): version packages"** PR aggregating pending changesets.
7. A maintainer merging the Version PR triggers automatic publish to npm (with provenance) and creates a GitHub Release for each package — tags use Changesets' scoped form, e.g. `@unclecat/mcp-multi-db@1.2.3`.

## Releasing manually (maintainer)

In the rare case the bot is unavailable:

```bash
pnpm changeset version           # bumps versions, updates CHANGELOG
pnpm install --no-frozen-lockfile
git commit -am "chore(release): version packages"
git push
pnpm release                     # builds (if-present) and publishes to npm
git push --follow-tags
```

## Required GitHub settings (maintainer)

- **Branch protection on `master`:** require PR + ≥ 1 approval, require status check **`ci-success`** to pass, no force push.
- **Allow GitHub Actions to create PRs:** Settings → Actions → General → Workflow permissions.
- **Secrets:** `NPM_TOKEN` (granular access token for `@unclecat/*`, type "automation").

## Tests

We use [Vitest](https://vitest.dev). Tests live next to the package they cover (`<package>/test/unit/`).

Coverage gate is enforced in CI: ≥ 80 % lines/functions/statements and ≥ 75 % branches for every package's `lib/` source.

## Code style

- ESLint flat config at root, plus Prettier.
- ESM modules (`"type": "module"`).
- No global state in libraries; injected via constructor.
- Errors derive from each package's `lib/errors.js`. Never throw bare `Error` for user-visible errors.

## Reporting security issues

See [`SECURITY.md`](./SECURITY.md) at the repo root. Do not file public issues for vulnerabilities.
