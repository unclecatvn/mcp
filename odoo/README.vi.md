# @unclecat/mcp-odoo

> MCP server cho [Odoo](https://www.odoo.com) 18+ qua JSON-RPC. Server cho phép trợ lý AI tìm kiếm, lập báo cáo, tạo và cập nhật bản ghi, cũng như chạy các business action trên bất kỳ model nào.

[![npm](https://img.shields.io/npm/v/@unclecat/mcp-odoo.svg)](https://www.npmjs.com/package/@unclecat/mcp-odoo)
[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

[English](./README.md) · **Tiếng Việt** · [Chính sách bảo mật](../SECURITY.md)

Server mở ORM của Odoo thông qua mười tool tổng quát, nên hoạt động được với mọi model chuẩn lẫn tùy chỉnh mà không cần code riêng cho từng model. Một server có thể làm việc với nhiều instance Odoo, chẳng hạn production, staging và database của khách hàng, và model chọn một instance cho mỗi lời gọi.

## Tính năng

- **Toàn bộ bề mặt của ORM:**
  - khám phá schema;
  - tìm kiếm, đếm và tra cứu tên mờ (fuzzy);
  - tổng hợp `read_group` cho báo cáo;
  - create, write và unlink;
  - lối thoát `call_method` cho các business action như xác nhận đơn hàng, ghi sổ hóa đơn hoặc chạy wizard.
- **Nhiều instance.** Cấu hình bao nhiêu instance tùy ý, mỗi instance có thông tin đăng nhập và timeout riêng.
- **Xác thực bằng API key** (khuyến nghị) hoặc mật khẩu, chọn riêng cho từng instance.
- **Cheatsheet Odoo tích hợp sẵn.** Khi `initialize`, model nhận được ghi chú về cú pháp domain, command tuple của x2many, định dạng field và mã lỗi, nên dựng được lời gọi đúng mà không cần thử sai.
- **Mã lỗi ổn định.** Các exception của Odoo được ánh xạ sang các mã như `ODOO_ACCESS_DENIED` và `ODOO_USER_ERROR`, để model biết nên sửa lời gọi, retry hay dừng lại.

## Bắt đầu nhanh

Yêu cầu **Node.js 20+** và một user Odoo 18+ có API key. Để tạo API key, mở menu avatar → **My Profile → Account Security → New API Key**. Nếu mục API Keys bị ẩn, hãy bật developer mode trước.

### Claude Code

```bash
claude mcp add odoo \
  -e ODOO_PROD_URL=https://erp.example.com \
  -e ODOO_PROD_DB=production \
  -e ODOO_PROD_USERNAME=admin@example.com \
  -e ODOO_PROD_API_KEY=your-api-key \
  -- npx -y @unclecat/mcp-odoo
```

### Claude Desktop, Cursor, Windsurf

Thêm server vào `claude_desktop_config.json`, `.cursor/mcp.json` hoặc `.mcp.json` của dự án:

```json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-odoo"],
      "env": {
        "ODOO_PROD_URL": "https://erp.example.com",
        "ODOO_PROD_DB": "production",
        "ODOO_PROD_USERNAME": "admin@example.com",
        "ODOO_PROD_API_KEY": "your-api-key"
      }
    }
  }
}
```

### VS Code

Trong `.vscode/mcp.json` (VS Code 1.102+), dùng cùng khối trên nhưng đặt dưới key cấp cao nhất `servers` và thêm `"type": "stdio"`.

## Cấu hình

Mỗi instance là một khối biến môi trường đặt tên theo dạng `ODOO_<NAME>_<FIELD>`. `<NAME>` trở thành đối số `connection` viết thường mà các tool nhận: `ODOO_PROD_*` thành `"prod"`, và `ODOO_MY_PROD_*` thành `"my_prod"`.

| Trường | Bắt buộc | Mô tả |
|---|---|---|
| `URL` | có | URL gốc, ví dụ `https://erp.example.com` |
| `DB` | có | Tên database |
| `USERNAME` | có | Tên đăng nhập (email hoặc username) |
| `API_KEY` | một trong hai | Khuyến nghị. Bạn có thể xoay vòng và thu hồi nó độc lập với mật khẩu. |
| `PASSWORD` | một trong hai | Phương án dự phòng khi không dùng được API key |
| `TIMEOUT_MS` | không | Timeout của request. Mặc định `60000`, được giới hạn trong khoảng 1000–600000 ms. |

Instance thứ hai chỉ đơn giản là một khối khác:

```json
"env": {
  "ODOO_PROD_URL": "https://erp.example.com",
  "ODOO_PROD_DB": "production",
  "ODOO_PROD_USERNAME": "admin@example.com",
  "ODOO_PROD_API_KEY": "key-prod",

  "ODOO_STAGING_URL": "https://staging.example.com",
  "ODOO_STAGING_DB": "staging",
  "ODOO_STAGING_USERNAME": "admin@example.com",
  "ODOO_STAGING_PASSWORD": "password-staging"
}
```

- Một khối không hợp lệ sẽ được ghi log ra stderr và bị bỏ qua. Server vẫn chạy với các instance còn lại.
- Nếu một khối đặt cả `API_KEY` lẫn `PASSWORD`, API key được dùng và một cảnh báo được ghi log.

> **Xác thực hai yếu tố (2FA).** Đăng nhập bằng mật khẩu bị từ chối đối với user đã bật 2FA. Hãy dùng API key, vốn hoạt động được với 2FA theo thiết kế.

## Tool

Mọi tool trừ `list_connections` đều nhận đối số `connection`.

| Tool | Dùng để | Trả về |
|---|---|---|
| `list_connections` | Xem các instance đã cấu hình, một lần cho mỗi phiên | `{ connections: [{ name, url, db, username, authType, ... }] }` |
| `fields_get` | Xem các field của một model trước khi ghi. Kết quả được cache. | `{ model, fields: { name: { type, required, relation, ... } } }` |
| `search_read` | Truy vấn bản ghi với domain, field, limit và order | `{ model, count, records: [...] }` |
| `search_count` | Đếm bản ghi mà không cần lấy dữ liệu về | `{ model, count }` |
| `name_search` | Tra cứu mờ theo tên hiển thị | `{ model, results: [[id, "name"], ...] }` |
| `read_group` | Nhóm theo field và tổng hợp, cho báo cáo và KPI | `{ model, count, groups: [...] }` |
| `create` | Thêm một bản ghi hoặc một lô bản ghi | `{ model, id }` hoặc `{ model, ids }` |
| `write` | Cập nhật bản ghi theo id | `{ model, ids, success }` |
| `unlink` | Xóa bản ghi theo id. Lưu trữ (archive) bằng `active: false` thường an toàn hơn. | `{ model, ids, success }` |
| `call_method` | Chạy bất kỳ method nào khác của model: business action, wizard, `copy`, `default_get`, RPC tùy chỉnh | `{ model, method, result }` |

### Prompt ví dụ

- *"Tháng trước chúng ta có bao nhiêu đơn bán hàng đã xác nhận, nhóm theo nhân viên bán hàng?"*
- *"Tìm đối tác Acme và liệt kê các hóa đơn chưa thanh toán của họ."*
- *"Tạo báo giá cho Acme với 10 chiếc ghế văn phòng rồi xác nhận nó."*
- *"So sánh giá sản phẩm giữa prod và staging."*

## Mã lỗi

Lỗi được trả về dưới dạng `[CODE] message` bên trong một kết quả `isError` của MCP.

| Mã | Ý nghĩa | Model nên làm gì |
|---|---|---|
| `ODOO_INPUT_INVALID` | Đối số không qua được bước kiểm tra schema | Sửa lời gọi |
| `ODOO_UNKNOWN_CONNECTION` | `connection` không xác định | Gọi lại `list_connections` |
| `ODOO_AUTH_FAILED` | Sai thông tin đăng nhập, hoặc đăng nhập bằng mật khẩu với user bật 2FA | Dừng lại và hỏi người vận hành |
| `ODOO_ACCESS_DENIED` | User không có quyền trên model hoặc bản ghi | Không retry |
| `ODOO_MISSING_RECORD` | Bản ghi đã bị xóa trong lúc đó | Tìm kiếm lại |
| `ODOO_FIELD_INVALID` | Vi phạm một ràng buộc, ví dụ thiếu field bắt buộc hoặc sai kiểu | Sửa payload |
| `ODOO_USER_ERROR` | Một quy tắc nghiệp vụ đã chặn thao tác | Thường cần một bước chuyển trạng thái khác trước |
| `ODOO_SERVER_ERROR` | Exception không mong đợi từ Odoo | Coi là lỗi nghiêm trọng đối với lời gọi này |
| `ODOO_TRANSPORT_FAILED` | Lỗi mạng, HTTP hoặc timeout | Có thể retry một lần |

## Bảo mật

- **Đặc quyền tối thiểu.** Model có thể làm mọi việc mà user Odoo đã cấu hình làm được. Hãy kết nối bằng một user riêng có quyền truy cập khớp với phạm vi bạn muốn trợ lý được đụng tới.
- **Ưu tiên API key.** Bạn có thể thu hồi API key mà không phải đổi mật khẩu của user.
- **HTTP thuần.** URL `http://` được chấp nhận nhưng sẽ kích hoạt một cảnh báo khi khởi động, vì thông tin đăng nhập sẽ đi qua mạng dưới dạng văn bản thuần.
- **Không rò rỉ secret.** `list_connections` chỉ báo *loại* xác thực, không bao giờ báo key hay mật khẩu.
- **MCP host nhìn thấy mọi thứ.** MCP host thấy mọi input và output của tool, nên hãy tránh dùng thông tin đăng nhập production trong các phiên chia sẻ hoặc demo.

## Ghi log

Log là các dòng key-value có cấu trúc trên **stderr**, vì stdout dùng để truyền giao thức MCP. Đặt mức log bằng `MCP_ODOO_LOG_LEVEL`: `debug`, `info` (mặc định), `warn` hoặc `error`.

## Phát triển

```bash
pnpm install
pnpm --filter @unclecat/mcp-odoo test
pnpm --filter @unclecat/mcp-odoo test:coverage
ODOO_PROD_URL=... ODOO_PROD_DB=... ODOO_PROD_USERNAME=... ODOO_PROD_API_KEY=... node odoo/index.js
```

Ghi chú kiến trúc dành cho contributor nằm trong [CLAUDE.md](./CLAUDE.md). Quy trình branch và release được mô tả trong [CONTRIBUTING.md](../CONTRIBUTING.md).

## Giấy phép

[MIT](./LICENSE)
