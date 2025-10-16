# Test Suite Documentation

Comprehensive testing suite for the Lyzr Agent platform. All tests require a valid `COGNITO_TOKEN` environment variable.

## Quick Start

```bash
# Get your token from the app UI
export COGNITO_TOKEN="your-token-here"

# Run interactive test menu
./run-tests.sh

# Or run specific tests
npm run test:quick
npm run test:tools
npm run test:long
npm run test:files
npm run test:benchmark
npm run test:summaries
```

---

## Test Files Overview

### 🚀 test-quick.js
**Purpose:** Quick smoke test for basic API functionality  
**Duration:** ~30 seconds  
**What it tests:**
- Health check endpoint
- Session creation
- Basic chat message
- Session listing
- Context stats validation

**When to use:**
- After deployments
- Quick sanity checks
- CI/CD pipelines
- Validating API is running

**Run:**
```bash
npm run test:quick
```

---

### 🔧 test-tools.js
**Purpose:** Validates all tool integrations work correctly  
**Duration:** ~1 minute  
**What it tests:**
- Calculator tool (arithmetic operations)
- get_current_time tool (timezone handling)
- remember_preference tool (memory storage)
- web_search tool (internet search)
- get_weather tool (weather API integration)

**When to use:**
- After tool updates
- Verifying external API integrations
- Testing tool calling reliability

**Run:**
```bash
npm run test:tools
```

---

### 💬 test-long-conversation.js
**Purpose:** Tests context management across extended conversations  
**Duration:** ~5 minutes  
**What it tests:**
- 60+ turn conversation handling
- Token tracking and limits
- Automatic summarization triggers
- Memory persistence across turns
- Context window management
- Structured memory extraction

**When to use:**
- Testing large context handling
- Validating summarization quality
- Checking memory consistency
- Performance testing under load

**Run:**
```bash
npm run test:long
```

---

### 📄 test-large-context-files.js
**Purpose:** Tests file upload and document processing  
**Duration:** ~3 minutes  
**What it tests:**
- File upload API
- Document chunking
- Vector embeddings
- Semantic search over documents
- Multi-file knowledge base
- RAG (Retrieval Augmented Generation)

**When to use:**
- Testing file processing pipeline
- Validating vector search
- Checking embedding quality
- Document QA accuracy

**Run:**
```bash
npm run test:files
```

---

### 🎯 test-quality-benchmark.js
**Purpose:** LLM-as-a-judge quality comparison benchmark  
**Duration:** ~15-20 minutes (80 turns + evaluations)  
**What it tests:**
- Baseline (full context) vs Summarized (rolling summaries)
- Consistency scoring (fact recall)
- Completeness scoring (information coverage)
- Accuracy scoring (calculation correctness)
- Relevance scoring (answer quality)
- Fact retention over long conversations

**Features:**
- Auto-resume from checkpoint (`.benchmark-state.json`)
- Random + fixed evaluation points
- Token compression tracking
- Detailed report generation
- Quality trend analysis

**When to use:**
- Validating summarization quality
- Before/after algorithm changes
- Quality regression testing
- Performance optimization validation

**Run:**
```bash
npm run test:benchmark
```

**Resume from checkpoint:**
```bash
# If interrupted, just run again - it auto-resumes
npm run test:benchmark
```

**Start fresh:**
```bash
rm .benchmark-state.json
npm run test:benchmark
```

---

### 📊 test-rolling-summaries.js
**Purpose:** Validates multi-tier rolling summary system  
**Duration:** ~3 minutes  
**What it tests:**
- Ancient/Middle/Recent summary tiers
- Structured memory extraction (entities, facts, decisions, goals)
- Summary compression and rolling
- Reference tracking (turn IDs → content)
- Database persistence of summaries

**When to use:**
- Testing summarization algorithm
- Validating structured memory
- Checking summary quality
- Database persistence testing

**Run:**
```bash
npm run test:summaries
```

---

## Test Output Files

### `.benchmark-state.json`
- Auto-saved checkpoint for quality benchmark
- Enables resume after interruption
- Contains session IDs, responses, judgements, token tracking
- **Delete to start fresh benchmark**

### `benchmark-report-*.json`
- Detailed quality benchmark results
- LLM-as-a-judge scores and reasoning
- Token compression analysis
- Quality trend over conversation
- **Last 5 reports kept automatically**

---

## Environment Variables

All tests require:
```bash
COGNITO_TOKEN="your-token-here"
```

Optional:
```bash
REACT_APP_API_URL="http://localhost:3001"  # Default API endpoint
API_ENDPOINT="http://localhost:3001"       # Alternative var name
```

### Getting Your Token

1. Run the app: `npm run dev`
2. Open `http://localhost:3000` and login
3. Click "🔑 API Token" button in header
4. Copy the token
5. `export COGNITO_TOKEN="your-token"`

Or add to `.env`:
```bash
echo 'COGNITO_TOKEN="your-token"' >> .env
source .env
```

---

## Test Development Guidelines

### Creating New Tests

1. **Naming:** Use `test-<feature>.js` format
2. **Header comment:** Include purpose, duration, what it tests
3. **Error handling:** Graceful failures with clear messages
4. **Token check:** Validate `COGNITO_TOKEN` at start
5. **Output:** Use emoji and clear formatting for readability

### Test Template

```javascript
#!/usr/bin/env node
// test-<feature>.js
/**
 * <Feature> test - <Purpose>
 * 
 * Tests:
 * - Item 1
 * - Item 2
 * 
 * Duration: ~X minutes
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const COGNITO_TOKEN = process.env.COGNITO_TOKEN;

if (!COGNITO_TOKEN) {
  console.error('❌ Error: COGNITO_TOKEN environment variable required');
  process.exit(1);
}

// Test implementation...
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Test Suite
  env:
    COGNITO_TOKEN: ${{ secrets.COGNITO_TOKEN }}
    REACT_APP_API_URL: ${{ secrets.API_URL }}
  run: |
    npm run test:quick
    npm run test:tools
```

### Pre-deployment Checklist

```bash
# Quick validation
npm run test:quick

# Full validation
npm run test:tools
npm run test:long
npm run test:files

# Quality benchmark (optional, time-intensive)
npm run test:benchmark
```

---

## Troubleshooting

### "Connection error" / "ECONNREFUSED"
- Backend not running
- Solution: `npm run dev:backend` in another terminal

### "401 Unauthorized"
- Invalid or expired token
- Solution: Get fresh token from UI

### "ValidationException: First message must use the 'user' role"
- Fixed in backend `bedrock.ts`
- Solution: Update backend code and rebuild

### Benchmark stuck/hanging
- Check `.benchmark-state.json` for current turn
- Backend might be processing - check logs
- Can safely Ctrl+C and resume later

---

## Performance Benchmarks

Typical results on AWS infrastructure:

| Test | Duration | API Calls | Tokens Used |
|------|----------|-----------|-------------|
| Quick | 30s | 3-5 | ~500 |
| Tools | 1m | 5-10 | ~2,000 |
| Long | 5m | 60+ | ~50,000 |
| Files | 3m | 10-15 | ~10,000 |
| Benchmark | 20m | 160+ | ~200,000 |
| Summaries | 3m | 30+ | ~15,000 |

---

## Contributing

When adding tests:
1. Update this README with test description
2. Add npm script to root `package.json`
3. Update `run-tests.sh` if interactive test
4. Include example output in test file comments
5. Test on both local and deployed environments

---

## Questions?

See main [README.md](../README.md) for full project documentation.

