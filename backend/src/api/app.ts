// src/api/app.ts
/**
 * Express application - shared between Lambda and local dev server
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { chatRouter } from './routes/chat';
import { sessionsRouter } from './routes/sessions';
import { knowledgeRouter } from './routes/knowledge';
import { memoriesRouter } from './routes/memories';
import { uploadRouter } from './routes/upload';
import { auth } from './middleware/auth';

// Create Express app
export const expressApp = express();

// Middleware
expressApp.use(cors({
  origin: true, // Allow all origins with credentials
  credentials: true,
}));
expressApp.use(express.json());

// Root route
expressApp.get('/', (req: Request, res: Response) => {
  const mode = process.env.NODE_ENV || 'production';
  res.json({
    message: 'Lyzr Large Context Agent API',
    docs: '/api/v1/health',
    version: '1.0.0',
    mode,
  });
});

// Routes
expressApp.use('/api/v1/health', healthRouter);
expressApp.use('/api/v1/sessions', auth, sessionsRouter);
expressApp.use('/api/v1/chat', auth, chatRouter);
expressApp.use('/api/v1/knowledge', auth, knowledgeRouter);
expressApp.use('/api/v1/memories', auth, memoriesRouter);
expressApp.use('/api/v1/upload', auth, uploadRouter);

// Error handling
expressApp.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

