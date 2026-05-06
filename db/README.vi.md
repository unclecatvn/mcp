# @unclecat/mcp-multi-db

> MCP server cho MySQL/MariaDB, PostgreSQL và SQL Server — với truy vấn parameterized, chế độ an toàn theo alias, timeout, và giới hạn số dòng.

📖 English: [README.md](./README.md) · 🛡️ [Security policy](./SECURITY.md)

## Tính năng

- **Chỉ truy vấn parameterized** — loại bỏ SQL injection ở tầng API.
- **Mode theo alias** — `readonly` (mặc định), `readwrite`, `readwrite+ddl`.
- **Timeout truy vấn** — driver-native, hard cap 600 s.
- **Giới hạn số dòng + phát hiện overflow** — mặc định 10 000, override per-alias / per-request.
- **SSL/TLS** — `disable` / `prefer` / `require` / `verify` (custom CA).
- **Đa CSDL** — MySQL, MariaDB, PostgreSQL, SQL Server cùng lúc.
- **Connection pooling, retry exponential backoff, logging có cấu trúc.**

## Cài đặt

```bash
npx @unclecat/mcp-multi-db
```

Yêu cầu Node ≥ 18.

## Cấu hình

Cấu hình qua biến môi trường, mỗi DB là một *alias*. Mặc định mode là **readonly**.

```bash
# Bắt buộc
DB_PROD_TYPE=postgresql                     # mysql | mariadb | postgresql | sqlserver
DB_PROD_URL=postgresql://user:pass@host:5432/dbname

# Tuỳ chọn, đều có default an toàn
DB_PROD_MODE=readonly                       # readonly (mặc định) | readwrite | readwrite+ddl
DB_PROD_SSL=prefer                          # disable | prefer (mặc định) | require | verify
DB_PROD_TIMEOUT_MS=30000
DB_PROD_MAX_ROWS=10000
DB_PROD_POOL_MAX=5

# Toàn server
MCP_DB_LOG_LEVEL=info                       # debug | info (mặc định) | warn | error
```

Xem [.env.example](./.env.example) cho template đầy đủ.

### Cấu hình với Claude Desktop

Thêm vào `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "DB_PROD_TYPE": "postgresql",
        "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname",
        "DB_PROD_MODE": "readonly"
      }
    }
  }
}
```

## Mô hình bảo mật

Server chạy với credentials của DB. Để giảm phạm vi rủi ro:

| Mode                 | Cho phép                                      |
|----------------------|----------------------------------------------|
| `readonly` (mặc định)| SELECT, EXPLAIN, DESCRIBE, SHOW, USE         |
| `readwrite`          | + INSERT, UPDATE, DELETE, MERGE              |
| `readwrite+ddl`      | + CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, RENAME |

Statement không nhận diện được đều bị từ chối kể cả ở `readwrite+ddl` (deny-by-default).

Khi query bị chặn, error message luôn kèm env var cần set:

```
[DB_PERMISSION_DENIED] Database 'prod' is in readonly mode. Operation 'DELETE'
requires 'readwrite' mode. To allow: set DB_PROD_MODE=readwrite in environment.
```

### Truy vấn parameterized

Tool `db_query` yêu cầu SQL với placeholder và `params` riêng. Không bao giờ ghép chuỗi user input vào SQL.

```js
// Vị trí
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = ?", params: [42] }

// Tên
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = :id", params: { id: 42 } }
```

Server tự dịch `?` và `:name` sang placeholder native của từng driver.

### Row cap và timeout

Mặc định, SELECT không có `LIMIT`/`TOP`/`FETCH` được giới hạn 10 000 dòng; response trả `truncated: true` khi đạt cap. `maxRows` và `timeoutMs` per-query bị clamp về max của alias và hard cap.

## Tools

| Tool | Inputs |
|------|--------|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` |
| `db_list_tables` | `databaseAlias`, `schema?` |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` |
| `db_test_connection` | `databaseAlias` |
| `db_query_history` | `databaseAlias?`, `limit?` |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` |

## Resources

- `db://security-guide` — giải thích về modes và parameterized queries (Markdown).
- `db://aliases` — tóm tắt aliases đã load (JSON, không có secrets).

## Migration từ v1

Đây là bản public đầu tiên. v1.x (chưa publish) đã được thay bằng API parameterized. Mapping:

| v1 (đã bỏ)                                    | v2                                                            |
|-----------------------------------------------|---------------------------------------------------------------|
| `db_query({ type, query: 'SELECT...' })`       | `db_query({ databaseAlias, sql, params })`                    |
| `MYSQL_CONNECTIONS=...`                        | `DB_<ALIAS>_TYPE=mysql ...`                                   |
| Override `connection: {...}` qua tool          | Đã bỏ. Chỉ cấu hình qua env.                                  |

## Troubleshooting

- **`[DB_PERMISSION_DENIED]`** — alias mode không cho phép thao tác. Set `DB_<ALIAS>_MODE`.
- **`[DB_TIMEOUT]`** — tăng `timeoutMs` per request, hoặc `DB_<ALIAS>_TIMEOUT_MS`.
- **`[DB_RESULT_TOO_LARGE]`** — thêm `LIMIT` vào query, hoặc tăng `maxRows`.
- **`[DB_CONNECTION_FAILED]`** — kiểm tra host/port và credentials. Server retry tối đa 3 lần.
- **`[DB_VALIDATION_FAILED]` ở `tableName`** — identifier phải match `^[A-Za-z_][A-Za-z0-9_]*$`.
- **Không alias nào load được** — server exit code 1. Set ít nhất một `DB_<ALIAS>_TYPE` và host.

## Đóng góp

Xem [CONTRIBUTING.md](../CONTRIBUTING.md) ở root monorepo.

## License

MIT — xem [LICENSE](../LICENSE).
