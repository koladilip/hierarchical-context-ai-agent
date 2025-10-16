// backend/src/api/routes/knowledge.ts
/**
 * Knowledge base management endpoints
 * Upload, list, search internal documents
 */
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/auth';
import { getVectorStore } from '../../services/vectorStore';

export const knowledgeRouter = Router();

interface UploadKnowledgeBody {
  title: string;
  content: string;
  category?: string;
  source?: string;
}

// Upload knowledge document
knowledgeRouter.post('/upload', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, category, source } = req.body as UploadKnowledgeBody;
    const userId = req.user?.sub || 'anonymous';

    if (!title || !content) {
      res.status(400).json({ error: 'Missing title or content' });
      return;
    }

    const docId = uuidv4();
    const vectorStore = getVectorStore();

    console.log(`📚 Uploading knowledge: "${title}" (${content.length} chars)`);

    // Store in vector store for semantic search
    await vectorStore.add(
      content,
      {
        title,
        category: category || 'general',
        source: source || 'user-upload',
        uploaded_by: userId,
        uploaded_at: new Date().toISOString(),
      },
      'knowledge-base', // Special userId for shared knowledge
      'shared',         // Shared session
      docId
    );

    console.log(`✅ Knowledge uploaded: ${docId}`);

    res.json({
      id: docId,
      title,
      category: category || 'general',
      content_length: content.length,
      uploaded_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Knowledge upload error:', error);
    res.status(500).json({
      error: 'Failed to upload knowledge',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Search knowledge base
knowledgeRouter.post('/search', async (req: AuthRequest, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }

    console.log(`🔍 Searching knowledge: "${query}"`);

    const vectorStore = getVectorStore();
    const results = await vectorStore.search(
      query,
      'knowledge-base',
      'shared',
      limit
    );

    console.log(`✅ Found ${results.length} results`);

    res.json({
      query,
      results: results.map(r => ({
        text: r.text,
        title: r.metadata.title,
        category: r.metadata.category,
        source: r.metadata.source,
        relevance: Math.round(r.score * 100),
        uploaded_at: r.metadata.uploaded_at,
      })),
      count: results.length,
    });
  } catch (error) {
    console.error('Knowledge search error:', error);
    res.status(500).json({
      error: 'Failed to search knowledge',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Bulk upload (for seeding)
knowledgeRouter.post('/bulk-upload', async (req: AuthRequest, res: Response) => {
  try {
    const { documents } = req.body as { documents: UploadKnowledgeBody[] };
    const userId = req.user?.sub || 'anonymous';

    if (!documents || !Array.isArray(documents)) {
      res.status(400).json({ error: 'Missing documents array' });
      return;
    }

    console.log(`📚 Bulk uploading ${documents.length} documents...`);

    const vectorStore = getVectorStore();
    const uploaded: string[] = [];

    for (const doc of documents) {
      if (!doc.title || !doc.content) {
        console.warn(`⚠️  Skipping invalid document: ${doc.title || 'untitled'}`);
        continue;
      }

      const docId = uuidv4();
      await vectorStore.add(
        doc.content,
        {
          title: doc.title,
          category: doc.category || 'general',
          source: doc.source || 'bulk-upload',
          uploaded_by: userId,
          uploaded_at: new Date().toISOString(),
        },
        'knowledge-base',
        'shared',
        docId
      );

      uploaded.push(docId);
      console.log(`  ✅ ${doc.title}`);
    }

    console.log(`✅ Bulk upload complete: ${uploaded.length}/${documents.length}`);

    res.json({
      uploaded: uploaded.length,
      total: documents.length,
      ids: uploaded,
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({
      error: 'Failed to bulk upload',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

