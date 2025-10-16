// backend/src/services/userMemory.ts
/**
 * User Memory Service - Persistent preferences across all sessions
 * Stores things user wants to remember permanently
 */
import { getVectorStore } from './vectorStore';
import { v4 as uuidv4 } from 'uuid';

export interface UserMemory {
  id: string;
  content: string;
  category: string;
  tags?: string[];
  timestamp: string;
}

export class UserMemoryService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Store a memory from !remember command
   */
  async remember(content: string, category: string = 'preference'): Promise<string> {
    const memoryId = uuidv4();
    const vectorStore = getVectorStore();

    console.log(`💾 Storing user memory for ${this.userId}: "${content.substring(0, 50)}..."`);

    await vectorStore.add(
      content,
      {
        type: 'user_memory',
        category,
        created_at: new Date().toISOString(),
      },
      this.userId,
      'user-memories', // Special session for persistent memories
      memoryId
    );

    return memoryId;
  }

  /**
   * Get all relevant memories for current context (semantic search)
   */
  async getRelevantMemories(query: string, limit: number = 3): Promise<UserMemory[]> {
    const vectorStore = getVectorStore();

    try {
      const results = await vectorStore.search(
        query,
        this.userId,
        'user-preferences', // Updated to match tool
        limit
      );

      return results
        .filter(r => r.score > 0.7) // Higher threshold - only very relevant
        .map(r => ({
          id: r.turnId,
          content: r.text,
          category: r.metadata.category || 'other',
          tags: r.metadata.tags || [],
          timestamp: r.metadata.stored_at || r.metadata.created_at,
        }));
    } catch (error) {
      console.error('Error fetching memories:', error);
      return [];
    }
  }

  /**
   * Get all memories (for display)
   */
  async getAllMemories(): Promise<UserMemory[]> {
    const vectorStore = getVectorStore();
    
    try {
      // Search with broad query to get all preferences
      const results = await vectorStore.search(
        'user preferences information', // Broad query to match all
        this.userId,
        'user-preferences',
        50 // Max memories
      );

      return results.map(r => ({
        id: r.turnId,
        content: r.text,
        category: r.metadata.category || 'other',
        tags: r.metadata.tags || [],
        timestamp: r.metadata.stored_at || r.metadata.created_at,
      }));
    } catch (error) {
      console.error('Error fetching all memories:', error);
      return [];
    }
  }

  /**
   * Build memory context for system prompt (only relevant memories)
   */
  async buildMemoryContext(currentMessage: string): Promise<string> {
    const memories = await this.getRelevantMemories(currentMessage, 3);

    if (memories.length === 0) {
      return '';
    }

    const memoryText = memories
      .map(m => {
        const tags = m.tags && m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
        return `- ${m.content} (${m.category}${tags})`;
      })
      .join('\n');

    return `\n\nℹ️ Relevant User Preferences:\n${memoryText}\n\nConsider these when responding, but don't mention you're using stored preferences unless relevant.`;
  }

  /**
   * Delete all memories for this user
   */
  async deleteAllMemories(): Promise<number> {
    const vectorStore = getVectorStore();
    
    try {
      const deletedCount = await vectorStore.deleteAll(this.userId, 'user-preferences');
      console.log(`🗑️  Deleted all ${deletedCount} memories for user: ${this.userId}`);
      return deletedCount;
    } catch (error) {
      console.error('Error deleting all memories:', error);
      throw error;
    }
  }
}

// Singleton factory
const memoryInstances = new Map<string, UserMemoryService>();

export function getUserMemory(userId: string): UserMemoryService {
  if (!memoryInstances.has(userId)) {
    memoryInstances.set(userId, new UserMemoryService(userId));
  }
  return memoryInstances.get(userId)!;
}

