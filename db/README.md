# Multi-Database MCP Server

MCP Server hỗ trợ nhiều loại database: MySQL/MariaDB, PostgreSQL, và SQL Server.

## 🎯 Tính năng

- **Multi-Database Support**: MySQL/MariaDB, PostgreSQL, SQL Server
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

## 🚀 Sử dụng

### Tool: `db_query`

**Parameters:**
- `type` (required): Loại database (`mysql`, `mariadb`, `postgresql`, `sqlserver`)
- `query` (required): SQL query để thực thi
- `connection` (optional): Thông tin kết nối database

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

#### 3. Sử dụng với Environment Variables

```json
{
  "type": "sqlserver",
  "query": "SELECT * FROM sys.tables;"
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