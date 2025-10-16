# Backend API

**Node.js 22 + TypeScript serverless API for the Lyzr Agent**

This backend provides a REST API for managing AI agent conversations with intelligent context management, tool calling, and file processing.

---

## 🏗️ Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│  Lambda Handler (serverless-http)                           │
│  └─ Express.js App                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ↓                       ↓
┌──────────────────┐    ┌──────────────────┐
│  API Routes      │    │  Middleware      │
│  - /chat         │    │  - Auth (JWT)    │
│  - /sessions     │    │  - CORS          │
│  - /files        │    │  - Error Handler │
│  - /memories     │    └──────────────────┘
│  - /knowledge    │
└────────┬─────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Services Layer                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Context      │  │ Bedrock      │  │ Database         │  │
│  │ Manager      │  │ Service      │  │ Service          │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ File         │  │ Vector       │  │ User Memory      │  │
│  │ Service      │  │ Store        │  │ Service          │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐                                           │
│  │ Quality      │                                           │
│  │ Monitor      │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Agent Orchestrator                                          │
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐│
│  │ Calculator  │ Time/Date   │ Text        │ Knowledge    ││
│  │ Tool        │ Tool        │ Analyzer    │ Search       ││
│  └─────────────┴─────────────┴─────────────┴──────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
backend/
├── src/
│   ├── handlers/
│   │   └── index.ts              # Lambda entry point
│   │
│   ├── api/
│   │   ├── app.ts                # Express app setup
│   │   ├── middleware/
│   │   │   └── auth.ts           # JWT authentication
│   │   └── routes/
│   │       ├── chat.ts           # Chat endpoint
│   │       ├── sessions.ts       # Session management
│   │       ├── upload.ts         # File upload
│   │       ├── knowledge.ts      # File search
│   │       ├── memories.ts       # User memories
│   │       └── health.ts         # Health check
│   │
│   ├── services/
│   │   ├── contextManager.ts    # Context management (core)
│   │   ├── bedrock.ts           # AWS Bedrock LLM
│   │   ├── database.ts          # DynamoDB operations
│   │   ├── fileService.ts       # File processing
│   │   ├── vectorStore.ts       # S3 vector storage
│   │   ├── userMemory.ts        # User preferences
│   │   └── qualityMonitor.ts    # Quality tracking
│   │
│   ├── agent/
│   │   ├── orchestrator.ts      # Tool calling logic
│   │   └── tools.ts             # Tool definitions
│   │
│   ├── utils/
│   │   └── cleanup.ts           # Resource cleanup
│   │
│   └── dev-server.ts            # Local development server
│
├── dist/                         # Compiled JavaScript
├── package.json
└── tsconfig.json
```

---

## 🔑 Core Services

### 1. Context Manager (`contextManager.ts`)

**Purpose**: Manages conversation context with intelligent compression and memory extraction.

**Key Features**:
- Multi-tier rolling summaries (Ancient → Middle → Recent)
- Structured memory extraction (entities, facts, decisions, goals)
- Turn reference tracking (retrieve original messages by ID)
- Token budget management (model-aware allocation)
- Quality metrics calculation

**Algorithm**:
```typescript
// When user sends message:
1. Add message to context
2. Check token usage
3. If > 60% capacity:
   a. Create summary of unsummarized turns (excluding last 5)
   b. Extract structured memory (entities, facts, decisions)
   c. Roll existing tiers (Recent → Middle, Middle+Ancient → Ancient)
   d. Persist to DynamoDB
4. Build LLM prompt:
   - System instructions
   - Ancient summary (if exists)
   - Middle summary (if exists)
   - Recent summary (if exists)
   - Structured memory context
   - Hot context (last 5-10 turns)
   - Current user message
5. Send to Bedrock
6. Track response and update context
```

**Token Budget**:
```typescript
{
  totalContext: 300000,      // Model's max context (Nova Lite)
  systemPrompt: 2000,        // System instructions + tools
  hotContext: 65%,           // Recent messages (full fidelity)
  summaries: 20%,            // Compressed history
  buffer: 15%                // Safety margin
}
```

**Data Structures**:
```typescript
interface SummaryTier {
  text: string;              // Natural language summary
  turnRangeStart: number;    // First turn in this tier
  turnRangeEnd: number;      // Last turn in this tier
  tokens: number;            // Token count
  createdAt: string;         // Timestamp
  structuredMemory?: StructuredMemory;
}

interface StructuredMemory {
  entities: {
    people: string[];
    places: string[];
    things: string[];
  };
  facts: string[];
  decisions: string[];
  goals: string[];
  unresolvedIntentions: string[];
}
```

### 2. Bedrock Service (`bedrock.ts`)

**Purpose**: Interface to AWS Bedrock for LLM inference and embeddings.

**Supported Models**:
- **LLM**: Amazon Nova Lite (300K context, $0.06/1M input tokens)
- **Embeddings**: Amazon Titan Text Embeddings V2 (8192 dims, $0.10/1M tokens)

**Key Methods**:
```typescript
// Generate chat completion
generateChatCompletion(messages, tools): Promise<Response>

// Generate embeddings
generateEmbedding(text): Promise<number[]>

// Tool calling support via Nova's native format
```

**Configuration**:
```bash
BEDROCK_LLM_MODEL=amazon.nova-lite-v1:0
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_REGION=us-east-1
```

### 3. Database Service (`database.ts`)

**Purpose**: DynamoDB operations for sessions and files.

**Tables**:

**Sessions Table** (`lyzr-sessions`):
```typescript
{
  sessionId: string;         // PK
  userId: string;            // GSI partition key
  createdAt: string;         // GSI sort key
  updatedAt: string;
  title: string;
  messages: Message[];
  
  // Rolling summaries
  ancientSummary?: SummaryTier;
  middleSummary?: SummaryTier;
  recentSummary?: SummaryTier;
  
  // Structured memory
  structuredMemory?: StructuredMemory;
  
  // Metadata
  totalTokens: number;
  turnCount: number;
  lastSummarizedTurnIndex: number;
}
```

**Files Table** (`lyzr-files`):
```typescript
{
  fileId: string;            // PK
  userId: string;            // GSI partition key
  uploadedAt: string;        // GSI sort key
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  textContent: string;       // Extracted text
  embeddingGenerated: boolean;
}
```

**Key Methods**:
```typescript
// Sessions
createSession(userId, title): Promise<Session>
getSession(sessionId): Promise<Session>
listUserSessions(userId): Promise<Session[]>
updateSession(sessionId, updates): Promise<void>
deleteSession(sessionId): Promise<void>

// Rolling summaries
updateRollingSummaries(sessionId, summaries): Promise<void>
updateStructuredMemory(sessionId, memory): Promise<void>

// Files
createFile(userId, metadata): Promise<File>
getUserFiles(userId): Promise<File[]>
deleteFile(fileId): Promise<void>
getUserTotalFileSize(userId): Promise<number>
```

### 4. File Service (`fileService.ts`)

**Purpose**: Process uploaded files and extract text content.

**Supported Formats**:
- PDF (via `pdf-parse`)
- DOCX (via `mammoth`)
- TXT (plain text)
- Images (metadata extraction, future OCR)

**Workflow**:
```typescript
1. Validate file size (<10MB per file)
2. Check user quota (100MB total)
3. Extract text content based on file type
4. Generate embedding of text content
5. Store file in S3 (lyzr-vectors bucket)
6. Store metadata in DynamoDB
7. Store embedding in S3 (JSON file)
```

**Key Methods**:
```typescript
processUpload(file, userId): Promise<FileMetadata>
extractText(buffer, mimeType): Promise<string>
deleteUserFile(fileId, userId): Promise<void>
```

### 5. Vector Store (`vectorStore.ts`)

**Purpose**: Semantic search over uploaded files and memories.

**Implementation**:
- Store embeddings as JSON in S3
- Cosine similarity for search
- No external vector DB (cost optimization)

**Structure**:
```typescript
// S3 bucket: lyzr-vectors
// Files:
//   embeddings/{userId}/files/{fileId}.json
//   embeddings/{userId}/memories/{memoryId}.json

interface VectorRecord {
  id: string;
  type: 'file' | 'memory';
  userId: string;
  embedding: number[];       // 8192 dims
  metadata: {
    fileName?: string;
    content: string;
    timestamp: string;
  };
}
```

**Search Algorithm**:
```typescript
1. Generate embedding for query
2. Load all user's vectors from S3
3. Calculate cosine similarity for each
4. Sort by similarity score
5. Return top K results (default: 5)
```

**Key Methods**:
```typescript
storeFileEmbedding(fileId, userId, text): Promise<void>
storeMemoryEmbedding(memoryId, userId, text): Promise<void>
searchFiles(userId, query, topK): Promise<SearchResult[]>
searchMemories(userId, query, topK): Promise<SearchResult[]>
```

### 6. User Memory Service (`userMemory.ts`)

**Purpose**: Store and retrieve user preferences and memories.

**Features**:
- Explicit memory storage (`!remember` command)
- AI auto-detection of preferences
- Semantic search over memories
- Memory persistence across sessions

**Data Structure**:
```typescript
interface Memory {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  source: 'explicit' | 'auto-detected';
  sessionId?: string;
}
```

**Key Methods**:
```typescript
storeMemory(userId, content, source): Promise<Memory>
getUserMemories(userId): Promise<Memory[]>
searchMemories(userId, query, topK): Promise<Memory[]>
deleteMemory(memoryId, userId): Promise<void>
```

### 7. Quality Monitor (`qualityMonitor.ts`)

**Purpose**: Track conversation quality and detect degradation.

**Metrics**:
- **Entity Drift**: Percentage of entities lost during summarization
- **Context Retention**: Percentage of facts recalled correctly
- **Fact Preservation**: Accuracy of specific fact recall
- **Self-Evaluation**: Model's self-assessment of memory

**Usage**:
```typescript
// Enable via environment variable
ENABLE_QUALITY_MONITORING=true

// Automatic tracking during summarization
const metrics = qualityMonitor.calculateMetrics(session);
// {
//   entityDrift: 0.067,      // 6.7%
//   contextRetention: 0.95,  // 95%
//   factPreservation: 0.94,  // 94%
//   overallScore: 0.89       // 89%
// }
```

**Thresholds**:
| Metric | Excellent | Good | Warning |
|--------|-----------|------|---------|
| Entity Drift | <10% | 10-20% | >30% |
| Context Retention | >90% | 80-90% | <70% |
| Overall Score | >85% | 75-85% | <65% |

---

## 🛠️ Agent Orchestrator

### Tool System

**Architecture**:
```typescript
// tools.ts defines available tools
export const tools = [
  {
    name: 'calculator',
    description: 'Perform mathematical calculations',
    inputSchema: { expression: 'string' }
  },
  // ... more tools
];

// orchestrator.ts handles tool execution
async function executeTools(toolCalls) {
  for (const call of toolCalls) {
    const result = await executeTool(call.name, call.input);
    toolResults.push({ name: call.name, result });
  }
  return toolResults;
}
```

**Available Tools**:

1. **Calculator**
   - Purpose: Math operations
   - Input: `{ expression: "15 * 37" }`
   - Output: `{ result: 555 }`

2. **Time/Date**
   - Purpose: Current time queries
   - Input: `{ timezone: "America/New_York" }`
   - Output: `{ time: "2025-10-16 14:30:00 EDT" }`

3. **Text Analyzer**
   - Purpose: Text statistics
   - Input: `{ text: "some long text..." }`
   - Output: `{ wordCount, charCount, sentences, ... }`

4. **Knowledge Search**
   - Purpose: Search uploaded files
   - Input: `{ query: "budget requirements", topK: 5 }`
   - Output: `{ results: [{ file, content, score }] }`

5. **Remember Preference**
   - Purpose: Store user preferences
   - Input: `{ preference: "I like mathematics" }`
   - Output: `{ stored: true, memoryId: "..." }`

---

## 🔌 API Endpoints

### Authentication

All endpoints (except `/health`) require JWT token in `Authorization` header:
```
Authorization: Bearer <cognito-jwt-token>
```

### Endpoints

#### `POST /api/v1/chat`

Send a message and get AI response.

**Request**:
```json
{
  "message": "What is 15 * 37?",
  "sessionId": "uuid-here"
}
```

**Response**:
```json
{
  "response": "15 × 37 = 555",
  "sessionId": "uuid-here",
  "context_stats": {
    "total_turns": 5,
    "total_tokens": 1234,
    "context_window_percent": 12,
    "summary_active": false,
    "summary_tiers": {
      "ancient": 0,
      "middle": 0,
      "recent": 0
    },
    "structured_memory": {
      "entities": 3,
      "facts": 2,
      "decisions": 1,
      "goals": 1
    }
  },
  "system_events": [
    {
      "type": "tool_use",
      "message": "Used calculator tool"
    }
  ]
}
```

#### `GET /api/v1/sessions`

List user's sessions.

**Response**:
```json
{
  "sessions": [
    {
      "sessionId": "uuid-1",
      "title": "Vacation Planning",
      "createdAt": "2025-10-16T10:00:00Z",
      "updatedAt": "2025-10-16T11:30:00Z",
      "messageCount": 18,
      "totalTokens": 12456
    }
  ]
}
```

#### `POST /api/v1/sessions`

Create new session.

**Request**:
```json
{
  "title": "New Chat"
}
```

#### `GET /api/v1/sessions/:sessionId`

Get session details with full history.

**Response**:
```json
{
  "sessionId": "uuid-1",
  "title": "Vacation Planning",
  "messages": [...],
  "rolling_summaries": {
    "ancient": { "text": "...", "turnRangeStart": 0, "turnRangeEnd": 20 },
    "middle": { "text": "...", "turnRangeStart": 21, "turnRangeEnd": 40 },
    "recent": { "text": "...", "turnRangeStart": 41, "turnRangeEnd": 55 }
  },
  "structured_memory": {
    "entities": { "people": [...], "places": [...] },
    "facts": [...],
    "decisions": [...],
    "goals": [...]
  }
}
```

#### `DELETE /api/v1/sessions/:sessionId`

Delete a session.

#### `POST /api/v1/upload`

Upload a file.

**Request**: `multipart/form-data` with `file` field

**Response**:
```json
{
  "success": true,
  "file": {
    "fileId": "uuid",
    "fileName": "document.pdf",
    "sizeBytes": 1234567,
    "textExtracted": true
  }
}
```

#### `GET /api/v1/knowledge/search`

Search uploaded files.

**Query Params**: `?query=budget&topK=5`

**Response**:
```json
{
  "results": [
    {
      "fileId": "uuid",
      "fileName": "requirements.pdf",
      "content": "Budget is $50,000...",
      "score": 0.89
    }
  ]
}
```

#### `GET /api/v1/memories`

List user memories.

#### `POST /api/v1/memories`

Create memory.

**Request**:
```json
{
  "content": "I prefer TypeScript over JavaScript"
}
```

#### `DELETE /api/v1/memories/:memoryId`

Delete memory.

#### `GET /api/v1/health`

Health check (no auth required).

---

## 🔧 Configuration

### Environment Variables

```bash
# AWS Resources (auto-set by CDK)
S3_VECTOR_BUCKET=lyzr-vectors
SESSIONS_TABLE=lyzr-sessions
FILES_TABLE=lyzr-files
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_APP_CLIENT_ID=xxxxx

# Bedrock Models
BEDROCK_LLM_MODEL=amazon.nova-lite-v1:0
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_REGION=us-east-1

# Quality Monitoring (optional)
ENABLE_QUALITY_MONITORING=true

# Development (local only)
PORT=3001
```

### Model Configuration

**Supported Models**:
| Model | Context | Cost (per 1M tokens) |
|-------|---------|----------------------|
| amazon.nova-lite-v1:0 | 300K | $0.06 / $0.24 |
| amazon.nova-pro-v1:0 | 300K | $0.80 / $3.20 |
| anthropic.claude-3-5-sonnet-20240620-v1:0 | 200K | $3.00 / $15.00 |

To switch models:
```bash
export BEDROCK_LLM_MODEL=amazon.nova-pro-v1:0
npm run deploy  # Redeploy with new config
```

---

## 🚀 Development

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start dev server (hot-reload)
npm run dev

# Server runs at http://localhost:3001
```

**Dev Server Features**:
- Hot-reload on file changes
- CORS enabled for `http://localhost:3000`
- Uses local DynamoDB/S3 from AWS (not mocked)
- JWT auth bypass with `dev-token`

### Testing Locally

```bash
# Start dev server
npm run dev

# In another terminal, test endpoints
curl http://localhost:3001/api/v1/health
# {"status":"ok","timestamp":"..."}

# With auth (use dev-token or real JWT)
curl http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer dev-token"
```

### Debugging

**Enable detailed logs**:
```typescript
// In dev-server.ts
console.log('Request:', req.method, req.path);
console.log('Body:', req.body);
```

**CloudWatch Logs** (production):
```bash
aws logs tail /aws/lambda/lyzr-agent-api --follow \
  --profile default
```

---

## 📦 Deployment

### Lambda Deployment

Handled by AWS CDK (see `infra/README.md`):

```bash
cd ../infra
npm run cdk deploy

# Builds backend automatically via esbuild
# Creates Lambda function with Node.js 22 runtime
# Sets environment variables
# Grants IAM permissions
```

**Bundle Configuration**:
```typescript
// In infra/lib/lyzr-stack.ts
bundling: {
  minify: true,           // Reduce bundle size
  sourceMap: true,        // Enable debugging
  target: 'es2020',       // Modern JS
  externalModules: [      // Use Lambda runtime
    '@aws-sdk/*'
  ]
}
```

**Lambda Configuration**:
- Runtime: Node.js 22.x
- Memory: 2048 MB
- Timeout: 60 seconds
- Ephemeral storage: 512 MB

---

## 🧪 Testing

### Unit Tests

```bash
npm run test
```

*Note: Unit tests not yet implemented. Focus on integration tests.*

### Integration Tests

See main repo's test files:
- `test-quick.js` - Smoke test
- `test-tools.js` - Tool execution
- `test-long-conversation.js` - Context management
- `test-rolling-summaries.js` - Summary validation

---

## 🎯 Key Design Decisions

### 1. Singleton Services

All services use singleton pattern to reuse connections:
```typescript
// database.ts
let databaseInstance: Database | null = null;

export function getDatabase(): Database {
  if (!databaseInstance) {
    databaseInstance = new Database();
  }
  return databaseInstance;
}
```

**Why**: Lambda containers are reused. Avoid reconnecting to DynamoDB on every request.

### 2. Async Persistence

Summaries and quality metrics are persisted asynchronously:
```typescript
// Don't wait for DB write
persistSummaries(sessionId, summaries).catch(err => 
  console.error('Failed to persist:', err)
);

// Return response immediately
return { response, context_stats };
```

**Why**: Reduce API latency. DB writes don't block user response.

### 3. Progressive Summarization

Triggered at 60% token usage, not 90%:
```typescript
const threshold = totalContext * 0.6;
if (currentTokens > threshold) {
  await performSummarization();
}
```

**Why**: Conservative approach maintains quality. Aggressive compression loses context.

### 4. S3 for Vectors

No external vector database (Pinecone, Weaviate):
```typescript
// Store as JSON in S3
await s3.putObject({
  Bucket: vectorBucket,
  Key: `embeddings/${userId}/files/${fileId}.json`,
  Body: JSON.stringify({ embedding, metadata })
});
```

**Why**: Cost optimization. 100 users × 10 files × $0.01/month = $10 vs $70/month for Pinecone.

---

## 📊 Performance Considerations

### Cold Start

**Typical**: 2-3 seconds  
**Optimizations**:
- Use esbuild (fast bundling)
- External AWS SDK (included in runtime)
- Singleton services (reuse connections)

**Further optimization**: Provisioned concurrency ($$$)

### Token Limits

Nova Lite: 300K context, but effective usage:
- System prompt: ~2K tokens
- Tools definition: ~1K tokens
- **Available for history**: ~297K tokens

Budget allocation:
- Recent messages (65%): ~193K tokens
- Summaries (20%): ~59K tokens
- Buffer (15%): ~45K tokens

### Memory Usage

**Lambda Memory**: 2048 MB

**Typical Usage**:
- Service initialization: ~200 MB
- Context loading: ~50-100 MB
- LLM response: ~100-200 MB
- **Peak**: ~500-600 MB

**Why 2GB**: Comfortable buffer for large file uploads.

---

## 🐛 Common Issues

### 1. Lambda Timeout

**Symptom**: 60-second timeout error

**Cause**: Long LLM response or large summarization

**Solution**:
- Increase timeout in CDK (max 15 minutes)
- Stream responses (not yet implemented)
- Optimize summarization prompts

### 2. Token Limit Exceeded

**Symptom**: Bedrock error "Input too long"

**Cause**: Too many hot turns or large summaries

**Solution**:
- Reduce hot turn count (5 → 3)
- Trigger summarization earlier (60% → 40%)
- Compress summaries more aggressively

### 3. DynamoDB Throttling

**Symptom**: `ProvisionedThroughputExceededException`

**Cause**: Too many concurrent requests

**Solution**:
- Using on-demand billing (auto-scales)
- If still throttled, check for scan operations
- Use query with indexes, not scan

---

## 📚 Further Reading

- [Context Management Implementation Details](../CONTEXT_IMPROVEMENTS.md)
- [Quality Measurement Guide](../QUALITY_MEASUREMENT.md)
- [API Gateway Setup](../infra/README.md)

---

## 🤝 Contributing

When modifying backend:

1. **TypeScript First**: Always maintain type safety
2. **Singleton Pattern**: Reuse service instances
3. **Async Persistence**: Don't block API responses
4. **Error Handling**: Log errors, return user-friendly messages
5. **Testing**: Add integration tests for new features

---

**Built with**: Node.js 22, TypeScript, Express, AWS SDK v3
**Runtime**: AWS Lambda (serverless)
**Database**: DynamoDB (NoSQL)
**LLM**: AWS Bedrock (Amazon Nova Lite)

