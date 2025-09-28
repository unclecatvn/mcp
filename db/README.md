# Multi-Database MCP Server

MCP Server hỗ trợ nhiều loại database: MySQL/MariaDB, PostgreSQL, và SQL Server.

## 🎯 Tính năng

- **Multi-Database Support**: MySQL/MariaDB, PostgreSQL, SQL Server
- **Multiple Database Instances**: Hỗ trợ nhiều database cùng loại với alias
- **Flexible Connection**: Connection string hoặc individual parameters
- **Environment Variables**: Hỗ trợ config qua env vars
- **Error Handling**: Xử lý lỗi chi tiết theo từng database type
- **Connection Pooling**: Tái sử dụng kết nối hiệu quả

## 📦 Cài đặt

```bash
pnpm install
# hoặc
npm install
```

## ⚙️ Cấu hình

### Environment Variables

#### Phương pháp 1: Multiple Databases với Connection Strings (Khuyến nghị)

```bash
# Nhiều database MySQL với alias
MYSQL_CONNECTIONS="prod=mysql://user:pass@prod-host:3306/prod_db;dev=mysql://user:pass@dev-host:3306/dev_db;test=mysql://user:pass@localhost:3306/test_db"

# Nhiều database PostgreSQL
POSTGRESQL_CONNECTIONS="main=postgresql://user:pass@host1:5432/main_db;analytics=postgresql://user:pass@host2:5432/analytics_db"

# Nhiều database SQL Server
SQLSERVER_CONNECTIONS="primary=sqlserver://user:pass@server1:1433/primary_db;secondary=sqlserver://user:pass@server2:1433/secondary_db"
```

#### Phương pháp 2: Multiple Databases với Individual Variables

```bash
# Database MySQL đầu tiên
MYSQL_DB1_HOST=host1
MYSQL_DB1_PORT=3306
MYSQL_DB1_USER=user1
MYSQL_DB1_PASSWORD=pass1
MYSQL_DB1_DATABASE=db1

# Database MySQL thứ hai
MYSQL_DB2_HOST=host2
MYSQL_DB2_PORT=3306
MYSQL_DB2_USER=user2
MYSQL_DB2_PASSWORD=pass2
MYSQL_DB2_DATABASE=db2

# Tương tự cho PostgreSQL và SQL Server
POSTGRESQL_DB1_HOST=host1
POSTGRESQL_DB1_DATABASE=db1
# ...
```

#### Phương pháp 3: Single Database (Backward Compatibility)

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

### Cursor MCP Configuration

Thêm config vào file `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "node",
      "args": ["/path/to/your/db/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "yourpassword",
        "MYSQL_DATABASE": "mydatabase",

        "POSTGRESQL_HOST": "localhost",
        "POSTGRESQL_USER": "postgres",
        "POSTGRESQL_PASSWORD": "yourpassword",
        "POSTGRESQL_DATABASE": "mydatabase",

        "SQLSERVER_SERVER": "localhost",
        "SQLSERVER_USER": "sa",
        "SQLSERVER_PASSWORD": "yourpassword",
        "SQLSERVER_DATABASE": "mydatabase"
      }
    }
  }
}
```

**Lưu ý:**

- Thay `/path/to/your/db/index.js` bằng đường dẫn thực tế đến file index.js
- Chỉ cần config env vars cho database types mà bạn sử dụng
- Restart Cursor sau khi thay đổi config

## 🚀 Sử dụng

### Tool: `db_query`

**Parameters:**

- `type` (required): Loại database (`mysql`, `mariadb`, `postgresql`, `sqlserver`)
- `query` (required): SQL query để thực thi
- `databaseAlias` (optional): Alias của database để sử dụng (nếu có nhiều database được cấu hình)
- `connection` (optional): Thông tin kết nối database (override env vars)

### 📝 Ví dụ sử dụng

#### 1. Sử dụng với Connection String

```json
{
  "type": "mysql",
  "query": "SHOW DATABASES;",
  "connection": {
    "connectionString": "mysql://user:pass@localhost:3306/mydatabase"
  }
}
```

#### 2. Sử dụng với Individual Parameters

```json
{
  "type": "postgresql",
  "query": "SELECT * FROM pg_tables;",
  "connection": {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "yourpassword",
    "database": "mydatabase"
  }
}
```

#### 3. Sử dụng với Environment Variables (Database mặc định)

```json
{
  "type": "sqlserver",
  "query": "SELECT * FROM sys.tables;"
}
```

#### 4. Sử dụng với Multiple Databases (chỉ định databaseAlias)

```json
{
  "type": "mysql",
  "query": "SELECT * FROM users LIMIT 10;",
  "databaseAlias": "prod"
}
```

#### 5. Override connection với individual parameters

```json
{
  "type": "postgresql",
  "query": "SELECT * FROM analytics_data;",
  "databaseAlias": "analytics",
  "connection": {
    "password": "override_password"
  }
}
```

## 🔧 Database-Specific Commands

### MySQL/MariaDB

```sql
-- Hiển thị databases
SHOW DATABASES;

-- Chọn database
USE mydatabase;

-- Hiển thị tables
SHOW TABLES;

-- Describe table
DESCRIBE table_name;
```

### PostgreSQL

```sql
-- Hiển thị databases
SELECT datname FROM pg_database;

-- Hiển thị tables
SELECT * FROM information_schema.tables;

-- Describe table
\d table_name
-- hoặc
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table_name';
```

### SQL Server

```sql
-- Hiển thị databases
SELECT name FROM sys.databases;

-- Sử dụng database
USE [mydatabase];

-- Hiển thị tables
SELECT * FROM sys.tables;

-- Describe table
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'table_name';
```

## 🎯 Connection String Format

- **MySQL**: `mysql://user:pass@host:port/database`
- **MariaDB**: `mariadb://user:pass@host:port/database`
- **PostgreSQL**: `postgresql://user:pass@host:port/database`
- **SQL Server**: `sqlserver://user:pass@host:port/database`

## 🚨 Lưu ý quan trọng

1. **USE Statement**: Chỉ áp dụng cho MySQL/MariaDB
2. **SQL Syntax**: Mỗi database có syntax khác nhau
3. **Connection Security**: Luôn sử dụng strong passwords và secure connections
4. **Error Handling**: Server sẽ trả về lỗi chi tiết theo từng database type

## 🔍 Troubleshooting

### MySQL/MariaDB

- `ER_NO_DB_ERROR`: Sử dụng `USE database_name;` hoặc specify database trong connection
- `ER_BAD_DB_ERROR`: Database không tồn tại, kiểm tra với `SHOW DATABASES;`

### PostgreSQL

- `3D000`: Database không tồn tại
- `42P01`: Table không tồn tại

### SQL Server

- `Invalid object name`: Object không tồn tại, kiểm tra với `SELECT * FROM sys.tables;`

## 📊 Response Format

### SELECT Queries

```json
{
  "type": "select",
  "databaseType": "mysql",
  "host": "localhost",
  "port": 3306,
  "database": "mydatabase",
  "rowCount": 10,
  "data": [...],
  "fields": [...]
}
```

### Modification Queries

```json
{
  "type": "modification",
  "databaseType": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "mydatabase",
  "affectedRows": 1,
  "insertId": null,
  "message": "Query executed successfully"
}
```

## 🏃 Chạy Server

```bash
pnpm start
# hoặc
node index.js
```
