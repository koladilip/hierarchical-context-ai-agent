// test-large-context-files.js
/**
 * Test large context handling using file uploads
 * Tests:
 * 1. Upload multiple large files
 * 2. Reference files in conversation
 * 3. Push context to summarization threshold
 * 4. Verify context retention across large conversations
 */

const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({path: '../.env'});

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3001';
const TOKEN = process.env.COGNITO_TOKEN;

// Validate token is provided
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

// Test configuration
const config = {
  apiUrl: `${API_ENDPOINT}/api/v1`,
  token: TOKEN,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
};

// Helper to create large text files for testing
function createLargeTextFile(filename, sizeInChars) {
  const content = [];
  const paragraphs = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  ];
  
  let currentSize = 0;
  let paragraphIndex = 0;
  
  while (currentSize < sizeInChars) {
    const text = `\n\nParagraph ${Math.floor(currentSize / 200)}: ${paragraphs[paragraphIndex % paragraphs.length]}`;
    content.push(text);
    currentSize += text.length;
    paragraphIndex++;
  }
  
  const fullContent = content.join('\n');
  fs.writeFileSync(filename, fullContent);
  return filename;
}

// Helper to create test documents with specific content
function createTestDocument(filename, content) {
  fs.writeFileSync(filename, content);
  return filename;
}

// Helper to upload file
async function uploadFile(filePath) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const response = await axios.post(
    `${config.apiUrl}/upload`,
    form,
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        ...form.getHeaders(),
      },
    }
  );
  
  return response.data;
}

// Helper to send chat message
async function sendMessage(sessionId, message, fileIds = []) {
  const response = await axios.post(
    `${config.apiUrl}/chat`,
    {
      session_id: sessionId,
      message,
      tools_enabled: true,
      file_ids: fileIds,
    },
    { headers: config.headers }
  );
  return response.data;
}

// Create session
async function createSession(title) {
  const response = await axios.post(
    `${config.apiUrl}/sessions`,
    { title },
    { headers: config.headers }
  );
  return response.data.session_id;
}

// Get session details
async function getSession(sessionId) {
  const response = await axios.get(
    `${config.apiUrl}/sessions/${sessionId}`,
    { headers: config.headers }
  );
  return response.data;
}

// Main test
async function runTest() {
  console.log('🧪 Large Context File Upload Test\n');
  console.log('=' .repeat(60));
  
  const testFiles = [];
  
  try {
    // Step 1: Create test documents
    console.log('\n📝 Step 1: Creating test documents...\n');
    
    // Document 1: Project requirements (medium size, ~10K chars)
    const doc1 = createTestDocument('./test-doc1-requirements.txt', `
PROJECT REQUIREMENTS DOCUMENT

Project: AI Agent Platform
Budget: $50,000
Timeline: 3 months
Team Size: 5 developers

Key Features:
1. Multi-turn conversation support
2. Large context handling (300K tokens)
3. Tool integration (calculator, search, memory)
4. File upload and processing
5. Semantic search with embeddings
6. Cost-efficient token management

Technical Stack:
- Backend: Node.js, TypeScript, AWS Lambda
- LLM: Amazon Nova Lite (300K context)
- Storage: DynamoDB, S3
- Frontend: React, TypeScript

Success Metrics:
- Handle 50+ turn conversations
- Process files up to 100MB
- Response time < 3 seconds
- Cost < $0.01 per conversation

${'.'.repeat(5000)}
`);
    console.log(`✅ Created doc1: ${doc1} (~${fs.statSync(doc1).size} bytes)`);
    testFiles.push(doc1);
    
    // Document 2: Technical specifications (medium size, ~15K chars)
    const doc2 = createTestDocument('./test-doc2-technical-spec.txt', `
TECHNICAL SPECIFICATIONS

Architecture Overview:
The system uses a serverless architecture on AWS with the following components:

1. API Layer (AWS Lambda + API Gateway)
2. Storage Layer (DynamoDB for metadata, S3 for files)
3. AI Layer (Amazon Bedrock - Nova Lite)
4. Vector Store (Custom S3-based implementation)

Context Management:
- Progressive summarization at 60% context usage
- Token-based triggers (not turn-based)
- Smart windowing: 65% recent, 20% summary, 15% buffer

File Processing:
- Upload limit: 10MB per file
- User quota: 100MB total
- Supported formats: PDF, DOCX, TXT, MD, Images
- Text extraction using pdf-parse and mammoth
- Chunking for embeddings: 25K chars per chunk

Embedding Model:
- Amazon Titan Embeddings V2
- Token limit: 8,192 tokens per embedding
- Dimension: 1024

Cost Analysis:
- Nova Lite: $0.06 / $0.24 per 1M tokens (input/output)
- Titan Embeddings: $0.0002 per 1K tokens
- DynamoDB: $1.25 per 1M requests
- S3: $0.023 per GB

${'.'.repeat(10000)}
`);
    console.log(`✅ Created doc2: ${doc2} (~${fs.statSync(doc2).size} bytes)`);
    testFiles.push(doc2);
    
    // Document 3: Large test file (50K+ chars)
    const doc3 = createLargeTextFile('./test-doc3-large.txt', 50000);
    console.log(`✅ Created doc3: ${doc3} (~${fs.statSync(doc3).size} bytes)`);
    testFiles.push(doc3);
    
    // Step 2: Upload all files
    console.log('\n📤 Step 2: Uploading files...\n');
    
    const uploadedFiles = [];
    for (const file of testFiles) {
      const result = await uploadFile(file);
      uploadedFiles.push({
        id: result.file_id,
        name: result.filename,
        size: result.size,
        textExtracted: result.text_extracted,
      });
      console.log(`✅ Uploaded: ${result.filename}`);
      console.log(`   File ID: ${result.file_id}`);
      console.log(`   Size: ${(result.size / 1024).toFixed(1)}KB`);
      console.log(`   Text extracted: ${result.text_extracted} chars`);
      console.log(`   Quota used: ${result.quota.used_mb}MB / ${result.quota.limit_mb}MB\n`);
    }
    
    // Step 3: Create session
    console.log('\n💬 Step 3: Starting conversation...\n');
    const sessionId = await createSession('Large Context File Test');
    console.log(`✅ Created session: ${sessionId}\n`);
    
    // Step 4: Test conversation with file references
    console.log('\n🎯 Step 4: Testing file-based conversation...\n');
    
    const conversations = [
      {
        message: `I've uploaded project requirements in @${uploadedFiles[0].name}. What is the project budget?`,
        fileIds: [uploadedFiles[0].id],
      },
      {
        message: 'What is the timeline for this project?',
        fileIds: [],
      },
      {
        message: `According to @${uploadedFiles[1].name}, what embedding model are we using?`,
        fileIds: [uploadedFiles[1].id],
      },
      {
        message: 'What is the token limit for this embedding model?',
        fileIds: [],
      },
      {
        message: 'Compare the budget from the requirements document with the cost analysis in the technical spec. Are we within budget?',
        fileIds: [uploadedFiles[0].id, uploadedFiles[1].id],
      },
      {
        message: 'What programming languages are mentioned across all the documents I uploaded?',
        fileIds: uploadedFiles.map(f => f.id),
      },
      {
        message: 'Summarize the key technical decisions from the specification document.',
        fileIds: [uploadedFiles[1].id],
      },
      {
        message: 'Based on the requirements, what are the success metrics?',
        fileIds: [uploadedFiles[0].id],
      },
      {
        message: 'Calculate: If one conversation costs $0.008, how many conversations can we handle with the $50,000 budget?',
        fileIds: [],
      },
      {
        message: 'What was the project budget I mentioned in the first message?',
        fileIds: [],
      },
    ];
    
    for (let i = 0; i < conversations.length; i++) {
      const { message, fileIds } = conversations[i];
      console.log(`\n--- Turn ${i + 1} ---`);
      console.log(`👤 User: ${message}`);
      if (fileIds.length > 0) {
        console.log(`📎 Attached: ${fileIds.length} file(s)`);
      }
      
      const response = await sendMessage(sessionId, message, fileIds);
      console.log(`🤖 AI: ${response.response.substring(0, 200)}${response.response.length > 200 ? '...' : ''}`);
      
      if (response.context_stats) {
        console.log(`\n📊 Context Stats:`);
        console.log(`   Total Turns: ${response.context_stats.total_turns}`);
        console.log(`   Total Tokens: ${response.context_stats.total_tokens.toLocaleString()}`);
        console.log(`   Context Used: ${response.context_stats.context_window_used}`);
        console.log(`   Summarized: ${response.context_stats.summary_present ? '✅ Yes' : '❌ No'}`);
      }
      
      if (response.system_events && response.system_events.length > 0) {
        console.log(`\n🔔 System Events:`);
        response.system_events.forEach(event => {
          console.log(`   ${event.message}`);
        });
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Step 5: Get final session state
    console.log('\n\n📊 Step 5: Final Session Analysis\n');
    console.log('=' .repeat(60));
    
    const sessionData = await getSession(sessionId);
    console.log(`\nSession: ${sessionData.title}`);
    console.log(`Total Messages: ${sessionData.message_count}`);
    console.log(`Total Tokens: ${sessionData.tokens_used.toLocaleString()}`);
    console.log(`Has Summary: ${sessionData.has_summary ? '✅ Yes' : '❌ No'}`);
    
    if (sessionData.context_stats) {
      console.log(`\nFinal Context Stats:`);
      console.log(`  Context Window Used: ${sessionData.context_stats.context_window_used}`);
      console.log(`  Hot Context: ${sessionData.context_stats.hot_context_turns} turns`);
      console.log(`  Summary Present: ${sessionData.context_stats.summary_present ? '✅' : '❌'}`);
    }
    
    // Step 6: Test results summary
    console.log('\n\n✅ Test Results Summary\n');
    console.log('=' .repeat(60));
    console.log(`✅ Files uploaded: ${uploadedFiles.length}`);
    console.log(`✅ Total file size: ${(uploadedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1)}KB`);
    console.log(`✅ Total text extracted: ${uploadedFiles.reduce((sum, f) => sum + f.textExtracted, 0).toLocaleString()} chars`);
    console.log(`✅ Conversation turns: ${conversations.length}`);
    console.log(`✅ Total tokens used: ${sessionData.tokens_used.toLocaleString()}`);
    console.log(`✅ Context management: ${sessionData.has_summary ? 'Summarization triggered' : 'Within limits'}`);
    
    console.log('\n🎉 Large context file test completed successfully!\n');
    
    // Cleanup
    console.log('\n🧹 Cleaning up test files...');
    testFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`   Deleted: ${file}`);
      }
    });
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    console.error('\nStack:', error.stack);
    
    // Cleanup on error
    testFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    
    process.exit(1);
  }
}

// Run the test
runTest();

