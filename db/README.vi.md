# MCP Database Server

MCP Server hỗ trợ multi-database với phân tích query thông minh và tối ưu hóa AI cho MySQL/MariaDB, PostgreSQL, và SQL Server.

[🇬🇧 English](./README.md)

## 🎯 Tính năng (Version 1.1.0)

- **Multi-Database Support**: MySQL/MariaDB, PostgreSQL, SQL Server
- **Multiple Database Instances**: Hỗ trợ nhiều database cùng lúc với aliases
- **Flexible Connection**: Connection string hoặc tham số riêng lẻ
- **Environment Variables**: Cấu hình qua env vars
- **Connection Pooling**: Tái sử dụng kết nối hiệu quả
- **Auto Retry**: Tự động retry với exponential backoff (3 retries)
- **AI-Powered Analysis**: Gợi ý tối ưu query và phát hiện anti-pattern
- **Execution Plans**: Hỗ trợ EXPLAIN cho mọi database
- **Query History**: Theo dõi query gần đây với performance metrics
- **Database-Specific Detection**: Phân tích query theo từng loại database
- **Function Detection**: Phát hiện hàm SQL được sử dụng trong query

## 🛠️ MCP Tools

| Tool | Mô tả |
|------|-------|
| `db_query` | Thực thi SQL với tracking performance và metadata |
| `db_analyze_query` | Phân tích query bằng AI và gợi ý tối ưu |
| `db_explain_query` | Lấy execution plan để phân tích performance |
| `db_list_tables` | Liệt kê tất cả tables trong database |
| `db_describe_table` | Xem cấu trúc table (columns, indexes, constraints) |
| `db_query_history` | Xem lịch sử query với performance metrics |

## 📦 Cài đặt

```bash
npm install
# hoặc
pnpm install
```

## ⚙️ Cấu hình

### Phương pháp 1: Nhiều Database với Connection Strings (Khuyến nghị)

```bash
# Nhiều MySQL database với aliases
MYSQL_CONNECTIONS="prod=mysql://user:pass@prod-host:3306/prod_db;dev=mysql://user:pass@dev-host:3306/dev_db"

# Nhiều PostgreSQL database
POSTGRESQL_CONNECTIONS="main=postgresql://user:pass@host1:5432/main_db;analytics=postgresql://user:pass@host2:5432/analytics_db"
```

### Phương pháp 2: Nhiều Database với Variables Riêng

```bash
# MySQL database thứ nhất → alias: db1
MYSQL_DB1_HOST=host1
MYSQL_DB1_PORT=3306
MYSQL_DB1_USER=user1
MYSQL_DB1_PASSWORD=pass1
MYSQL_DB1_DATABASE=db1

# MySQL database thứ hai → alias: db2
MYSQL_DB2_HOST=host2
MYSQL_DB2_PORT=3306
MYSQL_DB2_USER=user2
MYSQL_DB2_PASSWORD=pass2
MYSQL_DB2_DATABASE=db2
```

### Phương pháp 3: Single Database (Tương thích ngược)

```bash
# MySQL/MariaDB
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DATABASE=mydatabase
```

## 🔧 Cursor MCP Configuration

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

**Lưu ý:**
- Database aliases: `MYSQL_DB1_*` → `db1`, `MYSQL_DB2_*` → `db2`, v.v.

## 🚀 Sử Dụng

### Workflow Khuyến Nghị Cho AI

```
1. Hiểu schema     → db_describe_table
2. Phân tích query  → db_analyze_query
3. Kiểm tra plan    → db_explain_query
4. Thực thi         → db_query
5. Xem lịch sử      → db_query_history
```

### Tool: `db_query`

Thực thi SQL query với tracking performance.

**Tham số:**
- `type` (bắt buộc): Loại database (`mysql`, `mariadb`, `postgresql`, `sqlserver`)
- `query` (bắt buộc): SQL query
- `databaseAlias` (tùy chọn): Alias database (`db1`, `db2`, v.v.)
- `connection` (tùy chọn): Override config kết nối

**Response:** Kết quả + metadata (thời gian, rows, tables)

---

### Tool: `db_analyze_query`

Phân tích query bằng AI với gợi ý tối ưu.

**Tham số:**
- `type` (bắt buộc): Loại database
- `query` (bắt buộc): SQL query

**Phát hiện:**
- Loại query (SELECT/INSERT/UPDATE/DELETE/DDL)
- Anti-patterns (SELECT *, wildcard, thiếu index)
- Vấn đề database-specific
- Hàm được sử dụng

---

### Tool: `db_explain_query`

Lấy execution plan để phân tích performance.

**Tham số:**
- `type` (bắt buộc): Loại database
- `query` (bắt buộc): SQL query
- `databaseAlias` (tùy chọn): Alias database
- `connection` (tùy chọn): Override kết nối

---

### Tool: `db_list_tables`

Liệt kê tất cả tables trong database.

---

### Tool: `db_describe_table`

Xem cấu trúc chi tiết table (columns, indexes, constraints).

---

### Tool: `db_query_history`

Xem lịch sử query với performance metrics.

---

## 📝 Ví Dụ Sử Dụng

### 1. Phân Trước Khi Thực Thi

```json
{
  "type": "mysql",
  "query": "SELECT * FROM users WHERE name LIKE '%john%'"
}
```

### 2. Kiểm Tra Execution Plan

```json
{
  "type": "postgresql",
  "query": "SELECT * FROM orders JOIN users ON orders.user_id = users.id"
}
```

### 3. Thực Thi Với Metadata

```json
{
  "type": "mysql",
  "databaseAlias": "db1",
  "query": "SELECT id, name FROM users LIMIT 10"
}
```

## 🎯 Hướng Dẫn Database-Specific

### MySQL/MariaDB
- Limit: `LIMIT offset, count`
- Index hints: `USE INDEX (index_name)` hoặc `FORCE INDEX`
- Chú ý: filesort, temporary tables

### PostgreSQL
- Limit: `LIMIT count OFFSET offset`
- Pagination >1000: Dùng keyset/cursor pagination
- EXPLAIN: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
- ILIKE: Không dùng index (trừ khi dùng pg_trgm)

### SQL Server
- Limit: `OFFSET offset ROWS FETCH NEXT count ROWS ONLY`
- Luôn dùng ORDER BY với TOP
- Tránh NOLOCK (dùng READ COMMITTED SNAPSHOT thay thế)
- String concat `+` có vấn đề với NULL

## 📌 Anti-Patterns Được Phát Hiện

| Pattern | Vấn Đề | Khắc Phục |
|---------|-------|-----------|
| `SELECT *` | Lấy tất cả columns | Chỉ định nghĩa columns cần thiết |
| `LIKE '%value'` | Không dùng index | Full-text search, pg_trgm |
| `DELETE/UPDATE` no WHERE | Nguy hiểm | Luôn thêm WHERE |
| `OR col=x OR col=y` | Không hiệu quả | Dùng `IN` clause |
| `NOT IN` | Chậm trên dataset lớn | Dùng `NOT EXISTS` |
| High OFFSET (>1000) | Chậm pagination | Dùng keyset pagination |

## 📊 Response Format

Mọi response `db_query` đều bao gồm:

```json
{
  "content": [
    { "type": "text", "text": "[Kết quả Query]" },
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
- `ER_NO_DB_ERROR`: Chỉ định database trong connection hoặc dùng `USE database;`
- `ER_BAD_DB_ERROR`: Kiểm tra với `SHOW DATABASES;`

### PostgreSQL
- `3D000`: Database không tồn tại
- `42P01`: Table không tồn tại
- High OFFSET không hiệu quả → Dùng keyset pagination

### SQL Server
- `Invalid object name`: Kiểm tra với `SELECT * FROM sys.tables;`
- TOP không ORDER BY → Kết quả không xác định

## 🏃 Chạy Server

```bash
npm start
# hoặc
node index.js
```

## 📝 Giấy Phép

MIT

## 👤 Tác Giả

**UncleCat** - [@unclecatvn](https://github.com/unclecatvn)
