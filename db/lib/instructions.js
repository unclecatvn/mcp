/**
 * Server-level instructions shipped via MCP initialize. Keep concise — tool
 * descriptions already embed the alias roster at startup.
 */
export const INSTRUCTIONS = `You are connected to one or more SQL databases via parameterized MCP tools.

WORKFLOW
  1. Pick the right databaseAlias (or omit it when a defaultAlias is configured).
  2. db_list_tables / db_describe_table for schema discovery before writing SQL.
  3. db_query for reads and writes — ALWAYS use ? or :name placeholders.
  4. db_explain_query to inspect slow queries without executing them for real.

ALIAS ROUTING
  • Tool descriptions list every loaded alias with type, mode, and metadata.
  • When defaultSchema is set (e.g. public for Odoo), omit schema on list/describe tools.
  • Use namePattern on db_list_tables (e.g. sale_%) instead of loading every table.

SAFETY
  • Default mode is readonly — INSERT/UPDATE/DELETE require readwrite; DDL requires readwrite+ddl.
  • Wide SELECTs are auto-capped; response includes truncated:true when capped.
  • Never concatenate user input into SQL strings.

RESOURCES
  • db://aliases — JSON summary of loaded aliases (no secrets).
  • db://security-guide — modes, placeholders, and limits.

ERROR CODES
  DB_PERMISSION_DENIED, DB_VALIDATION_FAILED, DB_CONNECTION_FAILED, DB_TIMEOUT,
  DB_QUERY_FAILED, DB_CONFIG_INVALID
`;
