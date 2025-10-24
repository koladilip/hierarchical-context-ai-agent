# Infrastructure

**AWS CDK Infrastructure for the Agent**

Complete AWS stack definition using Infrastructure as Code (IaC) with AWS CDK and TypeScript.

---

## 🏗️ AWS Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Users (Web Browser)                                        │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  CloudFront Distribution                                    │
│  - HTTPS only                                               │
│  - Global CDN                                               │
│  - SPA routing (404 → index.html)                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  S3 Bucket (Frontend)                                       │
│  - Static website hosting                                   │
│  - React build artifacts                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Users (Web Browser / API Clients)                          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS + JWT
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  API Gateway (HTTP API)                                     │
│  - JWT Authorizer (Cognito)                                │
│  - CORS configuration                                       │
│  - Catch-all routing                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Lambda Function (Node.js 22)                               │
│  - Express.js API                                           │
│  - 2048 MB memory                                           │
│  - 60 second timeout                                        │
│  - Environment variables (tables, buckets, Cognito)        │
└───┬─────────────┬───────────────┬─────────────────────────┘
    │             │               │
    │             │               │
    ↓             ↓               ↓
┌───────────┐ ┌───────────┐ ┌─────────────────────────────┐
│ DynamoDB  │ │ S3 Bucket │ │ AWS Bedrock                 │
│           │ │           │ │                             │
│ Sessions  │ │ Files     │ │ - Nova Lite (LLM)           │
│ Table     │ │ Vectors   │ │ - Titan V2 (Embeddings)     │
│           │ │           │ │ - us-east-1 region          │
│ Files     │ │           │ └─────────────────────────────┘
│ Table     │ │           │
└───────────┘ └───────────┘

┌─────────────────────────────────────────────────────────────┐
│  Cognito User Pool                                          │
│  - Email/password authentication                            │
│  - Google OAuth provider                                    │
│  - JWT token issuance                                       │
│  - Hosted UI                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 AWS Resources

### 1. Lambda Function

**Resource**: `ApiFunction`  
**Runtime**: Node.js 22.x  
**Handler**: `handlers/index.handler`  
**Memory**: 2048 MB  
**Timeout**: 60 seconds  

**Configuration**:
```typescript
new nodejs.NodejsFunction(this, 'ApiFunction', {
  functionName: 'agent-agent-api',
  runtime: lambda.Runtime.NODEJS_22_X,
  entry: '../backend/src/handlers/index.ts',
  handler: 'handler',
  timeout: cdk.Duration.seconds(60),
  memorySize: 2048,
  bundling: {
    minify: true,
    sourceMap: true,
    target: 'es2020',
    externalModules: ['@aws-sdk/*']
  }
});
```

**IAM Permissions**:
- ✅ CloudWatch Logs (write)
- ✅ DynamoDB (read/write on `agent-sessions` and `agent-files`)
- ✅ S3 (read/write on `agent-vectors`)
- ✅ Bedrock (invoke model, invoke with stream)

**Environment Variables**:
```typescript
environment: {
  S3_VECTOR_BUCKET: vectorBucket.bucketName,
  SESSIONS_TABLE: sessionsTable.tableName,
  FILES_TABLE: filesTable.tableName,
  COGNITO_USER_POOL_ID: userPool.userPoolId,
  COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
  BEDROCK_LLM_MODEL: 'amazon.nova-lite-v1:0',
  BEDROCK_EMBED_MODEL: 'amazon.titan-embed-text-v2:0',
  BEDROCK_REGION: 'us-east-1'
}
```

### 2. API Gateway (HTTP API)

**Resource**: `HttpApi`  
**Type**: HTTP API (not REST API)  
**Authorization**: JWT (Cognito User Pool)

**Routes**:
```typescript
// Health check (no auth)
GET /api/v1/health

// All other routes (JWT required)
GET /api/v1/sessions
POST /api/v1/sessions
GET /api/v1/sessions/:id
DELETE /api/v1/sessions/:id
POST /api/v1/chat
POST /api/v1/upload
GET /api/v1/knowledge/search
GET /api/v1/memories
POST /api/v1/memories
DELETE /api/v1/memories/:id
```

**CORS Configuration**:
```typescript
corsPreflight: {
  allowOrigins: [
    'http://localhost:3000',
    'https://{cloudfront-domain}',
    frontendBucket.bucketWebsiteUrl
  ],
  allowMethods: [
    CorsHttpMethod.GET,
    CorsHttpMethod.POST,
    CorsHttpMethod.PUT,
    CorsHttpMethod.DELETE,
    CorsHttpMethod.OPTIONS
  ],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Amz-Date',
    'X-Api-Key'
  ],
  maxAge: Duration.days(1),
  allowCredentials: true
}
```

**JWT Authorizer**:
```typescript
const authorizer = new HttpJwtAuthorizer(
  'CognitoAuthorizer',
  `https://cognito-idp.us-east-1.amazonaws.com/${userPoolId}`,
  {
    jwtAudience: [userPoolClientId]
  }
);
```

### 3. DynamoDB Tables

#### Sessions Table

**Resource**: `SessionsTable`  
**Table Name**: `agent-sessions`  
**Billing**: On-demand (auto-scales)  
**TTL**: Enabled (attribute: `ttl`)

**Schema**:
```typescript
{
  tableName: 'agent-sessions',
  partitionKey: {
    name: 'sessionId',
    type: AttributeType.STRING
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
  timeToLiveAttribute: 'ttl'
}
```

**Global Secondary Index**:
```typescript
{
  indexName: 'userSessionsIndex',
  partitionKey: {
    name: 'userId',
    type: AttributeType.STRING
  },
  sortKey: {
    name: 'createdAt',
    type: AttributeType.STRING
  }
}
```

**Purpose**: Store conversation sessions with full message history and rolling summaries.

#### Files Table

**Resource**: `FilesTable`  
**Table Name**: `agent-files`  
**Billing**: On-demand

**Schema**:
```typescript
{
  tableName: 'agent-files',
  partitionKey: {
    name: 'fileId',
    type: AttributeType.STRING
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY
}
```

**Global Secondary Index**:
```typescript
{
  indexName: 'userFilesIndex',
  partitionKey: {
    name: 'userId',
    type: AttributeType.STRING
  },
  sortKey: {
    name: 'uploadedAt',
    type: AttributeType.STRING
  }
}
```

**Purpose**: Store file metadata with user quota tracking.

### 4. S3 Buckets

#### Vector Storage Bucket

**Resource**: `VectorBucket`  
**Bucket Name**: `agent-vectors`  
**Versioning**: Enabled  
**Removal Policy**: DESTROY (deletes on stack deletion)

**CORS Configuration**:
```typescript
cors: [
  {
    allowedMethods: [
      HttpMethods.GET,
      HttpMethods.PUT,
      HttpMethods.POST,
      HttpMethods.DELETE
    ],
    allowedOrigins: ['*'],
    allowedHeaders: ['*']
  }
]
```

**Purpose**: Store uploaded files and vector embeddings (JSON format).

**Structure**:
```
s3://agent-vectors/
├── files/
│   └── {userId}/
│       └── {fileId}              # Original file
└── embeddings/
    └── {userId}/
        ├── files/
        │   └── {fileId}.json     # File embedding
        └── memories/
            └── {memoryId}.json   # Memory embedding
```

#### Frontend Bucket

**Resource**: `FrontendBucket`  
**Bucket Name**: `agent-app`  
**Website Hosting**: Enabled  
**Public Access**: Enabled (for CloudFront)

**Configuration**:
```typescript
{
  bucketName: 'agent-app',
  websiteIndexDocument: 'index.html',
  websiteErrorDocument: 'index.html',
  publicReadAccess: true,
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true
}
```

**Purpose**: Host React frontend static files.

### 5. CloudFront Distribution

**Resource**: `FrontendDistribution`  
**Origin**: S3 Frontend Bucket (OAC)  
**Protocol**: HTTPS only (redirect HTTP → HTTPS)

**Configuration**:
```typescript
{
  defaultBehavior: {
    origin: S3BucketOrigin.withOriginAccessControl(frontendBucket),
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
    compress: true
  },
  defaultRootObject: 'index.html',
  errorResponses: [
    {
      httpStatus: 403,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.minutes(5)
    },
    {
      httpStatus: 404,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.minutes(5)
    }
  ]
}
```

**Purpose**: 
- Global CDN for fast frontend delivery
- HTTPS termination
- SPA routing (all paths → index.html)

### 6. Cognito User Pool

**Resource**: `UserPool`  
**Name**: `agent-agent-users`

**Configuration**:
```typescript
{
  userPoolName: 'agent-agent-users',
  selfSignUpEnabled: true,
  signInAliases: {
    email: true
  },
  autoVerify: {
    email: true
  },
  standardAttributes: {
    email: {
      required: true,
      mutable: true
    }
  },
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: false
  }
}
```

**Domain**:
```typescript
userPool.addDomain('CognitoDomain', {
  cognitoDomain: {
    domainPrefix: `agent-agent-${accountId}`
  }
});
```

**Hosted UI URL**:
```
https://agent-agent-{accountId}.auth.us-east-1.amazoncognito.com
```

#### User Pool Client

**Resource**: `UserPoolClient`  
**Name**: `agent-agent-client`

**OAuth Configuration**:
```typescript
{
  oAuth: {
    flows: {
      authorizationCodeGrant: true,
      implicitCodeGrant: true
    },
    scopes: [
      OAuthScope.EMAIL,
      OAuthScope.OPENID,
      OAuthScope.PROFILE
    ],
    callbackUrls: [
      'http://localhost:3000',
      'https://{cloudfront-domain}'
    ],
    logoutUrls: [
      'http://localhost:3000',
      'https://{cloudfront-domain}'
    ]
  },
  supportedIdentityProviders: [
    UserPoolClientIdentityProvider.COGNITO,
    UserPoolClientIdentityProvider.GOOGLE
  ]
}
```

#### Google OAuth Provider

**Resource**: `GoogleProvider`  
**Required**: Google OAuth credentials

**Configuration**:
```typescript
new UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
  userPool: userPool,
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  scopes: ['profile', 'email', 'openid'],
  attributeMapping: {
    email: ProviderAttribute.GOOGLE_EMAIL,
    givenName: ProviderAttribute.GOOGLE_GIVEN_NAME,
    familyName: ProviderAttribute.GOOGLE_FAMILY_NAME
  }
});
```

**Setup Google OAuth**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `https://agent-agent-{accountId}.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
4. Export credentials:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   ```

---

## 📊 Cost Analysis

### Monthly Cost Breakdown

**Assumptions**:
- 1,000 conversations/month
- 20 messages per conversation
- 200 tokens per message (average)

| Service | Usage | Cost |
|---------|-------|------|
| **Lambda** | 20K invocations, 2s avg duration, 2GB memory | ~$5 |
| **API Gateway** | 20K requests | ~$0.02 |
| **DynamoDB** | 1K sessions, 20K read/write ops | ~$2 |
| **S3** | 10GB storage, 100K requests | ~$0.50 |
| **CloudFront** | 100GB data transfer | ~$8.50 |
| **Cognito** | 1,000 MAUs | Free (under 50K) |
| **Bedrock (Nova Lite)** | 4M input tokens, 1M output tokens | ~$0.50 |
| **Total** | | **~$16.50/month** |

**Per Conversation**: ~$0.017

### Cost Comparison

| Provider | Cost/Conversation | Notes |
|----------|-------------------|-------|
| **AWS (Nova Lite)** | $0.017 | Current implementation |
| GPT-4 (OpenAI) | $0.15 | 8.8x more expensive |
| Claude 3.5 Sonnet | $0.12 | 7x more expensive |
| GPT-3.5 Turbo | $0.02 | Similar, but 128K context only |

### Cost Optimization Tips

1. **Use On-Demand Billing**
   - DynamoDB: Pay only for what you use
   - Lambda: No idle costs
   - S3: Lifecycle policies for old files

2. **CloudFront Caching**
   - Reduce S3 requests
   - Faster global delivery
   - Set appropriate TTLs

3. **Lambda Memory Optimization**
   - 2GB is generous for most requests
   - Monitor actual usage
   - Reduce if consistently under 1GB

4. **Aggressive Summarization**
   - Reduce token usage by 36%
   - Lower Bedrock costs
   - Maintain quality with structured extraction

---

## 🚀 Deployment

### Prerequisites

```bash
# Install AWS CLI
brew install awscli

# Install AWS CDK CLI
npm install -g aws-cdk

# Configure AWS credentials
aws configure --profile default

# Verify credentials
aws sts get-caller-identity --profile default
```

### Initial Deployment

```bash
# From project root
cd infra

# Install dependencies
npm install

# Bootstrap CDK (one-time per account/region)
npx cdk bootstrap \
  --profile default \
  --region us-east-1

# Preview changes
npx cdk diff --profile default

# Deploy stack
npx cdk deploy --profile default

# Or use monorepo command
cd ..
npm run deploy
```

**Expected Output**:
```
✅  AgentStack

Outputs:
AgentStack.ApiEndpoint = https://xxxxx.execute-api.us-east-1.amazonaws.com
AgentStack.UserPoolId = us-east-1_xxxxx
AgentStack.UserPoolClientId = xxxxx
AgentStack.CloudFrontUrl = https://xxxxx.cloudfront.net
```

### Update Deployment

```bash
# Make changes to lib/agent-stack.ts

# Preview changes
npm run diff

# Deploy updates
npm run deploy
```

### Destroy Stack

```bash
# Delete all AWS resources
npm run destroy

# Or
npx cdk destroy --profile default
```

**⚠️ Warning**: This deletes all data (DynamoDB tables, S3 files, sessions).

---

## 🔧 Configuration

### Stack Configuration

**File**: `bin/app.ts`

```typescript
const app = new cdk.App();

new AgentStack(app, 'AgentStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1'
  },
  config: {
    frontendDomain: process.env.FRONTEND_DOMAIN,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET
  }
});
```

### Environment Variables

Create `.env` in `infra/` directory (optional):

```bash
# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-secret

# Custom domain (optional)
FRONTEND_DOMAIN=https://your-custom-domain.com

# AWS Account (auto-detected from profile)
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1
```

### Model Configuration

Change Bedrock models in `lib/agent-stack.ts`:

```typescript
environment: {
  BEDROCK_LLM_MODEL: 'amazon.nova-pro-v1:0',  // More powerful
  BEDROCK_EMBED_MODEL: 'amazon.titan-embed-text-v2:0'
}
```

**Available Models**:
- `amazon.nova-lite-v1:0` (default)
- `amazon.nova-pro-v1:0`
- `anthropic.claude-3-5-sonnet-20240620-v1:0`
- `anthropic.claude-3-haiku-20240307-v1:0`

---

## 🔍 Monitoring & Debugging

### CloudWatch Logs

**Lambda Logs**:
```bash
aws logs tail /aws/lambda/agent-agent-api --follow \
  --profile default
```

**Filtered Logs** (errors only):
```bash
aws logs tail /aws/lambda/agent-agent-api --follow \
  --filter-pattern "ERROR" \
  --profile default
```

### DynamoDB Inspection

**List Sessions**:
```bash
aws dynamodb scan \
  --table-name agent-sessions \
  --profile default \
  | jq '.Items[0]'
```

**Get Specific Session**:
```bash
aws dynamodb get-item \
  --table-name agent-sessions \
  --key '{"sessionId":{"S":"your-session-id"}}' \
  --profile default
```

### S3 Inspection

**List Buckets**:
```bash
aws s3 ls --profile default
```

**List Files**:
```bash
aws s3 ls s3://agent-vectors/ --recursive \
  --profile default
```

**Download File**:
```bash
aws s3 cp s3://agent-vectors/files/user123/file456 . \
  --profile default
```

### API Gateway Testing

**Health Check**:
```bash
curl https://your-api-gateway-url.amazonaws.com/api/v1/health
```

**Authenticated Request**:
```bash
TOKEN="your-jwt-token"

curl https://your-api-gateway-url.amazonaws.com/api/v1/sessions \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🛠️ Troubleshooting

### 1. CDK Bootstrap Error

**Error**: `Policy statement must contain principals`

**Solution**:
```bash
npx cdk bootstrap \
  --profile default \
  --region us-east-1 \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

### 2. Lambda Permissions Error

**Error**: `User is not authorized to perform: bedrock:InvokeModel`

**Solution**: Check IAM role has Bedrock permissions:
```typescript
lambdaRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: ['*']
  })
);
```

### 3. CORS Error

**Error**: `Access-Control-Allow-Origin header is missing`

**Solution**: Verify API Gateway CORS includes frontend origin:
```typescript
corsPreflight: {
  allowOrigins: [
    'http://localhost:3000',
    `https://${distribution.distributionDomainName}`
  ]
}
```

### 4. Cognito Redirect Error

**Error**: `Invalid redirect URI`

**Solution**: Add CloudFront URL to Cognito callback URLs:
```typescript
callbackUrls: [
  'http://localhost:3000',
  `https://${distribution.distributionDomainName}`
]
```

### 5. Stack Update Fails

**Error**: `Resource already exists`

**Solution**: Delete conflicting resource or change resource name:
```bash
# Check what exists
aws cloudformation describe-stacks \
  --stack-name AgentStack \
  --profile default

# Destroy and redeploy
npm run destroy
npm run deploy
```

---

## 🔐 Security Considerations

### IAM Best Practices

1. **Least Privilege**: Lambda only has permissions it needs
2. **No Hardcoded Secrets**: Use environment variables
3. **Encryption**: Enable at-rest encryption (S3, DynamoDB)

### API Security

1. **JWT Authorization**: All endpoints (except health) require valid token
2. **CORS**: Whitelist specific origins
3. **Rate Limiting**: Not yet implemented (add API Gateway throttling)

### Data Security

1. **DynamoDB**: Encryption at rest (default)
2. **S3**: Versioning enabled for vector bucket
3. **CloudWatch**: Logs retention (default: never expire)

**Recommended Additions**:
```typescript
// Add S3 bucket encryption
encryption: s3.BucketEncryption.S3_MANAGED,

// Add DynamoDB point-in-time recovery
pointInTimeRecovery: true,

// Add CloudWatch log retention
logRetention: logs.RetentionDays.ONE_MONTH
```

---

## 🎯 Production Checklist

Before going to production:

### Infrastructure
- [ ] Enable CloudWatch alarms (Lambda errors, API Gateway 5xx)
- [ ] Set up SNS topic for alerts
- [ ] Configure log retention (30-90 days)
- [ ] Enable DynamoDB point-in-time recovery
- [ ] Set up S3 lifecycle policies (delete old files)

### Security
- [ ] Review IAM policies (least privilege)
- [ ] Enable AWS WAF on API Gateway
- [ ] Configure rate limiting
- [ ] Set up VPC for Lambda (optional, for RDS)
- [ ] Enable CloudTrail logging

### Monitoring
- [ ] Create CloudWatch dashboard
- [ ] Set up cost alerts (Budgets)
- [ ] Enable X-Ray tracing
- [ ] Configure Lambda Insights

### Cost Optimization
- [ ] Review Lambda memory allocation
- [ ] Configure DynamoDB auto-scaling (if using provisioned)
- [ ] Set up S3 Intelligent-Tiering
- [ ] Enable CloudFront compression

---

## 📚 Further Reading

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [API Gateway Security](https://docs.aws.amazon.com/apigateway/latest/developerguide/security-best-practices.html)

---

**Infrastructure as Code**: AWS CDK + TypeScript  
**Region**: us-east-1  
**Account**: 123456789012

