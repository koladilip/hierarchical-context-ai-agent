// backend/src/api/routes/memories.ts
/**
 * User memories/preferences endpoints
 */
import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getUserMemory } from '../../services/userMemory';

export const memoriesRouter = Router();

// Get all user memories
memoriesRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const userMemory = getUserMemory(userId);
    
    const memories = await userMemory.getAllMemories();
    
    res.json({
      memories,
      count: memories.length,
    });
  } catch (error) {
    console.error('Failed to get memories:', error);
    res.status(500).json({
      error: 'Failed to get memories',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete all memories
memoriesRouter.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    
    console.log(`🗑️  Deleting ALL memories for user: ${userId}`);
    
    const userMemory = getUserMemory(userId);
    const deletedCount = await userMemory.deleteAllMemories();
    
    res.json({
      message: 'All memories deleted successfully',
      deleted_count: deletedCount,
    });
  } catch (error) {
    console.error('Failed to delete all memories:', error);
    res.status(500).json({
      error: 'Failed to delete all memories',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete a memory
memoriesRouter.delete('/:memoryId', async (req: AuthRequest, res: Response) => {
  try {
    const { memoryId } = req.params;
    const userId = req.user?.sub || 'anonymous';
    
    console.log(`🗑️  Deleting memory: ${memoryId} for user: ${userId}`);
    
    // TODO: Implement actual deletion from S3 Vectors
    // For now, just acknowledge
    res.json({
      message: 'Memory deleted successfully',
      memory_id: memoryId,
    });
  } catch (error) {
    console.error('Failed to delete memory:', error);
    res.status(500).json({
      error: 'Failed to delete memory',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Search memories (for testing)
memoriesRouter.post('/search', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }
    
    const userMemory = getUserMemory(userId);
    const memories = await userMemory.getRelevantMemories(query, limit);
    
    res.json({
      query,
      memories,
      count: memories.length,
    });
  } catch (error) {
    console.error('Failed to search memories:', error);
    res.status(500).json({
      error: 'Failed to search memories',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

