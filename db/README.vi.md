# @unclecat/mcp-multi-db

> MCP server cho MySQL/MariaDB, PostgreSQL và SQL Server — với truy vấn parameterized, chế độ an toàn theo alias, timeout, và giới hạn số dòng.

📖 English: [README.md](./README.md) · 🛡️ [Security policy](../SECURITY.md)

## Tính năng

- **Chỉ truy vấn parameterized** — loại bỏ SQL injection ở tầng API.
- **Mode theo alias** — `readonly` (mặc định), `readwrite`, `readwrite+ddl`.
- **Timeout truy vấn** — driver-native, hard cap 600 s.
- **Giới hạn số dòng + phát hiện overflow** — mặc định 10 000, override per-alias / per-request.
- **SSL/TLS** — `disable` / `prefer` / `require` / `verify` (custom CA).
- **Đa CSDL** — MySQL, MariaDB, PostgreSQL, SQL Server cùng một server, kết hợp tự do.
- **Connection pooling, retry exponential backoff, logging có cấu trúc.**

## Cài đặt

```bash
npx @unclecat/mcp-multi-db
```

Yêu cầu Node ≥ 18.

---

## Quick start

Config tối thiểu cho Claude Desktop, một PostgreSQL chỉ-đọc:

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "DB_PROD_TYPE": "postgresql",
        "DB_PROD_URL": "postgresql://user:pass@host:5432/dbname"
      }
    }
  }
}
```

Vậy là xong. Khi không set `DB_PROD_MODE`, alias mặc định là **`readonly`** — chỉ cho SELECT/EXPLAIN/DESCRIBE/SHOW/USE. Mọi INSERT/UPDATE/DELETE/DDL đều bị chặn với error message ghi rõ env var nào cần set để cho phép.

Khi server start, log sẽ in alias đã load:

```
[info] event="loaded_aliases" count=1 aliases="prod(postgresql,readonly)"
[info] event="ready"
```

---

## Cấu hình bằng file JSON (khuyến nghị khi có >1 DB)

Khi anh có nhiều hơn một database — hoặc muốn AI client biết mỗi DB dùng cho việc gì — hãy trỏ server vào 1 file JSON qua biến môi trường `MCP_DB_CONFIG`. Cách này thay thế hoàn toàn block `DB_<ALIAS>_*` env var, viết gọn 1 block cho mỗi alias.

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "MCP_DB_CONFIG": "/Users/you/mcp-db.config.json"
      }
    }
  }
}
```

File config liệt kê từng alias 1 lần với tất cả field nằm trong 1 block:

```json
{
  "$schema": "https://unpkg.com/@unclecat/mcp-multi-db/schema/config.schema.json",
  "defaultAlias": "unleashed",
  "aliases": {
    "unleashed": {
      "type": "postgresql",
      "url": "postgresql://ro:pw@host:5432/main",
      "mode": "readonly",
      "displayName": "Unleashed — TMĐT Đài Loan",
      "description": "DB production thị trường Đài Loan. Doanh thu, đơn hàng, tồn kho, khách hàng.",
      "tablesHint": ["orders", "products", "customers"]
    },
    "staging": {
      "type": "mysql",
      "host": "staging.example.com", "user": "app", "password": "pw", "database": "appdb",
      "mode": "readwrite",
      "displayName": "Staging",
      "description": "Môi trường test. Cho phép INSERT/UPDATE/DELETE."
    }
  }
}
```

### Field metadata (giúp AI chọn đúng alias)

| Field | Mục đích |
|-------|----------|
| `displayName` | Nhãn ngắn dễ đọc, hiển thị cạnh tên alias trong tool description. |
| `description` | Mô tả ngắn DB này dùng cho việc gì. Inject vào tool description để AI route đúng. |
| `tablesHint` | List tên bảng "thường dùng" để AI có điểm bắt đầu khi khám phá schema. |
| `defaultAlias` (top-level) | Hint xuất hiện trong tool description khi user không chỉ rõ DB. `databaseAlias` vẫn required ở schema — đây chỉ là routing hint, không phải default ở server. |

Khi khởi động, server inject toàn bộ metadata này vào description của các tool DB, đồng thời thêm `enum` constraint cho `databaseAlias` liệt kê tất cả alias đã load — AI không thể "bịa" alias không tồn tại.

### Thứ tự ưu tiên

- Có `MCP_DB_CONFIG` → dùng file loader; **toàn bộ `DB_*` env vars bị bỏ qua**.
- Không có `MCP_DB_CONFIG` → fallback về env-var loader (xem mục bên dưới).
- Cả 2 đều rỗng → server exit code 1.

Có file mẫu để copy ở [`mcp-db.config.example.json`](./mcp-db.config.example.json).

---

## Mô hình cấu hình

Cấu hình qua biến môi trường. Mental model:

> **Mỗi database bạn muốn truy cập là một *alias* có tên. Mỗi alias là một nhóm biến `DB_<ALIAS>_*`.**

Tên alias gồm chữ in hoa, chữ số, dấu gạch dưới, bắt đầu bằng chữ cái (vd `PROD`, `DEV`, `DB1`, `LEGACY_2024`). Khi gọi tool, alias chuyển về lowercase (`databaseAlias: "prod"`).

### Bắt buộc cho mỗi alias

Phải set type và đủ thông tin kết nối:

| Biến | Ý nghĩa | Ví dụ |
|------|---------|-------|
| `DB_<ALIAS>_TYPE` | Driver | `postgresql` \| `mysql` \| `mariadb` \| `sqlserver` |
| `DB_<ALIAS>_URL` | Connection URL đầy đủ (nhanh gọn) | `postgresql://user:pass@host:5432/dbname` |

Hoặc thay vì `_URL`, set từng field rời:

| Biến | Ví dụ |
|------|-------|
| `DB_<ALIAS>_HOST` | `localhost` |
| `DB_<ALIAS>_PORT` | `5432` (mặc định theo driver nếu bỏ qua) |
| `DB_<ALIAS>_USER` | `appuser` |
| `DB_<ALIAS>_PASSWORD` | `secret` |
| `DB_<ALIAS>_DATABASE` | `mydb` |

Có thể trộn: set `_URL` + override field cụ thể (`DB_PROD_URL` + `DB_PROD_PASSWORD`).

### Tuỳ chọn — đều có default an toàn

Mỗi biến đều có default an toàn; chỉ set những gì muốn đổi.

| Biến | Mặc định | Mục đích |
|------|----------|----------|
| `DB_<ALIAS>_MODE` | `readonly` | Loại operation cho phép. Xem [Mô hình bảo mật](#mô-hình-bảo-mật). |
| `DB_<ALIAS>_SSL` | `prefer` | TLS: `disable` / `prefer` / `require` / `verify`. |
| `DB_<ALIAS>_CA_CERT` | — | PEM cert dạng string; dùng khi `SSL=verify` với CA tự ký. |
| `DB_<ALIAS>_TIMEOUT_MS` | `30000` | Timeout per query (ms). Hard cap: 600 000. |
| `DB_<ALIAS>_MAX_ROWS` | `10000` | Cap số dòng cho SELECT không có LIMIT. Hard cap: 1 000 000. |
| `DB_<ALIAS>_POOL_MAX` | `5` | Pool connections tối đa. Hard cap: 100. |

### Toàn server

| Biến | Mặc định | Mục đích |
|------|----------|----------|
| `MCP_DB_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |

Xem [.env.example](./.env.example) cho template chi tiết có comment.

---

## Nhiều database cùng lúc

Để cấu hình thêm database, thêm các nhóm `DB_<ALIAS>_*` với tên alias khác nhau. Server load tất cả khi start, mỗi alias có pool, mode, timeout, row cap riêng. Có thể trộn nhiều DB type tự do.

### Ví dụ — 3 databases với role khác nhau

```json
{
  "mcpServers": {
    "multi-db": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-multi-db"],
      "env": {
        "DB_PROD_TYPE": "postgresql",
        "DB_PROD_URL": "postgresql://ro_user:ro_pass@prod-db.example.com:5432/main",
        "DB_PROD_MODE": "readonly",

        "DB_STAGING_TYPE": "mysql",
        "DB_STAGING_HOST": "staging-db.example.com",
        "DB_STAGING_PORT": "3306",
        "DB_STAGING_USER": "appuser",
        "DB_STAGING_PASSWORD": "stagingpass",
        "DB_STAGING_DATABASE": "appdb",
        "DB_STAGING_MODE": "readwrite",

        "DB_LOCAL_TYPE": "postgresql",
        "DB_LOCAL_URL": "postgresql://postgres:postgres@localhost:5432/devdb",
        "DB_LOCAL_MODE": "readwrite+ddl"
      }
    }
  }
}
```

Server load 3 aliases — `prod` (Postgres chỉ-đọc), `staging` (MySQL đọc-ghi), `local` (Postgres dev full quyền). Tool route theo alias:

```js
// Production bị ép readonly
db_query({ databaseAlias: "prod",    sql: "SELECT * FROM users WHERE id = ?", params: [42] })

// Staging cho phép vì readwrite
db_query({ databaseAlias: "staging", sql: "INSERT INTO logs(msg) VALUES (?)", params: ["test"] })

// Local cho phép vì readwrite+ddl
db_query({ databaseAlias: "local",   sql: "CREATE TABLE t (id INT)" })

// Bị chặn — readonly không cho DELETE; error sẽ ghi rõ env var nào cần set
db_query({ databaseAlias: "prod",    sql: "DELETE FROM users WHERE id = ?", params: [42] })
```

### Override per-alias

Mỗi DB thường có nhu cầu khác nhau về timeout, row cap, pool size. Mỗi alias có settings độc lập:

```json
{
  "DB_PROD_TYPE": "postgresql",
  "DB_PROD_URL": "...",
  "DB_PROD_MODE": "readonly",
  "DB_PROD_TIMEOUT_MS": "60000",
  "DB_PROD_MAX_ROWS": "5000",
  "DB_PROD_POOL_MAX": "10",
  "DB_PROD_SSL": "verify",
  "DB_PROD_CA_CERT": "-----BEGIN CERTIFICATE-----\n...",

  "DB_LOGS_TYPE": "mysql",
  "DB_LOGS_URL": "...",
  "DB_LOGS_MODE": "readwrite",
  "DB_LOGS_MAX_ROWS": "100000"
}
```

### Quy tắc đặt tên alias

- Pattern: `^[A-Z][A-Z0-9_]*$` — chữ in hoa đầu, sau đó chữ/số/gạch dưới.
- Hợp lệ: `PROD`, `DB1`, `MAIN_RO`, `ANALYTICS_2024`.
- Không hợp lệ: `1prod` (bắt đầu số), `prod-db` (gạch ngang), `prod.staging` (chấm), `Prod` (có chữ thường).
- Khi gọi tool, alias là lowercase: `DB_PROD_*` ⇒ `databaseAlias: "prod"`.

### Khi một alias config sai thì sao?

Alias sai bị skip + log error; các alias còn lại vẫn load. Ví dụ `DB_BAD_MODE=godmode`:

```
[error] event="config_error" alias="bad" message="DB_BAD_MODE must be one of: readonly, readwrite, readwrite+ddl"
[info]  event="loaded_aliases" count=2 aliases="prod(postgresql,readonly), staging(mysql,readwrite)"
```

Nếu **không** alias nào hợp lệ, server exit code 1 với error.

### Kiểm tra alias đã load

- Log dòng startup phía trên liệt kê tất cả alias kèm type và mode.
- Đọc resource `db://aliases` để có JSON summary (không có secret).
- Gọi `db_test_connection({ databaseAlias: "prod" })` để verify connectivity.

---

## Mô hình bảo mật

Server chạy với credentials của DB. Để giảm rủi ro, mỗi alias có **mode** quy định loại SQL được phép.

| Mode | Cho phép |
|------|---------|
| `readonly` *(mặc định)* | SELECT, EXPLAIN, DESCRIBE, SHOW, USE |
| `readwrite` | Tất cả của readonly + INSERT, UPDATE, DELETE, MERGE |
| `readwrite+ddl` | Tất cả của readwrite + CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, RENAME |

**Mặc định là `readonly`.** Nếu không set `DB_<ALIAS>_MODE`, mọi write/DDL đều bị chặn. Bạn opt-in cho phép write/DDL từng alias bằng cách set explicit. Điều này bảo vệ production khỏi thay đổi vô tình bởi AI client.

Statement không nhận diện được đều bị từ chối kể cả ở `readwrite+ddl` (deny-by-default).

Khi query bị chặn, error message luôn kèm env var cần set:

```
[DB_PERMISSION_DENIED] Database 'prod' is in readonly mode. Operation 'DELETE'
requires 'readwrite' mode. To allow: set DB_PROD_MODE=readwrite in environment.
```

Multi-statement (vd `SELECT ...; DELETE ...;`) áp mode strict nhất mà bất kỳ statement nào yêu cầu.

### Truy vấn parameterized

Tool `db_query` yêu cầu SQL với placeholder và `params` riêng. Không bao giờ ghép chuỗi user input vào SQL.

```js
// Vị trí — params là array
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = ?", params: [42] }

// Tên — params là object
{ databaseAlias: "prod", sql: "SELECT * FROM users WHERE id = :id", params: { id: 42 } }
```

Server tự dịch `?` và `:name` sang placeholder native:

| Dialect | `?` thành | `:name` thành |
|---------|-----------|---------------|
| PostgreSQL | `$1, $2, ...` | `$1, $2, ...` (dedup theo tên) |
| MySQL / MariaDB | `?` (giữ nguyên) | `?` với value reorder |
| SQL Server | `@p1, @p2, ...` | `@name` (giữ nguyên) |

Placeholder bên trong string literal (`'...'`, `"..."`) và comment (`-- ...`, `/* ... */`) bị bỏ qua. Toán tử cast `::` của PostgreSQL được nhận diện và không bị coi là named placeholder. Số placeholder/param không khớp sẽ throw validation error.

### Row cap và timeout

Mặc định, SELECT không có `LIMIT`/`TOP`/`FETCH` được giới hạn 10 000 dòng. Server fetch `maxRows + 1` để phát hiện overflow; nếu chạm cap, response có `truncated: true` và hint thêm LIMIT hoặc tăng `maxRows`.

Override per-query:

```js
db_query({
  databaseAlias: "prod",
  sql: "SELECT * FROM big_table",
  maxRows: 50,
  timeoutMs: 5000
})
```

Override bị bound bởi alias config và hard cap (1 000 000 rows, 600 000 ms).

---

## Tools

| Tool | Inputs | Mô tả |
|------|--------|-------|
| `db_query` | `databaseAlias`, `sql`, `params?`, `maxRows?`, `timeoutMs?` | Chạy parameterized SQL. |
| `db_list_tables` | `databaseAlias`, `schema?` | Liệt kê tables (filter theo schema nếu có). |
| `db_describe_table` | `databaseAlias`, `tableName`, `schema?` | Hiện columns và indexes của table. |
| `db_test_connection` | `databaseAlias` | Healthcheck alias. |
| `db_query_history` | `databaseAlias?`, `limit?` | Trả về N query gần nhất (đã sanitize, giữ tối đa 50). |
| `db_explain_query` | `databaseAlias`, `sql`, `params?` | Chạy EXPLAIN-equivalent và trả plan. |

## Resources

- `db://security-guide` — giải thích về modes và parameterized queries (Markdown).
- `db://aliases` — tóm tắt aliases đã load (JSON, không có secret).

---

## Migration từ v1

Đây là bản public đầu tiên. v1.x raw-query API (chưa publish) đã được thay. Mapping config:

| v1 (đã bỏ) | v2 |
|-----------|----|
| `db_query({ type, query: 'SELECT...' })` | `db_query({ databaseAlias, sql, params })` |
| `MYSQL_CONNECTIONS="prod=mysql://..."` | `DB_PROD_TYPE=mysql` + `DB_PROD_URL=mysql://...` |
| `MYSQL_DB1_HOST=h1` (numbered) | `DB_DB1_TYPE=mysql` + `DB_DB1_HOST=h1` |
| `MYSQL_HOST=...` (single legacy) | `DB_PROD_TYPE=mysql` + `DB_PROD_HOST=...` |
| Override `connection: {...}` qua tool | Đã bỏ. Chỉ cấu hình qua env. |

Behavior mặc định cũng đổi: v2 **mặc định readonly** — phải explicit set `DB_<ALIAS>_MODE=readwrite` (hoặc `readwrite+ddl`) mới cho phép thay đổi data.

---

## Troubleshooting

| Error code | Ý nghĩa | Cách xử lý |
|------------|---------|-----------|
| `DB_PERMISSION_DENIED` | Alias mode không cho phép operation. | Set `DB_<ALIAS>_MODE` cao hơn. Error message ghi rõ tên var. |
| `DB_TIMEOUT` | Query vượt timeout. | Truyền `timeoutMs` cao hơn per request, hoặc tăng `DB_<ALIAS>_TIMEOUT_MS`. Hard cap 600 000. |
| `DB_RESULT_TOO_LARGE` | Row cap bị vượt. | Thêm LIMIT vào query, hoặc truyền `maxRows` cao hơn, hoặc tăng `DB_<ALIAS>_MAX_ROWS`. |
| `DB_CONNECTION_FAILED` | Không kết nối được DB. | Kiểm tra host/port/credentials. Server retry tối đa 3 lần với backoff. |
| `DB_VALIDATION_FAILED` ở identifier | `databaseAlias`, `tableName`, `schema` không match `^[A-Za-z_][A-Za-z0-9_]*$`. | Dùng identifier đơn giản (không quote, gạch ngang, chấm). |
| `DB_CONFIG_INVALID` (trong startup log) | Một alias có env var sai. | Đọc message — nó nêu rõ field và giá trị hợp lệ. Aliases khác vẫn hoạt động. |
| `event="no_valid_aliases"` (server exit 1) | Không có alias nào được cấu hình. | Set ít nhất một `DB_<ALIAS>_TYPE` và host/URL. |

Nếu không chắc config đúng chưa, kiểm tra log startup `event="loaded_aliases"` hoặc đọc resource `db://aliases` — cả hai đều liệt kê đầy đủ.

---

## Đóng góp

Xem [CONTRIBUTING.md](../CONTRIBUTING.md) ở root monorepo.

## License

MIT — xem [LICENSE](./LICENSE).
