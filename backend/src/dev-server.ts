// backend/src/dev-server.ts
/**
 * Local development server - runs Express directly (no Lambda wrapper)
 * Hot-reload enabled with ts-node-dev
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.log('⚠️  No .env file found at:', envPath);
  console.log('   Creating default .env for local development...');
  console.log('');
}

import { expressApp } from './api/app';

const PORT = process.env.PORT || 3001;

// Set development mode
process.env.NODE_ENV = 'development';

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ Uncaught Exception - Server Crashed!');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('');
  console.error('💡 Common causes:');
  console.error('   - Missing AWS credentials');
  console.error('   - Missing environment variables in .env');
  console.error('   - DynamoDB table not found');
  console.error('   - Bedrock API access denied');
  console.error('');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ Unhandled Promise Rejection');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('');
  console.error('Reason:', reason);
  console.error('');
});

// Start server
expressApp.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Lyzr Agent Backend - Development Server`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 API Server: http://localhost:${PORT}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/v1/health`);
  console.log(`🌐 Frontend: http://localhost:3000`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Environment:');
  console.log(`   AWS Region: ${process.env.AWS_REGION || process.env.BEDROCK_REGION || '❌ NOT SET'}`);
  console.log(`   LLM Model: ${process.env.BEDROCK_LLM_MODEL || '❌ NOT SET'}`);
  console.log(`   Sessions Table: ${process.env.SESSIONS_TABLE || '❌ NOT SET'}`);
  console.log(`   Vector Bucket: ${process.env.S3_VECTOR_BUCKET || '❌ NOT SET'}`);
  console.log(`   Cognito Pool: ${process.env.COGNITO_USER_POOL_ID || '❌ NOT SET'}`);
  console.log('');
  
  // Warn if critical env vars are missing
  const criticalVars = ['AWS_REGION', 'SESSIONS_TABLE', 'BEDROCK_LLM_MODEL', 'COGNITO_USER_POOL_ID'];
  const missing = criticalVars.filter(v => !process.env[v] && !process.env.BEDROCK_REGION);
  
  if (missing.length > 0) {
    console.log('⚠️  Warning: Missing environment variables:');
    missing.forEach(v => console.log(`   - ${v}`));
    console.log('');
    console.log('💡 Run: npm run setup:env (to generate from CDK)');
    console.log('   Or manually create .env file in project root');
    console.log('');
  }
  
  console.log('🔄 Hot-reload enabled - code changes will auto-restart');
  console.log('');
});

