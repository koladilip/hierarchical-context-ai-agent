#!/usr/bin/env node
// cdk/bin/app.ts
/**
 * AWS CDK App for Large Context Agent
 * Deploy entire infrastructure with: cdk deploy
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentStack } from '../lib/agent-stack';

const app = new cdk.App();

// Get AWS account ID for resource naming
const accountId = process.env.CDK_DEFAULT_ACCOUNT || 'default';

// Configuration from environment
const config = {
  frontendDomain: process.env.FRONTEND_DOMAIN || 'http://localhost:3000',
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  resourcePrefix: process.env.RESOURCE_PREFIX || accountId,
};

// Debug: Log if Google credentials are configured
console.log('🔍 CDK Environment Check:');
console.log('   RESOURCE_PREFIX:', config.resourcePrefix);
console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `SET (${process.env.GOOGLE_CLIENT_ID.length} chars)` : 'NOT SET');
console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? `SET (${process.env.GOOGLE_CLIENT_SECRET.length} chars)` : 'NOT SET');
console.log('   CDK_DEFAULT_ACCOUNT:', process.env.CDK_DEFAULT_ACCOUNT);
console.log('   CDK_DEFAULT_REGION:', process.env.CDK_DEFAULT_REGION);

if (config.googleClientId && config.googleClientSecret) {
  console.log('✅ Google OAuth credentials detected');
} else {
  console.log('⚠️  Google OAuth credentials NOT found (will only support email/password)');
}

// Create stack
new AgentStack(app, 'AgentStack', {
  config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
  },
  description: 'Full-stack serverless AI agent with large context handling',
});

app.synth();

