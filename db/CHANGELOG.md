# @unclecat/mcp-multi-db

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- No changes yet.

## [0.0.1] - 2026-05-08

### Added

- Initial public baseline release for the package.
- MCP server support for MySQL/MariaDB, PostgreSQL, and SQL Server.
- Parameterized query handling with alias-based configuration (`DB_<ALIAS>_*`).
- Safety modes per alias: `readonly`, `readwrite`, and `readwrite+ddl`.
- Core project documentation: `README.md`, `README.vi.md`, `SECURITY.md`, and `.env.example`.

### Changed

- Versioning and release process normalized to SemVer with `vX.Y.Z` tag naming.

[Unreleased]: https://github.com/unclecatvn/mcp/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/unclecatvn/mcp/releases/tag/v0.0.1
