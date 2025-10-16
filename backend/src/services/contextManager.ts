// backend/src/services/contextManager.ts
/**
 * Smart Context Manager - Core of large context handling
 * 
 * Manages conversation context across multiple turns, implementing:
 * - Token budget tracking
 * - Progressive summarization
 * - Rolling summary with recent message retention
 * 
 * Note: S3 Vectors reserved for Knowledge Base (separate feature)
 */
import { getLLMService } from './bedrock';
import { getDBService } from './database';
import { getQualityMonitor, QualityMetrics } from './qualityMonitor';

// Model context windows (in tokens)
const MODEL_LIMITS: Record<string, number> = {
  // Amazon Nova (AWS Native)
  'amazon.nova-micro-v1:0': 128000,
  'amazon.nova-lite-v1:0': 300000,
  'amazon.nova-pro-v1:0': 300000,
  
  // Anthropic Claude
  'anthropic.claude-3-5-sonnet-20241022-v2:0': 200000,
  'anthropic.claude-3-5-haiku-20241022-v1:0': 200000,
  'anthropic.claude-3-haiku-20240307-v1:0': 200000,
  'anthropic.claude-3-sonnet-20240229-v1:0': 200000,
  'anthropic.claude-3-opus-20240229-v1:0': 200000,
  
  // Meta Llama
  'meta.llama3-1-8b-instruct-v1:0': 128000,
  'meta.llama3-1-70b-instruct-v1:0': 128000,
  'meta.llama3-1-405b-instruct-v1:0': 128000,
  
  // Amazon Titan
  'amazon.titan-text-express-v1': 8000,
  'amazon.titan-text-lite-v1': 4000,
  'amazon.titan-text-premier-v1:0': 32000,
};

// Context budget allocation (simplified - no semantic search)
const BUDGET_ALLOCATION = {
  SYSTEM_PROMPT: 0.05,      // 5% for instructions
  HOT_CONTEXT: 0.65,        // 65% for recent turns (verbatim)
  SUMMARY_CONTEXT: 0.20,    // 20% for summarized history
  OUTPUT_BUFFER: 0.10,      // 10% for response generation
};

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens: number;
  turnIndex: number;
}

// Structured memory components
export interface StructuredMemory {
  entities: Record<string, string[]>;  // category -> entity list
  facts: string[];                     // Key facts extracted
  decisions: string[];                 // Decisions made
  goals: string[];                     // Conversation goals/plans
  unresolvedIntentions: string[];      // Things user wanted but not done
  agentState: Record<string, any>;     // Agent context/state
}

// Rolling summary tier
export interface SummaryTier {
  text: string;
  turnRangeStart: number;  // First turn index in this summary
  turnRangeEnd: number;    // Last turn index in this summary
  tokens: number;
  createdAt: string;
  structuredMemory?: StructuredMemory;
}

export interface ContextWindow {
  hotContext: ConversationTurn[];           // Last N turns (full)
  recentSummary: SummaryTier | null;        // Recent summarized content
  middleSummary: SummaryTier | null;        // Older compressed content
  ancientSummary: SummaryTier | null;       // Oldest, most compressed
  structuredMemory: StructuredMemory;       // Extracted structured data
  retrievedContext: ConversationTurn[];     // Semantically relevant
  totalTokens: number;
  windowUsagePercent: number;
}

export class ContextManager {
  private modelId: string;
  private maxTokens: number;
  private userId: string;
  private sessionId: string;
  private conversationHistory: ConversationTurn[] = [];
  
  // Rolling summary tiers
  private ancientSummary: SummaryTier | null = null;
  private middleSummary: SummaryTier | null = null;
  private recentSummary: SummaryTier | null = null;
  
  // Structured memory
  private structuredMemory: StructuredMemory = {
    entities: {},
    facts: [],
    decisions: [],
    goals: [],
    unresolvedIntentions: [],
    agentState: {},
  };
  
  // Reference tracking
  private turnIdToContent: Map<number, ConversationTurn> = new Map();
  private lastSummarizedTurnIndex: number = -1;
  
  // Quality monitoring
  private qualityMonitor: ReturnType<typeof getQualityMonitor>;
  private enableQualityMonitoring: boolean = process.env.ENABLE_QUALITY_MONITORING === 'true';

  constructor(userId: string, sessionId: string, modelId?: string) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.qualityMonitor = getQualityMonitor(sessionId);
    this.modelId = modelId || process.env.BEDROCK_LLM_MODEL || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    this.maxTokens = MODEL_LIMITS[this.modelId];
    
    if (!this.maxTokens) {
      console.warn(`⚠️  Unknown model: ${this.modelId}, using default 200K context window`);
      this.maxTokens = 200000;
    }
    
    console.log(`🧠 Context Manager initialized: ${this.modelId} (${this.maxTokens.toLocaleString()} tokens)`);
  }

  /**
   * Add a new turn to conversation history
   */
  async addTurn(role: 'user' | 'assistant', content: string): Promise<void> {
    const tokens = this.estimateTokens(content);
    
    const turn: ConversationTurn = {
      role,
      content,
      timestamp: new Date().toISOString(),
      tokens,
      turnIndex: this.conversationHistory.length,
    };

    this.conversationHistory.push(turn);
    
    // Store for reference tracking (enables retrieval of original content)
    this.turnIdToContent.set(turn.turnIndex, turn);

    // NOTE: Vector store is for knowledge base (documents, FAQs) - not conversation history
    // Conversation context is managed via summarization + recent messages in DynamoDB
  }

  /**
   * Get optimized context window for next LLM call
   */
  async getContextWindow(currentMessage: string): Promise<ContextWindow> {
    const availableTokens = Math.floor(this.maxTokens * (1 - BUDGET_ALLOCATION.OUTPUT_BUFFER));
    
    const budget = {
      hot: Math.floor(availableTokens * BUDGET_ALLOCATION.HOT_CONTEXT),
      summary: Math.floor(availableTokens * BUDGET_ALLOCATION.SUMMARY_CONTEXT),
    };

    // 1. Get hot context (recent turns, full fidelity)
    const hotContext = this.getHotContext(budget.hot);
    const hotTokens = this.countTokens(hotContext);

    // 2. Check if we need rolling summarization
    const totalHistoryTokens = this.countTokens(this.conversationHistory);
    const needsSummarization = totalHistoryTokens > (availableTokens * 0.6);

    if (needsSummarization) {
      await this.performRollingSummarization();
    }

    // 3. Calculate total tokens including all summary tiers
    const summaryTokens = 
      (this.ancientSummary?.tokens || 0) +
      (this.middleSummary?.tokens || 0) +
      (this.recentSummary?.tokens || 0);
    
    const totalTokens = hotTokens + summaryTokens;

    return {
      hotContext,
      recentSummary: this.recentSummary,
      middleSummary: this.middleSummary,
      ancientSummary: this.ancientSummary,
      structuredMemory: this.structuredMemory,
      retrievedContext: [], // Vector store reserved for knowledge base, not conversation
      totalTokens,
      windowUsagePercent: (totalTokens / availableTokens) * 100,
    };
  }

  /**
   * Get recent turns (hot context) within token budget
   */
  private getHotContext(tokenBudget: number): ConversationTurn[] {
    const hotContext: ConversationTurn[] = [];
    let tokensUsed = 0;

    // Start from most recent and work backwards
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const turn = this.conversationHistory[i];
      if (tokensUsed + turn.tokens <= tokenBudget) {
        hotContext.unshift(turn); // Add to beginning
        tokensUsed += turn.tokens;
      } else {
        break; // Budget exceeded
      }
    }

    return hotContext;
  }

  /**
   * Rolling summarization with multi-tier compression
   */
  private summarizationJustCreated = false;

  private async performRollingSummarization(): Promise<void> {
    const totalTokens = this.countTokens(this.conversationHistory);
    
    if (totalTokens < 10000) {
      console.log(`⏸️  Not enough tokens to summarize (${totalTokens.toLocaleString()}/10K)`);
      return;
    }

    // Strategy: Keep last 5 turns as hot context, summarize the rest
    const hotTurnCount = 5;
    const unsummarizedTurns = this.conversationHistory.filter(
      t => t.turnIndex > this.lastSummarizedTurnIndex
    );

    if (unsummarizedTurns.length <= hotTurnCount) {
      return; // Not enough new content to summarize
    }

    // Get turns to summarize (exclude last 5 hot turns)
    const turnsToSummarize = unsummarizedTurns.slice(0, -hotTurnCount);
    
    if (turnsToSummarize.length === 0) {
      return;
    }

    console.log(`📝 Rolling summarization: ${turnsToSummarize.length} turns (${this.countTokens(turnsToSummarize).toLocaleString()} tokens)`);

    // Create new recent summary
    const newRecentSummary = await this.createSummaryTier(turnsToSummarize);
    
    if (!newRecentSummary) {
      return;
    }

    // Roll existing summaries
    if (this.recentSummary) {
      // If recent summary exists, it becomes middle
      if (this.middleSummary) {
        // If middle exists, compress it with ancient
        if (this.ancientSummary) {
          // Compress ancient + middle into new ancient
          this.ancientSummary = await this.compressSummaries(
            this.ancientSummary,
            this.middleSummary
          );
        } else {
          this.ancientSummary = this.middleSummary;
        }
      }
      this.middleSummary = this.recentSummary;
    }

    this.recentSummary = newRecentSummary;
    this.lastSummarizedTurnIndex = turnsToSummarize[turnsToSummarize.length - 1].turnIndex;
    this.summarizationJustCreated = true;

    console.log(`✅ Rolling summary complete | Recent: ${this.recentSummary.tokens} | Middle: ${this.middleSummary?.tokens || 0} | Ancient: ${this.ancientSummary?.tokens || 0}`);

    // Persist to database (async, don't block)
    this.persistSummaries().catch(err => 
      console.error('⚠️  Failed to persist summaries:', err)
    );
  }

  /**
   * Persist rolling summaries and structured memory to database
   */
  private async persistSummaries(): Promise<void> {
    const db = getDBService();
    
    try {
      // Save rolling summaries
      await db.updateRollingSummaries(this.sessionId, {
        ancient: this.ancientSummary,
        middle: this.middleSummary,
        recent: this.recentSummary,
      });

      // Save structured memory
      await db.updateStructuredMemory(this.sessionId, this.structuredMemory);
      
      console.log(`💾 Persisted summaries and structured memory to database`);
    } catch (error) {
      console.error('Failed to persist summaries:', error);
    }
  }

  /**
   * Create a summary tier with structured memory extraction
   */
  private async createSummaryTier(turns: ConversationTurn[]): Promise<SummaryTier | null> {
    if (turns.length === 0) return null;

    const conversationText = turns
      .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n\n');

    const llm = getLLMService();
    
    try {
      const tokensToSummarize = this.countTokens(turns);
      
      // Create summary with structured memory extraction
      const response = await llm.chat([
        {
          role: 'system',
          content: `You are a conversation summarization assistant. Create a concise summary and extract key information from the conversation below.

Your output should be a JSON object with these fields:
{
  "summary": "Brief narrative summary (under 500 tokens)",
  "entities": {
    "people": ["person references"],
    "places": ["location references"],
    "things": ["object/item references"]
  },
  "facts": ["important facts mentioned"],
  "decisions": ["decisions made"],
  "goals": ["stated goals or plans"],
  "unresolvedIntentions": ["pending requests or tasks"]
}

Important: Keep information factual and contextual. Preserve details that may be referenced later in the conversation.`,
        },
        {
          role: 'user',
          content: conversationText,
        },
      ], 1500);

      // Parse structured response
      let structured: any;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structured = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: use plain summary
          structured = { summary: response.content };
        }
      } catch (e) {
        structured = { summary: response.content };
      }

      const summaryText = structured.summary || response.content;
      const tokens = this.estimateTokens(summaryText);

      // Update global structured memory
      this.mergeStructuredMemory(structured);

      const tier: SummaryTier = {
        text: summaryText,
        turnRangeStart: turns[0].turnIndex,
        turnRangeEnd: turns[turns.length - 1].turnIndex,
        tokens,
        createdAt: new Date().toISOString(),
        structuredMemory: {
          entities: structured.entities || {},
          facts: structured.facts || [],
          decisions: structured.decisions || [],
          goals: structured.goals || [],
          unresolvedIntentions: structured.unresolvedIntentions || [],
          agentState: {},
        },
      };

      // Track quality metrics if enabled
      if (this.enableQualityMonitoring) {
        this.qualityMonitor.trackEntities(structured.entities || {});
        this.qualityMonitor.trackFacts(structured.facts || []);
        this.qualityMonitor.setGoals(structured.goals || []);
      }

      console.log(`   ✓ Tier created: ${tokensToSummarize.toLocaleString()} → ${tokens} tokens (turns ${tier.turnRangeStart}-${tier.turnRangeEnd})`);
      
      return tier;
    } catch (error) {
      console.error('❌ Failed to create summary tier:', error);
      return null;
    }
  }

  /**
   * Compress two summary tiers into one (for ancient summary)
   */
  private async compressSummaries(tier1: SummaryTier, tier2: SummaryTier): Promise<SummaryTier> {
    const llm = getLLMService();
    
    try {
      const response = await llm.chat([
        {
          role: 'system',
          content: 'Compress the following two conversation summaries into one concise summary. Preserve only the most critical facts, decisions, and context. Keep under 400 tokens.',
        },
        {
          role: 'user',
          content: `Summary 1 (older):\n${tier1.text}\n\nSummary 2 (newer):\n${tier2.text}\n\nCreate ultra-compressed summary:`,
        },
      ], 800);

      const tokens = this.estimateTokens(response.content);
      
      return {
        text: response.content,
        turnRangeStart: tier1.turnRangeStart,
        turnRangeEnd: tier2.turnRangeEnd,
        tokens,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Failed to compress summaries:', error);
      return tier2; // Fallback to newer tier
    }
  }

  /**
   * Merge structured memory from a new summary into global memory
   */
  private mergeStructuredMemory(newMemory: any): void {
    if (newMemory.entities) {
      for (const [category, items] of Object.entries(newMemory.entities)) {
        if (!this.structuredMemory.entities[category]) {
          this.structuredMemory.entities[category] = [];
        }
        const itemsArray = items as string[];
        for (const item of itemsArray) {
          if (!this.structuredMemory.entities[category].includes(item)) {
            this.structuredMemory.entities[category].push(item);
          }
        }
      }
    }

    if (newMemory.facts) {
      for (const fact of newMemory.facts) {
        if (!this.structuredMemory.facts.includes(fact)) {
          this.structuredMemory.facts.push(fact);
        }
      }
    }

    if (newMemory.decisions) {
      for (const decision of newMemory.decisions) {
        if (!this.structuredMemory.decisions.includes(decision)) {
          this.structuredMemory.decisions.push(decision);
        }
      }
    }

    if (newMemory.goals) {
      for (const goal of newMemory.goals) {
        if (!this.structuredMemory.goals.includes(goal)) {
          this.structuredMemory.goals.push(goal);
        }
      }
    }

    if (newMemory.unresolvedIntentions) {
      for (const intention of newMemory.unresolvedIntentions) {
        if (!this.structuredMemory.unresolvedIntentions.includes(intention)) {
          this.structuredMemory.unresolvedIntentions.push(intention);
        }
      }
    }
  }

  wasSummarizedThisTurn(): boolean {
    const result = this.summarizationJustCreated;
    this.summarizationJustCreated = false; // Reset after check
    return result;
  }

  /**
   * Retrieve original turn content by turn index (for reference lookup)
   */
  getTurnByIndex(turnIndex: number): ConversationTurn | null {
    return this.turnIdToContent.get(turnIndex) || null;
  }

  /**
   * Get turn range content (for detailed context retrieval)
   */
  getTurnRange(startIndex: number, endIndex: number): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const turn = this.turnIdToContent.get(i);
      if (turn) {
        turns.push(turn);
      }
    }
    return turns;
  }

  /**
   * Build final messages array for LLM with optimized context
   */
  async buildMessages(userMessage: string): Promise<any[]> {
    const contextWindow = await this.getContextWindow(userMessage);
    const messages: any[] = [];

    // 1. System prompt with memory guidance
    messages.push({
      role: 'system',
      content: `You are a helpful AI assistant with access to conversation history and context.

🚨 CRITICAL: ALWAYS USE TOOLS WHEN APPROPRIATE 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MEMORY STORAGE - HIGHEST PRIORITY:
When user shares personal information, you MUST call remember_preference tool FIRST, then respond.

EXAMPLES OF WHEN TO USE remember_preference:
1. User: "I like maths" 
   → TOOL_CALL: remember_preference
   → PARAMS: {"preference": "likes mathematics", "category": "interests", "tags": ["math", "hobbies"]}

2. User: "I'm vegetarian"
   → TOOL_CALL: remember_preference  
   → PARAMS: {"preference": "vegetarian diet", "category": "dietary", "tags": ["food", "vegetarian"]}

3. User: "Remember this"
   → Look at previous message for what to remember
   → TOOL_CALL: remember_preference with that information

KEYWORDS THAT TRIGGER TOOL:
- "I like", "I love", "I enjoy", "I prefer"
- "I am", "I'm", "I work as"
- "Remember this", "Remember that", "Don't forget"
- "My favorite", "I can't", "I don't"

⚠️  DO NOT just acknowledge - CALL THE TOOL! ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    });

    // 2. Multi-tier summaries (ancient → middle → recent)
    if (contextWindow.ancientSummary) {
      messages.push({
        role: 'system',
        content: `[Ancient Context - Turns ${contextWindow.ancientSummary.turnRangeStart}-${contextWindow.ancientSummary.turnRangeEnd}]: ${contextWindow.ancientSummary.text}`,
      });
    }

    if (contextWindow.middleSummary) {
      messages.push({
        role: 'system',
        content: `[Middle Context - Turns ${contextWindow.middleSummary.turnRangeStart}-${contextWindow.middleSummary.turnRangeEnd}]: ${contextWindow.middleSummary.text}`,
      });
    }

    if (contextWindow.recentSummary) {
      messages.push({
        role: 'system',
        content: `[Recent Context - Turns ${contextWindow.recentSummary.turnRangeStart}-${contextWindow.recentSummary.turnRangeEnd}]: ${contextWindow.recentSummary.text}`,
      });
    }

    // 3. Structured memory (if present)
    const structuredContext = this.buildStructuredMemoryContext(contextWindow.structuredMemory);
    if (structuredContext) {
      messages.push({
        role: 'system',
        content: structuredContext,
      });
    }

    // 4. Hot context (recent conversation - full messages)
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
   * Build structured memory context string
   */
  private buildStructuredMemoryContext(memory: StructuredMemory): string | null {
    const parts: string[] = [];

    // Entities
    if (Object.keys(memory.entities).length > 0) {
      const entityList = Object.entries(memory.entities)
        .map(([category, items]) => `${category}: ${items.join(', ')}`)
        .join(' | ');
      parts.push(`Entities: ${entityList}`);
    }

    // Key facts
    if (memory.facts.length > 0) {
      parts.push(`Facts: ${memory.facts.slice(0, 5).join('; ')}`);
    }

    // Decisions
    if (memory.decisions.length > 0) {
      parts.push(`Decisions: ${memory.decisions.slice(0, 5).join('; ')}`);
    }

    // Goals
    if (memory.goals.length > 0) {
      parts.push(`Goals: ${memory.goals.slice(0, 3).join('; ')}`);
    }

    // Unresolved intentions
    if (memory.unresolvedIntentions.length > 0) {
      parts.push(`Pending: ${memory.unresolvedIntentions.slice(0, 3).join('; ')}`);
    }

    if (parts.length === 0) {
      return null;
    }

    return `[Structured Memory]: ${parts.join(' | ')}`;
  }

  /**
   * Get context statistics
   */
  getStats(): {
    totalTurns: number;
    totalTokens: number;
    hasSummary: boolean;
    summaryTiers: {
      ancient: number | null;
      middle: number | null;
      recent: number | null;
    };
    structuredMemory: {
      entities: number;
      facts: number;
      decisions: number;
      goals: number;
      unresolvedIntentions: number;
    };
    contextWindowUsage: string;
  } {
    return {
      totalTurns: this.conversationHistory.length,
      totalTokens: this.countTokens(this.conversationHistory),
      hasSummary: this.recentSummary !== null || this.middleSummary !== null || this.ancientSummary !== null,
      summaryTiers: {
        ancient: this.ancientSummary?.tokens || null,
        middle: this.middleSummary?.tokens || null,
        recent: this.recentSummary?.tokens || null,
      },
      structuredMemory: {
        entities: Object.keys(this.structuredMemory.entities).reduce(
          (sum, key) => sum + this.structuredMemory.entities[key].length,
          0
        ),
        facts: this.structuredMemory.facts.length,
        decisions: this.structuredMemory.decisions.length,
        goals: this.structuredMemory.goals.length,
        unresolvedIntentions: this.structuredMemory.unresolvedIntentions.length,
      },
      contextWindowUsage: `${Math.round((this.countTokens(this.conversationHistory) / this.maxTokens) * 100)}%`,
    };
  }

  /**
   * Calculate quality metrics (if monitoring enabled)
   */
  async getQualityMetrics(): Promise<QualityMetrics | null> {
    if (!this.enableQualityMonitoring) {
      return null;
    }

    return await this.qualityMonitor.calculateQualityScore(
      this.conversationHistory,
      this.structuredMemory
    );
  }

  /**
   * Get quality trend
   */
  getQualityTrend() {
    return this.qualityMonitor.getQualityTrend();
  }

  /**
   * Load conversation history from DynamoDB
   */
  async loadHistory(): Promise<void> {
    const db = getDBService();
    
    try {
      // Load messages
      const messages = await db.getSessionMessages(this.sessionId);
      if (messages.length > 0) {
        this.conversationHistory = messages.map((msg, index) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          tokens: msg.tokens,
          turnIndex: index,
        }));

        // Rebuild turn reference map
        this.conversationHistory.forEach(turn => {
          this.turnIdToContent.set(turn.turnIndex, turn);
        });

        console.log(`📥 Loaded ${messages.length} messages from database`);
      }

      // Load rolling summaries
      const summaries = await db.getRollingSummaries(this.sessionId);
      this.ancientSummary = summaries.ancient;
      this.middleSummary = summaries.middle;
      this.recentSummary = summaries.recent;

      if (summaries.recent) {
        this.lastSummarizedTurnIndex = summaries.recent.turnRangeEnd;
        console.log(`📥 Loaded rolling summaries from database`);
      }

      // Load structured memory
      const structuredMemory = await db.getStructuredMemory(this.sessionId);
      if (structuredMemory) {
        this.structuredMemory = structuredMemory;
        console.log(`📥 Loaded structured memory from database`);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      // Continue with empty state
    }
  }

  /**
   * Save conversation to DynamoDB
   */
  async saveHistory(): Promise<void> {
    // TODO: Implement DynamoDB saving
    // For now, just stored in S3 Vectors
  }

  // Helper methods
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private countTokens(turns: ConversationTurn[]): number {
    return turns.reduce((sum, turn) => sum + turn.tokens, 0);
  }
}

/**
 * Session manager cache (in-memory for Lambda warm starts)
 */
const sessionCache = new Map<string, ContextManager>();

export function getContextManager(userId: string, sessionId: string): ContextManager {
  const key = `${userId}:${sessionId}`;
  
  if (!sessionCache.has(key)) {
    sessionCache.set(key, new ContextManager(userId, sessionId));
  }
  
  return sessionCache.get(key)!;
}

