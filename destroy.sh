#!/bin/bash
# destroy.sh - Clean up all AWS resources

set -e

# Get the absolute path to the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Load .env if it exists
if [ -f .env ]; then
    echo "📄 Loading .env file..."
    set +e
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
    set -e
fi

# Set AWS profile and region (from .env or default)
export AWS_PROFILE=${AWS_PROFILE:-Skyfi-test-admin}
export AWS_REGION=${AWS_REGION:-us-east-1}

# Get account ID and set resource prefix
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")
export CDK_DEFAULT_ACCOUNT=$ACCOUNT_ID
export CDK_DEFAULT_REGION=$AWS_REGION
export RESOURCE_PREFIX=${RESOURCE_PREFIX:-$ACCOUNT_ID}

echo "🗑️  Lyzr Agent - Destroy Infrastructure"
echo "======================================"
echo ""
echo "📌 AWS Profile: ${AWS_PROFILE}"
echo "📌 AWS Region: ${AWS_REGION}"
echo "📌 Resource Prefix: ${RESOURCE_PREFIX}"
echo ""
echo "⚠️  WARNING: This will delete ALL resources including:"
echo "  - Lambda functions"
echo "  - API Gateway"
echo "  - Cognito User Pool (and all users!)"
echo "  - S3 buckets (frontend and vectors)"
echo "  - CloudFront distribution"
echo "  - All stored data"
echo ""

read -p "Are you sure you want to proceed? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Destruction cancelled"
    exit 0
fi

echo ""
echo "🗑️  Destroying infrastructure..."
echo ""

cd infra

# CDK destroy
npx cdk destroy --force

cd ..

# Clean up build artifacts
echo "Cleaning up build artifacts..."
rm -rf backend/dist
rm -rf infra/cdk.out
rm -f .env.deployed

echo ""
echo "✅ Infrastructure destroyed successfully"
echo ""
echo "Note: CDK bootstrap stack (CDKToolkit) is preserved"
echo "To remove it: aws cloudformation delete-stack --stack-name CDKToolkit"
echo ""
