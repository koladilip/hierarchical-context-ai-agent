#!/usr/bin/env node
// test-long-conversation.js
/**
 * Long conversation test - Validates context management & summarization
 * 
 * Tests:
 * - Session creation
 * - Multiple turns (50+)
 * - Token tracking
 * - Automatic summarization
 * - Tool calling
 * - Memory persistence
 * - Context window management
 */

const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config({path: '../.env'});

// Configuration
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const COGNITO_TOKEN = process.env.COGNITO_TOKEN;

if (!COGNITO_TOKEN) {
  console.error('❌ Error: COGNITO_TOKEN environment variable is required');
  console.error('');
  console.error('Get your token:');
  console.error('1. Login to the app');
  console.error('2. Click "🔑 API Token" button');
  console.error('3. Copy the token');
  console.error('');
  console.error('Then run:');
  console.error('export COGNITO_TOKEN="your-token-here"');
  console.error('node test-long-conversation.js');
  process.exit(1);
}

// Create axios instance with defaults
const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${COGNITO_TOKEN}`,
  },
});

// API Helper
async function apiRequest(method, path, body = null) {
  try {
    const response = await api.request({
      method,
      url: path,
      data: body,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(`HTTP ${error.response.status}: ${error.response.data.error || error.response.data.message || JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // Request made but no response (connection error)
      throw new Error(`Connection error: ${error.message}. Is the backend running at ${API_URL}?`);
    } else {
      // Something else happened
      throw error;
    }
  }
}

// Test scenarios
const CONVERSATION_SCENARIOS = [
  // Phase 1: Warm-up (10 messages, ~2-3K tokens)
  { message: "Hello! I'm testing your context management capabilities.", expectTool: null },
  { message: "I like mathematics and programming. Remember this.", expectTool: "remember_preference" },
  { message: "What's 2847 × 3921?", expectTool: "calculator" },
  { message: "What time is it right now?", expectTool: "get_current_time" },
  { message: "Tell me about prime numbers", expectTool: null },
  { message: "Explain the Fibonacci sequence in detail", expectTool: null },
  { message: "What's the difference between correlation and causation?", expectTool: null },
  { message: "I'm also vegetarian. Please remember that for future conversations.", expectTool: "remember_preference" },
  { message: "Describe the concept of recursion with examples", expectTool: null },
  { message: "What are the applications of calculus in real life?", expectTool: null },
  
  // Phase 2: Build context (20 messages, ~8-10K tokens)
  { message: "Let's discuss algorithms. What's the difference between O(n) and O(log n)?", expectTool: null },
  { message: "Explain quicksort algorithm step by step", expectTool: null },
  { message: "What are the advantages of merge sort over quicksort?", expectTool: null },
  { message: "Describe how hash tables work internally", expectTool: null },
  { message: "What's the difference between arrays and linked lists?", expectTool: null },
  { message: "Explain binary search trees with an example", expectTool: null },
  { message: "What are the different tree traversal methods?", expectTool: null },
  { message: "Describe the concept of dynamic programming", expectTool: null },
  { message: "Give me an example of a greedy algorithm", expectTool: null },
  { message: "What's the traveling salesman problem?", expectTool: null },
  { message: "Explain graph theory basics", expectTool: null },
  { message: "What's the difference between DFS and BFS?", expectTool: null },
  { message: "Describe Dijkstra's algorithm", expectTool: null },
  { message: "What are the applications of machine learning?", expectTool: null },
  { message: "Explain supervised vs unsupervised learning", expectTool: null },
  { message: "What's overfitting in machine learning?", expectTool: null },
  { message: "Describe neural networks in simple terms", expectTool: null },
  { message: "What's the difference between AI and machine learning?", expectTool: null },
  { message: "Explain what deep learning is", expectTool: null },
  { message: "What are convolutional neural networks used for?", expectTool: null },
  
  // Phase 3: Continue building (20 more messages, ~15-20K tokens total)
  { message: "Let's talk about databases. What's the difference between SQL and NoSQL?", expectTool: null },
  { message: "Explain database normalization", expectTool: null },
  { message: "What are ACID properties in databases?", expectTool: null },
  { message: "Describe database indexing and its benefits", expectTool: null },
  { message: "What's the CAP theorem?", expectTool: null },
  { message: "Explain database sharding", expectTool: null },
  { message: "What's the difference between horizontal and vertical scaling?", expectTool: null },
  { message: "Describe microservices architecture", expectTool: null },
  { message: "What are the benefits of serverless computing?", expectTool: null },
  { message: "Explain containerization and Docker", expectTool: null },
  { message: "What's Kubernetes used for?", expectTool: null },
  { message: "Describe CI/CD pipelines", expectTool: null },
  { message: "What's the difference between REST and GraphQL?", expectTool: null },
  { message: "Explain WebSockets and when to use them", expectTool: null },
  { message: "What are design patterns in software engineering?", expectTool: null },
  { message: "Describe the singleton pattern", expectTool: null },
  { message: "What's the factory pattern?", expectTool: null },
  { message: "Explain the observer pattern with an example", expectTool: null },
  { message: "What's dependency injection?", expectTool: null },
  { message: "Describe SOLID principles", expectTool: null },
  
  // Phase 4: Test recall from early conversation
  { message: "Do you remember what I said I like at the beginning of our conversation?", expectTool: null },
  { message: "What dietary restriction did I mention?", expectTool: null },
  { message: "Can you summarize what we've discussed so far?", expectTool: null },
];

// Main test runner
async function runLongConversationTest() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Long Conversation Test - Context Management Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`📡 API URL: ${API_URL}`);
  console.log(`🔑 Token: ${COGNITO_TOKEN.substring(0, 20)}...`);
  console.log(`📊 Total messages to send: ${CONVERSATION_SCENARIOS.length}`);
  console.log('');

  let sessionId;
  let totalTokens = 0;
  let toolCallsDetected = 0;
  let summarizationEvents = 0;
  let startTime = Date.now();

  try {
    // Step 1: Create session
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Step 1: Creating new session...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const session = await apiRequest('POST', '/api/v1/sessions', { 
      title: `Long Test ${new Date().toLocaleTimeString()}` 
    });
    sessionId = session.session_id;
    
    console.log(`✅ Session created: ${sessionId}`);
    console.log('');

    // Step 2: Send messages
    for (let i = 0; i < CONVERSATION_SCENARIOS.length; i++) {
      const scenario = CONVERSATION_SCENARIOS[i];
      const turnNumber = i + 1;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`💬 Turn ${turnNumber}/${CONVERSATION_SCENARIOS.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`User: ${scenario.message}`);
      
      const response = await apiRequest('POST', '/api/v1/chat', {
        session_id: sessionId,
        message: scenario.message,
      });

      totalTokens = response.context_stats.total_tokens;
      
      // Truncate long responses
      const responsePreview = response.response.length > 150 
        ? response.response.substring(0, 150) + '...' 
        : response.response;
      
      console.log(`AI: ${responsePreview}`);
      console.log('');
      console.log('📊 Metrics:');
      console.log(`   Tokens this turn: ${response.tokens_used}`);
      console.log(`   Total tokens: ${totalTokens.toLocaleString()}`);
      console.log(`   Context window: ${response.context_stats.context_window_used}`);
      console.log(`   Total turns: ${response.context_stats.total_turns}`);
      console.log(`   Has summary: ${response.context_stats.has_summary ? '✅ YES' : '❌ NO'}`);
      
      // Check for tools
      if (response.tools_used && response.tools_used.length > 0) {
        toolCallsDetected++;
        console.log(`   🔧 Tools used: ${response.tools_used.join(', ')}`);
        
        if (scenario.expectTool && !response.tools_used.includes(scenario.expectTool)) {
          console.log(`   ⚠️  WARNING: Expected tool "${scenario.expectTool}" not called!`);
        }
      } else if (scenario.expectTool) {
        console.log(`   ⚠️  WARNING: Expected tool "${scenario.expectTool}" but no tool was called!`);
      }
      
      // Check for system events
      if (response.system_events && response.system_events.length > 0) {
        response.system_events.forEach(event => {
          if (event.type === 'summarization') {
            summarizationEvents++;
            console.log(`   📝 ${event.message}`);
          } else if (event.type === 'tool_call') {
            console.log(`   🔧 ${event.message}`);
          }
        });
      }
      
      console.log('');
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 3: Final statistics
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Test Complete - Final Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`📊 Conversation Metrics:`);
    console.log(`   Total turns: ${CONVERSATION_SCENARIOS.length}`);
    console.log(`   Total tokens: ${totalTokens.toLocaleString()}`);
    console.log(`   Average tokens/turn: ${Math.round(totalTokens / CONVERSATION_SCENARIOS.length)}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Avg time/turn: ${(duration / CONVERSATION_SCENARIOS.length).toFixed(1)}s`);
    console.log('');
    console.log(`🔧 Tool Calling:`);
    console.log(`   Tool calls detected: ${toolCallsDetected}`);
    console.log('');
    console.log(`📝 Context Management:`);
    console.log(`   Summarization events: ${summarizationEvents}`);
    console.log(`   Context compressed: ${summarizationEvents > 0 ? '✅ YES' : '❌ NO'}`);
    console.log('');
    console.log(`💾 Session Info:`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   View in UI: ${API_URL.replace(/:\d+/, ':3000')}/chat`);
    console.log('');
    
    // Validation
    let warnings = [];
    if (summarizationEvents === 0 && totalTokens > 10000) {
      warnings.push('⚠️  Expected summarization at >10K tokens but none occurred');
    }
    if (toolCallsDetected === 0) {
      warnings.push('⚠️  No tool calls detected (expected at least calculator/time/memory tools)');
    }
    
    if (warnings.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  Warnings:');
      warnings.forEach(w => console.log(`   ${w}`));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
    }
    
    console.log('✨ Test completed successfully!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Test Failed');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    
    // Provide specific troubleshooting hints
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ECONNRESET')) {
      console.error('💡 Connection Error - Backend not responding');
      console.error('');
      console.error('Troubleshooting steps:');
      console.error('1. Is the backend running?');
      console.error('   → Run: npm run dev:backend');
      console.error('');
      console.error('2. Check if port 3001 is in use:');
      console.error('   → Run: lsof -i :3001');
      console.error('');
      console.error('3. Check backend logs for errors');
      console.error('');
      console.error('4. Verify .env file exists with AWS credentials');
      console.error('   → Run: cat .env | grep -E "(AWS_REGION|SESSIONS_TABLE|COGNITO)"');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 Authentication Error');
      console.error('');
      console.error('Options:');
      console.error('1. Use dev token (local backend only):');
      console.error('   → export COGNITO_TOKEN="dev-token"');
      console.error('');
      console.error('2. Get real token from UI:');
      console.error('   → Login at http://localhost:3000');
      console.error('   → Click "🔑 API Token"');
      console.error('   → Copy and export');
    } else if (error.message.includes('500')) {
      console.error('💡 Server Error - Backend crashed or misconfigured');
      console.error('');
      console.error('Check backend logs for:');
      console.error('- AWS credentials missing');
      console.error('- DynamoDB connection errors');
      console.error('- Bedrock API errors');
      console.error('- Missing environment variables');
    }
    
    console.error('');
    console.error('Full error details:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

// Run the test
runLongConversationTest();

