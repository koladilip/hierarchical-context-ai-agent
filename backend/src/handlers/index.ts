// backend/src/handlers/index.ts
/**
 * AWS Lambda handler for Lyzr Agent API
 * Entry point for all API requests
 */
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { expressApp } from '../api/app';
import { cleanupEmptySessions } from '../utils/cleanup';

// Convert Express app to Lambda handler
const lambdaHandler = serverless(expressApp);

// Run cleanup on cold start (not on every request)
let cleanupDone = false;

const runColdStartCleanup = async () => {
  if (!cleanupDone) {
    console.log('🚀 Lambda cold start - running cleanup...');
    await cleanupEmptySessions();
    cleanupDone = true;
  }
};

// Export Lambda handler with cleanup
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  try {
    // Run cleanup on first request after cold start (non-blocking)
    runColdStartCleanup().catch(err => console.error('Cleanup error:', err));
    
    // Route the request through our Express app
    const response = await lambdaHandler(event, context);
    return response;
  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

