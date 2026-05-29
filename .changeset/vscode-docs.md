---
"@unclecat/mcp-multi-db": patch
---

docs: VS Code native MCP setup + documentation refresh.

Documentation-only release — no runtime or API changes. Existing configs keep working as-is.

**VS Code integration (README.md + README.vi.md)**

- New **VS Code** section under Quick start covering VS Code 1.102+ native MCP support.
- Shows the `.vscode/mcp.json` workspace config, calling out that the top-level key is `servers` (not `mcpServers` as in Claude Desktop).
- Uses `${workspaceFolder}` for `MCP_DB_CONFIG` so the config file can live in the repo root with no hardcoded absolute path — solving the "must be an absolute path" caveat per machine.
- Documents the `inputs` / `promptString` pattern to prompt for the config path instead of committing it.
- Notes per-workspace vs. global setup (`MCP: Open User Configuration` / the `mcp` key in user `settings.json`), where to view logs (MCP view in the Extensions panel), and the GitHub Copilot Agent-mode requirement.
- Mirrored in the Vietnamese README (`README.vi.md`).

**CLAUDE.md refresh**

- Rewritten to match the current `lib/`-based architecture. The previous version described a monolithic `mcpServer.js` (~700 lines, 3 tools) that no longer reflects the code.
- Documents the real layout: `mcpServer.js` (~126 lines) only wires modules, registers handlers, and manages shutdown; logic lives in the `lib/` modules.
- Adds a module map (loader, configFile/config, connectionManager, toolHandlers, resourceHandlers, queryAnalyzer, modeEnforcer, paramConverter, limits, validators, errors).
- Describes the startup sequence, the full query pipeline (`analyzeQuery → enforceMode → applyRowLimit → convertParams → withRetry`), all **6** tools (`db_query`, `db_list_tables`, `db_describe_table`, `db_test_connection`, `db_query_history`, `db_explain_query`), both resources (`db://aliases`, `db://security-guide`), and the security model.
- Updates the commands section to the real Vitest test scripts (`test`, `test:watch`, `test:coverage`) and lint/format commands, replacing the old "no test framework configured" note.
