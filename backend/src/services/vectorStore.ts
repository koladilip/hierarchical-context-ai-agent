// src/memory/vectorStore.ts
/**
 * S3 Vectors for semantic search
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getEmbeddingsService } from './bedrock';

export interface SearchResult {
  text: string;
  metadata: Record<string, any>;
  score: number;
  turnId: string;
}

export class S3VectorStore {
  private s3: S3Client;
  private bucketName: string;
  private embeddings: ReturnType<typeof getEmbeddingsService>;

  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = process.env.S3_VECTOR_BUCKET || 'agent-vectors';
    this.embeddings = getEmbeddingsService();
    this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (error) {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucketName }));
      } catch (createError) {
        console.error('Failed to create bucket:', createError);
      }
    }
  }

  async add(
    text: string,
    metadata: Record<string, any>,
    userId: string,
    sessionId: string,
    turnId: string
  ): Promise<void> {
    try {
      // Generate embedding
      const embedding = await this.embeddings.embedText(text);

      // Create document
      const document = {
        text,
        embedding,
        metadata,
        userId,
        sessionId,
        turnId,
        timestamp: new Date().toISOString(),
      };

      // Store in S3
      const key = `vectors/${userId}/${sessionId}/${turnId}.json`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: JSON.stringify(document),
          ContentType: 'application/json',
          Metadata: {
            userId,
            sessionId,
            turnId,
            hasEmbedding: 'true',
          },
        })
      );
    } catch (error) {
      console.error('Failed to add to vector store:', error);
      throw error;
    }
  }

  async search(
    query: string,
    userId: string,
    sessionId: string,
    topK: number = 5
  ): Promise<SearchResult[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // List all vectors for this session
      const prefix = `vectors/${userId}/${sessionId}/`;
      const listResponse = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
        })
      );

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return [];
      }

      // Load and score each vector
      const results: SearchResult[] = [];

      for (const obj of listResponse.Contents) {
        if (!obj.Key) continue;

        try {
          const getResponse = await this.s3.send(
            new GetObjectCommand({
              Bucket: this.bucketName,
              Key: obj.Key,
            })
          );

          const body = await getResponse.Body?.transformToString();
          if (!body) continue;

          const document = JSON.parse(body);

          // Calculate cosine similarity
          const score = this.cosineSimilarity(queryEmbedding, document.embedding);

          results.push({
            text: document.text,
            metadata: document.metadata,
            score,
            turnId: document.turnId,
          });
        } catch (error) {
          console.error(`Failed to load vector ${obj.Key}:`, error);
        }
      }

      // Sort by score and return top k
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } catch (error) {
      console.error('Vector search error:', error);
      return [];
    }
  }

  /**
   * Delete all vectors for a specific user/session
   */
  async deleteAll(userId: string, sessionId: string): Promise<number> {
    try {
      const prefix = `vectors/${userId}/${sessionId}/`;
      
      // List all objects with this prefix
      const listResponse = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
        })
      );

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log(`No objects found for prefix: ${prefix}`);
        return 0;
      }

      // Delete all objects
      let deletedCount = 0;

      for (const obj of listResponse.Contents) {
        if (obj.Key) {
          await this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.bucketName,
              Key: obj.Key,
            })
          );
          deletedCount++;
        }
      }

      console.log(`🗑️  Deleted ${deletedCount} objects from ${prefix}`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to delete from vector store:', error);
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }
}

// Singleton instance
let vectorStoreInstance: S3VectorStore | null = null;

export function getVectorStore(): S3VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new S3VectorStore();
  }
  return vectorStoreInstance;
}

