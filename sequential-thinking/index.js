#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';

/**
 * @typedef {Object} ThoughtData
 * @property {string} thought - Nội dung tư duy
 * @property {number} thoughtNumber - Số thứ tự thought
 * @property {number} totalThoughts - Tổng số thoughts dự kiến
 * @property {number} confidence - Độ tin cậy (0-1)
 * @property {string[]} tags - Categories: analysis, hypothesis, verification, etc.
 * @property {string} context - Tóm tắt context ngắn gọn
 * @property {number[]} dependencies - Thoughts mà thought này phụ thuộc vào
 * @property {boolean} [isRevision] - Có phải revision không
 * @property {number} [revisesThought] - Revision thought số mấy
 * @property {number} [branchFromThought] - Branch từ thought nào
 * @property {string} [branchId] - ID của branch
 * @property {boolean} [needsMoreThoughts] - Cần thêm thoughts không
 * @property {boolean} nextThoughtNeeded - Có cần thought tiếp theo không
 * @property {Date} timestamp - Thời gian tạo
 */

/**
 * @typedef {Object} Pattern
 * @property {string} name - Tên pattern
 * @property {string} description - Mô tả pattern
 * @property {string[]} indicators - Các từ khóa nhận diện
 * @property {string[]} suggestions - Gợi ý cho pattern này
 */

class EnhancedSequentialThinkingServer {
  constructor() {
    this.thoughtHistory = [];
    this.branches = {};
    this.contextMemory = new Map();
    this.patterns = [
      {
        name: "problem_decomposition",
        description: "Breaking down complex problems",
        indicators: ["complex", "multiple", "various", "different aspects"],
        suggestions: ["Consider breaking this into smaller sub-problems", "What are the key components?"]
      },
      {
        name: "hypothesis_testing",
        description: "Testing assumptions",
        indicators: ["assume", "suppose", "might be", "could be"],
        suggestions: ["How can we verify this assumption?", "What evidence supports this?"]
      },
      {
        name: "solution_convergence",
        description: "Converging towards solution",
        indicators: ["therefore", "so", "conclude", "final"],
        suggestions: ["Double-check the logic chain", "Are there alternative explanations?"]
      }
    ];
  }

  /**
   * Validate thought data input
   * @param {any} input - Input data to validate
   * @returns {ThoughtData} Validated thought data
   */
  validateThoughtData(input) {
    const data = input;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Thought phải là string không rỗng');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('thoughtNumber phải là số');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('totalThoughts phải là số');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('nextThoughtNeeded phải là boolean');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      confidence: data.confidence || 0.5,
      tags: data.tags || [],
      context: data.context || '',
      dependencies: data.dependencies || [],
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision,
      revisesThought: data.revisesThought,
      branchFromThought: data.branchFromThought,
      branchId: data.branchId,
      needsMoreThoughts: data.needsMoreThoughts,
      timestamp: new Date()
    };
  }

  /**
   * Detect patterns in thought content
   * @param {string} thought - Thought content to analyze
   * @returns {Pattern[]} Array of detected patterns
   */
  detectPatterns(thought) {
    return this.patterns.filter(pattern => 
      pattern.indicators.some(indicator => 
        thought.toLowerCase().includes(indicator.toLowerCase())
      )
    );
  }

  /**
   * Generate suggestions based on thought data
   * @param {ThoughtData} thoughtData - Thought data to analyze
   * @returns {string[]} Array of suggestions
   */
  generateSuggestions(thoughtData) {
    const suggestions = [];
    const detectedPatterns = this.detectPatterns(thoughtData.thought);
    
    // Pattern-based suggestions
    detectedPatterns.forEach(pattern => {
      suggestions.push(...pattern.suggestions);
    });

    // Context-based suggestions
    if (thoughtData.confidence < 0.7) {
      suggestions.push("Cân nhắc tăng độ tin cậy bằng cách tìm thêm bằng chứng");
    }

    if (thoughtData.thoughtNumber > 5 && !thoughtData.tags.includes('summary')) {
      suggestions.push("Có thể cần tóm tắt các thoughts trước đó");
    }

    // Dependency analysis
    if (thoughtData.dependencies.length === 0 && thoughtData.thoughtNumber > 1) {
      suggestions.push("Cân nhắc kết nối với thoughts trước đó");
    }

    return suggestions;
  }

  /**
   * Calculate progress overall and by tag
   * @returns {Object} Progress data with overall and byTag metrics
   */
  calculateProgress() {
    const total = this.thoughtHistory.length;
    if (total === 0) return { overall: 0, byTag: {} };

    const confidenceSum = this.thoughtHistory.reduce((sum, t) => sum + t.confidence, 0);
    const overall = confidenceSum / total;

    const byTag = {};
    const tagCounts = {};
    
    this.thoughtHistory.forEach(thought => {
      thought.tags.forEach(tag => {
        if (!byTag[tag]) byTag[tag] = 0;
        if (!tagCounts[tag]) tagCounts[tag] = 0;
        byTag[tag] += thought.confidence;
        tagCounts[tag]++;
      });
    });

    Object.keys(byTag).forEach(tag => {
      byTag[tag] = byTag[tag] / tagCounts[tag];
    });

    return { overall, byTag };
  }

  /**
   * Format thought for display
   * @param {ThoughtData} thoughtData - Thought data to format
   * @returns {string} Formatted thought string
   */
  formatThought(thoughtData) {
    const { thoughtNumber, totalThoughts, thought, confidence, tags, context, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let contextInfo = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      contextInfo = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      contextInfo = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      contextInfo = '';
    }

    const confidenceColor = confidence >= 0.8 ? chalk.green : confidence >= 0.5 ? chalk.yellow : chalk.red;
    const confidenceBar = '█'.repeat(Math.floor(confidence * 10)) + '░'.repeat(10 - Math.floor(confidence * 10));
    
    const tagsDisplay = tags.length > 0 ? chalk.cyan(`[${tags.join(', ')}]`) : '';
    const contextDisplay = context ? chalk.gray(` • ${context}`) : '';

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${contextInfo}`;
    const confidence_line = `Confidence: ${confidenceColor(confidenceBar)} ${Math.round(confidence * 100)}%`;
    const meta_line = `${tagsDisplay}${contextDisplay}`;
    
    const maxWidth = Math.max(header.length, thought.length, confidence_line.length, meta_line.length) + 4;
    const border = '─'.repeat(maxWidth);

    return `
┌${border}┐
│ ${header.padEnd(maxWidth - 2)} │
│ ${confidence_line.padEnd(maxWidth - 2)} │
${meta_line ? `│ ${meta_line.padEnd(maxWidth - 2)} │` : ''}
├${border}┤
│ ${thought.padEnd(maxWidth - 2)} │
└${border}┘`;
  }

  /**
   * Generate progress report
   * @returns {string} Formatted progress report
   */
  generateProgressReport() {
    const progress = this.calculateProgress();
    const overallBar = '█'.repeat(Math.floor(progress.overall * 20)) + '░'.repeat(20 - Math.floor(progress.overall * 20));
    
    let report = `\n${chalk.bold('📊 Progress Report:')}\n`;
    report += `Overall: ${chalk.blue(overallBar)} ${Math.round(progress.overall * 100)}%\n`;
    
    if (Object.keys(progress.byTag).length > 0) {
      report += `\nBy Category:\n`;
      Object.entries(progress.byTag).forEach(([tag, score]) => {
        const tagBar = '█'.repeat(Math.floor(score * 10)) + '░'.repeat(10 - Math.floor(score * 10));
        report += `  ${tag}: ${chalk.cyan(tagBar)} ${Math.round(score * 100)}%\n`;
      });
    }
    
    return report;
  }

  /**
   * Process thought input and return response
   * @param {any} input - Input thought data
   * @returns {Object} Response object with content
   */
  processThought(input) {
    try {
      const validatedInput = this.validateThoughtData(input);

      // Auto-adjust total thoughts if needed
      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      // Store in memory
      this.thoughtHistory.push(validatedInput);
      this.contextMemory.set(`thought_${validatedInput.thoughtNumber}`, {
        summary: validatedInput.thought.substring(0, 100),
        confidence: validatedInput.confidence,
        tags: validatedInput.tags
      });

      // Handle branching
      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      // Generate suggestions
      const suggestions = this.generateSuggestions(validatedInput);
      
      // Format and display
      const formattedThought = this.formatThought(validatedInput);
      console.error(formattedThought);

      // Show suggestions if any
      if (suggestions.length > 0) {
        console.error(chalk.gray('\n💡 Suggestions:'));
        suggestions.forEach(suggestion => {
          console.error(chalk.gray(`   • ${suggestion}`));
        });
      }

      // Progress report every 3 thoughts
      if (validatedInput.thoughtNumber % 3 === 0) {
        console.error(this.generateProgressReport());
      }

      // Prepare response
      const responseData = {
        thoughtNumber: validatedInput.thoughtNumber,
        totalThoughts: validatedInput.totalThoughts,
        nextThoughtNeeded: validatedInput.nextThoughtNeeded,
        confidence: validatedInput.confidence,
        suggestions: suggestions.slice(0, 3), // Top 3 suggestions
        progress: this.calculateProgress(),
        branches: Object.keys(this.branches),
        thoughtHistoryLength: this.thoughtHistory.length,
        detectedPatterns: this.detectPatterns(validatedInput.thought).map(p => p.name),
        contextSummary: this.contextMemory.has('thought_summary') ? 
          this.contextMemory.get('thought_summary') : 'No context summary yet'
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  /**
   * Get context summary from high confidence thoughts
   * @returns {string} Context summary
   */
  getContextSummary() {
    if (this.thoughtHistory.length === 0) return "Chưa có thoughts nào";
    
    const highConfidenceThoughts = this.thoughtHistory.filter(t => t.confidence >= 0.7);
    const keyInsights = highConfidenceThoughts.map(t => t.thought.substring(0, 50) + '...');
    
    return `Key insights: ${keyInsights.join(' | ')}`;
  }
}

const ENHANCED_SEQUENTIAL_THINKING_TOOL = {
  name: "enhanced_sequential_thinking",
  description: `🧠 Enhanced Sequential Thinking Tool - Phiên bản cải tiến cho tư duy logic từng bước

Công cụ này giúp phân tích vấn đề thông qua quá trình tư duy có cấu trúc với các tính năng nâng cao:

🎯 TÍNH NĂNG CHÍNH:
- Context Memory: Ghi nhớ và kết nối các thoughts
- Auto-Suggestion: Đề xuất thông minh cho bước tiếp theo
- Confidence Scoring: Đánh giá độ tin cậy từng thought (0-1)
- Pattern Detection: Nhận diện các pattern tư duy
- Progress Tracking: Theo dõi tiến độ theo category
- Smart Visualization: Hiển thị trực quan đẹp mắt

📝 CÁC THAM SỐ:
- thought: Nội dung tư duy hiện tại
- thoughtNumber: Số thứ tự thought (bắt đầu từ 1)
- totalThoughts: Tổng số thoughts dự kiến
- nextThoughtNeeded: Có cần thought tiếp theo không (boolean)
- confidence: Độ tin cậy (0-1, mặc định 0.5)
- tags: Danh sách tags để phân loại ['analysis', 'hypothesis', 'verification']
- context: Tóm tắt ngắn gọn về context
- dependencies: Array số thứ tự thoughts mà thought này phụ thuộc vào

🔧 CÁC THAM SỐ TÙY CHỌN:
- isRevision: Có phải là revision không
- revisesThought: Revision thought số mấy
- branchFromThought: Branch từ thought nào
- branchId: ID của branch
- needsMoreThoughts: Cần thêm thoughts không

🎨 TAGS PHỔ BIẾN:
- 'analysis': Phân tích vấn đề
- 'hypothesis': Đưa ra giả thuyết
- 'verification': Kiểm chứng
- 'summary': Tóm tắt
- 'solution': Đưa ra giải pháp
- 'question': Đặt câu hỏi
- 'revision': Xem xét lại

💡 GỢI Ý SỬ DỤNG:
1. Bắt đầu với confidence thấp, tăng dần khi chắc chắn hơn
2. Sử dụng tags để phân loại rõ ràng
3. Kết nối thoughts qua dependencies
4. Đặt context ngắn gọn nhưng đủ ý nghĩa
5. Sử dụng revision khi cần điều chỉnh
6. Tận dụng suggestions để cải thiện tư duy`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Nội dung tư duy hiện tại"
      },
      thoughtNumber: {
        type: "integer",
        description: "Số thứ tự thought",
        minimum: 1
      },
      totalThoughts: {
        type: "integer", 
        description: "Tổng số thoughts dự kiến",
        minimum: 1
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Có cần thought tiếp theo không"
      },
      confidence: {
        type: "number",
        description: "Độ tin cậy (0-1)",
        minimum: 0,
        maximum: 1
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags phân loại thought"
      },
      context: {
        type: "string",
        description: "Tóm tắt context ngắn gọn"
      },
      dependencies: {
        type: "array",
        items: { type: "integer", minimum: 1 },
        description: "Thoughts mà thought này phụ thuộc vào"
      },
      isRevision: {
        type: "boolean",
        description: "Có phải revision không"
      },
      revisesThought: {
        type: "integer",
        description: "Revision thought số mấy",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branch từ thought nào",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "ID của branch"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "Cần thêm thoughts không"
      }
    },
    required: ["thought", "thoughtNumber", "totalThoughts", "nextThoughtNeeded"]
  }
};

const server = new Server(
  {
    name: "enhanced-sequential-thinking-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const enhancedThinkingServer = new EnhancedSequentialThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [ENHANCED_SEQUENTIAL_THINKING_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "enhanced_sequential_thinking") {
    return enhancedThinkingServer.processThought(request.params.arguments);
  }

  return {
    content: [{
      type: "text",
      text: `Unknown tool: ${request.params.name}`
    }],
    isError: true
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🧠 Enhanced Sequential Thinking MCP Server is running on stdio");
  console.error("🚀 Ready to enhance your thinking process!");
}

runServer().catch((error) => {
  console.error("❌ Fatal error running server:", error);
  process.exit(1);
}); 