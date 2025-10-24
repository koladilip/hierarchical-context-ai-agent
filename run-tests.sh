#!/bin/bash
# run-tests.sh - Interactive test runner

set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Agent - API Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if COGNITO_TOKEN is set
if [ -z "$COGNITO_TOKEN" ]; then
    echo "❌ COGNITO_TOKEN environment variable not set"
    echo ""
    echo "📋 How to get your token:"
    echo "   1. Open the app in your browser"
    echo "   2. Login with your credentials"
    echo "   3. Click the '🔑 API Token' button in the header"
    echo "   4. Copy the token"
    echo "   5. Run: export COGNITO_TOKEN=\"your-token-here\""
    echo ""
    echo "Or add it to your .env file:"
    echo "   echo 'COGNITO_TOKEN=\"your-token\"' >> .env"
    echo "   source .env"
    echo ""
    exit 1
fi

echo "✅ COGNITO_TOKEN is set"
echo ""

# Load environment
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ Environment loaded from .env"
fi

API_URL=${REACT_APP_API_URL:-http://localhost:3001}
echo "📡 API URL: $API_URL"
echo ""

# Menu
echo "Select test to run:"
echo ""
echo "1) Quick Test (~30s)          - Smoke test for basic functionality"
echo "2) Tool Test (~1m)            - Test all 5 tools"
echo "3) Long Test (~5m)            - 60+ messages, context management"
echo "4) File Processing (~3m)      - Document upload and RAG"
echo "5) Rolling Summaries (~3m)    - Multi-tier summary system"
echo "6) Quality Benchmark (~20m)   - LLM-as-a-judge quality comparison"
echo "7) Core Tests (~7m)           - Quick + Tools + Long"
echo "8) All Tests (except bench)   - Run all tests except benchmark"
echo "9) Exit"
echo ""

read -p "Enter choice [1-9]: " choice

case $choice in
    1)
        echo ""
        echo "Running Quick Test..."
        npm run test:quick
        ;;
    2)
        echo ""
        echo "Running Tool Test..."
        npm run test:tools
        ;;
    3)
        echo ""
        echo "Running Long Conversation Test..."
        npm run test:long
        ;;
    4)
        echo ""
        echo "Running File Processing Test..."
        npm run test:files
        ;;
    5)
        echo ""
        echo "Running Rolling Summaries Test..."
        npm run test:summaries
        ;;
    6)
        echo ""
        echo "Running Quality Benchmark..."
        echo "⚠️  This test takes ~20 minutes"
        echo "💾 Progress auto-saved - can resume if interrupted"
        npm run test:benchmark
        ;;
    7)
        echo ""
        echo "Running Core Tests..."
        npm run test:quick && npm run test:tools && npm run test:long
        ;;
    8)
        echo ""
        echo "Running All Tests (except benchmark)..."
        npm run test:all
        ;;
    9)
        echo "Bye!"
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

