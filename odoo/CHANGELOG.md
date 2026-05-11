# @unclecat/mcp-odoo

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- No changes yet.

## [0.0.1] - 2026-05-11

### Added

- Initial public baseline release for the package.
- MCP server for Odoo v18+ via JSON-RPC.
- Multi-instance support via `ODOO_<NAME>_*` env blocks.
- Auth via API key (preferred) or password, per connection.
- Generic CRUD tools: `search_read`, `search_count`, `name_search`, `read_group`, `create`, `write`, `unlink`.
- `fields_get` for schema discovery and `call_method` as a generic `execute_kw` escape hatch.
- `list_connections` for discovery of configured instances.
- Built-in Odoo cheatsheet sent on `initialize` (domains, command tuples, common models).
- Stable error envelopes with documented error codes.
- Core project documentation: `README.md`, `README.vi.md`, `LICENSE`, and `.env.example`.

[Unreleased]: https://github.com/unclecatvn/mcp/compare/@unclecat/mcp-odoo@0.0.1...HEAD
[0.0.1]: https://github.com/unclecatvn/mcp/releases/tag/@unclecat/mcp-odoo@0.0.1
