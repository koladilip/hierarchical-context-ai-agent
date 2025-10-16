#!/usr/bin/env node
// test-tools.js
/**
 * Tool calling test - Validates all tools work correctly
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const COGNITO_TOKEN = process.env.COGNITO_TOKEN;

if (!COGNITO_TOKEN) {
  console.error('❌ Error: COGNITO_TOKEN environment variable required');
  console.error('Run: export COGNITO_TOKEN="your-token-here"');
  process.exit(1);
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${COGNITO_TOKEN}`,
  },
});

async function apiRequest(method, path, body = null) {
  try {
    const response = await api.request({ method, url: path, data: body });
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.data.error || error.response.data.message || JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error(`Connection error: ${error.message}. Is the backend running at ${API_URL}?`);
    } else {
      throw error;
    }
  }
}

const TOOL_TESTS = [
  {
    name: 'calculator',
    message: "What's 3847 × 2913?",
    expectedTool: 'calculator',
  },
  {
    name: 'get_current_time',
    message: "What time is it right now?",
    expectedTool: 'get_current_time',
  },
  {
    name: 'analyze_text',
    message: 'Analyze this text: "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet."',
    expectedTool: 'analyze_text',
  },
  {
    name: 'remember_preference',
    message: "I like hiking and outdoor activities. Remember this.",
    expectedTool: 'remember_preference',
  },
  {
    name: 'remember_preference (implicit)',
    message: "I'm allergic to peanuts",
    expectedTool: 'remember_preference',
  },
];

async function runToolTests() {
  console.log('');
  console.log('🔧 Tool Calling Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // Create session
    const session = await apiRequest('POST', '/api/v1/sessions', { title: 'Tool Test' });
    const sessionId = session.session_id;
    console.log(`📝 Session: ${sessionId}`);
    console.log('');

    let passed = 0;
    let failed = 0;

    for (const test of TOOL_TESTS) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🧪 Testing: ${test.name}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`User: ${test.message}`);
      
      const response = await apiRequest('POST', '/api/v1/chat', {
        session_id: sessionId,
        message: test.message,
      });

      const responsePreview = response.response.length > 150 
        ? response.response.substring(0, 150) + '...' 
        : response.response;
      
      console.log(`AI: ${responsePreview}`);
      console.log('');

      const toolsUsed = response.tools_used || [];
      const expectedToolCalled = toolsUsed.includes(test.expectedTool);
      
      if (expectedToolCalled) {
        console.log(`✅ PASS: Tool "${test.expectedTool}" was called`);
        console.log(`   Tools used: ${toolsUsed.join(', ')}`);
        passed++;
      } else {
        console.log(`❌ FAIL: Expected tool "${test.expectedTool}" but got: ${toolsUsed.join(', ') || 'none'}`);
        failed++;
      }
      
      console.log('');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Check memories were stored
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 Checking memories...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const memories = await apiRequest('GET', '/api/v1/memories');
    const memoriesCount = memories.memories?.length || 0;
    
    if (memoriesCount > 0) {
      console.log(`✅ Found ${memoriesCount} memories stored`);
      memories.memories?.forEach(m => {
        console.log(`   - ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}`);
      });
    } else {
      console.log(`⚠️  No memories found (remember_preference tool may not have worked)`);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Final Results');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Passed: ${passed}/${TOOL_TESTS.length}`);
    console.log(`❌ Failed: ${failed}/${TOOL_TESTS.length}`);
    console.log('');

    if (failed === 0) {
      console.log('🎉 All tool tests passed!');
    } else {
      console.log('⚠️  Some tool tests failed');
      console.log('');
      console.log('💡 Tip: Amazon Nova models have limited tool calling capabilities.');
      console.log('   Consider switching to Claude for better tool support:');
      console.log('   BEDROCK_LLM_MODEL=anthropic.claude-3-haiku-20240307-v1:0');
    }
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

runToolTests();

