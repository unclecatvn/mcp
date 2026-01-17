# MCP Database Server

Multi-Database MCP Server with intelligent query analysis and AI-assisted optimization for MySQL/MariaDB, PostgreSQL, and SQL Server.

[🇻🇳 Tiếng Việt](./README.vi.md)

## 🎯 Features

- **Multi-Database Support**: MySQL/MariaDB, PostgreSQL, SQL Server
- **Multiple Database Instances**: Support multiple databases of the same type with aliases
- **Flexible Connection**: Connection string or individual parameters
- **Environment Variables**: Configuration via env vars
- **Connection Pooling**: Efficient connection reuse
- **Auto Retry**: Automatic retry with exponential backoff (3 retries)
- **AI-Powered Analysis**: Query optimization suggestions and anti-pattern detection
- **Execution Plans**: EXPLAIN support for all database types
- **Query History**: Track recent queries with performance metrics

## 🛠️ MCP Tools

| Tool | Description |
|------|-------------|
| `db_query` | Execute SQL with performance tracking and metadata |
| `db_analyze_query` | AI-powered query analysis and optimization suggestions |
| `db_explain_query` | Get execution plan to analyze query performance |
| `db_list_tables` | List all tables in database |
| `db_describe_table` | Get table structure (columns, indexes, constraints) |
| `db_query_history` | Review recent queries with performance metrics |

## 📦 Installation

```bash
npm install
# or
pnpm install
```

## ⚙️ Configuration

### Method 1: Multiple Databases with Connection Strings (Recommended)

```bash
# Multiple MySQL databases with aliases
MYSQL_CONNECTIONS="prod=mysql://user:pass@prod-host:3306/prod_db;dev=mysql://user:pass@dev-host:3306/dev_db"

# Multiple PostgreSQL databases
POSTGRESQL_CONNECTIONS="main=postgresql://user:pass@host1:5432/main_db;analytics=postgresql://user:pass@host2:5432/analytics_db"

# Multiple SQL Server databases
SQLSERVER_CONNECTIONS="primary=sqlserver://user:pass@server1:1433/primary_db;secondary=sqlserver://user:pass@server2:1433/secondary_db"
```

### Method 2: Multiple Databases with Individual Variables

```bash
# First MySQL database → alias: db1
MYSQL_DB1_HOST=host1
MYSQL_DB1_PORT=3306
MYSQL_DB1_USER=user1
MYSQL_DB1_PASSWORD=pass1
MYSQL_DB1_DATABASE=db1

# Second MySQL database → alias: db2
MYSQL_DB2_HOST=host2
MYSQL_DB2_PORT=3306
MYSQL_DB2_USER=user2
MYSQL_DB2_PASSWORD=pass2
MYSQL_DB2_DATABASE=db2

# Similar for PostgreSQL and SQL Server
POSTGRESQL_DB1_HOST=host1
POSTGRESQL_DB1_DATABASE=db1
```

### Method 3: Single Database (Backward Compatibility)

```bash
# MySQL/MariaDB
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DATABASE=mydatabase

# PostgreSQL
POSTGRESQL_HOST=localhost
POSTGRESQL_PORT=5432
POSTGRESQL_USER=postgres
POSTGRESQL_PASSWORD=yourpassword
POSTGRESQL_DATABASE=mydatabase

# SQL Server
SQLSERVER_SERVER=localhost
SQLSERVER_PORT=1433
SQLSERVER_USER=sa
SQLSERVER_PASSWORD=yourpassword
SQLSERVER_DATABASE=mydatabase
```

## 🔧 Cursor MCP Configuration

Add config to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "node",
      "args": ["/path/to/mcp/db/index.js"],
      "env": {
        "MYSQL_DB1_HOST": "localhost",
        "MYSQL_DB1_PORT": "3306",
        "MYSQL_DB1_USER": "root",
        "MYSQL_DB1_PASSWORD": "yourpassword",
        "MYSQL_DB1_DATABASE": "mydatabase",

        "POSTGRESQL_DB1_HOST": "localhost",
        "POSTGRESQL_DB1_PORT": "5432",
        "POSTGRESQL_DB1_USER": "postgres",
        "POSTGRESQL_DB1_PASSWORD": "yourpassword",
        "POSTGRESQL_DB1_DATABASE": "mydatabase"
      }
    }
  }
}
```

**Notes:**
- Replace `/path/to/mcp/db/index.js` with the actual path
- Database aliases: `MYSQL_DB1_*` → `db1`, `MYSQL_DB2_*` → `db2`, etc.
- Restart Cursor after changing config

## 🚀 Usage

### Recommended AI Workflow

```
1. Understand schema → db_describe_table
2. Analyze query   → db_analyze_query
3. Check execution plan → db_explain_query
4. Execute query    → db_query
5. Review history    → db_query_history
```

### Tool: `db_query`

Execute SQL queries with performance tracking.

**Parameters:**
- `type` (required): Database type (`mysql`, `mariadb`, `postgresql`, `sqlserver`)
- `query` (required): SQL query to execute
- `databaseAlias` (optional): Database alias (`db1`, `db2`, etc.)
- `connection` (optional): Override connection config

**Response:** Results + execution metadata (time, rows, tables)

---

### Tool: `db_analyze_query`

AI-powered query analysis with optimization suggestions.

**Parameters:**
- `type` (required): Database type
- `query` (required): SQL query to analyze

**Detects:**
- Query type (SELECT/INSERT/UPDATE/DELETE/DDL)
- Anti-patterns (SELECT *, wildcards, missing indexes)
- Database-specific issues
- Function usage

**Returns:** Optimization suggestions and best practices

---

### Tool: `db_explain_query`

Get execution plan to analyze query performance.

**Parameters:**
- `type` (required): Database type
- `query` (required): SQL query to explain
- `databaseAlias` (optional): Database alias
- `connection` (optional): Override connection config

---

### Tool: `db_list_tables`

List all tables in the database.

---

### Tool: `db_describe_table`

Get detailed table structure (columns, data types, indexes, constraints).

---

### Tool: `db_query_history`

Get recent query execution history with performance metrics.

---

## 📝 Usage Examples

### 1. Analyze Before Execution

```json
{
  "type": "mysql",
  "query": "SELECT * FROM users WHERE name LIKE '%john%'"
}
```

### 2. Check Execution Plan

```json
{
  "type": "postgresql",
  "query": "SELECT * FROM orders JOIN users ON orders.user_id = users.id"
}
```

### 3. Execute with Metadata

```json
{
  "type": "mysql",
  "databaseAlias": "db1",
  "query": "SELECT id, name FROM users LIMIT 10"
}
```

## 🎯 Database-Specific Guidance

### MySQL/MariaDB
- Limit: `LIMIT offset, count`
- Index hints: `USE INDEX (index_name)` or `FORCE INDEX`
- Watch for: filesort, temporary tables

### PostgreSQL
- Limit: `LIMIT count OFFSET offset`
- For pagination >1000: Use keyset/cursor pagination
- EXPLAIN: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`

### SQL Server
- Limit: `OFFSET offset ROWS FETCH NEXT count ROWS ONLY`
- Always use ORDER BY with TOP
- Avoid NOLOCK (use READ COMMITTED SNAPSHOT instead)

## 📌 Common Anti-Patterns Detected

| Pattern | Issue | Fix |
|---------|-------|-----|
| `SELECT *` | Retrieves all columns | Specify columns |
| `LIKE '%value'` | No index usage | Full-text search, pg_trgm |
| `DELETE/UPDATE` no WHERE | Dangerous | Always add WHERE |
| `OR col=x OR col=y` | Inefficient | Use `IN` clause |
| `NOT IN` | Slow on large datasets | Use `NOT EXISTS` |
| High OFFSET (>1000) | Slow pagination | Use keyset pagination |

## 📊 Response Format

All `db_query` responses include:

```json
{
  "content": [
    { "type": "text", "text": "[Query Results]" },
    { "type": "text", "text": "--- Query Metadata ---\nDatabase: mysql @ host:3306/db\nQuery Type: SELECT\nExecution Time: 45ms\nRows Returned: 10\nTables: users" }
  ],
  "_metadata": {
    "databaseType": "mysql",
    "executionTime": 45,
    "success": true,
    "rowCount": 10
  }
}
```

## 🔧 Troubleshooting

### MySQL/MariaDB
- `ER_NO_DB_ERROR`: Specify database in connection or use `USE database;`
- `ER_BAD_DB_ERROR`: Check with `SHOW DATABASES;`

### PostgreSQL
- `3D000`: Database doesn't exist
- `42P01`: Table doesn't exist
- High OFFSET inefficient → Use keyset pagination

### SQL Server
- `Invalid object name`: Check with `SELECT * FROM sys.tables;`
- TOP without ORDER BY → Non-deterministic results

## 🏃 Run Server

```bash
npm start
# or
node index.js
```

## 📝 License

MIT

## 👤 Author

**UncleCat** - [@unclecatvn](https://github.com/unclecatvn)
