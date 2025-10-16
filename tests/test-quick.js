#!/usr/bin/env node
// test-quick.js
/**
 * Quick smoke test - Validates basic API functionality
 * Takes ~30 seconds to run
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

async function runQuickTest() {
  console.log('');
  console.log('🚀 Quick Smoke Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // 1. Health check
    console.log('1️⃣  Health check...');
    await apiRequest('GET', '/api/v1/health');
    console.log('   ✅ API is healthy');
    console.log('');

    // 2. Create session
    console.log('2️⃣  Creating session...');
    const session = await apiRequest('POST', '/api/v1/sessions', { title: 'Quick Test' });
    const sessionId = session.session_id;
    console.log(`   ✅ Session: ${sessionId}`);
    console.log('');

    // 3. Send message
    console.log('3️⃣  Sending message...');
    const response = await apiRequest('POST', '/api/v1/chat', {
      session_id: sessionId,
      message: "Hello! What's 25 × 17?"
    });
    console.log(`   ✅ Response: ${response.response.substring(0, 100)}...`);
    console.log(`   📊 Tokens: ${response.tokens_used}`);
    console.log(`   🔧 Tools: ${response.tools_used?.join(', ') || 'none'}`);
    console.log('');

    // 4. Get sessions
    console.log('4️⃣  Listing sessions...');
    const sessions = await apiRequest('GET', '/api/v1/sessions');
    console.log(`   ✅ Found ${sessions.sessions.length} sessions`);
    console.log('');

    // 5. Get memories
    console.log('5️⃣  Checking memories...');
    const memories = await apiRequest('GET', '/api/v1/memories');
    console.log(`   ✅ Found ${memories.memories?.length || 0} memories`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

runQuickTest();

