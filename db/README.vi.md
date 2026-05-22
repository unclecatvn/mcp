# @unclecat/mcp-multi-db

> MCP server cho MySQL/MariaDB, PostgreSQL và SQL Server — parameterized queries, mode an toàn theo alias, timeout, row caps.

📖 English: [README.md](./README.md) · 🛡️ [Security policy](../SECURITY.md)

## Tính năng

- **Chỉ truy vấn parameterized** — loại bỏ SQL injection ở tầng API.
- **Mode theo alias** — `readonly` (mặc định), `readwrite`, `readwrite+ddl`.
- **Đa CSDL** — MySQL, MariaDB, PostgreSQL, SQL Server cùng một server.
- **Tool description có metadata** — `description` + `tablesHint` của từng alias được nhúng vào MCP tool schema để AI chọn đúng DB, không phải đoán.
- Query timeout, row cap + phát hiện overflow, SSL/TLS (`disable`/`prefer`/`require`/`verify`), connection pooling, retry exponential backoff, logging có cấu trúc.

## Cài đặt

```bash
npx @unclecat/mcp-multi-db
```

Yêu cầu **Node ≥ 20**.

---

## Quick start (khuyến nghị: JSON config)

Trỏ server vào 1 file JSON qua `MCP_DB_CONFIG` (dùng **đường dẫn tuyệt đối** — cwd của MCP process do client quyết định):

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": { "MCP_DB_CONFIG": "/duong/dan/tuyet/doi/mcp-db.config.json" }
    }
  }
}
```

`mcp-db.config.json`:

```jsonc
{
  "$schema": "https://unpkg.com/@unclecat/mcp-multi-db/schema/config.schema.json",
  "defaultAlias": "prod",
  "aliases": {
    "prod": {
      "type": "postgresql",
      "url": "postgresql://ro:pw@host:5432/main",
      "mode": "readonly",
      "displayName": "Production",
      "description": "Bản replica chỉ-đọc của production. Đơn hàng, khách hàng, sản phẩm.",
      "tablesHint": ["orders", "customers", "products"]
    },
    "staging": {
      "type": "mysql",
      "host": "stg.example.com", "user": "app", "password": "pw", "database": "appdb",
      "mode": "readwrite"
    }
  }
}
```

Log khi start:

```
[info] event="loaded_aliases" source="config_file" count=2 \
       aliases="prod(postgresql,readonly), staging(mysql,readwrite)" defaultAlias="prod"
```

> **Tại sao JSON tốt hơn env vars?** 1 block/alias thay vì `DB_<ALIAS>_*` × 6+ biến, và gắn được `displayName`/`description`/`tablesHint` — những thứ này đi vào tool description của AI để nó route đúng alias.

Copy [`mcp-db.config.example.json`](./mcp-db.config.example.json) để bắt đầu.

---

## Tham chiếu cấu hình

### Bắt buộc cho mỗi alias

| Field | Ý nghĩa |
|---|---|
| `type` | `postgresql` \| `mysql` \| `mariadb` \| `sqlserver` |
| `url` **hoặc** `host` | Connection URL, HOẶC `host` (+ `port`, `user`, `password`, `database` theo nhu cầu driver) |

Set cả 2 → explicit fields override URL components.

### Tuỳ chọn (default an toàn)

| Field | Mặc định | Hard cap |
|---|---|---|
| `mode` | `readonly` | — |
| `ssl` | `prefer` | — |
| `caCert` | — | — |
| `timeoutMs` | `30000` | `600000` |
| `maxRows` | `10000` | `1000000` |
| `poolMax` | `5` | `100` |

### Metadata (chỉ JSON — quyết định AI routing)

| Field | Tác dụng |
|---|---|
| `displayName` | Nhãn ngắn cạnh tên alias trong tool description. |
| `description` | Mô tả 1 dòng "DB này dùng cho việc gì". Inject vào tool description để AI biết gọi alias nào. |
| `tablesHint` | Danh sách bảng thường dùng — gợi ý cho AI điểm bắt đầu. |
| `defaultAlias` (top-level) | Hint hiển thị trong tool description khi user không chỉ DB. `databaseAlias` vẫn **bắt buộc** ở schema — đây chỉ là gợi ý route, không phải default ở server. |

Khi start, server inject metadata vào description của mọi tool, đồng thời thêm `enum` constraint cho `databaseAlias` liệt kê các alias đã load — client không thể truyền alias không tồn tại.

### Toàn server

| Setting | Mặc định | Cách set |
|---|---|---|
| Log level | `info` | env: `MCP_DB_LOG_LEVEL=debug` &nbsp;**hoặc**&nbsp; JSON: `"logLevel": "debug"` (top-level) |

### Quy tắc đặt tên alias

| Nguồn | Pattern | Ví dụ |
|---|---|---|
| JSON `aliases` key | `^[a-z][a-z0-9_]*$` *(lowercase)* | `prod`, `db1`, `analytics_2024` |
| Env var `DB_<ALIAS>_*` | `^[A-Z][A-Z0-9_]*$` *(uppercase)* | `PROD`, `DB1`, `ANALYTICS_2024` |
| Tool call `databaseAlias` | luôn lowercase | `"prod"` |

---

## Phương án thay thế: cấu hình bằng env vars

Khi `MCP_DB_CONFIG` **không** được set, server fallback sang `DB_<ALIAS>_*`. Dùng cho case single-DB đơn giản hoặc khi client không tham chiếu được file path.

```json
"env": {
  "DB_PROD_TYPE": "postgresql",
  "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname"
}
```

Mapping tên = SCREAMING_SNAKE_CASE của JSON field. Đầy đủ: `DB_<ALIAS>_TYPE`, `_URL`, `_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_DATABASE`, `_MODE`, `_SSL`, `_CA_CERT`, `_TIMEOUT_MS`, `_MAX_ROWS`, `_POOL_MAX`. Env loader **không** hỗ trợ metadata (`displayName`/`description`/`tablesHint`) — chỉ JSON có.

**Thứ tự ưu tiên (exclusive):**

- Có `MCP_DB_CONFIG` → JSON loader, `DB_*` env vars bị bỏ qua hoàn toàn.
- Không có `MCP_DB_CONFIG` → env-var loader.
- Cả 2 đều rỗng → server exit code 1.

Xem [.env.example](./.env.example) để có template env đầy đủ.

---

## Mô hình bảo mật

Mỗi alias có **mode** quy định loại SQL được phép:

| Mode | Cho phép |
|---|---|
| `readonly` *(mặc định)* | SELECT, EXPLAIN, DESCRIBE, SHOW, USE |
| `readwrite` | + INSERT, UPDATE, DELETE, MERGE |
| `readwrite+ddl` | + CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, RENAME |

Mặc định `readonly` — writes bị chặn trừ khi anh opt-in. Statement không nhận diện được bị từ chối kể cả ở `readwrite+ddl`. Multi-statement: mode strict nhất thắng. Operation bị chặn trả về `DB_PERMISSION_DENIED` kèm tên setting cần đổi.

### Parameterized queries

```js
// Vị trí — params là array
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = ?", params: [42] }

// Tên — params là object
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = :id", params: { id: 42 } }
```

Server dịch placeholder sang native của từng dialect (`$1`/`?`/`@p1`). Placeholder trong string literal và comment bị bỏ qua. Số placeholder/param không khớp → validation error.

### Row caps

SELECT không có `LIMIT`/`TOP`/`FETCH` bị cap ở `maxRows` (mặc định 10 000). Response có `truncated: true` khi chạm cap. Override per-query:

```js
db_query({ databaseAlias: "prod", sql: "SELECT * FROM big_table", maxRows: 50, timeoutMs: 5000 })
```

Override bị bound bởi alias config + hard cap toàn cục (1 000 000 rows, 600 000 ms).

---

## Tools

Tool descriptions được rebuild lúc start để chèn alias roster đã load — AI thấy mỗi DB dùng cho gì, không chỉ là 1 list tên.

| Tool | Inputs | Mô tả |
|---|---|---|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` | Chạy parameterized SQL. |
| `db_list_tables` | `databaseAlias`, `schema?` | Liệt kê tables (filter theo schema nếu có). |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` | Columns + indexes của 1 table. |
| `db_test_connection` | `databaseAlias` | Healthcheck `SELECT 1` nhẹ. |
| `db_query_history` | `databaseAlias?`, `limit?` | Metadata của query gần đây (giữ tối đa 50, không lưu SQL text). |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` | EXPLAIN theo dialect. |

## Resources

- `db://aliases` — JSON summary các alias đã load. Có `displayName`/`description`/`tablesHint` nếu set. Không lộ secret.
- `db://security-guide` — Markdown tham chiếu mode + parameterized queries.

---

## Troubleshooting

| Code / event | Ý nghĩa | Cách fix |
|---|---|---|
| `DB_PERMISSION_DENIED` | Operation không được mode alias cho phép | Raise `mode` trong JSON (hoặc `DB_<ALIAS>_MODE` env). |
| `DB_TIMEOUT` | Query vượt timeout | Raise `timeoutMs` của alias hoặc truyền per-request. |
| `DB_RESULT_TOO_LARGE` | Vượt row cap | Thêm `LIMIT`, hoặc raise `maxRows`. |
| `DB_CONNECTION_FAILED` | Không kết nối được DB | Kiểm tra host/port/credentials. Server retry 3× với backoff. |
| `DB_VALIDATION_FAILED` | Identifier sai | `databaseAlias` / `tableName` / `schema` phải match `^[A-Za-z_][A-Za-z0-9_]*$`. |
| `DB_CONFIG_INVALID` | Env-var alias config sai | Message nêu rõ field + giá trị hợp lệ. Alias khác vẫn load. |
| `Config file not readable at '...'` | `MCP_DB_CONFIG` path sai hoặc không đọc được | Dùng đường dẫn **tuyệt đối**; kiểm tra permission. |
| `Config file is not valid JSON: ...` | JSON syntax sai | Validate file (editor sẽ flag khi có `$schema`). |
| `Config schema error: aliases.<a>.<field>: ...` | JSON field sai | Message nêu field + lý do; fix hoặc xóa alias entry đó. |
| `defaultAlias '...' does not reference a loaded alias` | Top-level `defaultAlias` typo | Match đúng key có trong `aliases`. Server vẫn start; hint chỉ bị bỏ qua. |
| `event="no_valid_aliases"` (exit 1) | Không alias nào load được | Set ít nhất 1 alias trong JSON hoặc env. |

Kiểm tra alias đã load: đọc startup log (`event="loaded_aliases" source="..." count=..."`) hoặc resource `db://aliases`.

---

## Đóng góp

Xem [CONTRIBUTING.md](../CONTRIBUTING.md) ở root monorepo.

## License

MIT — xem [LICENSE](./LICENSE).
