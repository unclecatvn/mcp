# @unclecat/mcp-odoo

> MCP server expose mọi instance Odoo v18+ ra cho MCP client (Claude Desktop, Claude Code, ...) qua JSON-RPC.

📖 English: [README.md](./README.md) · 🛡️ [Security policy](../SECURITY.md)

## Tính năng

- **Đa instance** — cấu hình bao nhiêu Odoo server tuỳ ý, mỗi tool call chọn instance qua tham số `connection`.
- **Auth** — API key (khuyến nghị) hoặc password, riêng cho từng connection.
- **CRUD tổng quát** — `search_read`, `create`, `write`, `unlink`, kèm `fields_get` để khám phá schema và `call_method` làm escape hatch `execute_kw`.
- **Hướng dẫn built-in** — bản cheatsheet về Odoo domain, command tuple, các model thường dùng và business action được gửi kèm trong `initialize`, model không cần thử-sai.

## Cài đặt / chạy

Không cần cài — `npx` sẽ tự fetch bản mới nhất.

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-odoo"],
      "env": {
        "ODOO_PROD_URL": "https://erp.example.com",
        "ODOO_PROD_DB": "production",
        "ODOO_PROD_USERNAME": "admin",
        "ODOO_PROD_API_KEY": "thay-bang-api-key-cua-ban"
      }
    }
  }
}
```

Với Claude Code, cùng config nằm trong `~/.claude/claude_code_config.json` (hoặc dùng `claude mcp add`).

## Cấu hình connection

Pattern: `ODOO_<NAME>_<FIELD>`.

| Field        | Bắt buộc        | Mô tả                                                                                |
| ------------ | --------------- | ------------------------------------------------------------------------------------ |
| `URL`        | có              | URL gốc của instance Odoo, ví dụ `https://erp.example.com`                            |
| `DB`         | có              | Tên database                                                                          |
| `USERNAME`   | có              | Tên đăng nhập (email hoặc username)                                                    |
| `API_KEY`    | một-trong-hai   | Khuyến nghị. Tạo tại Settings → Users → API Keys.                                     |
| `PASSWORD`   | một-trong-hai   | Fallback khi không có API key.                                                         |
| `TIMEOUT_MS` | không           | Timeout request riêng cho connection (ms). Mặc định `60000`, kẹp trong `[1000, 600000]`. |

`<NAME>` chính là giá trị `connection` (lowercase) truyền vào mọi tool — `ODOO_PROD_*` → `"prod"`. Underscore trong `<NAME>` được giữ nguyên (vd `ODOO_MY_PROD_*` → `"my_prod"`).

> **Gotcha 2FA:** nếu user Odoo bật 2FA, auth bằng `PASSWORD` **sẽ không hoạt động** — `authenticate()` từ chối. Dùng API key thay vì password; API key bypass 2FA theo design.

Thêm connection thứ 2 chỉ là thêm block mới:

```jsonc
"env": {
  "ODOO_PROD_URL":      "https://erp.example.com",
  "ODOO_PROD_DB":       "production",
  "ODOO_PROD_USERNAME": "admin",
  "ODOO_PROD_API_KEY":  "k-prod...",

  "ODOO_STAGING_URL":      "https://staging.example.com",
  "ODOO_STAGING_DB":       "staging",
  "ODOO_STAGING_USERNAME": "admin",
  "ODOO_STAGING_PASSWORD": "p-staging..."
}
```

Entry sai sẽ được log ra stderr và bỏ qua — không bao giờ làm crash server. Connection set cả `API_KEY` lẫn `PASSWORD` sẽ dùng `API_KEY` và warn.

## Tools

| Tool               | Khi nào dùng                                                                  | Trả về                                        |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `list_connections` | Mỗi session một lần — khám phá các instance hiện có                            | `{ connections: [{ name, url, db, ... }] }`   |
| `fields_get`       | Trước mọi create/write, hoặc khi cần schema của model (có cache)               | `{ model, fields: { fieldName: {...} } }`     |
| `search_read`      | Mọi truy vấn — gộp search + read trong một round-trip                          | `{ model, count, records: [...] }`            |
| `search_count`     | Chỉ cần đếm — rẻ hơn `search_read` khi không cần row                            | `{ model, count }`                            |
| `name_search`      | Tra cứu mờ theo display name — autocomplete, "tìm partner Acme"                | `{ model, results: [[id, "name"], ...] }`     |
| `read_group`       | GROUP BY + aggregate — dashboard, report, KPI ("doanh thu theo user/tháng")    | `{ model, count, groups: [...] }`             |
| `create`           | Insert một record (dict) hoặc nhiều (array of dict)                             | `{ model, id }` hoặc `{ model, ids }`         |
| `write`            | Update record đã tồn tại (phải có sẵn id)                                       | `{ model, ids, success }`                     |
| `unlink`           | Xóa record vĩnh viễn (đa số model Odoo nên dùng `active=false` thay vì xóa)     | `{ model, ids, success }`                     |
| `call_method`      | Mọi thứ còn lại — business action, wizard, copy, default_get, RPC custom        | `{ model, method, result }`                   |

Tool nào cũng nhận `connection` làm tham số đầu tiên. Block `instructions` của server-info (xem [`lib/instructions.js`](lib/instructions.js)) hướng dẫn model workflow chuẩn, cú pháp domain, command tuple, quy ước kiểu field, và ý nghĩa của mọi error code.

### Error codes mà Claude sẽ thấy

Lỗi trả về dạng text `[CODE] message` trong envelope `isError` của MCP. Code ổn định:

| Code                       | Ý nghĩa                                                            | Model nên làm gì                            |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| `ODOO_INPUT_INVALID`       | Tham số tool fail schema validation                                 | Sửa call                                    |
| `ODOO_UNKNOWN_CONNECTION`  | Sai tên `connection`                                                | Chạy lại `list_connections`                  |
| `ODOO_AUTH_FAILED`         | Sai credential, hoặc 2FA bật trên user dùng password                | Dừng. Hỏi operator.                          |
| `ODOO_ACCESS_DENIED`       | User không có quyền với model/thao tác                              | Không retry                                  |
| `ODOO_MISSING_RECORD`      | Id đã bị xóa giữa lúc search và lúc call                            | Search lại                                   |
| `ODOO_FIELD_INVALID`       | Vi phạm ràng buộc field (thiếu required, sai kiểu, ...)             | Đọc message, sửa payload                     |
| `ODOO_USER_ERROR`          | Rule nghiệp vụ chặn thao tác                                        | Thường cần chuyển state trước                |
| `ODOO_SERVER_ERROR`        | Exception Odoo không xác định                                       | Coi như fatal cho call này                   |
| `ODOO_TRANSPORT_FAILED`    | Network/HTTP/timeout                                                | Có thể retry 1 lần                           |

## Model phía client nên sử dụng như thế nào

Response `initialize` của server bao gồm block instruction dạy model về:

- Cú pháp domain Odoo (prefix Polish, leaf format, operator).
- Command write của Many2one / One2many / Many2many.
- Quy tắc serialize date/datetime/monetary/binary/selection.
- Các model dùng nhiều và method business action phổ biến.
- Phân loại lỗi (`AccessError`, `ValidationError`, `MissingError`, ...).

Xem text gốc tại [`lib/instructions.js`](lib/instructions.js).

## Logging

Server log dòng key/value có cấu trúc ra **stderr** (stream duy nhất stdio MCP cho phép). Set `MCP_ODOO_LOG_LEVEL=debug|info|warn|error` để filter (mặc định `info`).

## Lưu ý bảo mật

- Ưu tiên API key thay vì password — rotate/revoke độc lập với credential chính của user.
- Server chỉ chấp nhận `https:` và `http:`; dùng `http:` sẽ trigger warning lúc startup vì credential bị gửi plaintext.
- Secret không bao giờ echo lại cho model — `list_connections` trả về *kiểu* auth nhưng không bao giờ trả về secret.
- Host MCP (Claude Desktop / Code) thấy input/output của tool. Đừng đưa secret production qua demo / session dùng chung.

## Phát triển

```bash
pnpm --filter @unclecat/mcp-odoo test          # chạy unit test
pnpm --filter @unclecat/mcp-odoo test:watch    # watch mode
pnpm --filter @unclecat/mcp-odoo test:coverage # report coverage
pnpm --filter @unclecat/mcp-odoo start         # chạy server (stdio)
```

## License

MIT — xem [`LICENSE`](./LICENSE).
