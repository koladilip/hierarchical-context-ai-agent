#!/bin/bash
# setup-env.sh - Auto-generate .env from CDK outputs

set -e

echo "🔧 Setting up environment configuration"
echo "======================================="
echo ""

if [ ! -d "infra/cdk.out" ]; then
    echo "❌ CDK not deployed yet. Run 'npm run deploy' first."
    exit 1
fi

echo "📋 Getting CDK outputs..."
cd infra

# Export AWS profile for CDK
export AWS_PROFILE=${AWS_PROFILE:-Skyfi-test-admin}
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile ${AWS_PROFILE} 2>/dev/null)
export CDK_DEFAULT_REGION=${AWS_REGION:-us-east-1}
export RESOURCE_PREFIX=${RESOURCE_PREFIX:-$CDK_DEFAULT_ACCOUNT}

# Get stack outputs from CloudFormation directly (more reliable)
STACK_NAME="LyzrAgentStack"
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

# Remove trailing slash from API endpoint
API_ENDPOINT=${API_ENDPOINT%/}

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

APP_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`OutputCloudFrontUrl`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

VECTOR_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`OutputVectorBucket`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`OutputFrontendBucket`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "")

cd ..

echo "✅ Got deployment values"
echo ""

# Get account ID for Cognito domain
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile ${AWS_PROFILE} 2>/dev/null)
COGNITO_DOMAIN="lyzr-agent-${ACCOUNT_ID}.auth.us-east-1.amazoncognito.com"

# Use resource prefix from environment or default to account ID
RESOURCE_PREFIX=${RESOURCE_PREFIX:-$ACCOUNT_ID}

# Preserve Google credentials if they exist
GOOGLE_ID=""
GOOGLE_SECRET=""
if [ -f .env ]; then
    GOOGLE_ID=$(grep GOOGLE_CLIENT_ID .env | cut -d'=' -f2 || echo "")
    GOOGLE_SECRET=$(grep GOOGLE_CLIENT_SECRET .env | cut -d'=' -f2 || echo "")
fi

# Create root .env
cat > .env <<EOF
# Lyzr Agent - Auto-generated from CDK outputs
# Generated: $(date)

# AWS Configuration
AWS_PROFILE=${AWS_PROFILE}
AWS_REGION=us-east-1

# Resource Prefix
RESOURCE_PREFIX=${RESOURCE_PREFIX}

# Vite Frontend Variables (VITE_ prefix for Vite)
VITE_API_ENDPOINT=${API_ENDPOINT}
VITE_USER_POOL_ID=${USER_POOL_ID}
VITE_APP_CLIENT_ID=${APP_CLIENT_ID}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
VITE_REGION=us-east-1
VITE_CLOUDFRONT_URL=${CLOUDFRONT_URL}

# S3 Buckets (from CDK outputs)
S3_FRONTEND_BUCKET=${FRONTEND_BUCKET}
S3_VECTOR_BUCKET=${VECTOR_BUCKET}

# Google OAuth
$([ -n "$GOOGLE_ID" ] && echo "GOOGLE_CLIENT_ID=$GOOGLE_ID" || echo "# GOOGLE_CLIENT_ID=")
$([ -n "$GOOGLE_SECRET" ] && echo "GOOGLE_CLIENT_SECRET=$GOOGLE_SECRET" || echo "# GOOGLE_CLIENT_SECRET=")
EOF

echo "✅ Created .env at project root"

# Create frontend .env.local (symlink or copy)
cp .env frontend/.env.local

echo "✅ Created frontend/.env.local"
echo ""

# Display configuration
echo "=================================="
echo "Configuration Summary"
echo "=================================="
echo ""
echo "API Endpoint:    ${API_ENDPOINT}"
echo "User Pool ID:    ${USER_POOL_ID}"
echo "App Client ID:   ${APP_CLIENT_ID}"
echo "CloudFront URL:  ${CLOUDFRONT_URL}"
echo ""
echo "✅ Environment configured!"
echo ""
echo "Next steps:"
echo "1. cd frontend"
echo "2. npm install"
echo "3. npm run build"
echo "4. ./deploy-frontend.sh"
echo ""

