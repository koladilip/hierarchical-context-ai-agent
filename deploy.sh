#!/bin/bash
# deploy.sh - Monorepo deployment script

set -e

# Get the absolute path to the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Load .env if it exists (for Google OAuth credentials)
if [ -f .env ]; then
    echo "📄 Loading .env file from: $SCRIPT_DIR/.env"
    set +e  # Temporarily disable exit on error for env loading
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
    set -e  # Re-enable exit on error
    
    echo "✅ Environment loaded"
    echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:+SET} (${#GOOGLE_CLIENT_ID} chars)"
    echo "   GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:+SET} (${#GOOGLE_CLIENT_SECRET} chars)"
fi

# Set AWS profile and region (from .env or default)
export AWS_PROFILE=${AWS_PROFILE:-default}
export AWS_REGION=${AWS_REGION:-us-east-1}

echo "🚀 Agent - Monorepo Deployment"
echo "===================================="
echo ""
echo "📌 AWS Profile: ${AWS_PROFILE}"
echo "📌 AWS Region: ${AWS_REGION}"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install: https://aws.amazon.com/cli/"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "❌ Node.js 22+ required. Current: $(node -v)"
    exit 1
fi

echo "✅ All prerequisites met"
echo ""

# Check AWS credentials
echo "🔐 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ AWS Account: $ACCOUNT_ID"

# Export for CDK
export CDK_DEFAULT_ACCOUNT=$ACCOUNT_ID
export CDK_DEFAULT_REGION=$AWS_REGION

# Set resource prefix (from .env or default to account ID)
export RESOURCE_PREFIX=${RESOURCE_PREFIX:-$ACCOUNT_ID}
echo "✅ Resource Prefix: $RESOURCE_PREFIX"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."

if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
fi

if [ ! -d "infra/node_modules" ]; then
    echo "Installing infra dependencies..."
    cd infra && npm install && cd ..
fi

if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

echo "✅ Dependencies installed"
echo ""

# Bootstrap CDK (if needed)
echo "🌱 Checking CDK bootstrap..."

if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1 &> /dev/null; then
    echo "Bootstrapping CDK..."
    cd infra
    npx cdk bootstrap aws://${ACCOUNT_ID}/us-east-1
    cd ..
else
    echo "✅ CDK already bootstrapped"
fi

echo ""

# Build backend
echo "🔨 Building backend..."
cd backend
npm run build
cd ..
echo "✅ Backend built"
echo ""

# Deploy infrastructure
echo "☁️  Deploying infrastructure..."
echo "   CDK_DEFAULT_ACCOUNT: $CDK_DEFAULT_ACCOUNT"
echo "   CDK_DEFAULT_REGION: $CDK_DEFAULT_REGION"
echo "   AWS_PROFILE: $AWS_PROFILE"
echo "   RESOURCE_PREFIX: $RESOURCE_PREFIX"
echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "   GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:15}..."

# Export all variables before running CDK
export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
export CDK_DEFAULT_REGION="$AWS_REGION"
export RESOURCE_PREFIX
export GOOGLE_CLIENT_ID
export GOOGLE_CLIENT_SECRET

cd infra
npx cdk deploy --require-approval never
cd ..

echo ""
echo "=================================="
echo "✅ Deployment Complete!"
echo "=================================="
echo ""

# Get outputs
echo "📋 Deployment Information:"
cd infra
cdk outputs --output-format json > /tmp/cdk-outputs.json 2>/dev/null || true

if [ -f /tmp/cdk-outputs.json ]; then
    echo ""
    cat /tmp/cdk-outputs.json | python3 -m json.tool 2>/dev/null || cat /tmp/cdk-outputs.json
    echo ""
fi

cd ..

echo ""
echo "Next steps:"
echo "1. Test API: curl \$(cd infra && cdk outputs --output-format json | grep ApiEndpoint | cut -d'\"' -f4)/api/v1/health"
echo "2. Access Cognito: Check AWS Console → Cognito"
echo "3. Deploy frontend: cd frontend && npm run build && aws s3 sync build/ s3://BUCKET_NAME/"
echo ""
echo "To destroy: npm run destroy"
echo ""
