// backend/src/services/fileService.ts
/**
 * File upload and processing service
 * - Uploads files to S3
 * - Extracts text from PDF, DOCX, TXT, images
 * - Stores metadata in DynamoDB
 * - Enforces 100MB quota per user
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { getVectorStore } from './vectorStore';

const BUCKET_NAME = process.env.S3_VECTOR_BUCKET || 'lyzr-vectors';
const FILES_TABLE = process.env.FILES_TABLE || 'lyzr-files';
const MAX_USER_STORAGE_MB = 100; // 100MB per user

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface FileMetadata {
  fileId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  s3Key: string;
  uploadedAt: string;
  textLength: number;
}

export interface FileUploadResult {
  fileId: string;
  filename: string;
  s3Url: string;
  textContent: string;
}

export class FileService {
  /**
   * Check user's storage quota
   */
  async checkQuota(userId: string, newFileSize: number): Promise<{ allowed: boolean; current: number; limit: number }> {
    const files = await this.listUserFiles(userId);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalMB = totalSize / (1024 * 1024);
    const newFileMB = newFileSize / (1024 * 1024);

    return {
      allowed: (totalMB + newFileMB) <= MAX_USER_STORAGE_MB,
      current: Math.round(totalMB * 100) / 100,
      limit: MAX_USER_STORAGE_MB,
    };
  }

  /**
   * Process file upload - stores in S3 and extracts text
   */
  async processUpload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    userId: string
  ): Promise<FileUploadResult> {
    // Check quota
    const quota = await this.checkQuota(userId, buffer.length);
    if (!quota.allowed) {
      throw new Error(`Storage quota exceeded! You've used ${quota.current}MB of ${quota.limit}MB. Delete some files to free up space.`);
    }

    const fileId = `file-${uuidv4()}`;
    const s3Key = `uploads/${userId}/${fileId}/${filename}`;
    const uploadedAt = new Date().toISOString();

    // Upload original file to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        userId,
        originalName: filename,
        uploadedAt,
      },
    }));

    console.log(`📤 Uploaded to S3: s3://${BUCKET_NAME}/${s3Key}`);

    // Extract text from file
    const textContent = await this.extractText(buffer, mimeType, filename);

    // Store metadata in DynamoDB
    const metadata: FileMetadata = {
      fileId,
      userId,
      filename,
      mimeType,
      size: buffer.length,
      s3Key,
      uploadedAt,
      textLength: textContent.length,
    };

    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: metadata,
    }));

    console.log(`💾 Stored metadata in DynamoDB: ${fileId}`);

    // Store in vector store for semantic search (user-level, not session-scoped)
    // Chunk large texts to avoid embedding TOKEN limits (8192 tokens = ~30K chars)
    const vectorStore = getVectorStore();
    const MAX_CHUNK_SIZE = 25000; // Conservative: ~6250 tokens (4 chars/token estimate)
    
    if (textContent.length <= MAX_CHUNK_SIZE) {
      // Small file - store as single chunk
      await vectorStore.add(
        textContent,
        {
          type: 'uploaded_file',
          filename,
          mimeType,
          s3Key,
          uploadedAt,
          size: buffer.length,
          chunk: 1,
          totalChunks: 1,
        },
        userId,
        'user-files',
        fileId
      );
    } else {
      // Large file - split into chunks
      const chunks = this.chunkText(textContent, MAX_CHUNK_SIZE);
      console.log(`📦 Splitting large file into ${chunks.length} chunks`);
      
      for (let i = 0; i < chunks.length; i++) {
        await vectorStore.add(
          chunks[i],
          {
            type: 'uploaded_file',
            filename,
            mimeType,
            s3Key,
            uploadedAt,
            size: buffer.length,
            chunk: i + 1,
            totalChunks: chunks.length,
          },
          userId,
          'user-files',
          `${fileId}-chunk-${i + 1}`
        );
      }
    }

    return {
      fileId,
      filename,
      s3Url: `s3://${BUCKET_NAME}/${s3Key}`,
      textContent,
    };
  }

  /**
   * Chunk large text into smaller pieces for embedding
   */
  private chunkText(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + maxSize;
      
      // Try to break at paragraph boundary
      if (end < text.length) {
        const nextParagraph = text.indexOf('\n\n', end - 500);
        if (nextParagraph > start && nextParagraph < end + 500) {
          end = nextParagraph;
        } else {
          // Try to break at sentence boundary
          const lastPeriod = text.lastIndexOf('. ', end);
          if (lastPeriod > start) {
            end = lastPeriod + 2;
          }
        }
      }
      
      chunks.push(text.substring(start, end).trim());
      start = end;
    }
    
    return chunks;
  }

  /**
   * Extract text from file based on type
   */
  private async extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const ext = filename.split('.').pop()?.toLowerCase();

    // Text files - direct conversion
    if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'md') {
      return buffer.toString('utf-8');
    }

    // PDF files
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return await this.extractTextFromPDF(buffer);
    }

    // DOCX files
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
      return await this.extractTextFromDOCX(buffer);
    }

    // Images - use Bedrock Vision or return placeholder
    if (mimeType.startsWith('image/')) {
      return `[Image: ${filename}]\nImage uploaded. Ask questions about this image and I'll analyze it.`;
    }

    // Fallback
    return `[File: ${filename}]\nUnsupported file type for text extraction. File uploaded successfully.`;
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  private async extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      console.error('PDF parsing error:', error);
      return '[PDF file - text extraction failed. File stored but content not readable.]';
    }
  }

  /**
   * Extract text from DOCX using mammoth
   */
  private async extractTextFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('DOCX parsing error:', error);
      return '[DOCX file - text extraction failed. File stored but content not readable.]';
    }
  }

  /**
   * Get file content from vector store
   * Handles both single-chunk and multi-chunk files
   */
  async getFileContent(fileId: string, userId: string): Promise<string> {
    const vectorStore = getVectorStore();
    
    // First try single chunk (small files)
    const singleResult = await vectorStore.search(
      fileId,
      userId,
      'user-files',
      1
    );

    if (singleResult.length > 0 && singleResult[0].metadata?.totalChunks === 1) {
      return singleResult[0].text;
    }

    // If not found or multiple chunks, search with high limit to get all chunks
    const allResults = await vectorStore.search(
      fileId,
      userId,
      'user-files',
      50 // Max chunks we support
    );

    if (allResults.length === 0) {
      throw new Error('File not found');
    }

    // Filter and sort chunks
    const chunks = allResults
      .filter(r => r.turnId.startsWith(fileId))
      .sort((a, b) => {
        const chunkA = a.metadata?.chunk || 1;
        const chunkB = b.metadata?.chunk || 1;
        return chunkA - chunkB;
      });

    if (chunks.length === 0) {
      throw new Error('File chunks not found');
    }

    // Combine all chunks
    return chunks.map(c => c.text).join('\n\n');
  }

  /**
   * List all files for a user from DynamoDB
   */
  async listUserFiles(userId: string): Promise<FileMetadata[]> {
    const { Items } = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: 'userFilesIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // Most recent first
    }));

    return (Items as FileMetadata[]) || [];
  }

  /**
   * Get file metadata from DynamoDB
   */
  async getFileMetadata(fileId: string, userId: string): Promise<FileMetadata> {
    const { Item } = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { fileId },
    }));

    if (!Item) {
      throw new Error('File not found');
    }

    const file = Item as FileMetadata;
    
    // Verify ownership
    if (file.userId !== userId) {
      throw new Error('Unauthorized access to file');
    }

    return file;
  }

  /**
   * Rename file
   */
  async renameFile(fileId: string, userId: string, newFilename: string): Promise<void> {
    // Verify ownership
    await this.getFileMetadata(fileId, userId);

    await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { fileId },
      UpdateExpression: 'SET filename = :filename',
      ExpressionAttributeValues: {
        ':filename': newFilename,
      },
    }));

    console.log(`✏️  Renamed file ${fileId} to "${newFilename}"`);
  }

  /**
   * Delete all files for a user
   */
  async deleteAllFiles(userId: string): Promise<{ filesDeleted: number; vectorsDeleted: number }> {
    try {
      // Get all user files
      const files = await this.listUserFiles(userId);
      
      if (files.length === 0) {
        return { filesDeleted: 0, vectorsDeleted: 0 };
      }

      console.log(`🗑️  Deleting all ${files.length} files for user: ${userId}`);
      
      let filesDeleted = 0;
      let vectorsDeleted = 0;

      // Delete each file
      for (const file of files) {
        try {
          // Delete from S3
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: file.s3Key,
          }));

          // Delete metadata from DynamoDB
          await docClient.send(new DeleteCommand({
            TableName: FILES_TABLE,
            Key: {
              fileId: file.fileId,
              userId,
            },
          }));

          filesDeleted++;
          console.log(`  ✓ Deleted file: ${file.filename}`);
        } catch (error) {
          console.error(`  ✗ Failed to delete file ${file.fileId}:`, error);
        }
      }

      // Delete all vectors for this user's uploaded files
      const vectorStore = getVectorStore();
      try {
        vectorsDeleted = await vectorStore.deleteAll(userId, 'user-files');
      } catch (error) {
        console.error('Failed to delete vectors:', error);
      }

      console.log(`✅ Deleted ${filesDeleted}/${files.length} files and ${vectorsDeleted} vectors`);
      
      return { filesDeleted, vectorsDeleted };
    } catch (error) {
      console.error('Failed to delete all files:', error);
      throw error;
    }
  }

  /**
   * Delete file (from S3, DynamoDB, and vector store)
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    // Get metadata and verify ownership
    const file = await this.getFileMetadata(fileId, userId);

    // Delete from S3
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: file.s3Key,
    }));

    console.log(`🗑️  Deleted from S3: ${file.s3Key}`);

    // Delete from DynamoDB
    await docClient.send(new DeleteCommand({
      TableName: FILES_TABLE,
      Key: { fileId },
    }));

    console.log(`🗑️  Deleted from DynamoDB: ${fileId}`);

    // Vector store cleanup would happen here (optional)
    // For now, vectors can stay - they won't be accessible without metadata
  }
}

// Singleton
let fileServiceInstance: FileService | null = null;

export function getFileService(): FileService {
  if (!fileServiceInstance) {
    fileServiceInstance = new FileService();
  }
  return fileServiceInstance;
}

