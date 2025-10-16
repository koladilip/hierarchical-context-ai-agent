// src/api/routes/health.ts
/**
 * Health check endpoint
 */
import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/', async (req: Request, res: Response) => {
  try {
    // Check AWS connectivity (optional)
    const health = {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        bedrock: true, // Could add actual checks
        s3: true,
      },
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

