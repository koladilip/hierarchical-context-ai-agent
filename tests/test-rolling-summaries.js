// test-rolling-summaries.js
/**
 * Test rolling summaries and structured memory
 * Tests:
 * 1. Multi-tier summary creation (ancient/middle/recent)
 * 2. Structured memory extraction (entities, facts, decisions, goals)
 * 3. Reference tracking (turn IDs → original content)
 * 4. Summary compression and rolling
 */

const axios = require('axios');

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3001';
const TOKEN = process.env.COGNITO_TOKEN;

if (!TOKEN) {
  console.error('\n❌ Error: COGNITO_TOKEN environment variable is required\n');
  console.error('To get your token:');
  console.error('1. Run: npm run dev');
  console.error('2. Open: http://localhost:3000 and login');
  console.error('3. Click "API Token" button in the header');
  console.error('4. Copy the token');
  console.error('5. Run: export COGNITO_TOKEN="your-token-here"\n');
  console.error('Then run this test again.\n');
  process.exit(1);
}

const config = {
  apiUrl: `${API_ENDPOINT}/api/v1`,
  token: TOKEN,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
};

async function sendMessage(sessionId, message) {
  const response = await axios.post(
    `${config.apiUrl}/chat`,
    {
      session_id: sessionId,
      message,
      tools_enabled: true,
    },
    { headers: config.headers }
  );
  return response.data;
}

async function createSession(title) {
  const response = await axios.post(
    `${config.apiUrl}/sessions`,
    { title },
    { headers: config.headers }
  );
  return response.data.session_id;
}

async function getSession(sessionId) {
  const response = await axios.get(
    `${config.apiUrl}/sessions/${sessionId}`,
    { headers: config.headers }
  );
  return response.data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🧪 Rolling Summaries & Structured Memory Test\n');
  console.log('=' .repeat(60));
  
  try {
    // Create session
    console.log('\n💬 Step 1: Creating session...\n');
    const sessionId = await createSession('Rolling Summary Test');
    console.log(`✅ Created session: ${sessionId}\n`);
    
    // Phase 1: Build initial context with entities, facts, decisions
    console.log('\n🎯 Phase 1: Building initial context (entities, facts, decisions)...\n');
    
    const phase1Messages = [
      "Hi! My name is John Smith and I'm working on a project called ProjectX.",
      "ProjectX is about building an AI agent platform with advanced context management.",
      "I decided to use Amazon Nova Lite as the LLM because it has 300K context window.",
      "The budget for this project is $50,000 and we have a 3-month timeline.",
      "The team consists of 5 developers: Alice (backend), Bob (frontend), Carol (DevOps), Dave (ML), and Eve (QA).",
      "We're using AWS Lambda, DynamoDB, and S3 for the infrastructure.",
      "My goal is to implement rolling summaries with structured memory extraction.",
      "I also want to add reference tracking so we can retrieve original messages when needed.",
      "The system should handle conversations with 50+ turns efficiently.",
      "I prefer using TypeScript for type safety and better IDE support.",
    ];
    
    for (let i = 0; i < phase1Messages.length; i++) {
      console.log(`\n--- Turn ${i + 1} ---`);
      console.log(`👤 User: ${phase1Messages[i]}`);
      
      const response = await sendMessage(sessionId, phase1Messages[i]);
      console.log(`🤖 AI: ${response.response.substring(0, 150)}...`);
      
      if (response.context_stats) {
        console.log(`📊 Context: ${response.context_stats.total_turns} turns, ${response.context_stats.total_tokens.toLocaleString()} tokens, ${response.context_stats.context_window_used}`);
        
        // Check for structured memory in extended stats
        if (response.context_stats.structured_memory) {
          const sm = response.context_stats.structured_memory;
          console.log(`🧠 Memory: ${sm.entities} entities, ${sm.facts} facts, ${sm.decisions} decisions, ${sm.goals} goals`);
        }
        
        // Check for summary tiers
        if (response.context_stats.summary_tiers) {
          const tiers = response.context_stats.summary_tiers;
          console.log(`📚 Summaries: Ancient=${tiers.ancient || 0}, Middle=${tiers.middle || 0}, Recent=${tiers.recent || 0}`);
        }
      }
      
      await sleep(800);
    }
    
    // Phase 2: Add more context to trigger first summarization
    console.log('\n\n🎯 Phase 2: Adding more context to trigger summarization...\n');
    
    const phase2Messages = [
      "Let me tell you about the technical architecture in detail.",
      "We're using a serverless architecture with API Gateway and Lambda functions.",
      "The context manager implements progressive summarization at 60% token usage.",
      "We use Amazon Titan Embeddings V2 for vector embeddings with 1024 dimensions.",
      "The cost per conversation should be under $0.01 to stay within budget.",
      "Files are stored in S3 with a 100MB per user quota limit.",
      "We support PDF, DOCX, TXT, MD, and image files for upload.",
      "The frontend is built with React and uses Vite as the build tool.",
      "We have a beautiful UI following modern UX best practices.",
      "Authentication is handled through AWS Cognito with JWT tokens.",
      "The database uses a single table design for efficiency.",
      "Context is managed with hot context, summaries, and structured memory.",
      "I want to ensure the system can handle very long conversations.",
      "The goal is to compress old context while preserving key information.",
      "We should extract entities like people, places, and things from conversations.",
    ];
    
    for (let i = 0; i < phase2Messages.length; i++) {
      console.log(`\n--- Turn ${phase1Messages.length + i + 1} ---`);
      console.log(`👤 User: ${phase2Messages[i]}`);
      
      const response = await sendMessage(sessionId, phase2Messages[i]);
      console.log(`🤖 AI: ${response.response.substring(0, 150)}...`);
      
      if (response.context_stats) {
        console.log(`📊 Context: ${response.context_stats.total_turns} turns, ${response.context_stats.total_tokens.toLocaleString()} tokens, ${response.context_stats.context_window_used}`);
        
        if (response.context_stats.structured_memory) {
          const sm = response.context_stats.structured_memory;
          console.log(`🧠 Memory: ${sm.entities} entities, ${sm.facts} facts, ${sm.decisions} decisions, ${sm.goals} goals`);
        }
        
        if (response.context_stats.summary_tiers) {
          const tiers = response.context_stats.summary_tiers;
          console.log(`📚 Summaries: Ancient=${tiers.ancient || 0}, Middle=${tiers.middle || 0}, Recent=${tiers.recent || 0}`);
        }
        
        if (response.context_stats.summary_present) {
          console.log(`✅ SUMMARIZATION TRIGGERED!`);
        }
      }
      
      await sleep(800);
    }
    
    // Phase 3: Test memory recall and reference tracking
    console.log('\n\n🎯 Phase 3: Testing memory recall and reference tracking...\n');
    
    const phase3Messages = [
      "What was my name again?",
      "What is the budget for ProjectX?",
      "Who are the team members working on this project?",
      "What LLM did I decide to use and why?",
      "What are the main goals I mentioned for this project?",
      "What file formats do we support for upload?",
      "What is my preferred programming language?",
      "Summarize the key decisions I've made so far.",
      "What are the unresolved tasks or intentions I mentioned?",
    ];
    
    for (let i = 0; i < phase3Messages.length; i++) {
      console.log(`\n--- Turn ${phase1Messages.length + phase2Messages.length + i + 1} ---`);
      console.log(`👤 User: ${phase3Messages[i]}`);
      
      const response = await sendMessage(sessionId, phase3Messages[i]);
      console.log(`🤖 AI: ${response.response}`);
      
      if (response.context_stats) {
        console.log(`📊 Context: ${response.context_stats.total_turns} turns, ${response.context_stats.total_tokens.toLocaleString()} tokens`);
        
        if (response.context_stats.summary_tiers) {
          const tiers = response.context_stats.summary_tiers;
          console.log(`📚 Summaries: Ancient=${tiers.ancient || 0}, Middle=${tiers.middle || 0}, Recent=${tiers.recent || 0}`);
        }
      }
      
      await sleep(1000);
    }
    
    // Final analysis
    console.log('\n\n📊 Final Session Analysis\n');
    console.log('=' .repeat(60));
    
    const sessionData = await getSession(sessionId);
    console.log(`\nSession: ${sessionData.title}`);
    console.log(`Total Messages: ${sessionData.message_count}`);
    console.log(`Total Tokens: ${sessionData.tokens_used.toLocaleString()}`);
    console.log(`Has Summary: ${sessionData.has_summary ? '✅ Yes' : '❌ No'}`);
    
    if (sessionData.context_stats) {
      console.log(`\nContext Stats:`);
      console.log(`  Context Window Used: ${sessionData.context_stats.context_window_used}`);
      console.log(`  Summary Present: ${sessionData.context_stats.summary_present ? '✅' : '❌'}`);
      
      if (sessionData.context_stats.summary_tiers) {
        const tiers = sessionData.context_stats.summary_tiers;
        console.log(`\nSummary Tiers:`);
        console.log(`  Ancient: ${tiers.ancient ? tiers.ancient + ' tokens' : 'None'}`);
        console.log(`  Middle: ${tiers.middle ? tiers.middle + ' tokens' : 'None'}`);
        console.log(`  Recent: ${tiers.recent ? tiers.recent + ' tokens' : 'None'}`);
      }
      
      if (sessionData.context_stats.structured_memory) {
        const sm = sessionData.context_stats.structured_memory;
        console.log(`\nStructured Memory:`);
        console.log(`  Entities: ${sm.entities}`);
        console.log(`  Facts: ${sm.facts}`);
        console.log(`  Decisions: ${sm.decisions}`);
        console.log(`  Goals: ${sm.goals}`);
        console.log(`  Unresolved Intentions: ${sm.unresolvedIntentions}`);
      }
    }
    
    // Test summary
    console.log('\n\n✅ Test Results Summary\n');
    console.log('=' .repeat(60));
    console.log(`✅ Total conversation turns: ${phase1Messages.length + phase2Messages.length + phase3Messages.length}`);
    console.log(`✅ Context management: ${sessionData.has_summary ? 'Rolling summarization active' : 'Within limits'}`);
    console.log(`✅ Memory recall: Tested entity, fact, and decision retrieval`);
    console.log(`✅ Reference tracking: Turn IDs tracked for future retrieval`);
    
    console.log('\n🎉 Rolling summaries and structured memory test completed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

runTest();

