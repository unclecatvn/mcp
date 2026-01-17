/**
 * Resource Handlers Module
 * Implements MCP resource handlers for AI assistant guidance
 * @module lib/resourceHandlers
 */

/**
 * Get AI assistant guidance/prompt for using this MCP server
 * @returns {string} Markdown formatted guidance
 */
export function getAssistantGuidance() {
  return `# Database MCP Server - AI Assistant Guidelines

## Overview
This MCP server provides intelligent database query capabilities with automatic performance analysis and optimization suggestions.

## Available Tools

### 1. db_query - Execute SQL with Performance Tracking
- Returns results + execution metadata (time, rows, tables)
- Automatically tracks query history for review

### 2. db_analyze_query - Review Query Before Execution
- Detects anti-patterns (SELECT *, wildcards, missing indexes)
- Database-specific optimization hints
- Function usage detection
- **USE THIS before running expensive queries**

### 3. db_explain_query - Get Execution Plan
- Shows how database will execute the query
- Identifies full table scans, index usage
- **USE THIS for performance tuning**

### 4. db_list_tables - List All Tables
### 5. db_describe_table - Get Table Schema
### 6. db_query_history - Review Recent Queries

## Recommended Workflow

When user asks to query a database:

1. **Understand schema**: Use \`db_describe_table\` to see columns and indexes
2. **Analyze query**: Use \`db_analyze_query\` to check for issues
3. **Check plan**: Use \`db_explain_query\` for complex/expensive queries
4. **Execute**: Use \`db_query\` to run with performance tracking
5. **Review**: Check metadata in response for execution time and optimization opportunities

## Database-Specific Guidance

### MySQL/MariaDB
- Limit: \`LIMIT offset, count\`
- Index hints: \`USE INDEX (index_name)\` or \`FORCE INDEX\`
- Watch for: filesort, temporary tables

### PostgreSQL
- Limit: \`LIMIT count OFFSET offset\`
- For pagination >1000: Use keyset/cursor pagination
- For case-insensitive search: Consider pg_trgm extension
- EXPLAIN: \`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\`

### SQL Server
- Limit: \`OFFSET offset ROWS FETCH NEXT count ROWS ONLY\`
- Always use ORDER BY with TOP
- Avoid NOLOCK (use READ COMMITTED SNAPSHOT instead)
- String concat: Use CONCAT() not +

## Common Anti-Patterns to Flag

- \`SELECT *\` → Specify columns
- \`LIKE '%value'\` → Leading wildcard prevents index
- \`DELETE/UPDATE\` without WHERE → Dangerous
- \`OR column=x OR column=y\` → Use IN clause
- \`NOT IN\` → Consider NOT EXISTS
- High OFFSET (>1000) → Use keyset pagination

## Response Format

All \`db_query\` responses include:
- Query results (JSON)
- Query metadata (type, execution time, rows, tables)
- Use this metadata to suggest optimizations if execution time >100ms
`;
}

/**
 * Get MCP resource definitions
 * @returns {Object[]} Array of resource definitions
 */
export function getResourceDefinitions() {
  return [
    {
      uri: "mcp://db/guidance",
      name: "AI Assistant Guidance",
      description: "Guidelines for AI assistants when using this MCP server",
      mimeType: "text/markdown",
    },
  ];
}

/**
 * Read resource content by URI
 * @param {string} uri - Resource URI
 * @returns {Object} Resource content
 * @throws {Error} If resource not found
 */
export function readResource(uri) {
  if (uri === "mcp://db/guidance") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: getAssistantGuidance(),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
}
