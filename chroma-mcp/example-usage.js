#!/usr/bin/env node

/**
 * Example usage of Chroma MCP Server
 * Run this file to test the functionality
 */

import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';

async function testChromaMCP() {
  console.log('🧪 Testing Chroma MCP Server functionality...\n');

  try {
    // Check OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    // Create OpenAI embedding function
    const openaiModel = process.env.OPENAI_MODEL || 'text-embedding-3-small';
    const embedder = new OpenAIEmbeddingFunction({
      openai_api_key: openaiApiKey,
      openai_model: openaiModel
    });

    // Connect directly to ChromaDB for testing
    const client = new ChromaClient({
      path: 'http://localhost:8000'
    });

    const collection = await client.getOrCreateCollection({
      name: 'ai_agent_memory_test',
      embeddingFunction: embedder,
      metadata: {
        'hnsw:space': 'cosine'  // Use cosine distance
      }
    });

    console.log(`Using OpenAI embedding model: ${openaiModel} with cosine distance`);

    // Test 1: Store memories with abstract field
    console.log('📝 Test 1: Storing memories with abstracts...');
    
    const testMemories = [
      {
        id: 'memory-1',
        document: 'Best practice for implementing custom exceptions in NestJS applications for consistent error handling.\n\nUse custom exceptions by extending HttpException for consistent error handling in NestJS. This approach provides better error tracking, standardized response formats, and easier debugging. Custom exceptions should include error codes, user-friendly messages, and proper HTTP status codes.\n\nImplementation:\n```typescript\nimport { HttpException, HttpStatus } from \'@nestjs/common\';\n\nexport class CustomBusinessException extends HttpException {\n  constructor(message: string, errorCode: string) {\n    super({\n      message,\n      errorCode,\n      timestamp: new Date().toISOString(),\n    }, HttpStatus.BAD_REQUEST);\n  }\n}\n```\n\nUsage in service:\n```typescript\nif (!user) {\n  throw new CustomBusinessException(\'User not found\', \'USER_NOT_FOUND\');\n}\n```',
        metadata: {
          type: 'best_practice',
          category: 'error_handling',
          importance: 8,
          tags: ['nestjs', 'exceptions', 'best-practice', 'error-handling'],
          source: 'ai-generated',
          context: 'Working on NestJS API error handling patterns'
        }
      },
      {
        id: 'memory-2', 
        document: 'Security best practice for input validation using class-validator decorators in NestJS DTOs.\n\nAlways validate input data using class-validator decorators in DTOs to prevent injection attacks. Implement proper sanitization, use whitelist validation, and validate nested objects. This prevents SQL injection, XSS attacks, and ensures data integrity throughout the application.\n\nImplementation:\n```typescript\nimport { IsEmail, IsString, IsOptional, IsNotEmpty, Length } from \'class-validator\';\nimport { Transform } from \'class-transformer\';\n\nexport class CreateUserDto {\n  @IsString()\n  @IsNotEmpty()\n  @Length(2, 50)\n  @Transform(({ value }) => value.trim())\n  name: string;\n\n  @IsEmail()\n  @Transform(({ value }) => value.toLowerCase())\n  email: string;\n\n  @IsOptional()\n  @IsString()\n  @Length(10, 15)\n  phone?: string;\n}\n```\n\nController usage:\n```typescript\n@Post()\nasync createUser(@Body() createUserDto: CreateUserDto) {\n  return this.userService.create(createUserDto);\n}\n```',
        metadata: {
          type: 'security',
          category: 'validation',
          importance: 9,
          tags: ['nestjs', 'validation', 'security', 'dto', 'class-validator'],
          source: 'ai-generated',
          context: 'Preventing SQL injection and XSS attacks in web applications'
        }
      },
      {
        id: 'memory-3',
        document: 'Performance optimization technique using Redis caching for frequently accessed data.\n\nUse Redis for caching frequently accessed data to improve API performance. Implement cache-aside pattern, set appropriate TTL values, and use cache invalidation strategies. Monitor cache hit rates and optimize cache keys for better performance.\n\nImplementation:\n```typescript\nimport { Injectable } from \'@nestjs/common\';\nimport { Redis } from \'ioredis\';\n\n@Injectable()\nexport class CacheService {\n  constructor(private readonly redis: Redis) {}\n\n  async get<T>(key: string): Promise<T | null> {\n    const cached = await this.redis.get(key);\n    return cached ? JSON.parse(cached) : null;\n  }\n\n  async set(key: string, value: any, ttl: number = 3600): Promise<void> {\n    await this.redis.setex(key, ttl, JSON.stringify(value));\n  }\n\n  async invalidate(pattern: string): Promise<void> {\n    const keys = await this.redis.keys(pattern);\n    if (keys.length > 0) {\n      await this.redis.del(...keys);\n    }\n  }\n}\n```',
        metadata: {
          type: 'performance',
          category: 'caching',
          importance: 7,
          tags: ['redis', 'caching', 'performance', 'optimization'],
          source: 'ai-generated',
          context: 'Optimizing database queries and API response times'
        }
      },
      {
        id: 'memory-4',
        document: 'Database transaction management best practices in NestJS with TypeORM.\n\nImplement proper database transaction handling in NestJS using TypeORM. Use @Transaction decorator for complex operations, handle rollbacks properly, and implement retry mechanisms for transient failures. Always wrap critical operations in transactions.\n\nImplementation:\n```typescript\nimport { Injectable } from \'@nestjs/common\';\nimport { InjectRepository } from \'@nestjs/typeorm\';\nimport { Repository, DataSource } from \'typeorm\';\nimport { User } from \'./user.entity\';\nimport { Order } from \'./order.entity\';\n\n@Injectable()\nexport class UserService {\n  constructor(\n    @InjectRepository(User)\n    private userRepository: Repository<User>,\n    @InjectRepository(Order)\n    private orderRepository: Repository<Order>,\n    private dataSource: DataSource,\n  ) {}\n\n  async createUserWithOrder(userData: any, orderData: any) {\n    return await this.dataSource.transaction(async manager => {\n      const user = await manager.save(User, userData);\n      const order = await manager.save(Order, {\n        ...orderData,\n        userId: user.id,\n      });\n      return { user, order };\n    });\n  }\n}\n```',
        metadata: {
          type: 'best_practice',
          category: 'database',
          importance: 8,
          tags: ['nestjs', 'typeorm', 'transactions', 'database', 'reliability'],
          source: 'ai-generated',
          context: 'Ensuring data consistency in complex database operations'
        }
      }
    ];

    for (const memory of testMemories) {
      await collection.add({
        ids: [memory.id],
        documents: [memory.document],
        metadatas: [memory.metadata]
      });
      // Extract abstract from document (first line before \n\n)
      const abstract = memory.document.split('\n\n')[0];
      console.log(`✅ Stored: ${abstract}`);
    }

    // Test 2: Search memories
    console.log('\n🔍 Test 2: Searching memories...');
    
    const searchQueries = [
      'error handling best practices',
      'security validation input',
      'performance optimization caching',
      'database transaction management'
    ];

    for (const query of searchQueries) {
      console.log(`\n🔎 Query: "${query}"`);
      
      const results = await collection.query({
        queryTexts: [query],
        nResults: 2
      });

      if (results.documents && results.documents[0]) {
        results.documents[0].forEach((doc, index) => {
          const cosineSimilarity = 1 - results.distances[0][index];
          const metadata = results.metadatas[0][index];
          const abstract = doc.split('\n\n')[0]; // Extract abstract from document
          console.log(`  📄 Result ${index + 1} (cosine similarity: ${cosineSimilarity.toFixed(3)})`);
          console.log(`     Abstract: ${abstract}`);
          console.log(`     Category: ${metadata.category} | Type: ${metadata.type} | Importance: ${metadata.importance}`);
        });
      }
    }

    // Test 3: Filtered search by category
    console.log('\n🎯 Test 3: Filtered search by category...');
    
    const filteredResults = await collection.query({
      queryTexts: ['best practices'],
      nResults: 5,
      where: { category: 'error_handling' }
    });

    console.log(`Found ${filteredResults.documents[0]?.length || 0} error handling memories`);
    if (filteredResults.documents[0]?.length > 0) {
      filteredResults.documents[0].forEach((doc, index) => {
        const abstract = doc.split('\n\n')[0]; // Extract abstract from document
        console.log(`  📋 ${abstract}`);
      });
    }

    // Test 4: Get collection stats
    console.log('\n📊 Test 4: Collection stats...');
    const count = await collection.count();
    console.log(`Total memories in collection: ${count}`);

    // Test 5: Demonstrate abstract extraction from documents
    console.log('\n🔖 Test 5: Abstract extraction demonstration...');
    const allResults = await collection.get({
      include: ['documents', 'metadatas']
    });
    
    console.log('All stored abstracts (extracted from documents):');
    allResults.documents.forEach((doc, index) => {
      const abstract = doc.split('\n\n')[0]; // Extract abstract from document
      const metadata = allResults.metadatas[index];
      console.log(`  ${index + 1}. ${abstract}`);
      console.log(`     Tags: ${metadata.tags.join(', ')}`);
    });

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await collection.delete({
      ids: testMemories.map(m => m.id)
    });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n💡 MCP Server Usage Examples:');
    console.log('1. Store memory with abstract in document:');
    console.log('   {"tool": "store_memory", "args": {"document": "Abstract summary...\\n\\nDetailed content...", "metadata": {"type": "best_practice", ...}}}');
    console.log('2. Search memory: {"tool": "search_memory", "args": {"query": "...", "n_results": 5}}');
    console.log('3. Filter by metadata: {"tool": "search_memory", "args": {"query": "...", "filter_metadata": {"category": "security"}}}');
    console.log('4. Get stats: {"tool": "get_collection_stats", "args": {}}');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🚨 Requirements:');
    console.log('1. ChromaDB must be running:');
    console.log('   docker run -p 8000:8000 chromadb/chroma');
    console.log('   or: pip install chromadb && chroma run --host localhost --port 8000');
    console.log('2. OpenAI API Key must be set:');
    console.log('   export OPENAI_API_KEY=your-api-key-here');
    console.log('   export OPENAI_MODEL=text-embedding-3-small  # optional');
  }
}

// Run test if file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testChromaMCP();
} 