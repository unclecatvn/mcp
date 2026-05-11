# Security policy

This policy applies to **all packages** in this monorepo:

- [`@unclecat/mcp-multi-db`](./db)
- [`@unclecat/mcp-odoo`](./odoo)

## Reporting a vulnerability

Please report security issues **privately** by either:

- Opening a GitHub Security Advisory: https://github.com/unclecatvn/mcp/security/advisories/new
- Or emailing `quangnh.tkcn@gmail.com` with subject `SECURITY: <package-name>` (e.g. `SECURITY: @unclecat/mcp-multi-db`).

Do **not** open a public issue for vulnerabilities.

We aim to acknowledge within 7 days and provide a remediation plan within 14 days for confirmed reports.

## Supported versions

Only the **latest released minor** of each package receives security fixes.

| Package                    | Supported |
| -------------------------- | --------- |
| `@unclecat/mcp-multi-db`   | latest minor |
| `@unclecat/mcp-odoo`       | latest minor |

Older versions can be patched on a best-effort basis if the vulnerability is severe and the consumer cannot upgrade.

## Threat model

All packages run as **trusted processes** with access to external systems (databases, ERP APIs). They are designed to be invoked by a **single MCP host process** (Claude Desktop, Claude Code, etc.) — not exposed as a network service.

Shared mitigations:

- **No raw query/exec API.** All external calls go through validated, parameterized interfaces.
- **Strict input validation.** Every tool input is validated by a zod schema before reaching transport.
- **Sanitized logging.** Secrets, full credentials, and bound query parameters are never written to logs.
- **Stable error envelopes.** Tool failures return MCP `isError` envelopes with stable codes — no stack traces leak to the model.
- **Stdio transport only.** No HTTP listener; the server cannot be reached by other processes on the host except through stdio.

Per-package mitigations are documented in each package's README under its "Security notes" or "Security model" section.

## Out of scope

- Multi-tenant authorization between users — each MCP process serves exactly one host. Run multiple instances with different env configs to grant different access tiers.
- Protecting against a malicious MCP host — the host inherently sees tool input/output.
- Operating-system level isolation — use OS-level controls (containers, sandboxes) if needed.
