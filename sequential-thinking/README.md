# 🧠 Enhanced Sequential Thinking MCP Server

Phiên bản cải tiến của MCP server cho sequential thinking với nhiều tính năng nâng cao để hỗ trợ tư duy logic và giải quyết vấn đề hiệu quả hơn.

## 🎯 Tính năng chính

### ✨ Cải tiến so với official tool:
- **Context Memory**: Ghi nhớ và kết nối các thoughts thông minh
- **Auto-Suggestion**: Đề xuất bước tiếp theo dựa trên pattern recognition
- **Confidence Scoring**: Đánh giá độ tin cậy từng thought (0-1 scale)
- **Pattern Detection**: Nhận diện các pattern tư duy phổ biến
- **Progress Tracking**: Theo dõi tiến độ overall và theo category
- **Smart Visualization**: Hiển thị trực quan đẹp mắt với màu sắc
- **Dependency Tracking**: Theo dõi mối quan hệ giữa các thoughts

## 🚀 Cài đặt

```bash
# Clone repository
git clone [your-repo-url]
cd enhanced-sequential-thinking-mcp

# Cài đặt dependencies
npm install

# Chạy server
npm start
```

## 📖 Cách sử dụng

### Tham số bắt buộc:
- `thought`: Nội dung tư duy hiện tại
- `thoughtNumber`: Số thứ tự thought (bắt đầu từ 1)
- `totalThoughts`: Tổng số thoughts dự kiến
- `nextThoughtNeeded`: Có cần thought tiếp theo không (boolean)

### Tham số nâng cao:
- `confidence`: Độ tin cậy (0-1, mặc định 0.5)
- `tags`: Array tags phân loại ['analysis', 'hypothesis', 'verification']
- `context`: Tóm tắt ngắn gọn về context
- `dependencies`: Array số thứ tự thoughts mà thought này phụ thuộc vào

### Tags phổ biến:
- `analysis`: Phân tích vấn đề
- `hypothesis`: Đưa ra giả thuyết  
- `verification`: Kiểm chứng
- `summary`: Tóm tắt
- `solution`: Đưa ra giải pháp
- `question`: Đặt câu hỏi
- `revision`: Xem xét lại

## 💡 Ví dụ sử dụng

```json
{
  "thought": "Cần phân tích vấn đề thành các thành phần nhỏ hơn",
  "thoughtNumber": 1,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "confidence": 0.8,
  "tags": ["analysis", "problem_decomposition"],
  "context": "Phân tích bài toán phức tạp",
  "dependencies": []
}
```

## 🎨 Visualization Features

- **Progress bars**: Hiển thị tiến độ overall và theo category
- **Confidence indicators**: Màu sắc thể hiện độ tin cậy
- **Pattern detection**: Tự động nhận diện và gợi ý
- **Structured display**: Format đẹp mắt với borders và icons

## 🔧 Cấu hình MCP

Thêm vào file cấu hình MCP của bạn:

```json
{
  "mcpServers": {
    "enhanced-sequential-thinking": {
      "command": "node",
      "args": ["path/to/index.js"]
    }
  }
}
```

## 📊 Output Format

Server trả về JSON với thông tin:
- `thoughtNumber`, `totalThoughts`: Số thứ tự và tổng
- `confidence`: Độ tin cậy
- `suggestions`: Gợi ý cho bước tiếp theo
- `progress`: Tiến độ overall và theo category
- `detectedPatterns`: Patterns được nhận diện
- `thoughtHistoryLength`: Số lượng thoughts đã xử lý

## 🆚 So sánh với Official Tool

| Feature | Official | Enhanced |
|---------|----------|----------|
| Basic sequential thinking | ✅ | ✅ |
| Revision & branching | ✅ | ✅ |
| Confidence scoring | ❌ | ✅ |
| Auto-suggestions | ❌ | ✅ |
| Pattern detection | ❌ | ✅ |
| Progress tracking | ❌ | ✅ |
| Context memory | ❌ | ✅ |
| Dependency tracking | ❌ | ✅ |
| Smart visualization | Basic | Advanced |

## 🤝 Đóng góp

Hoan nghênh mọi đóng góp! Vui lòng tạo issue hoặc pull request.

## 📄 License

MIT License - xem file LICENSE để biết thêm chi tiết. 