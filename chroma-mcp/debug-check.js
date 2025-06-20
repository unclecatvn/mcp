#!/usr/bin/env node

/**
 * Debug script để kiểm tra tất cả requirements cho Chroma MCP Server
 */

import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';

async function debugCheck() {
  console.log('🔍 Debugging Chroma MCP Server Requirements...\n');

  let allGood = true;

  // 1. Kiểm tra OpenAI API Key
  console.log('1️⃣ Checking OpenAI API Key...');
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.log('❌ OPENAI_API_KEY not set!');
    console.log('   Fix: export OPENAI_API_KEY=your-api-key-here');
    allGood = false;
  } else {
    console.log('✅ OPENAI_API_KEY is set');
    console.log(`   Length: ${openaiApiKey.length} characters`);
  }

  // 2. Kiểm tra OpenAI Model
  console.log('\n2️⃣ Checking OpenAI Model...');
  const openaiModel = process.env.OPENAI_MODEL || 'text-embedding-3-small';
  console.log(`✅ Using model: ${openaiModel}`);

  // 3. Kiểm tra ChromaDB connection
  console.log('\n3️⃣ Checking ChromaDB connection...');
  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
  console.log(`   Connecting to: ${chromaUrl}`);
  
  try {
    const client = new ChromaClient({ path: chromaUrl });
    const version = await client.version();
    console.log(`✅ ChromaDB connected successfully`);
    console.log(`   Version: ${version}`);
  } catch (error) {
    console.log('❌ ChromaDB connection failed!');
    console.log(`   Error: ${error.message}`);
    console.log('   Fix: docker run -p 8000:8000 chromadb/chroma');
    allGood = false;
  }

  // 4. Test OpenAI Embedding Function (nếu có API key)
  if (openaiApiKey) {
    console.log('\n4️⃣ Testing OpenAI Embedding Function...');
    try {
      const embedder = new OpenAIEmbeddingFunction({
        openai_api_key: openaiApiKey,
        openai_model: openaiModel
      });
      console.log('✅ OpenAI Embedding Function created successfully');
      
      // Test với một collection nhỏ
      const client = new ChromaClient({ path: chromaUrl });
      const testCollection = await client.getOrCreateCollection({
        name: 'debug_test_collection',
        embeddingFunction: embedder,
        metadata: { 'hnsw:space': 'cosine' }
      });
      
      // Test add một document nhỏ
      await testCollection.add({
        ids: ['test-1'],
        documents: ['This is a test document'],
        metadatas: [{ test: true }]
      });
      
      console.log('✅ Test document added successfully');
      
      // Test query
      const results = await testCollection.query({
        queryTexts: ['test document'],
        nResults: 1
      });
      
      if (results.documents && results.documents[0] && results.documents[0].length > 0) {
        console.log('✅ Test query successful');
        console.log(`   Cosine similarity: ${(1 - results.distances[0][0]).toFixed(3)}`);
      }
      
      // Cleanup
      await client.deleteCollection({ name: 'debug_test_collection' });
      console.log('✅ Test collection cleaned up');
      
    } catch (error) {
      console.log('❌ OpenAI Embedding test failed!');
      console.log(`   Error: ${error.message}`);
      if (error.message.includes('401')) {
        console.log('   Fix: Check your OpenAI API key is valid');
      } else if (error.message.includes('quota')) {
        console.log('   Fix: Check your OpenAI API quota/billing');
      }
      allGood = false;
    }
  }

  // 5. Tổng kết
  console.log('\n📊 Summary:');
  if (allGood) {
    console.log('🎉 All checks passed! MCP Server should work correctly.');
    console.log('\n🚀 You can now run:');
    console.log('   pnpm start');
  } else {
    console.log('⚠️  Some issues found. Please fix them before running MCP Server.');
  }

  console.log('\n💡 Environment Variables:');
  console.log(`   CHROMA_URL: ${chromaUrl}`);
  console.log(`   OPENAI_MODEL: ${openaiModel}`);
  console.log(`   OPENAI_API_KEY: ${openaiApiKey ? '***set***' : 'NOT SET'}`);
}

// Chạy debug check
debugCheck().catch(console.error); 