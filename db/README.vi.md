# @unclecat/mcp-multi-db

> MCP server cho MySQL, MariaDB, PostgreSQL và SQL Server. Server chỉ chạy query có tham số (parameterized), áp dụng một safety mode cho từng database, và giới hạn số dòng trả về cũng như thời gian chạy query.

[![npm](https://img.shields.io/npm/v/@unclecat/mcp-multi-db.svg)](https://www.npmjs.com/package/@unclecat/mcp-multi-db)
[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

[English](./README.md) · **Tiếng Việt** · [Chính sách bảo mật](../SECURITY.md)

Một server cấp cho trợ lý AI quyền truy cập SQL có kiểm soát tới bao nhiêu database tùy bạn cấu hình, và mỗi database (một *alias*) có engine, thông tin đăng nhập, giới hạn và mức quyền riêng. Mọi alias đều chỉ đọc cho đến khi bạn cho phép thêm.

- [Tính năng](#tính-năng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình](#cấu-hình)
- [Mô hình bảo mật](#mô-hình-bảo-mật)
- [Tool và resource](#tool-và-resource)
- [Xử lý sự cố](#xử-lý-sự-cố)
- [Phát triển](#phát-triển)

## Tính năng

- **Chỉ chạy query có tham số.** SQL injection bị chặn ngay ở tầng API. Các placeholder `?` và `:named` được chuyển sang dạng native của từng dialect.
- **Một safety mode cho mỗi alias:**
  - `readonly` (mặc định);
  - `readwrite`;
  - `readwrite+ddl`.

  Query nhiều câu lệnh được kiểm tra theo mode nghiêm ngặt nhất mà bất kỳ câu lệnh nào trong đó yêu cầu.
- **Bốn engine chạy song song:** MySQL, MariaDB, PostgreSQL và SQL Server.
- **Định tuyến model tới đúng database.** `description`, `tablesHint` và `defaultSchema` của mỗi alias được ghi vào phần mô tả tool, nhờ đó model biết database nào chứa dữ liệu gì.
- **Cơ chế bảo vệ cho production:**
  - timeout cho query;
  - giới hạn số dòng, và báo khi kết quả bị cắt bớt;
  - SSL/TLS (`disable` / `prefer` / `require` / `verify`);
  - connection pooling;
  - retry với exponential backoff;
  - log có cấu trúc trên stderr.

## Bắt đầu nhanh

Yêu cầu **Node.js 20+**. Không cần cài đặt gì; `npx` sẽ tải package.

### 1. Mô tả các database của bạn

Tạo file `mcp-db.config.json`. Bạn có thể bắt đầu từ [`mcp-db.config.example.json`](./mcp-db.config.example.json):

```jsonc
{
  "$schema": "https://unpkg.com/@unclecat/mcp-multi-db/schema/config.schema.json",
  "defaultAlias": "prod",
  "aliases": {
    "prod": {
      "type": "postgresql",
      "url": "postgresql://readonly:secret@db.example.com:5432/main",
      "mode": "readonly",
      "displayName": "Production",
      "description": "Read-only mirror of production: orders, customers, products.",
      "tablesHint": ["orders", "customers", "products"],
      "defaultSchema": "public"
    },
    "staging": {
      "type": "mysql",
      "host": "stg.example.com",
      "user": "app",
      "password": "secret",
      "database": "appdb",
      "mode": "readwrite"
    }
  }
}
```

Dòng `$schema` giúp bạn có autocomplete và validation trong VS Code và các IDE của JetBrains.

### 2. Đăng ký server

**Claude Code**

```bash
claude mcp add multi-db -e MCP_DB_CONFIG=/absolute/path/to/mcp-db.config.json -- npx -y @unclecat/mcp-multi-db
```

**Claude Desktop, Cursor, Windsurf** (`claude_desktop_config.json`, `.cursor/mcp.json` hoặc `.mcp.json`)

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": { "MCP_DB_CONFIG": "/absolute/path/to/mcp-db.config.json" }
    }
  }
}
```

**VS Code 1.102+** (`.vscode/mcp.json`; key cấp cao nhất là `servers`)

```json
{
  "servers": {
    "multi-db": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": { "MCP_DB_CONFIG": "${workspaceFolder}/mcp-db.config.json" }
    }
  }
}
```

Hãy dùng **đường dẫn tuyệt đối** cho `MCP_DB_CONFIG`, vì host quyết định thư mục làm việc của server. Trong VS Code, `${workspaceFolder}` sẽ được mở rộng thành một đường dẫn tuyệt đối.

Khi khởi động, server ghi log những gì nó đã nạp:

```
[info] event="loaded_aliases" source="config_file" count=2 aliases="prod(postgresql,readonly), staging(mysql,readwrite)" defaultAlias="prod"
```

## Cấu hình

### Kết nối (theo từng alias)

| Trường | Bắt buộc | Mô tả |
|---|---|---|
| `type` | có | `postgresql`, `mysql`, `mariadb` hoặc `sqlserver` |
| `url` | một trong `url` / `host` | URL kết nối |
| `host`, `port`, `user`, `password`, `database` | một trong `url` / `host` | Các trường khai báo tường minh. Chúng ghi đè các phần tương ứng của `url` khi cả hai cùng được đặt. |

### Giới hạn và transport (theo từng alias, tất cả đều tùy chọn)

| Trường | Mặc định | Giới hạn cứng | Mô tả |
|---|---|---|---|
| `mode` | `readonly` | — | `readonly`, `readwrite` hoặc `readwrite+ddl` |
| `ssl` | `prefer` | — | `disable`, `prefer`, `require` hoặc `verify` |
| `caCert` | — | — | Chứng chỉ CA tùy chỉnh cho TLS |
| `timeoutMs` | `30000` | `600000` | Timeout của query |
| `maxRows` | `10000` | `1000000` | Giới hạn số dòng cho các câu `SELECT` không có giới hạn |
| `poolMax` | `5` | `100` | Kích thước connection pool |

### Metadata định tuyến (theo từng alias, chỉ trong JSON config)

| Trường | Tác dụng |
|---|---|
| `displayName` | Nhãn ngắn hiển thị cạnh alias trong phần mô tả tool. |
| `description` | Một dòng mô tả database chứa gì. Model dùng nó để chọn alias. |
| `tablesHint` | Các tên bảng có khả năng cao, làm điểm khởi đầu cho model. |
| `defaultSchema` | Được `db_list_tables` và `db_describe_table` dùng khi không truyền `schema`, ví dụ `public`. |

### Cấp cao nhất

| Trường | Mô tả |
|---|---|
| `aliases` | Bắt buộc. Một map từ tên alias sang config. Tên phải khớp `^[a-z][a-z0-9_]*$`. |
| `defaultAlias` | Tùy chọn. Khi được đặt, các tool có thể bỏ qua `databaseAlias` và alias này sẽ được dùng. |
| `logLevel` | `debug`, `info` (mặc định), `warn` hoặc `error`. Biến môi trường `MCP_DB_LOG_LEVEL` được ưu tiên hơn. |

Server cũng thêm một `enum` JSON-Schema gồm các alias đã nạp vào `databaseAlias`, nên client không thể nhắm tới một alias không tồn tại.

### Cách khác: biến môi trường

Khi `MCP_DB_CONFIG` **không** được đặt, các alias được đọc từ các biến `DB_<ALIAS>_*`. Cách này tiện khi chỉ có một database:

```json
"env": {
  "DB_PROD_TYPE": "postgresql",
  "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname"
}
```

Các trường khả dụng: `_TYPE`, `_URL`, `_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_DATABASE`, `_MODE`, `_SSL`, `_CA_CERT`, `_TIMEOUT_MS`, `_MAX_ROWS` và `_POOL_MAX`. Tên alias viết hoa trong tên biến (`DB_PROD_*`) và viết thường trong lời gọi tool (`"prod"`). Metadata định tuyến chỉ có trong JSON config. Xem [`.env.example`](./.env.example).

Hai loader loại trừ lẫn nhau:
- Nếu `MCP_DB_CONFIG` được đặt, file JSON được dùng và các biến `DB_*` bị bỏ qua.
- Nếu không đặt, các biến `DB_*` được dùng.
- Nếu cả hai cách đều không nạp được alias nào, server thoát với mã 1.

## Mô hình bảo mật

### Mode

| Mode | Các câu lệnh được phép |
|---|---|
| `readonly` *(mặc định)* | `SELECT`, `EXPLAIN`, `DESCRIBE`, `SHOW`, `USE` |
| `readwrite` | mọi câu lệnh ở trên, cộng thêm `INSERT`, `UPDATE`, `DELETE`, `MERGE` |
| `readwrite+ddl` | mọi câu lệnh ở trên, cộng thêm `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `RENAME` |

Các loại câu lệnh không xác định bị từ chối ở mọi mode. Một câu lệnh bị chặn sẽ trả về `DB_PERMISSION_DENIED` kèm đúng thiết lập cần đổi. Các kết nối MySQL chạy với `multipleStatements: false`.

### Query có tham số

```js
// Positional
{ "databaseAlias": "prod", "sql": "SELECT * FROM users WHERE id = ?", "params": [42] }

// Named
{ "databaseAlias": "prod", "sql": "SELECT * FROM users WHERE id = :id", "params": { "id": 42 } }
```

Placeholder được chuyển thành `$1`, `?` hoặc `@p1` tùy dialect. Placeholder nằm trong string literal và comment được giữ nguyên, và việc placeholder không khớp với params sẽ bị từ chối.

### Giới hạn số dòng và timeout

Một câu `SELECT` không có `LIMIT`, `TOP` hoặc `FETCH` bị giới hạn ở `maxRows`, và response khi đó có thêm `truncated: true`. Mỗi lời gọi có thể hạ thấp các giới hạn này, nhưng không bao giờ vượt quá thiết lập của alias hay các giới hạn cứng toàn cục:

```js
{ "databaseAlias": "prod", "sql": "SELECT * FROM big_table", "maxRows": 50, "timeoutMs": 5000 }
```

## Tool và resource

Phần mô tả tool được dựng lại khi khởi động để bao gồm danh sách các alias đã nạp.

| Tool | Đầu vào | Mô tả |
|---|---|---|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` | Chạy SQL có tham số. |
| `db_list_tables` | `databaseAlias`, `schema?`, `limit?`, `offset?`, `namePattern?` | Liệt kê các bảng. Mỗi trang mặc định 100 dòng (tối đa 500), và `namePattern` nhận một pattern `LIKE` của SQL như `sale_%`. |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` | Các cột và index của một bảng. |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` | `EXPLAIN` theo từng dialect. |
| `db_test_connection` | `databaseAlias` | Health check nhẹ bằng `SELECT 1`. |
| `db_query_history` | `databaseAlias?`, `limit?` | Metadata của các query gần đây: 50 lời gọi gần nhất, không kèm nội dung SQL. |

`databaseAlias` là tùy chọn ở mọi tool khi `defaultAlias` đã được cấu hình.

| Resource | Nội dung |
|---|---|
| `db://aliases` | Tóm tắt dạng JSON về các alias đã nạp và metadata của chúng. Không chứa secret. |
| `db://security-guide` | Tài liệu tham khảo dạng Markdown về các mode và query có tham số. |

## Xử lý sự cố

| Mã hoặc thông báo | Ý nghĩa và cách khắc phục |
|---|---|
| `DB_PERMISSION_DENIED` | Mode của alias không cho phép câu lệnh này. Nâng `mode` trong JSON config hoặc trong `DB_<ALIAS>_MODE`. |
| `DB_TIMEOUT` | Query chạy quá timeout. Tăng `timeoutMs` của alias hoặc truyền `timeoutMs` trong lời gọi. |
| `DB_RESULT_TOO_LARGE` | Vượt quá giới hạn số dòng. Thêm `LIMIT` hoặc tăng `maxRows`. |
| `DB_CONNECTION_FAILED` | Không kết nối được tới database. Kiểm tra host, port và thông tin đăng nhập. Server đã retry 3 lần với backoff. |
| `DB_VALIDATION_FAILED` | Identifier không hợp lệ. `databaseAlias`, `tableName` và `schema` phải khớp `^[A-Za-z_][A-Za-z0-9_]*$`. |
| `DB_CONFIG_INVALID` | Một alias có config biến môi trường sai. Thông báo nêu tên trường, và các alias khác vẫn được nạp. |
| `Config file not readable at '...'` | Dùng đường dẫn `MCP_DB_CONFIG` tuyệt đối và kiểm tra quyền của file. |
| `Config file is not valid JSON` / `Config schema error: ...` | Sửa trường mà thông báo nêu tên. Khi đã đặt `$schema`, editor sẽ tô sáng lỗi cho bạn. |
| `defaultAlias '...' does not reference a loaded alias` | Gõ sai `defaultAlias`. Server vẫn khởi động, nhưng không có alias mặc định. |
| `event="no_valid_aliases"` (exit 1) | Không có alias nào được nạp. Hãy cấu hình ít nhất một alias. |

Để xem những gì đã được nạp, hãy đọc dòng log khởi động `loaded_aliases` hoặc resource `db://aliases`.

## Phát triển

```bash
pnpm install
pnpm --filter @unclecat/mcp-multi-db test
pnpm --filter @unclecat/mcp-multi-db test:coverage
MCP_DB_CONFIG=/path/to/config.json node db/index.js
```

Ghi chú kiến trúc dành cho contributor nằm trong [CLAUDE.md](./CLAUDE.md). Quy trình branch và release được mô tả trong [CONTRIBUTING.md](../CONTRIBUTING.md).

## Giấy phép

[MIT](./LICENSE)
