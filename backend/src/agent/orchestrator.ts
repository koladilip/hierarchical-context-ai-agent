// backend/src/agent/orchestrator.ts
/**
 * Agent Orchestrator - Intelligent decision making for context and knowledge retrieval
 * 
 * The agent decides:
 * 1. What knowledge to retrieve from knowledge base
 * 2. What conversation context to include
 * 3. Whether to summarize
 * 4. What tools to use (if any)
 * 5. How to assemble the final prompt
 */
import { getLLMService } from '../services/bedrock';
import { getContextManager } from '../services/contextManager';
import { getDBService } from '../services/database';

export interface AgentConfig {
  userId: string;
  sessionId: string;
  enableTools?: boolean;
}

export interface AgentResponse {
  content: string;
  tokensUsed: number;
  contextStats: {
    conversationTurns: number;
    totalTokens: number;
    windowUsage: string;
    hasSummary: boolean;
  };
}

export class AgentOrchestrator {
  private config: AgentConfig;
  private llm: ReturnType<typeof getLLMService>;
  private contextManager: ReturnType<typeof getContextManager>;
  private db: ReturnType<typeof getDBService>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.llm = getLLMService();
    this.contextManager = getContextManager(config.userId, config.sessionId);
    this.db = getDBService();
  }

  /**
   * Main processing pipeline
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    // Step 1: Get conversation context (smart retrieval)
    const contextWindow = await this.contextManager.getContextWindow(userMessage);

    // Step 2: Assemble prompt with context
    const messages = this.assemblePrompt(userMessage, contextWindow);

    // Step 3: Call LLM
    const response = await this.llm.chat(messages);

    // Step 4: Store messages in context manager and DB
    await this.contextManager.addTurn('user', userMessage);
    await this.contextManager.addTurn('assistant', response.content);
    await this.persistToDatabase(userMessage, response);

    // Step 5: Check if session should be completed and summarized
    await this.checkSessionCompletion();

    // Step 6: Return with detailed stats
    return this.buildResponse(response, contextWindow);
  }

  /**
   * Assemble final prompt with conversation context
   */
  private assemblePrompt(userMessage: string, contextWindow: any): any[] {
    const messages: any[] = [];

    // 1. System prompt
    messages.push({
      role: 'system',
      content: `You are a helpful AI assistant with access to conversation history.
You can retrieve relevant context from previous messages using semantic search.
Provide accurate, helpful responses based on the available context.`,
    });

    // 2. Conversation summary (if exists)
    if (contextWindow.summary) {
      messages.push({
        role: 'system',
        content: `Summary of earlier conversation:\n${contextWindow.summary}`,
      });
    }

    // 3. Retrieved relevant context (semantic search from S3 Vectors)
    if (contextWindow.retrievedContext.length > 0) {
      const retrievedText = contextWindow.retrievedContext
        .map((t: any) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
        .join('\n\n');

      messages.push({
        role: 'system',
        content: `Relevant from earlier conversation:\n${retrievedText}`,
      });
    }

    // 4. Hot context (recent turns, full fidelity)
    for (const turn of contextWindow.hotContext) {
      messages.push({
        role: turn.role,
        content: turn.content,
      });
    }

    // 5. Current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * Persist conversation to database
   */
  private async persistToDatabase(userMessage: string, response: any): Promise<void> {
    // Save user message
    await this.db.addMessage(this.config.sessionId, {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      tokens: this.llm.estimateTokens(userMessage),
    });

    // Save assistant message
    await this.db.addMessage(this.config.sessionId, {
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      tokens: response.usage?.outputTokens || this.llm.estimateTokens(response.content),
    });
  }

  /**
   * Check if session should be marked as completed and summarized
   */
  private async checkSessionCompletion(): Promise<void> {
    const stats = this.contextManager.getStats();

    // Auto-complete session if:
    // - More than 50 turns
    // - Or more than 100K tokens
    const shouldComplete = stats.totalTurns > 50 || stats.totalTokens > 100000;

    if (shouldComplete) {
      await this.completeSession();
    }
  }

  /**
   * Complete a session - create summary and mark as done
   */
  private async completeSession(): Promise<void> {
    try {
      // Get all session messages
      const messages = await this.db.getSessionMessages(this.config.sessionId);

      // Create comprehensive summary
      const summary = await this.createSessionSummary(messages);

      // Save summary
      await this.db.completeSession(this.config.sessionId, summary);

      // Optionally: Add summary to knowledge base for reuse
      // await this.knowledgeBase.addKnowledge(
      //   this.config.userId,
      //   `session-summary-${this.config.sessionId}`,
      //   {
      //     scope: 'user',
      //     category: 'session-summaries',
      //     title: `Session ${this.config.sessionId.substring(0, 8)}`,
      //     content: summary,
      //   }
      // );

      console.log(`Session ${this.config.sessionId} completed and summarized`);
    } catch (error) {
      console.error('Failed to complete session:', error);
    }
  }

  /**
   * Create comprehensive session summary
   */
  private async createSessionSummary(messages: any[]): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const response = await this.llm.chat([
      {
        role: 'system',
        content: `Create a comprehensive summary of this conversation session. Include:
- Main topics discussed
- Key decisions made
- Important facts mentioned
- User preferences revealed
- Action items or next steps

Keep the summary structured and under 1000 tokens.`,
      },
      {
        role: 'user',
        content: conversationText,
      },
    ], 2000);

    return response.content;
  }

  /**
   * Build final response with stats
   */
  private buildResponse(llmResponse: any, contextWindow: any): AgentResponse {
    const stats = this.contextManager.getStats();

    return {
      content: llmResponse.content,
      tokensUsed: llmResponse.usage?.totalTokens || 0,
      contextStats: {
        conversationTurns: stats.totalTurns,
        totalTokens: contextWindow.totalTokens,
        windowUsage: `${Math.round(contextWindow.windowUsagePercent)}%`,
        hasSummary: stats.hasSummary,
      },
    };
  }
}

/**
 * Create agent instance for a request
 */
export function createAgent(config: AgentConfig): AgentOrchestrator {
  return new AgentOrchestrator(config);
}

