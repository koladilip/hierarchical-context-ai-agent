// backend/src/api/routes/chat.ts
/**
 * Chat endpoint with smart context management and tool calling
 */
import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getContextManager } from '../../services/contextManager';
import { getLLMService } from '../../services/bedrock';
import { getDBService } from '../../services/database';
import { getUserMemory } from '../../services/userMemory';
import { getToolsDescription, parseToolCall, executeTool, clearOldToolCache } from '../../agent/tools';

export const chatRouter = Router();

interface ChatRequestBody {
  session_id: string;
  message: string;
  tools_enabled?: boolean;
}

chatRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { session_id, message, tools_enabled = true, file_ids } = req.body as ChatRequestBody & { file_ids?: string[] };
    const userId = req.user?.sub || 'anonymous';

    if (!session_id || !message) {
      res.status(400).json({ error: 'Missing session_id or message' });
      return;
    }

    // Check for !remember command (explicit memory storage)
    const rememberMatch = message.match(/^!remember\s+(.+)$/i);
    if (rememberMatch) {
      const textToRemember = rememberMatch[1];
      const { executeTool } = require('../../agent/tools');
      
      // Extract category and tags from context
      const result = await executeTool('remember_preference', {
        preference: textToRemember,
        category: 'other', // User can be more specific
        tags: ['explicit', 'user-requested'],
      }, userId);
      
      res.json({
        response: `✅ ${result}`,
        tokens_used: 0,
        tools_used: ['remember_preference'],
        system_events: [{
          type: 'tool_call',
          message: '🔧 Used tool: remember_preference (via !remember command)',
          timestamp: new Date().toISOString(),
        }],
        context_stats: {
          total_turns: 0,
          total_tokens: 0,
          has_summary: false,
          context_window_used: '0%',
          hot_context_turns: 0,
          retrieved_context_turns: 0,
          summary_present: false,
        },
      });
      return;
    }

    // Load user preferences/memories
    const userMemory = getUserMemory(userId);

    // Get services
    const contextManager = getContextManager(userId, session_id);
    const dbService = getDBService();
    const llmService = getLLMService();

    // Load previous messages from DynamoDB to rebuild context
    const previousMessages = await dbService.getSessionMessages(session_id);
    console.log(`📚 Loaded ${previousMessages.length} previous messages from DB`);
    
    // Initialize context manager with history (exclude system events - they're just for display)
    for (const msg of previousMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        let content = msg.content;
        
        // Handle tool results intelligently for context efficiency
        if (msg.role === 'assistant' && msg.metadata?.isToolResult) {
          // For tool results, use summary instead of full output for context
          const toolName = msg.metadata.toolName;
          if (toolName) {
            // Generate a context-efficient summary for tool results
            content = `[Used tool: ${toolName}] Tool executed successfully. Key information processed and integrated into conversation.`;
            console.log(`🔄 Converted tool result to context summary for ${toolName}`);
          }
        }
        
        // Restore file content for user messages that had file references
        if (msg.role === 'user' && msg.fileReferences && msg.fileReferences.length > 0) {
          const { getFileService } = require('../../services/fileService');
          const fileService = getFileService();
          
          try {
            const fileContents = await Promise.all(
              msg.fileReferences.map(async (fileId) => {
                try {
                  const metadata = await fileService.getFileMetadata(fileId, userId);
                  const content = await fileService.getFileContent(fileId, userId);
                  return `[File: ${metadata.filename}]\n${content}`;
                } catch (error) {
                  console.error(`Failed to restore file ${fileId}:`, error);
                  return `[File ${fileId} could not be loaded]`;
                }
              })
            );
            
            content += '\n\n' + fileContents.join('\n\n');
            console.log(`📎 Restored ${msg.fileReferences.length} file(s) for message from DB`);
          } catch (error) {
            console.error('Failed to restore file content:', error);
            // Continue with original content if file restoration fails
          }
        }
        
        await contextManager.addTurn(msg.role, content);
      }
    }

    // Load user memories and add to context
    const memoryContext = await userMemory.buildMemoryContext(message);
    if (memoryContext) {
      console.log(`💭 Including ${memoryContext.split('\n').length} user memories in context`);
    }

    // Parse @file-name mentions in message
    const fileMentions = message.match(/@([\w\-\.]+)/g) || [];
    let mentionedFileIds: string[] = file_ids || [];
    
    if (fileMentions.length > 0) {
      const { getFileService } = require('../../services/fileService');
      const fileService = getFileService();
      const userFiles = await fileService.listUserFiles(userId);
      
      fileMentions.forEach(mention => {
        const fileName = mention.substring(1); // Remove @
        const matchedFile = userFiles.find((f: any) => 
          f.filename.toLowerCase().includes(fileName.toLowerCase())
        );
        
        if (matchedFile && !mentionedFileIds.includes(matchedFile.fileId)) {
          mentionedFileIds.push(matchedFile.fileId);
          console.log(`📎 Detected file mention: @${fileName} → ${matchedFile.fileId}`);
        }
      });
    }

    // Load file attachments if provided or mentioned
    let fileContext = '';
    if (mentionedFileIds.length > 0) {
      const { getFileService } = require('../../services/fileService');
      const fileService = getFileService();
      
      const fileContents = await Promise.all(
        mentionedFileIds.map(async (fileId) => {
          try {
            const metadata = await fileService.getFileMetadata(fileId, userId);
            const content = await fileService.getFileContent(fileId, userId);
            return `[File: ${metadata.filename}]\n${content}`;
          } catch (error) {
            console.error(`Failed to load file ${fileId}:`, error);
            return `[File ${fileId} could not be loaded]`;
          }
        })
      );
      
      fileContext = '\n\n' + fileContents.join('\n\n');
      console.log(`📎 Including ${mentionedFileIds.length} file(s) in context`);
    }

    // Add current user message to context
    await contextManager.addTurn('user', message + fileContext);

    // Build optimized context window with smart management
    let messages = await contextManager.buildMessages(message + fileContext);
    
    // Add user memories to system prompt
    if (memoryContext) {
      messages[0].content += memoryContext;
    }
    
    // Add file context to user message if provided
    if (fileContext) {
      messages[messages.length - 1].content += fileContext;
    }
    
    // Add tools to system prompt if enabled
    if (tools_enabled) {
      const toolsDesc = getToolsDescription();
      messages[0].content += '\n\n' + toolsDesc;
      console.log('🔧 Tools enabled - added to system prompt');
      console.log('📋 System prompt length:', messages[0].content.length);
    }

    // Get LLM response
    let response = await llmService.chat(messages);
    let finalResponse = response.content;
    let toolsUsed: string[] = [];

    // Log response for debugging
    console.log('📤 LLM Response (first 500 chars):', response.content.substring(0, 500));

    // Check for tool calls (max 3 iterations to prevent loops)
    const toolResults: Array<{toolName: string; storageResult: string; isFirstUse: boolean}> = [];
    
    for (let i = 0; i < 3; i++) {
      const toolCall = parseToolCall(response.content);
      
      if (!toolCall || !tools_enabled) {
        if (i === 0) {
          console.log('ℹ️  No tool call detected in response');
        }
        break; // No tool call or tools disabled
      }
      
      console.log(`🔧 Tool call detected: ${toolCall.toolName}`, toolCall.params);
      toolsUsed.push(toolCall.toolName);
      
      // Execute tool (pass userId for tools that need it)
      const toolExecution = await executeTool(toolCall.toolName, toolCall.params, userId);
      
      // Store tool result info for later database storage
      toolResults.push({
        toolName: toolCall.toolName,
        storageResult: toolExecution.storageResult,
        isFirstUse: toolExecution.isFirstUse
      });
      
      // Add tool result to context as assistant message (use display result for LLM)
      await contextManager.addTurn('assistant', `[Used tool: ${toolCall.toolName}]\n\nTool result:\n${toolExecution.displayResult}`);
      
      // Ask LLM to process tool result
      const followUpMessages = await contextManager.buildMessages(
        `Process the tool result above and provide a final answer to the user.`
      );
      
      response = await llmService.chat(followUpMessages);
      finalResponse = response.content;
    }

    // Add final assistant response to context
    await contextManager.addTurn('assistant', finalResponse);

    // Periodic cache cleanup (every 10th request to avoid overhead)
    if (Math.random() < 0.1) {
      clearOldToolCache();
    }

    // Get current context stats
    const stats = contextManager.getStats();
    const contextWindow = await contextManager.getContextWindow(message);

    // Build system events for display (BEFORE saving)
    const systemEvents: Array<{type: string; message: string; timestamp: string}> = [];
    
    // Add tool usage events
    toolsUsed.forEach(tool => {
      systemEvents.push({
        type: 'tool_call',
        message: `🔧 Used tool: ${tool}`,
        timestamp: new Date().toISOString(),
      });
    });
    
    // Add summarization event if summary was just created
    if (contextManager.wasSummarizedThisTurn()) {
      const summaryInfo = [];
      if (contextWindow.recentSummary) summaryInfo.push(`Recent: ${contextWindow.recentSummary.tokens} tokens`);
      if (contextWindow.middleSummary) summaryInfo.push(`Middle: ${contextWindow.middleSummary.tokens} tokens`);
      if (contextWindow.ancientSummary) summaryInfo.push(`Ancient: ${contextWindow.ancientSummary.tokens} tokens`);
      
      systemEvents.push({
        type: 'summarization',
        message: `📝 Rolling summarization complete - ${summaryInfo.join(', ')}. Keeping last ${contextWindow.hotContext.length} messages in full with structured memory extraction (entities, facts, decisions, goals).`,
        timestamp: new Date().toISOString(),
      });
    }

    // Save user message to DynamoDB (with file references)
    const userMessage: any = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      tokens: llmService.estimateTokens(message),
    };
    
    // Only add fileReferences if there are any (avoid undefined values)
    if (mentionedFileIds.length > 0) {
      userMessage.fileReferences = mentionedFileIds;
    }
    
    await dbService.addMessage(session_id, userMessage);

    // Save system events (tool calls, summarization) to DynamoDB
    for (const event of systemEvents) {
      await dbService.addMessage(session_id, {
        role: 'system' as const,
        content: event.message,
        timestamp: event.timestamp,
        tokens: 0, // System events don't count toward token usage
      });
    }

    // Save assistant response to DynamoDB
    await dbService.addMessage(session_id, {
      role: 'assistant',
      content: finalResponse,
      timestamp: new Date().toISOString(),
      tokens: response.usage?.outputTokens || llmService.estimateTokens(finalResponse),
    });

    // Save tool results to DynamoDB with storage-optimized content
    for (const toolResult of toolResults) {
      await dbService.addMessage(session_id, {
        role: 'assistant',
        content: `[Used tool: ${toolResult.toolName}]\n\nTool result:\n${toolResult.storageResult}`,
        timestamp: new Date().toISOString(),
        tokens: llmService.estimateTokens(toolResult.storageResult),
        metadata: {
          toolName: toolResult.toolName,
          isFirstUse: toolResult.isFirstUse,
          isToolResult: true
        }
      });
    }

    // Auto-generate title after first user message (invisible to user)
    let generatedTitle: string | null = null;
    if (previousMessages.filter(m => m.role !== 'system').length === 0) {
      try {
        const titleResponse = await llmService.chat([
          {
            role: 'system',
            content: 'Generate a short, descriptive title (max 6 words) that summarizes the main topic or purpose of this conversation. Focus on the semantic meaning and subject matter, not on formatting or data structures. Return ONLY the title text, no quotes, no JSON, no metadata.',
          },
          {
            role: 'user',
            content: `USER: ${message}\n\nASSISTANT: ${finalResponse.substring(0, 500)}`,
          },
        ], 100);
        
        // Clean up the response - remove quotes, JSON artifacts, extra whitespace
        let rawTitle = titleResponse.content.trim();
        
        // Try to extract from JSON if it's wrapped
        const jsonMatch = rawTitle.match(/"title"\s*:\s*"([^"]+)"/);
        if (jsonMatch) {
          rawTitle = jsonMatch[1];
        }
        
        // Remove common prefixes/suffixes
        rawTitle = rawTitle
          .replace(/^(Title:|Chat:|Conversation:)\s*/i, '')
          .replace(/['"{}[\]]/g, '')
          .replace(/^[-\s]+|[-\s]+$/g, '')
          .trim();
        
        // Limit to 60 characters for display
        generatedTitle = rawTitle.substring(0, 60);
        
        console.log(`📝 Auto-generated title: "${generatedTitle}"`);
        await dbService.updateSessionTitle(session_id, generatedTitle);
      } catch (error) {
        console.error('Failed to generate title:', error);
      }
    }

    // Return response with detailed context stats
    res.json({
      response: finalResponse,
      tokens_used: response.usage?.totalTokens || 0,
      tools_used: toolsUsed,
      system_events: systemEvents,
      title: generatedTitle,
      context_stats: {
        total_turns: stats.totalTurns,
        total_tokens: stats.totalTokens,
        has_summary: stats.hasSummary,
        context_window_used: `${Math.round(contextWindow.windowUsagePercent)}%`,
        hot_context_turns: contextWindow.hotContext.length,
        retrieved_context_turns: contextWindow.retrievedContext.length,
        summary_present: stats.hasSummary,
        // Rolling summary tiers
        summary_tiers: stats.summaryTiers,
        // Structured memory
        structured_memory: stats.structuredMemory,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
