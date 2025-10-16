#!/bin/bash
# frontend/deploy-frontend.sh
# Deploy React frontend to S3 and invalidate CloudFront

set -e

# Get the absolute path to the root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load .env from root if it exists
if [ -f "$ROOT_DIR/.env" ]; then
    echo "📄 Loading .env file..."
    set +e
    export $(grep -v '^#' "$ROOT_DIR/.env" | grep -v '^$' | xargs)
    set -e
fi

echo "🎨 Deploying Frontend to S3"
echo "============================"
echo ""

# Configuration
AWS_PROFILE=${AWS_PROFILE:-Skyfi-test-admin}
AWS_REGION=${AWS_REGION:-us-east-1}

# Get account ID and set resource prefix
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile ${AWS_PROFILE} 2>/dev/null || echo "unknown")
RESOURCE_PREFIX=${RESOURCE_PREFIX:-$ACCOUNT_ID}
BUCKET_NAME="${RESOURCE_PREFIX}-lyzr-app"

echo "📌 AWS Profile: ${AWS_PROFILE}"
echo "📌 Resource Prefix: ${RESOURCE_PREFIX}"
echo "📌 Bucket Name: ${BUCKET_NAME}"
echo ""

# Build frontend
echo "📦 Building React app..."
npm run build

if [ ! -d "build" ]; then
    echo "❌ Build directory not found. Build failed?"
    exit 1
fi

echo "✅ Build complete"
echo ""

# Upload to S3
echo "☁️  Uploading to S3 bucket: ${BUCKET_NAME}..."
aws s3 sync build/ s3://${BUCKET_NAME}/ \
  --profile ${AWS_PROFILE} \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "*.json"

# HTML files without cache (for updates)
aws s3 sync build/ s3://${BUCKET_NAME}/ \
  --profile ${AWS_PROFILE} \
  --exclude "*" \
  --include "*.html" \
  --include "*.json" \
  --cache-control "public, max-age=0, must-revalidate"

echo "✅ Files uploaded to S3"
echo ""

# Get CloudFront distribution ID from CloudFormation
echo "🌐 Getting CloudFront distribution..."
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name LyzrAgentStack \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

if [ -n "$DIST_ID" ] && [ "$DIST_ID" != "None" ]; then
    echo "🔄 Invalidating CloudFront cache (distribution: ${DIST_ID})..."
    aws cloudfront create-invalidation \
      --distribution-id ${DIST_ID} \
      --paths "/" \
      --profile ${AWS_PROFILE} \
      --no-cli-pager
    
    echo "✅ CloudFront invalidation created"
else
    echo "⚠️  Could not find CloudFront distribution ID"
    echo "   You may need to wait a few minutes for cache to clear"
fi

echo ""
echo "=================================="
echo "✅ Frontend Deployment Complete!"
echo "=================================="
echo ""
echo "Access your app:"
echo "- CloudFront (HTTPS): https://${DIST_ID}.cloudfront.net"
echo "- S3 Direct: http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com"
echo ""
echo "Note: CloudFront may take 5-10 minutes to fully propagate"
echo ""

