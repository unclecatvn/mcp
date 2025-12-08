# MCP Servers Collection

A collection of custom-built MCP (Model Context Protocol) Servers for use with AI Coding Assistants like Cursor, Windsurf, Claude Desktop, etc.

## 📁 Structure

```
mcp/
└── db/          # Multi-Database MCP Server
```

## 🗄️ Database MCP Server (`db/`)

An MCP Server that supports connecting and executing SQL queries on multiple database types:

- **MySQL/MariaDB**
- **PostgreSQL** 
- **SQL Server**

### Key Features

- ✅ Support multiple database instances simultaneously with aliases
- ✅ Connect via connection string or individual parameters
- ✅ Configuration through environment variables
- ✅ Efficient connection pooling
- ✅ Detailed error handling per database type

### Installation & Usage

See details at [db/README.md](./db/README.md)

## 👤 Author

**UncleCat** - [@unclecatvn](https://github.com/unclecatvn)

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=unclecatvn/mcp&type=Date)](https://star-history.com/#unclecatvn/mcp&Date)

## 📝 License

MIT
