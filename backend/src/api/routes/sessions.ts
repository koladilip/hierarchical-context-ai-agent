// backend/src/api/routes/sessions.ts
/**
 * Session management endpoints
 */
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/auth';
import { getDBService } from '../../services/database';

export const sessionsRouter = Router();

// Create new session
sessionsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    console.log('Create session - User from JWT:', req.user);
    const userId = req.user?.sub || 'anonymous';
    const sessionId = uuidv4();
    const title = req.body?.title || 'New Chat';

    console.log('Creating session:', { userId, sessionId, title });
    const dbService = getDBService();
    const session = await dbService.createSession(userId, sessionId, title);

    console.log('Session created successfully:', session);
    res.json({
      session_id: session.sessionId,
      title: session.title,
      created_at: session.createdAt,
      user_id: userId,
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      error: 'Failed to create session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get session details with messages
sessionsRouter.get('/:sessionId', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const dbService = getDBService();
    
    const session = await dbService.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Get messages for this session
    const messages = await dbService.getSessionMessages(sessionId);

    // Build context stats
    const contextStats = {
      total_turns: session.messageCount,
      total_tokens: session.totalTokens,
      has_summary: !!session.summary || !!session.recentSummary || !!session.middleSummary || !!session.ancientSummary,
      context_window_used: session.totalTokens > 0 
        ? `${Math.round((session.totalTokens / 270000) * 100)}%` // Approx for Nova Lite
        : '0%',
      hot_context_turns: Math.min(session.messageCount, 10),
      retrieved_context_turns: 0,
      summary_present: !!session.summary || !!session.recentSummary || !!session.middleSummary || !!session.ancientSummary,
      // Rolling summary tiers
      summary_tiers: {
        ancient: session.ancientSummary?.tokens || null,
        middle: session.middleSummary?.tokens || null,
        recent: session.recentSummary?.tokens || null,
      },
      // Structured memory
      structured_memory: session.structuredMemory ? {
        entities: Object.keys(session.structuredMemory.entities).reduce(
          (sum, key) => sum + session.structuredMemory!.entities[key].length,
          0
        ),
        facts: session.structuredMemory.facts.length,
        decisions: session.structuredMemory.decisions.length,
        goals: session.structuredMemory.goals.length,
        unresolvedIntentions: session.structuredMemory.unresolvedIntentions.length,
      } : null,
    };

    res.json({
      session_id: session.sessionId,
      user_id: session.userId,
      title: session.title,
      status: session.status,
      message_count: session.messageCount,
      tokens_used: session.totalTokens,
      created_at: session.createdAt,
      has_summary: contextStats.has_summary,
      summary: session.summary, // Legacy field
      rolling_summaries: {
        ancient: session.ancientSummary || null,
        middle: session.middleSummary || null,
        recent: session.recentSummary || null,
      },
      structured_memory: session.structuredMemory || null,
      context_stats: contextStats,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete all sessions for a user
sessionsRouter.delete('/all/user', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const dbService = getDBService();
    
    console.log(`🗑️  Deleting all sessions for user: ${userId}`);
    const deletedCount = await dbService.deleteAllUserSessions(userId);
    
    res.json({
      message: 'All sessions deleted successfully',
      deleted_count: deletedCount,
    });
  } catch (error) {
    console.error('Failed to delete all sessions:', error);
    res.status(500).json({
      error: 'Failed to delete all sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete a session
sessionsRouter.delete('/:sessionId', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.sub || 'anonymous';
    const dbService = getDBService();
    
    // Verify session belongs to user
    const session = await dbService.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    if (session.userId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    // Delete session from DynamoDB
    console.log(`🗑️  Deleting session: ${sessionId}`);
    await dbService.deleteSession(sessionId);
    
    res.json({
      message: 'Session deleted successfully',
      session_id: sessionId,
    });
  } catch (error) {
    console.error('Failed to delete session:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get user's sessions
sessionsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const dbService = getDBService();
    
    const sessions = await dbService.getUserSessions(userId);

    // Filter out empty sessions (no messages sent)
    const activeSessions = sessions.filter(s => s.messageCount > 0);

    res.json({
      sessions: activeSessions.map(s => ({
        session_id: s.sessionId,
        title: s.title,
        status: s.status,
        message_count: s.messageCount,
        tokens_used: s.totalTokens,
        created_at: s.createdAt,
        has_summary: !!s.summary || !!s.recentSummary || !!s.middleSummary || !!s.ancientSummary,
        has_rolling_summaries: !!s.recentSummary || !!s.middleSummary || !!s.ancientSummary,
        has_structured_memory: !!s.structuredMemory,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
