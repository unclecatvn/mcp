# @unclecat/mcp-obsidian

> MCP server cho vault của [Obsidian](https://obsidian.md). Server đọc, tìm kiếm và chỉnh sửa note trực tiếp từ đĩa, nên không cần plugin và Obsidian không nhất thiết phải đang chạy.

[![npm](https://img.shields.io/npm/v/@unclecat/mcp-obsidian.svg)](https://www.npmjs.com/package/@unclecat/mcp-obsidian)
[![CI](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/unclecatvn/mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

[English](./README.md) · **Tiếng Việt** · [Chính sách bảo mật](../SECURITY.md)

Server làm việc trên các file `.md` trong thư mục vault của bạn. Obsidian tự nhận biết thay đổi trên đĩa, nên các chỉnh sửa thực hiện qua MCP xuất hiện trong app ngay lập tức, và server vẫn hoạt động khi app đã đóng, trên máy headless hoặc trong CI.

## Tính năng

- **Hiểu note của Obsidian**:
  - phân tích frontmatter, `[[wikilinks]]`, `![[embeds]]`, markdown link và `#nested/tags`;
  - tìm backlink theo đúng cách Obsidian phân giải.
- **Chỉnh sửa có mục tiêu.** Bạn có thể nối thêm nội dung vào hoặc thay thế một section dưới một heading, hoặc đặt và xóa các property trong frontmatter. Phần còn lại của note giữ nguyên từng byte.
- **Daily note.** Server tuân theo thiết lập Daily notes của bạn (thư mục, định dạng ngày, template).
- **Nhiều vault** trong một server, mỗi vault được đặt là `readonly` (mặc định) hoặc `readwrite`.
- **Xử lý file an toàn.** Việc ghi đè là atomic, và thao tác xóa chuyển note vào `.trash/`. Quyền truy cập bị giới hạn trong vault: đường dẫn chứa `..`, thư mục ẩn và symlink trỏ ra ngoài đều bị từ chối.

## Yêu cầu

- Node.js 20 trở lên
- Một thư mục vault trên đĩa cục bộ (thư mục iCloud, Dropbox và Syncthing đều dùng được)

## Bắt đầu nhanh

### Claude Code

```bash
claude mcp add obsidian -s user \
  -e OBSIDIAN_MAIN_PATH="/absolute/path/to/Vault" \
  -e OBSIDIAN_MAIN_MODE=readwrite \
  -- npx -y @unclecat/mcp-obsidian@1
```

`@1` khiến `npx` tự lấy bản 1.x mới nhất mỗi lần server khởi động, và không bao giờ nhảy sang bản 2.0 có thay đổi không tương thích.

### Claude Desktop, Cursor, Windsurf

Thêm server vào `claude_desktop_config.json`, `.cursor/mcp.json` hoặc `.mcp.json` của dự án:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-obsidian@1"],
      "env": {
        "OBSIDIAN_MAIN_PATH": "/absolute/path/to/Vault",
        "OBSIDIAN_MAIN_MODE": "readwrite"
      }
    }
  }
}
```

### VS Code

Trong `.vscode/mcp.json` (VS Code 1.102+), key cấp cao nhất là `servers`:

```json
{
  "servers": {
    "obsidian": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@unclecat/mcp-obsidian@1"],
      "env": { "OBSIDIAN_MAIN_PATH": "/absolute/path/to/Vault" }
    }
  }
}
```

Hãy khởi động lại host sau khi đổi cấu hình MCP của nó để các tool được nạp.

## Cấu hình

Mỗi vault là một cặp biến môi trường. `<NAME>` trở thành tên vault viết thường, nên `OBSIDIAN_WORK_PATH` định nghĩa vault `work`.

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `OBSIDIAN_<NAME>_PATH` | có | — | Đường dẫn tuyệt đối tới thư mục vault. Symlink được phân giải một lần khi khởi động. |
| `OBSIDIAN_<NAME>_MODE` | không | `readonly` | `readonly` hoặc `readwrite`. |

Nhiều vault:

```json
"env": {
  "OBSIDIAN_PERSONAL_PATH": "/Users/me/Notes",
  "OBSIDIAN_PERSONAL_MODE": "readwrite",
  "OBSIDIAN_WORK_PATH": "/Users/me/Work Vault"
}
```

Với một vault, mọi tool đều chạy được mà không cần đối số `vault`. Với nhiều vault, model chọn một vault cho mỗi lời gọi dựa trên `list_vaults`. Một vault cấu hình sai sẽ được ghi log ra stderr và bị bỏ qua, các vault khác vẫn được nạp.

## Tool

### Đọc (luôn khả dụng)

| Tool | Chức năng |
|---|---|
| `list_vaults` | Các vault đã cấu hình kèm đường dẫn và mode. |
| `list_notes` | Đường dẫn các note trong một vault hoặc thư mục, đã sắp xếp. Thư mục ẩn bị bỏ qua. |
| `read_note` | Toàn bộ nội dung cùng `frontmatter`, `links`, `embeds` và `tags` đã được phân tích. Tags bao gồm cả tag trong frontmatter lẫn tag inline. |
| `search_notes` | Tìm kiếm văn bản thường hoặc regex trên nội dung và đường dẫn. Bộ lọc tùy chọn: `tag` (tag lồng nhau cũng khớp) và giá trị `frontmatter`. Trả về tối đa 5 dòng khớp cho mỗi note. |
| `get_backlinks` | Các note liên kết tới hoặc embed một note, kèm số dòng. `[[Name]]` khớp theo tên file, còn `[[Folder/Name]]` và link `.md` khớp theo đường dẫn. |
| `daily_note` | Daily note của một ngày (mặc định là hôm nay), được đặt theo `.obsidian/daily-notes.json`. Với `create: true` (chỉ readwrite), note được tạo từ template, điền vào `{{date}}`, `{{time}}` và `{{title}}`. |

### Ghi (chỉ hiển thị khi có vault ở chế độ `readwrite`)

| Tool | Chức năng |
|---|---|
| `write_note` | `create` (mặc định; báo lỗi nếu note đã tồn tại), `overwrite` (thay thế atomic) hoặc `append`. Các thư mục còn thiếu sẽ được tạo. |
| `patch_note` | Nối thêm vào hoặc thay thế section dưới một heading, và/hoặc đặt các property trong frontmatter. Giá trị `null` sẽ xóa property đó. |
| `delete_note` | Chuyển note vào `<vault>/.trash/`, giữ nguyên cấu trúc thư mục. Không có gì bị xóa vĩnh viễn. |

Các lời gọi tool nhận đường dẫn tương đối so với vault, chẳng hạn `Projects/Plan.md`. Phần mở rộng `.md` là tùy chọn.

## Prompt ví dụ

- *"Những note gắn tag #project nào liên kết tới [[Roadmap]] nhưng có `status: active`?"*
- *"Nối bản tóm tắt stand-up hôm nay vào dưới `## Log` trong daily note của tôi."*
- *"Đánh dấu mọi note họp của tuần trước là `reviewed: true`."*
- *"Tìm các note nhắc đến hợp đồng Acme và tóm tắt những câu hỏi còn bỏ ngỏ."*

## An toàn

| Cơ chế bảo vệ | Hành vi |
|---|---|
| Giới hạn trong vault | Đường dẫn được phân giải theo đường dẫn thật của vault. `..`, thư mục ẩn và symlink thoát ra ngoài vault đều bị từ chối, kể cả symlink hỏng (dangling). |
| Loại file | Chỉ note `.md` được đọc hoặc ghi. Mỗi lần đọc bị giới hạn ở 2 MiB. |
| Quyền ghi | Mặc định tắt. Các tool ghi thậm chí không được công bố trừ khi có ít nhất một vault ở chế độ `readwrite`. |
| Không mất dữ liệu | `create` không bao giờ ghi đè, `overwrite` là ghi rồi mới đổi tên (write-then-rename), và `delete_note` chuyển note vào `.trash/`. |

## Hạn chế

- Đổi tên một note không viết lại các link trỏ tới nó. Hãy đổi tên bên trong Obsidian để làm việc đó.
- Server không thể chạy lệnh hay plugin của Obsidian, và không thể query Dataview, vì nó làm việc trên file chứ không đi qua app.
- Mỗi lần tìm kiếm đọc toàn bộ vault. Cách này vẫn nhanh cho đến khoảng 10 nghìn note.
- Các note mà iCloud đã offload (`.Note.md.icloud`) sẽ không thấy được cho đến khi được tải xuống lại. Trong Finder, chọn **Download Now** trên thư mục vault.

## Xử lý sự cố

| Thông báo | Nguyên nhân và cách khắc phục |
|---|---|
| `No vaults configured` | `OBSIDIAN_<NAME>_PATH` bị thiếu hoặc rỗng. Kiểm tra khối `env` trong cấu hình host của bạn. |
| `... is not a usable directory` (stderr khi khởi động) | Đường dẫn không tồn tại hoặc không phải là thư mục. Dùng đường dẫn tuyệt đối, và đặt trong dấu nháy nếu có khoảng trắng. |
| `Vault "x" is readonly` | Đặt `OBSIDIAN_X_MODE=readwrite` và khởi động lại host. |
| `Path "..." is not allowed` | Đường dẫn dùng `..` hoặc một thư mục ẩn như `.obsidian`. Hãy dùng đường dẫn thuần tương đối so với vault. |
| `Path resolves outside the vault` | Đường dẫn đi qua một symlink trỏ ra ngoài vault. |
| `Pass "vault" — one of: ...` | Có nhiều vault được cấu hình, nên lời gọi phải chỉ rõ một vault. |
| Thiếu các tool ghi | Không có vault nào ở chế độ `readwrite`, hoặc host chưa được khởi động lại sau khi đổi cấu hình. |

## Phát triển

```bash
pnpm install
pnpm --filter @unclecat/mcp-obsidian test          # unit tests
pnpm --filter @unclecat/mcp-obsidian test:coverage # with coverage thresholds
OBSIDIAN_MAIN_PATH=/path/to/Vault node obsidian/index.js
```

Xem [CONTRIBUTING.md](../CONTRIBUTING.md) để biết quy trình branch và release.

## Giấy phép

[MIT](./LICENSE)
