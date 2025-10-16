# Changelog

## [Unreleased] - 2024-10-16

### Added
- Fixed AWS Bedrock validation error "First message must use the 'user' role"
  - Added validation in `bedrock.ts` for both Nova and Claude models
  - Ensures first non-system message always has user role

- **Duplicate Memory Detection** in `remember_preference` tool
  - Searches existing memories before storing new ones
  - Skips storage if >90% similar memory already exists
  - Prevents duplicate preferences from cluttering memory store
  - Logs similarity scores for debugging

- **Delete All Functionality** for memories and files
  - `DELETE /api/v1/memories` - Delete all user memories at once
  - `DELETE /api/v1/upload` - Delete all user files at once
  - Added `deleteAll()` method to S3VectorStore for bulk deletion
  - Added `deleteAllMemories()` to UserMemoryService
  - Added `deleteAllFiles()` to FileService
  - Deletes from S3, DynamoDB, and vector store
  - Returns count of deleted items
  - **UI**: Added "Delete All" buttons in Memory and Files screens
  - Double confirmation dialogs for safety
  - Red styling with hover effects
  - Only visible when items exist
  
### Changed
- **Test Organization**
  - Created `tests/` directory for all test files
  - Moved all `test-*.js` files to `tests/` directory
  - Added comprehensive `tests/README.md` with detailed documentation
  - Updated all npm scripts in root `package.json` to reference `tests/` directory
  - Enhanced `run-tests.sh` with 6 test options (was 3)
  - Updated main `README.md` with dedicated testing section
  - Added `benchmark-report-*.json` to `.gitignore`

### Test Suite Now Includes
1. **test-quick.js** (~30s) - Basic API smoke test
2. **test-tools.js** (~1m) - All 5 tool integrations
3. **test-long-conversation.js** (~5m) - 60+ turn context management
4. **test-large-context-files.js** (~3m) - File processing and RAG
5. **test-rolling-summaries.js** (~3m) - Multi-tier summary validation
6. **test-quality-benchmark.js** (~20m) - LLM-as-a-judge quality comparison

### Package.json Scripts Updated
```bash
npm run test              # Interactive test menu
npm run test:quick        # Quick smoke test
npm run test:tools        # Tool integration test
npm run test:long         # Long conversation test
npm run test:files        # File processing test
npm run test:summaries    # Rolling summaries test
npm run test:benchmark    # Quality benchmark
npm run test:all          # All tests except benchmark
```

### Files Changed
- `backend/src/services/bedrock.ts` - Added first message validation
- `package.json` - Updated test scripts paths
- `run-tests.sh` - Enhanced with more test options
- `README.md` - Added testing section
- `.gitignore` - Added benchmark report files
- Created `tests/README.md` - Comprehensive test documentation
- Created `CHANGELOG.md` - This file

### Migration Notes
- All test files moved from root to `tests/` directory
- Old test commands still work (paths updated in package.json)
- `.benchmark-state.json` remains in root for easy access
- No breaking changes to existing functionality

