#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { ChromaClient } from "chromadb";
import { v4 as uuidv4 } from "uuid";
import { OpenAIEmbeddingFunction } from "chromadb";
import dotenv from "dotenv";

dotenv.config();

class ChromaMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "chroma-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.chromaClient = null;
    this.collection = null;
    this.setupHandlers();
  }

  async initializeChroma() {
    try {
      // Check OpenAI API key
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY environment variable is required");
      }

      // Create OpenAI embedding function
      const openaiModel = process.env.OPENAI_MODEL || "text-embedding-3-small";
      const embedder = new OpenAIEmbeddingFunction({
        openai_api_key: openaiApiKey,
        openai_model: openaiModel,
      });

      this.chromaClient = new ChromaClient({
        path: process.env.CHROMA_URL || "http://localhost:8000",
      });

      // Create or get collection for AI agent memory with OpenAI embeddings and cosine distance
      this.collection = await this.chromaClient.getOrCreateCollection({
        name: "ai_agent_memory",
        embeddingFunction: embedder,
        metadata: {
          "hnsw:space": "cosine", // Use cosine distance instead of L2
          description: "Long-term memory storage for AI agents",
          embedding_model: openaiModel,
          distance_metric: "cosine",
          created_at: new Date().toISOString(),
        },
      });

      console.error(
        `✅ ChromaDB connected successfully with OpenAI embeddings (${openaiModel}) using cosine distance`
      );
    } catch (error) {
      console.error("❌ Failed to connect to ChromaDB:", error.message);
      if (error.message.includes("OPENAI_API_KEY")) {
        console.error("💡 Please set OPENAI_API_KEY environment variable");
      }
      throw error;
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "store_memory",
          description: `
Store a knowledge document/memory into the vector database.

When generating content, create a well-structured document with:
- Start with a concise abstract/summary (2-4 sentences)
- Follow with detailed content including subheadings, explanations, and code examples
- Use clear, natural English that is technically accurate
- Focus on practical, actionable information

The document content should be provided as a single string in the 'document' parameter.
The metadata should include:
- type: content type (best_practice, concept, how_to, comparison, error_handling, tip, solution, etc.)
- category: topic category (coding, debugging, architecture, database, nestjs, react, etc.)
- importance: importance level from 1-10
- tags: array of relevant tags for classification
- source: information source (use "ai-generated" for AI-created content)
- context: optional context about when/why this memory was created

Example usage:
- document: "Abstract summary here.\n\nDetailed content with subheadings and examples..."
- metadata: {"type": "best_practice", "category": "nestjs", "importance": 8, "tags": ["nestjs", "guards"], "source": "ai-generated"}
          `,
          inputSchema: {
            type: "object",
            properties: {
              document: {
                type: "string",
                description:
                  "Document/memory content to store. Should start with abstract summary, followed by \\n\\n and detailed content (all in English)",
              },
              metadata: {
                type: "object",
                description:
                  "Additional metadata (type, category, importance, etc.) - abstract is NOT included here",
                properties: {
                  type: {
                    type: "string",
                    description:
                      "Memory type (best_practice, concept, how_to, comparison, error_handling, tip, solution, etc.)",
                  },
                  category: {
                    type: "string",
                    description:
                      "Category (coding, debugging, architecture, database, nestjs, react, etc.)",
                  },
                  importance: {
                    type: "number",
                    description: "Importance level (1-10)",
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tags for classification (in English)",
                  },
                  source: {
                    type: "string",
                    description:
                      'Information source (use "ai-generated" for AI-created content)',
                  },
                  context: {
                    type: "string",
                    description: "Context when this memory was created",
                  },
                },
              },
              id: {
                type: "string",
                description:
                  "Optional ID, will auto-generate UUID if not provided",
              },
            },
            required: ["document"],
          },
        },
        {
          name: "search_memory",
          description:
            "Search for related memories/documents based on query. Use English queries for better results.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Search query to find related memories (preferably in English)",
              },
              n_results: {
                type: "number",
                description: "Number of results to return (default: 5)",
                default: 5,
              },
              filter_metadata: {
                type: "object",
                description:
                  'Metadata filter (e.g., {"type": "best_practice"})',
              },
            },
            required: ["query"],
          },
        },
        {
          name: "get_memory_by_id",
          description: "Retrieve specific memory by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID of the memory to retrieve",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "list_memories",
          description: "List all memories with pagination",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Number of memories to return (default: 20)",
                default: 20,
              },
              offset: {
                type: "number",
                description: "Starting position (default: 0)",
                default: 0,
              },
              filter_metadata: {
                type: "object",
                description: "Metadata filter",
              },
            },
          },
        },
        {
          name: "delete_memory",
          description: "Delete memory by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID of the memory to delete",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "get_collection_stats",
          description: "Get collection statistics (document count, etc.)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "health_check",
          description:
            "Check system health status (ChromaDB, OpenAI API, etc.)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      let name = 'unknown'; // Default value to avoid "name is not defined" error
      
      try {
        await this.initializeChroma();

        const { name: toolName, arguments: args } = request.params;
        name = toolName; // Update name after successful destructuring

        switch (name) {
          case "store_memory":
            return await this.storeMemory(args);
          case "search_memory":
            return await this.searchMemory(args);
          case "get_memory_by_id":
            return await this.getMemoryById(args);
          case "list_memories":
            return await this.listMemories(args);
          case "delete_memory":
            return await this.deleteMemory(args);
          case "get_collection_stats":
            return await this.getCollectionStats();
          case "health_check":
            return await this.healthCheck();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        return this.createErrorResponse(error, name);
      }
    });
  }

  async storeMemory(args) {
    const { document, metadata = {}, id } = args;

    if (!document || document.trim() === "") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Document content is required"
      );
    }

    const memoryId = id || uuidv4();
    const enrichedMetadata = {
      ...metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      id: memoryId,
    };

    try {
      await this.collection.add({
        ids: [memoryId],
        documents: [document],
        metadatas: [enrichedMetadata],
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Memory stored successfully",
                id: memoryId,
                document: document,
                metadata: enrichedMetadata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to store memory: ${error.message}`
      );
    }
  }

  async searchMemory(args) {
    const { query, n_results = 5, filter_metadata } = args;

    if (!query || query.trim() === "") {
      throw new McpError(ErrorCode.InvalidParams, "Query is required");
    }

    try {
      const searchParams = {
        queryTexts: [query],
        nResults: Math.min(n_results, 50), // Limit maximum 50 results
      };

      if (filter_metadata) {
        searchParams.where = filter_metadata;
      }

      const results = await this.collection.query(searchParams);

      const memories = [];
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          memories.push({
            id: results.ids[0][i],
            document: results.documents[0][i],
            metadata: results.metadatas[0][i],
            distance: results.distances[0][i],
            cosine_similarity: 1 - results.distances[0][i], // Cosine similarity (1 - cosine distance)
            relevance_score: 1 - results.distances[0][i], // Relevance score based on cosine similarity
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                query: query,
                total_results: memories.length,
                memories: memories,
                suggestions:
                  memories.length > 0
                    ? `Found ${
                        memories.length
                      } related memories. Most relevant memory: "${memories[0]?.document?.substring(
                        0,
                        100
                      )}..."`
                    : "No related memories found. Consider storing this information as a new memory.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search memory: ${error.message}`
      );
    }
  }

  async getMemoryById(args) {
    const { id } = args;

    if (!id) {
      throw new McpError(ErrorCode.InvalidParams, "ID is required");
    }

    try {
      const results = await this.collection.get({
        ids: [id],
        include: ["documents", "metadatas"],
      });

      if (!results.ids || results.ids.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  message: "Memory not found",
                  id: id,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                memory: {
                  id: results.ids[0],
                  document: results.documents[0],
                  metadata: results.metadatas[0],
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get memory: ${error.message}`
      );
    }
  }

  async listMemories(args) {
    const { limit = 20, offset = 0, filter_metadata } = args;

    try {
      const queryParams = {
        limit: Math.min(limit, 100), // Limit maximum 100
        offset: offset,
        include: ["documents", "metadatas"],
      };

      if (filter_metadata) {
        queryParams.where = filter_metadata;
      }

      const results = await this.collection.get(queryParams);

      const memories = [];
      if (results.ids) {
        for (let i = 0; i < results.ids.length; i++) {
          memories.push({
            id: results.ids[i],
            document: results.documents[i],
            metadata: results.metadatas[i],
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                total_returned: memories.length,
                offset: offset,
                limit: limit,
                memories: memories,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list memories: ${error.message}`
      );
    }
  }

  async deleteMemory(args) {
    const { id } = args;

    if (!id) {
      throw new McpError(ErrorCode.InvalidParams, "ID is required");
    }

    try {
      await this.collection.delete({
        ids: [id],
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Memory deleted successfully",
                id: id,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to delete memory: ${error.message}`
      );
    }
  }

  async getCollectionStats() {
    try {
      const count = await this.collection.count();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                collection_name: "ai_agent_memory",
                total_memories: count,
                stats: {
                  total_documents: count,
                  collection_metadata: (await this.collection.metadata) || {},
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get stats: ${error.message}`
      );
    }
  }

  async healthCheck() {
    const healthStatus = {
      success: true,
      timestamp: new Date().toISOString(),
      components: {},
      overall_status: "healthy",
      warnings: [],
      errors: [],
    };

    // 1. Check OpenAI API Key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      healthStatus.components.openai = {
        status: "error",
        message: "OpenAI API Key not configured",
      };
      healthStatus.errors.push("🔑 OpenAI API Key not configured");
      healthStatus.overall_status = "unhealthy";
      healthStatus.success = false;
    } else {
      healthStatus.components.openai = {
        status: "healthy",
        message: "API Key configured",
        model: process.env.OPENAI_MODEL || "text-embedding-3-small",
      };
    }

    // 2. Check ChromaDB connection
    try {
      if (!this.chromaClient) {
        await this.initializeChroma();
      }

      const version = await this.chromaClient.version();
      healthStatus.components.chromadb = {
        status: "healthy",
        message: "Connected successfully",
        version: version,
        url: process.env.CHROMA_URL || "http://localhost:8000",
      };
    } catch (error) {
      healthStatus.components.chromadb = {
        status: "error",
        message: error.message,
        url: process.env.CHROMA_URL || "http://localhost:8000",
      };
      healthStatus.errors.push("🗄️ ChromaDB connection failed");
      healthStatus.overall_status = "unhealthy";
      healthStatus.success = false;
    }

    // 3. Check Collection
    try {
      if (this.collection) {
        const count = await this.collection.count();
        healthStatus.components.collection = {
          status: "healthy",
          message: "Collection accessible",
          name: "ai_agent_memory",
          document_count: count,
        };
      } else {
        healthStatus.components.collection = {
          status: "warning",
          message: "Collection not initialized yet",
        };
        healthStatus.warnings.push("📚 Collection not initialized yet");
      }
    } catch (error) {
      healthStatus.components.collection = {
        status: "error",
        message: error.message,
      };
      healthStatus.errors.push("📚 Collection access failed");
      if (healthStatus.overall_status !== "unhealthy") {
        healthStatus.overall_status = "degraded";
      }
    }

    // 4. Add suggestions if there are errors
    if (healthStatus.errors.length > 0) {
      healthStatus.suggestions = [];

      if (healthStatus.components.openai?.status === "error") {
        healthStatus.suggestions.push(
          "Set OpenAI API Key: export OPENAI_API_KEY=sk-your-key-here"
        );
      }

      if (healthStatus.components.chromadb?.status === "error") {
        healthStatus.suggestions.push(
          "Start ChromaDB: docker run -p 8000:8000 chromadb/chroma"
        );
      }

      healthStatus.suggestions.push("Run debug script: pnpm run debug");
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(healthStatus, null, 2),
        },
      ],
    };
  }

  createErrorResponse(error, toolName) {
    let errorType = "unknown_error";
    let userMessage = "";
    let suggestions = [];

    // Analyze error and provide specific suggestions
    if (error.message.includes("OPENAI_API_KEY")) {
      errorType = "missing_openai_key";
      userMessage = "🔑 OpenAI API Key not configured";
      suggestions = [
        "Get API key from: https://platform.openai.com/api-keys",
        "Set environment variable: export OPENAI_API_KEY=sk-your-key-here",
        "Or add to .env file: OPENAI_API_KEY=sk-your-key-here",
      ];
    } else if (
      error.message.includes("Failed to fetch") &&
      error.message.includes("localhost:8000")
    ) {
      errorType = "chromadb_not_running";
      userMessage = "🗄️ ChromaDB server not running";
      suggestions = [
        "Start ChromaDB: docker run -p 8000:8000 chromadb/chroma",
        "Or install locally: pip install chromadb && chroma run --host localhost --port 8000",
        "Check if port 8000 is occupied: lsof -i :8000",
      ];
    } else if (
      error.message.includes("401") ||
      error.message.includes("Unauthorized")
    ) {
      errorType = "invalid_openai_key";
      userMessage = "🚫 OpenAI API Key invalid or expired";
      suggestions = [
        "Check API key format: sk-...",
        "Verify key at: https://platform.openai.com/api-keys",
        "Check billing and quota at: https://platform.openai.com/usage",
      ];
    } else if (
      error.message.includes("quota") ||
      error.message.includes("billing")
    ) {
      errorType = "openai_quota_exceeded";
      userMessage = "💳 OpenAI API quota exceeded or billing not set up";
      suggestions = [
        "Check usage at: https://platform.openai.com/usage",
        "Add payment method: https://platform.openai.com/account/billing",
        "Upgrade plan if necessary",
      ];
    } else if (error.message.includes("422")) {
      errorType = "data_format_error";
      userMessage = "📝 Data format incorrect or missing required information";
      suggestions = [
        "Check document content is not empty",
        "Verify metadata format is valid JSON",
        "Run debug script: pnpm run debug",
      ];
    } else {
      userMessage = `❌ Unknown error in tool ${toolName}`;
      suggestions = [
        "Run debug script to check: pnpm run debug",
        "Check detailed logs in console",
        "Restart MCP server if necessary",
      ];
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error_type: errorType,
              message: userMessage,
              suggestions: suggestions,
              technical_error: error.message,
              tool_name: toolName,
              timestamp: new Date().toISOString(),
              help: {
                debug_command: "pnpm run debug",
                documentation: "Check README.md for setup instructions",
                support: "Ensure ChromaDB is running and OpenAI API key is set",
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 Chroma MCP Server started successfully");
  }
}

// Start server
const server = new ChromaMCPServer();
server.run().catch(console.error);
