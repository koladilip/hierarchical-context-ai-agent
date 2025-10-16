// backend/src/utils/cleanup.ts
/**
 * Cleanup utilities for maintaining database hygiene
 */
import { 
  DynamoDBClient, 
  ScanCommand, 
  DeleteItemCommand 
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Delete empty sessions (no messages)
 * Runs on Lambda cold start to keep DB clean
 */
export async function cleanupEmptySessions(): Promise<void> {
  const tableName = process.env.SESSIONS_TABLE;
  
  if (!tableName) {
    console.warn('⚠️  SESSIONS_TABLE not configured, skipping cleanup');
    return;
  }

  try {
    console.log('🧹 Cleaning up empty sessions...');
    
    // Scan for sessions with messageCount = 0
    const scanResult = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'messageCount = :zero',
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
      },
      ProjectionExpression: 'sessionId',
    }));

    const emptySessions = scanResult.Items || [];
    
    if (emptySessions.length === 0) {
      console.log('✅ No empty sessions to clean up');
      return;
    }

    console.log(`🗑️  Found ${emptySessions.length} empty sessions, deleting...`);

    // Delete empty sessions
    const deletePromises = emptySessions.map((session: any) =>
      client.send(new DeleteItemCommand({
        TableName: tableName,
        Key: { sessionId: { S: session.sessionId.S } },
      }))
    );

    await Promise.all(deletePromises);
    
    console.log(`✅ Cleaned up ${emptySessions.length} empty sessions`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    // Don't throw - cleanup failure shouldn't break the app
  }
}

/**
 * Cleanup old completed sessions (optional - for future)
 * Delete sessions older than X days and marked as completed
 */
export async function cleanupOldSessions(daysOld: number = 90): Promise<void> {
  const tableName = process.env.SESSIONS_TABLE;
  
  if (!tableName) {
    return;
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`🧹 Cleaning up sessions older than ${daysOld} days...`);
    
    const scanResult = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'createdAt < :cutoff AND #status = :completed',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':cutoff': { S: cutoffISO },
        ':completed': { S: 'completed' },
      },
      ProjectionExpression: 'sessionId',
    }));

    const oldSessions = scanResult.Items || [];
    
    if (oldSessions.length === 0) {
      console.log('✅ No old sessions to archive');
      return;
    }

    console.log(`📦 Found ${oldSessions.length} old completed sessions`);
    // In production, might want to archive to S3 before deleting
    
  } catch (error) {
    console.error('❌ Old session cleanup failed:', error);
  }
}

