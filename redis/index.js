#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient } from "redis";
// Configuration
const REDIS_URL = process.argv[2] || "redis://localhost:6379";
const MAX_RETRIES = 5;
const MIN_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
// Create Redis client with retry strategy
const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries >= MAX_RETRIES) {
        console.error(
          `[Redis Error] Maximum retries (${MAX_RETRIES}) reached. Giving up.`
        );
        console.error(`[Redis Error] Connection: ${REDIS_URL}`);
        return new Error("Max retries reached");
      }
      const delay = Math.min(
        Math.pow(2, retries) * MIN_RETRY_DELAY,
        MAX_RETRY_DELAY
      );
      console.error(
        `[Redis Retry] Attempt ${retries + 1}/${MAX_RETRIES} failed`
      );
      console.error(`[Redis Retry] Next attempt in ${delay}ms`);
      console.error(`[Redis Retry] Connection: ${REDIS_URL}`);
      return delay;
    },
  },
});
// Define Zod schema for the unified redis_query tool
const RedisQueryArgumentsSchema = z.object({
  command: z.string().describe("Redis command to execute (e.g., 'GET', 'SET', 'INCR', etc.)"),
  args: z.array(z.any()).optional().describe("Arguments for the Redis command"),
});
// Create server instance
const server = new Server(
  {
    name: "redis",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
// List available tools - now just one unified tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "redis_query",
        description: `Execute any Redis command directly. Supports all Redis operations including:
        
**Basic Operations:**
- SET key value [EX seconds] - Set key-value with optional expiration
- GET key - Get value by key
- DEL key [key ...] - Delete one or more keys
- EXISTS key [key ...] - Check if keys exist
- KEYS pattern - List keys matching pattern

**String Operations:**
- INCR key - Increment value by 1
- DECR key - Decrement value by 1  
- INCRBY key increment - Increment by amount
- DECRBY key decrement - Decrement by amount
- APPEND key value - Append to string

**Key Management:**
- EXPIRE key seconds - Set expiration
- TTL key - Get time to live
- PERSIST key - Remove expiration
- TYPE key - Get key type

**Database Operations:**
- SELECT database - Select database (0-15)
- DBSIZE - Get number of keys in current DB
- FLUSHDB - Clear current database
- INFO [section] - Get server information

**Hash Operations:**
- HSET key field value - Set hash field
- HGET key field - Get hash field
- HDEL key field [field ...] - Delete hash fields
- HGETALL key - Get all hash fields

**List Operations:**
- LPUSH key value [value ...] - Push to list head
- RPUSH key value [value ...] - Push to list tail
- LPOP key - Pop from list head
- RPOP key - Pop from list tail
- LLEN key - Get list length

**Set Operations:**
- SADD key member [member ...] - Add to set
- SREM key member [member ...] - Remove from set
- SMEMBERS key - Get all set members
- SCARD key - Get set size

And many more Redis commands...`,
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Redis command to execute (case-insensitive, e.g., 'GET', 'SET', 'HSET', 'LPUSH')",
            },
            args: {
              type: "array",
              description: "Arguments for the Redis command (order matters!)",
              items: {
                oneOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" }
                ]
              }
            },
          },
          required: ["command"],
        },
      },
    ],
  };
});
// Helper function to format Redis response for display
function formatRedisResponse(result, command) {
  if (result === null) {
    return "(nil)";
  }
  
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return "(empty array)";
    }
    return result.map((item, index) => `${index + 1}) ${item}`).join('\n');
  }
  
  if (typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }
  
  return String(result);
}
// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    if (name === "redis_query") {
      const { command, args: cmdArgs = [] } = RedisQueryArgumentsSchema.parse(args);
      
      // Convert command to uppercase for consistency
      const cmd = command.toUpperCase();
      
      // Execute the Redis command using the generic sendCommand method
      const result = await redisClient.sendCommand([cmd, ...cmdArgs.map(String)]);
      
      // Format the response based on command type
      let responseText;
      
      if (cmd === 'INFO') {
        responseText = `Redis Server Information:\n\n${result}`;
      } else if (cmd === 'KEYS') {
        const keys = Array.isArray(result) ? result : [];
        responseText = keys.length > 0 
          ? `Found ${keys.length} keys:\n${keys.join('\n')}`
          : 'No keys found matching pattern';
      } else if (cmd === 'TTL') {
        const ttl = Number(result);
        if (ttl === -1) {
          responseText = `Key exists but has no expiration`;
        } else if (ttl === -2) {
          responseText = `Key does not exist`;
        } else {
          responseText = `Key expires in ${ttl} seconds`;
        }
      } else if (['SET', 'DEL', 'EXPIRE', 'PERSIST'].includes(cmd)) {
        responseText = `Command executed successfully: ${cmd} ${cmdArgs.join(' ')}`;
        if (result !== 'OK' && result !== null) {
          responseText += `\nResult: ${formatRedisResponse(result, cmd)}`;
        }
      } else if (['INCR', 'DECR', 'INCRBY', 'DECRBY'].includes(cmd)) {
        responseText = `Command executed: ${cmd} ${cmdArgs.join(' ')}\nNew value: ${result}`;
      } else if (cmd === 'SELECT') {
        responseText = `Successfully selected database: ${cmdArgs[0]}`;
      } else if (cmd === 'DBSIZE') {
        responseText = `Number of keys in current database: ${result}`;
      } else {
        // Generic response for other commands
        const formattedResult = formatRedisResponse(result, cmd);
        responseText = `Command: ${cmd} ${cmdArgs.join(' ')}\nResult: ${formattedResult}`;
      }
      
      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    
    // Handle Redis-specific errors
    if (error.message && error.message.includes('WRONGTYPE')) {
      throw new Error(`Redis error: Wrong data type. The key exists but contains a different data type than expected.`);
    }
    
    if (error.message && error.message.includes('ERR invalid DB index')) {
      throw new Error(`Redis error: Invalid database index. Must be between 0-15.`);
    }
    
    if (error.message && error.message.includes('ERR unknown command')) {
      throw new Error(`Redis error: Unknown command. Please check the command name and try again.`);
    }
    
    throw error;
  }
});
// Set up Redis event handlers
redisClient.on("error", (err) => {
  console.error(`[Redis Error] ${err.name}: ${err.message}`);
  console.error(`[Redis Error] Connection: ${REDIS_URL}`);
  console.error(`[Redis Error] Stack: ${err.stack}`);
});
redisClient.on("connect", () => {
  console.error(`[Redis Connected] Successfully connected to ${REDIS_URL}`);
});
redisClient.on("reconnecting", () => {
  console.error(
    "[Redis Reconnecting] Connection lost, attempting to reconnect..."
  );
});
redisClient.on("end", () => {
  console.error("[Redis Disconnected] Connection closed");
});
async function runServer() {
  try {
    // Connect to Redis
    await redisClient.connect();
    
    // Set up MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Redis MCP Server running on stdio");
  } catch (error) {
    const err = error;
    console.error("[Redis Fatal] Server initialization failed");
    console.error(`[Redis Fatal] Error: ${err.name}: ${err.message}`);
    console.error(`[Redis Fatal] Connection: ${REDIS_URL}`);
    console.error(`[Redis Fatal] Stack: ${err.stack}`);
    await redisClient.quit().catch(() => {});
    process.exit(1);
  }
}
// Handle process termination
process.on("SIGINT", async () => {
  await redisClient.quit().catch(() => {});
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await redisClient.quit().catch(() => {});
  process.exit(0);
});
runServer();
