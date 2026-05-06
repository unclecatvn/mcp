# Security policy

## Reporting a vulnerability

Please report security issues privately by opening a GitHub Security Advisory at https://github.com/unclecatvn/mcp/security/advisories/new, or by emailing quangnh.tkcn@gmail.com with the subject `SECURITY: @unclecat/mcp-multi-db`.

Do **not** open a public issue for vulnerabilities.

We aim to respond within 7 days.

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅        |
| 1.x     | ❌ (never publicly released) |

## Threat model

This server runs as a privileged process with credentials to one or more databases. Mitigations included:

- Per-alias mode (readonly/readwrite/readwrite+ddl) with conservative defaults.
- Parameterized queries only (no raw query API).
- Strict tool-input validation (zod schemas; identifier regex).
- Per-query timeout, configurable per alias and per request.
- Default row cap (10000) with overflow detection.
- SSL/TLS modes including `verify` with custom CA support.
- Sanitized logging (no passwords or full SQL with bound params).

The server does not provide access control between users — it is intended to run alongside a single AI client per process. To grant different access tiers, run multiple instances with different env configs.
