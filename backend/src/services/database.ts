// backend/src/services/database.ts
/**
 * Single table design for sessions
 * - One row per session with messages array
 * - When completed, replace messages with summary
 * - Simple and efficient!
 */
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'agent-sessions';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens: number;
  fileReferences?: string[]; // Array of file IDs referenced in this message
  metadata?: {
    toolName?: string;
    isFirstUse?: boolean;
    isToolResult?: boolean;
  };
}

// Structured memory types
export interface StructuredMemory {
  entities: Record<string, string[]>;
  facts: string[];
  decisions: string[];
  goals: string[];
  unresolvedIntentions: string[];
  agentState: Record<string, any>;
}

export interface SummaryTier {
  text: string;
  turnRangeStart: number;
  turnRangeEnd: number;
  tokens: number;
  createdAt: string;
  structuredMemory?: StructuredMemory;
}

export interface Session {
  sessionId: string;
  userId: string;
  title: string;
  status: 'active' | 'completed';
  messages?: Message[];  // Present while active
  summary?: string;      // Replaces messages when completed (legacy)
  
  // Rolling summaries
  ancientSummary?: SummaryTier;
  middleSummary?: SummaryTier;
  recentSummary?: SummaryTier;
  
  // Structured memory
  structuredMemory?: StructuredMemory;
  
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  completedAt?: string;
  ttl?: number;
}

export class DatabaseService {
  private client: DynamoDBClient;

  constructor() {
    this.client = new DynamoDBClient({});
  }

  async createSession(userId: string, sessionId: string, title: string = 'New Chat'): Promise<Session> {
    const session: Session = {
      sessionId,
      userId,
      title,
      status: 'active',
      messages: [],
      messageCount: 0,
      totalTokens: 0,
      createdAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days
    };

    await this.client.send(
      new PutItemCommand({
        TableName: SESSIONS_TABLE,
        Item: marshall(session),
      })
    );

    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
      })
    );

    return response.Item ? (unmarshall(response.Item) as Session) : null;
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: SESSIONS_TABLE,
        IndexName: 'userSessionsIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: marshall({ ':userId': userId }),
        ScanIndexForward: false, // Most recent first
      })
    );

    return response.Items?.map(item => unmarshall(item) as Session) || [];
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
        UpdateExpression: `
          SET messages = list_append(if_not_exists(messages, :empty), :msg),
              messageCount = messageCount + :one,
              totalTokens = totalTokens + :tokens
        `,
        ExpressionAttributeValues: marshall({
          ':msg': [message],
          ':empty': [],
          ':one': 1,
          ':tokens': message.tokens,
        }),
      })
    );
  }

  async completeSession(sessionId: string, summary: string): Promise<void> {
    // Replace messages array with summary
    await this.client.send(
      new UpdateItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
        UpdateExpression: `
          SET #status = :completed,
              summary = :summary,
              completedAt = :now
          REMOVE messages
        `,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':completed': 'completed',
          ':summary': summary,
          ':now': new Date().toISOString(),
        }),
      })
    );
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    const session = await this.getSession(sessionId);
    return session?.messages || [];
  }

  async getSessionSummary(sessionId: string): Promise<string | null> {
    const session = await this.getSession(sessionId);
    return session?.summary || null;
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
        UpdateExpression: 'SET title = :title',
        ExpressionAttributeValues: marshall({
          ':title': title,
        }),
      })
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
      })
    );
  }

  async deleteAllUserSessions(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    
    await Promise.all(
      sessions.map(session => this.deleteSession(session.sessionId))
    );
    
    return sessions.length;
  }

  /**
   * Update session with rolling summaries
   */
  async updateRollingSummaries(
    sessionId: string,
    summaries: {
      ancient?: SummaryTier | null;
      middle?: SummaryTier | null;
      recent?: SummaryTier | null;
    }
  ): Promise<void> {
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (summaries.ancient !== undefined) {
      if (summaries.ancient === null) {
        removeExpressions.push('ancientSummary');
      } else {
        setExpressions.push('ancientSummary = :ancient');
        expressionAttributeValues[':ancient'] = summaries.ancient;
      }
    }

    if (summaries.middle !== undefined) {
      if (summaries.middle === null) {
        removeExpressions.push('middleSummary');
      } else {
        setExpressions.push('middleSummary = :middle');
        expressionAttributeValues[':middle'] = summaries.middle;
      }
    }

    if (summaries.recent !== undefined) {
      if (summaries.recent === null) {
        removeExpressions.push('recentSummary');
      } else {
        setExpressions.push('recentSummary = :recent');
        expressionAttributeValues[':recent'] = summaries.recent;
      }
    }

    if (setExpressions.length === 0 && removeExpressions.length === 0) {
      return;
    }

    const updateExpressionParts: string[] = [];
    if (setExpressions.length > 0) {
      updateExpressionParts.push(`SET ${setExpressions.join(', ')}`);
    }
    if (removeExpressions.length > 0) {
      updateExpressionParts.push(`REMOVE ${removeExpressions.join(', ')}`);
    }

    await this.client.send(
      new UpdateItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
        UpdateExpression: updateExpressionParts.join(' '),
        ...(Object.keys(expressionAttributeNames).length > 0 && {
          ExpressionAttributeNames: expressionAttributeNames,
        }),
        ...(Object.keys(expressionAttributeValues).length > 0 && {
          ExpressionAttributeValues: marshall(expressionAttributeValues),
        }),
      })
    );
  }

  /**
   * Update session with structured memory
   */
  async updateStructuredMemory(
    sessionId: string,
    structuredMemory: StructuredMemory
  ): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({ sessionId }),
        UpdateExpression: 'SET structuredMemory = :memory',
        ExpressionAttributeValues: marshall({
          ':memory': structuredMemory,
        }),
      })
    );
  }

  /**
   * Get rolling summaries from session
   */
  async getRollingSummaries(sessionId: string): Promise<{
    ancient: SummaryTier | null;
    middle: SummaryTier | null;
    recent: SummaryTier | null;
  }> {
    const session = await this.getSession(sessionId);
    return {
      ancient: session?.ancientSummary || null,
      middle: session?.middleSummary || null,
      recent: session?.recentSummary || null,
    };
  }

  /**
   * Get structured memory from session
   */
  async getStructuredMemory(sessionId: string): Promise<StructuredMemory | null> {
    const session = await this.getSession(sessionId);
    return session?.structuredMemory || null;
  }
}

// Singleton
let dbInstance: DatabaseService | null = null;

export function getDBService(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}
