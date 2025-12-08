# MCP Servers Collection

Repository chứa các MCP (Model Context Protocol) Servers tự xây dựng để sử dụng với các AI Coding Assistants như Cursor, Windsurf, Claude Desktop, v.v.

## 📁 Cấu trúc

```
mcp/
└── db/          # Multi-Database MCP Server
```

## 🗄️ Database MCP Server (`db/`)

MCP Server hỗ trợ kết nối và thực thi SQL query trên nhiều loại database:

- **MySQL/MariaDB**
- **PostgreSQL** 
- **SQL Server**

### Tính năng chính

- ✅ Hỗ trợ nhiều database instances cùng lúc với alias
- ✅ Kết nối qua connection string hoặc individual parameters
- ✅ Cấu hình qua environment variables
- ✅ Connection pooling hiệu quả
- ✅ Xử lý lỗi chi tiết theo từng database type

### Cài đặt & Sử dụng

Xem chi tiết tại [db/README.md](./db/README.md)

## 📝 License

MIT
