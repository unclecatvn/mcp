# Chroma MCP Server - AI Agent Long-term Memory

MCP (Model Context Protocol) server cho ChromaDB, được thiết kế để lưu trữ memory dài hạn cho AI agents.

## 🎯 Mục tiêu

AI agent có thể:
- **Lưu trữ** những câu/documents quan trọng với metadata
- **Tìm kiếm** memory liên quan dựa trên context
- **Nhận gợi ý** thông minh từ MCP server

## 🚀 Cài đặt

### 1. Cài đặt dependencies
```bash
pnpm install
```

### 2. Khởi động ChromaDB
```bash
# Sử dụng Docker
docker run -p 8000:8000 chromadb/chroma

# Hoặc cài đặt local
pip install chromadb
chroma run --host localhost --port 8000
```

### 3. Cấu hình OpenAI API Key
```bash
export OPENAI_API_KEY=your-openai-api-key-here
export OPENAI_MODEL=text-embedding-3-small  # optional
```

### 4. Chạy MCP Server
```bash
pnpm start
```

## 🛠️ Cấu hình

### Environment Variables
```bash
# URL của ChromaDB server (mặc định: http://localhost:8000)
export CHROMA_URL=http://localhost:8000

# OpenAI API Key (bắt buộc)
export OPENAI_API_KEY=your-openai-api-key-here

# OpenAI Embedding Model (mặc định: text-embedding-3-small)
export OPENAI_MODEL=text-embedding-3-small
```

## 📋 Tools Available

### 1. `store_memory`
Lưu trữ document/memory với metadata

**Input:**
```json
{
  "document": "Use custom exceptions by extending HttpException for consistent error handling",
  "metadata": {
    "type": "best_practice",
    "category": "error_handling", 
    "importance": 8,
    "tags": ["nestjs", "exceptions", "best-practice"],
    "source": "development_experience",
    "context": "Working on NestJS API error handling"
  },
  "id": "optional-custom-id"
}
```

### 2. `search_memory`
Tìm kiếm memory liên quan

**Input:**
```json
{
  "query": "error handling best practices",
  "n_results": 5,
  "filter_metadata": {"type": "best_practice"}
}
```

**Output:**
```json
{
  "success": true,
  "query": "error handling best practices",
  "total_results": 3,
  "memories": [
    {
      "id": "uuid-here",
      "document": "Use custom exceptions by extending HttpException...",
      "metadata": {...},
      "distance": 0.2,
      "cosine_similarity": 0.8,
      "relevance_score": 0.8
    }
  ],
  "suggestions": "Tìm thấy 3 memory liên quan. Memory có độ liên quan cao nhất: \"Use custom exceptions by extending HttpException...\""
}
```

### 3. `get_memory_by_id`
Lấy memory cụ thể theo ID

### 4. `list_memories`
Liệt kê memories với phân trang

### 5. `delete_memory`
Xóa memory theo ID

### 6. `get_collection_stats`
Thống kê collection

### 7. `health_check`
Kiểm tra trạng thái hệ thống

**Output:**
```json
{
  "success": true,
  "overall_status": "healthy",
  "components": {
    "openai": {"status": "healthy", "model": "text-embedding-3-small"},
    "chromadb": {"status": "healthy", "version": "0.4.x"},
    "collection": {"status": "healthy", "document_count": 150}
  },
  "errors": [],
  "warnings": [],
  "suggestions": []
}
```

## 💡 Ví dụ sử dụng

### Lưu trữ best practice
```json
{
  "tool": "store_memory",
  "args": {
    "document": "Always validate input data using class-validator decorators in NestJS DTOs",
    "metadata": {
      "type": "best_practice",
      "category": "validation",
      "importance": 9,
      "tags": ["nestjs", "validation", "dto", "security"],
      "source": "code_review",
      "context": "Preventing injection attacks"
    }
  }
}
```

### Tìm kiếm khi gặp vấn đề
```json
{
  "tool": "search_memory",
  "args": {
    "query": "NestJS validation input security",
    "n_results": 3,
    "filter_metadata": {"category": "validation"}
  }
}
```

## 🏗️ Kiến trúc

```
AI Agent ←→ MCP Server ←→ ChromaDB
    ↑           ↑            ↑
 Queries    Tools &      Vector DB
 Context   Suggestions   Storage
```

### Workflow:
1. **AI Agent** gửi query/context đến MCP Server
2. **MCP Server** tìm kiếm trong ChromaDB
3. **ChromaDB** trả về memories liên quan (vector similarity)
4. **MCP Server** format kết quả + gợi ý
5. **AI Agent** nhận suggestions và sử dụng

## 📊 Metadata Schema

```json
{
  "type": "best_practice | error_handling | tip | solution | pattern",
  "category": "coding | debugging | architecture | performance",
  "importance": 1-10,
  "tags": ["tag1", "tag2"],
  "source": "development | documentation | stackoverflow",
  "context": "Mô tả context khi tạo memory",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

## 🔧 Tùy chỉnh

### Thay đổi Collection Name
Sửa trong `index.js`:
```javascript
this.collection = await this.chromaClient.getOrCreateCollection({
  name: 'your_custom_collection_name',
  // ...
});
```

### Custom Embedding Model
Các OpenAI embedding models được hỗ trợ:

```bash
# Cost-effective (mặc định)
export OPENAI_MODEL=text-embedding-3-small

# Higher accuracy, more expensive  
export OPENAI_MODEL=text-embedding-3-large

# Legacy model
export OPENAI_MODEL=text-embedding-ada-002
```

**So sánh models:**
- `text-embedding-3-small`: 1536 dimensions, cost-effective, tốt cho hầu hết use cases
- `text-embedding-3-large`: 3072 dimensions, accuracy cao hơn, đắt hơn
- `text-embedding-ada-002`: 1536 dimensions, legacy model

### Distance Metric
Server sử dụng **cosine distance** thay vì L2 (Euclidean) distance:
- **Cosine similarity** tốt hơn cho text embeddings
- **Không bị ảnh hưởng** bởi magnitude của vectors
- **Kết quả tìm kiếm** chính xác hơn cho semantic search

## 🚨 Lưu ý

1. **ChromaDB phải chạy trước** khi start MCP server
2. **OpenAI API Key bắt buộc** - server sẽ không khởi động nếu thiếu
3. **Cosine similarity** được sử dụng cho semantic search chính xác
4. **Vector similarity search** - queries tương tự sẽ cho kết quả tốt hơn
5. **Metadata filtering** giúp tìm kiếm chính xác hơn
6. **Importance score** để ưu tiên memories quan trọng
7. **Embedding model** mặc định: `text-embedding-3-small` (cost-effective)

## 🔧 Error Handling

MCP server giờ đây **không crash** khi gặp lỗi, thay vào đó sẽ trả về **cảnh báo thân thiện** cho AI agent:

### Các loại lỗi được handle:
- ❌ **Missing OpenAI API Key** - Hướng dẫn cách lấy và set key
- ❌ **ChromaDB not running** - Hướng dẫn khởi động ChromaDB  
- ❌ **Invalid API Key** - Hướng dẫn verify key
- ❌ **Quota exceeded** - Hướng dẫn check billing
- ❌ **Data format error** - Hướng dẫn fix format

### Health Check Tool:
```json
{
  "tool": "health_check",
  "args": {}
}
```

**Response khi có lỗi:**
```json
{
  "success": false,
  "error_type": "missing_openai_key",
  "message": "🔑 OpenAI API Key chưa được cấu hình",
  "suggestions": [
    "Lấy API key từ: https://platform.openai.com/api-keys",
    "Set environment variable: export OPENAI_API_KEY=sk-your-key-here"
  ],
  "help": {
    "debug_command": "pnpm run debug"
  }
}
```

## 🤝 Tích hợp với AI Agent

### Claude/GPT Integration
```javascript
// Trong AI agent code
const mcpClient = new MCPClient();

// Tìm kiếm memory trước khi trả lời
const memories = await mcpClient.callTool('search_memory', {
  query: userQuery,
  n_results: 3
});

// Sử dụng memories trong context
const response = await generateResponse(userQuery, memories);

// Lưu trữ insight mới nếu có
if (newInsight) {
  await mcpClient.callTool('store_memory', {
    document: newInsight,
    metadata: { type: 'solution', importance: 7 }
  });
}
```

## 📈 Performance Tips

1. **Batch operations** khi có nhiều memories
2. **Sử dụng metadata filters** để giảm search space
3. **Limit n_results** phù hợp (5-10 thường đủ)
4. **Regular cleanup** memories không cần thiết

## 💰 Cost Estimation

**OpenAI Embedding Pricing (approximate):**
- `text-embedding-3-small`: $0.00002 / 1K tokens
- `text-embedding-3-large`: $0.00013 / 1K tokens

**Example costs:**
- 1000 memories (avg 50 words each): ~$0.01-0.07
- 10,000 memories: ~$0.10-0.70
- Search operations: Free (no additional embedding cost)

---

**Tác giả:** AI Assistant  
**Version:** 1.0.0  
**License:** ISC 