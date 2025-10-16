// backend/src/agent/tools.ts
/**
 * Tool definitions and execution
 * Demonstrates handling large tool outputs in context management
 */
import { getVectorStore } from '../services/vectorStore';

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  execute: (params: any) => Promise<string>;
}

/**
 * Calculator tool - performs basic arithmetic
 */
const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Performs basic arithmetic calculations. Use for math operations.',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2", "15 * 3.5")',
      },
    },
    required: ['expression'],
  },
  execute: async (params: { expression: string }) => {
    try {
      // Safe eval for basic math
      const result = Function(`'use strict'; return (${params.expression})`)();
      return `Calculation result: ${params.expression} = ${result}`;
    } catch (error) {
      return `Error: Invalid expression "${params.expression}"`;
    }
  },
};

/**
 * Current time tool
 */
const timeTool: Tool = {
  name: 'get_current_time',
  description: 'Gets the current date and time in various formats',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone (optional, defaults to UTC)',
      },
    },
    required: [],
  },
  execute: async (params: { timezone?: string }) => {
    const now = new Date();
    return `Current time (UTC): ${now.toISOString()}
Local: ${now.toLocaleString()}
Unix timestamp: ${Math.floor(now.getTime() / 1000)}
Day: ${now.toLocaleDateString('en-US', { weekday: 'long' })}`;
  },
};

/**
 * Text analyzer tool - demonstrates handling large outputs
 */
const textAnalyzerTool: Tool = {
  name: 'analyze_text',
  description: 'Analyzes text and provides detailed statistics',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze',
      },
    },
    required: ['text'],
  },
  execute: async (params: { text: string }) => {
    const text = params.text;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chars = text.length;
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    
    // Word frequency
    const wordFreq: Record<string, number> = {};
    words.forEach(word => {
      const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower) {
        wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      }
    });
    
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => `${word}: ${count}`)
      .join(', ');
    
    // This output can be large - testing context management
    return `Text Analysis Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Basic Stats:
   - Total characters: ${chars.toLocaleString()}
   - Total words: ${words.length}
   - Total sentences: ${sentences.length}
   - Unique words: ${uniqueWords.size}
   - Average word length: ${(chars / words.length).toFixed(1)} chars
   - Average sentence length: ${(words.length / sentences.length).toFixed(1)} words

📈 Top 10 Words:
   ${topWords}

💡 Readability:
   - Words per sentence: ${(words.length / sentences.length).toFixed(1)}
   - Estimated reading time: ${Math.ceil(words.length / 200)} min
   
✅ Analysis complete`;
  },
};

/**
 * Knowledge base search tool - searches internal documents
 * Demonstrates: S3 Vectors + handling large search results
 */
const knowledgeSearchTool: Tool = {
  name: 'search_knowledge',
  description: 'Searches the internal knowledge base for relevant information. Use when user asks about company policies, products, or documentation.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find relevant information',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['query'],
  },
  execute: async (params: { query: string; limit?: number }) => {
    try {
      const vectorStore = getVectorStore();
      const results = await vectorStore.search(
        params.query,
        'knowledge-base', // Special userId for shared knowledge
        'shared',         // Shared session
        params.limit || 5
      );
      
      if (results.length === 0) {
        return 'No relevant information found in the knowledge base.';
      }
      
      // Format results - can be large!
      const formatted = results.map((r, idx) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Result ${idx + 1} (Relevance: ${(r.score * 100).toFixed(0)}%)
${r.metadata.title || 'Document'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${r.text}

Source: ${r.metadata.source || 'Internal Knowledge Base'}
Last Updated: ${r.metadata.updated || 'N/A'}
`).join('\n');
      
      return `Knowledge Base Search Results (${results.length} found):
${formatted}

💡 This information comes from the company's internal knowledge base.`;
    } catch (error) {
      console.error('Knowledge search error:', error);
      return `Error searching knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Remember preference tool - AI stores user preferences automatically
 */
const rememberPreferenceTool: Tool = {
  name: 'remember_preference',
  description: 'Stores important user information for future conversations. Use when user shares preferences, restrictions, personal details, or anything they would want you to remember across all chats. ALWAYS categorize and tag appropriately.',
  parameters: {
    type: 'object',
    properties: {
      preference: {
        type: 'string',
        description: 'The preference or information to remember (e.g., "vegetarian and allergic to peanuts", "prefers concise answers", "works as software engineer at startup")',
      },
      category: {
        type: 'string',
        description: 'Primary category: dietary, communication, personal, professional, health, interests, location, other',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relevant tags for better retrieval (e.g., ["food", "allergies"] or ["work", "tech"])',
      },
    },
    required: ['preference', 'category', 'tags'],
  },
  execute: async (params: { preference: string; category: string; tags: string[] }) => {
    try {
      const vectorStore = getVectorStore();
      
      // Get userId from injected params
      const userId = (params as any)._userId || 'user';
      
      // Check for duplicates by searching existing memories
      const existingMemories = await vectorStore.search(
        params.preference,
        userId,
        'user-preferences',
        5 // Check top 5 similar memories
      );
      
      // If very similar memory exists (>0.9 similarity), skip storing
      const duplicateThreshold = 0.9;
      const hasDuplicate = existingMemories.some(m => m.score > duplicateThreshold);
      
      if (hasDuplicate) {
        const duplicate = existingMemories.find(m => m.score > duplicateThreshold)!;
        console.log(`⚠️  Duplicate memory detected (${(duplicate.score * 100).toFixed(1)}% similar), skipping:`, {
          new: params.preference.substring(0, 50) + '...',
          existing: duplicate.text.substring(0, 50) + '...',
        });
        
        return `✓ I already have this information stored (${params.category}). No need to store again.`;
      }
      
      // No duplicate found, store new memory
      const memoryId = `memory-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      await vectorStore.add(
        params.preference,
        {
          type: 'user_preference',
          category: params.category,
          tags: params.tags || [],
          stored_at: new Date().toISOString(),
        },
        userId,
        'user-preferences',
        memoryId
      );
      
      console.log(`💾 Stored preference for ${userId}:`, {
        content: params.preference.substring(0, 50) + '...',
        category: params.category,
        tags: params.tags,
        similarityCheck: `checked ${existingMemories.length} existing memories`,
      });
      
      return `✓ I've stored your preference (${params.category}: ${params.tags.join(', ')}). This will be remembered in all future chats.`;
    } catch (error) {
      console.error('Failed to store preference:', error);
      return 'Error: Failed to store preference';
    }
  },
};

/**
 * All available tools
 */
export const AVAILABLE_TOOLS: Tool[] = [
  calculatorTool,
  timeTool,
  textAnalyzerTool,
  knowledgeSearchTool,
  rememberPreferenceTool,
];

/**
 * Get tool by name
 */
export function getTool(name: string): Tool | undefined {
  return AVAILABLE_TOOLS.find(t => t.name === name);
}

/**
 * Get tools description for system prompt
 */
export function getToolsDescription(): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 AVAILABLE TOOLS - Use these whenever appropriate!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${AVAILABLE_TOOLS.map(tool => `📍 ${tool.name}
   ${tool.description}
   Parameters: ${JSON.stringify(tool.parameters.properties, null, 2)}`).join('\n\n')}

🔴 CRITICAL PRIORITY: remember_preference tool!
⚠️ When user shares ANY personal info → CALL THE TOOL! Don't just acknowledge!

CONCRETE EXAMPLES WITH EXACT FORMAT:

Example 1: User says "I like maths"
TOOL_CALL: remember_preference
PARAMS: {"preference": "enjoys mathematics and math-related topics", "category": "interests", "tags": ["math", "hobbies", "interests"]}

Example 2: User says "Remember this" (referring to previous statement)
TOOL_CALL: remember_preference
PARAMS: {"preference": "[extract what to remember from context]", "category": "[appropriate category]", "tags": ["[relevant]", "[tags]"]}

Example 3: User says "I'm vegetarian"
TOOL_CALL: remember_preference
PARAMS: {"preference": "follows vegetarian diet", "category": "dietary", "tags": ["food", "vegetarian", "diet"]}

Other tool examples:
- User: "What is 15 × 37?" → TOOL_CALL: calculator, PARAMS: {"expression": "15 * 37"}
- User: "What time is it?" → TOOL_CALL: get_current_time, PARAMS: {}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL CALL FORMAT (Use EXACTLY this format):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOOL_CALL: tool_name
PARAMS: {"param_name": "value"}

After tool execution, you'll receive the result and can provide a final answer.

🚨 DO NOT SAY "I'll remember that" - ACTUALLY CALL remember_preference TOOL! 🚨
`;
}

/**
 * Parse tool call from LLM response
 * Supports multiple formats for flexibility
 */
export function parseToolCall(response: string): { toolName: string; params: any } | null {
  // Format 1: Exact format
  const toolMatch = response.match(/TOOL_CALL:\s*(\w+)/i);
  const paramsMatch = response.match(/PARAMS:\s*({.*})/s);
  
  if (toolMatch && paramsMatch) {
    try {
      return {
        toolName: toolMatch[1],
        params: JSON.parse(paramsMatch[1]),
      };
    } catch (error) {
      console.error('Failed to parse tool call:', error);
    }
  }
  
  // Format 2: JSON-based tool call
  const jsonMatch = response.match(/```json\s*({[\s\S]*?})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tool && parsed.params) {
        return {
          toolName: parsed.tool,
          params: parsed.params,
        };
      }
    } catch (error) {
      // Ignore
    }
  }
  
  // Format 3: Check if response contains tool name directly
  for (const tool of AVAILABLE_TOOLS) {
    if (response.toLowerCase().includes(`use ${tool.name}`) || 
        response.toLowerCase().includes(`call ${tool.name}`) ||
        response.toLowerCase().includes(`${tool.name}(`)) {
      console.log(`🔍 Detected intent to use tool: ${tool.name} (but wrong format)`);
    }
  }
  
  return null;
}

/**
 * Tool output cache for smart summarization
 */
const toolOutputCache = new Map<string, {
  fullOutput: string;
  summary: string;
  timestamp: number;
  usageCount: number;
}>();

/**
 * Generate a smart summary of tool output for context efficiency
 */
function summarizeToolOutput(toolName: string, fullOutput: string): string {
  // Different summarization strategies based on tool type
  switch (toolName) {
    case 'search_knowledge':
      // Extract key findings and sources
      const results = fullOutput.match(/Result \d+ \(Relevance: \d+%\)/g) || [];
      const sources = fullOutput.match(/Source: [^\n]+/g) || [];
      return `Knowledge search found ${results.length} relevant results from ${sources.length} sources. Key findings extracted and processed.`;
    
    case 'analyze_text':
      // Extract key statistics
      const stats = fullOutput.match(/(Total characters|Total words|Total sentences|Unique words): [^\n]+/g) || [];
      const topWords = fullOutput.match(/Top 10 Words:\s*\n\s*([^\n]+)/);
      return `Text analysis complete. ${stats.join(', ')}. ${topWords ? `Top words: ${topWords[1].substring(0, 100)}...` : ''}`;
    
    case 'get_current_time':
      // Time outputs are small, return as-is
      return fullOutput;
    
    case 'calculator':
      // Math results are concise, return as-is
      return fullOutput;
    
    case 'remember_preference':
      // Memory operations are small, return as-is
      return fullOutput;
    
    default:
      // Generic summarization for unknown tools
      const lines = fullOutput.split('\n');
      if (lines.length <= 5) {
        return fullOutput; // Keep small outputs as-is
      }
      return `Tool ${toolName} completed successfully. Output processed (${fullOutput.length} chars). Key information extracted.`;
  }
}

/**
 * Get cache key for tool output
 */
function getCacheKey(toolName: string, params: any): string {
  // Create a stable key based on tool name and parameters
  const paramStr = JSON.stringify(params, Object.keys(params).sort());
  return `${toolName}:${Buffer.from(paramStr).toString('base64')}`;
}

/**
 * Execute tool and handle large outputs with smart caching
 * Returns both the display result and storage result
 */
export async function executeTool(toolName: string, params: any, userId?: string): Promise<{
  displayResult: string;
  storageResult: string;
  isFirstUse: boolean;
}> {
  const tool = getTool(toolName);
  
  if (!tool) {
    const errorMsg = `Error: Tool "${toolName}" not found. Available tools: ${AVAILABLE_TOOLS.map(t => t.name).join(', ')}`;
    return {
      displayResult: errorMsg,
      storageResult: errorMsg,
      isFirstUse: true
    };
  }
  
  try {
    console.log(`🔧 Executing tool: ${toolName}`, params);
    
    // Inject userId for tools that need it (like remember_preference)
    if (userId) {
      params._userId = userId;
    }
    
    const result = await tool.execute(params);
    console.log(`✅ Tool result (${result.length} chars):`, result.substring(0, 100) + '...');
    
    // Smart caching logic
    const cacheKey = getCacheKey(toolName, params);
    const cached = toolOutputCache.get(cacheKey);
    
    if (cached) {
      // Increment usage count
      cached.usageCount++;
      console.log(`🔄 Tool output cache hit (usage #${cached.usageCount})`);
      
      // Return summary for display, but store reference for storage
      return {
        displayResult: cached.summary,
        storageResult: `[Tool: ${toolName}] Output cached (usage #${cached.usageCount}). See first occurrence for full details.`,
        isFirstUse: false
      };
    } else {
      // First time - cache the full output and return it
      const summary = summarizeToolOutput(toolName, result);
      toolOutputCache.set(cacheKey, {
        fullOutput: result,
        summary: summary,
        timestamp: Date.now(),
        usageCount: 1
      });
      
      console.log(`💾 Tool output cached (first use)`);
      return {
        displayResult: result, // Full output for LLM processing
        storageResult: result, // Full output for storage
        isFirstUse: true
      };
    }
  } catch (error) {
    console.error(`❌ Tool execution failed:`, error);
    const errorMsg = `Error executing ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return {
      displayResult: errorMsg,
      storageResult: errorMsg,
      isFirstUse: true
    };
  }
}

/**
 * Clear old tool output cache entries (call periodically)
 */
export function clearOldToolCache(maxAge: number = 3600000): void { // 1 hour default
  const now = Date.now();
  for (const [key, value] of toolOutputCache.entries()) {
    if (now - value.timestamp > maxAge) {
      toolOutputCache.delete(key);
    }
  }
  console.log(`🧹 Cleared old tool cache entries`);
}

