// backend/src/api/routes/upload.ts
/**
 * File upload endpoint
 * Supports: PDF, TXT, DOCX, MD, images
 */
import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';
import { getFileService } from '../../services/fileService';

export const uploadRouter = Router();

// Configure multer for file uploads (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/markdown',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(txt|md|pdf|docx|png|jpg|jpeg|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Get storage quota
uploadRouter.get('/quota', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const fileService = getFileService();
    
    const files = await fileService.listUserFiles(userId);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalMB = totalSize / (1024 * 1024);

    res.json({
      used_mb: Math.round(totalMB * 100) / 100,
      limit_mb: 100,
      usage_percent: Math.round((totalMB / 100) * 100),
      files_count: files.length,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get quota',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Upload file endpoint
uploadRouter.post('/', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const file = req.file;
    
    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    console.log(`📎 File upload: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const fileService = getFileService();
    
    // Upload to S3 and extract text
    const result = await fileService.processUpload(
      file.buffer,
      file.originalname,
      file.mimetype,
      userId
    );

    console.log(`✅ File processed: ${result.fileId}`);
    console.log(`   Text extracted: ${result.textContent.length} chars`);

    // Get updated quota
    const quota = await fileService.checkQuota(userId, 0);

    res.json({
      file_id: result.fileId,
      filename: result.filename,
      size: file.size,
      mime_type: file.mimetype,
      s3_url: result.s3Url,
      text_extracted: result.textContent.length,
      preview: result.textContent.substring(0, 200),
      quota: {
        used_mb: quota.current,
        limit_mb: quota.limit,
        usage_percent: Math.round((quota.current / quota.limit) * 100),
      },
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// List all user files
uploadRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    const fileService = getFileService();
    const files = await fileService.listUserFiles(userId);
    
    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalMB = totalSize / (1024 * 1024);

    res.json({
      files,
      count: files.length,
      quota: {
        used_mb: Math.round(totalMB * 100) / 100,
        limit_mb: 100,
        usage_percent: Math.round((totalMB / 100) * 100),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list files',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get file metadata
uploadRouter.get('/:fileId', async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.sub || 'anonymous';
    
    const fileService = getFileService();
    const metadata = await fileService.getFileMetadata(fileId, userId);
    
    res.json(metadata);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get file content
uploadRouter.get('/:fileId/content', async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.sub || 'anonymous';
    
    const fileService = getFileService();
    const content = await fileService.getFileContent(fileId, userId);
    
    res.json({
      file_id: fileId,
      content,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get file content',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Rename file
uploadRouter.patch('/:fileId', async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;
    const { filename } = req.body;
    const userId = req.user?.sub || 'anonymous';
    
    if (!filename) {
      res.status(400).json({ error: 'Missing filename' });
      return;
    }

    const fileService = getFileService();
    await fileService.renameFile(fileId, userId, filename);
    
    res.json({
      message: 'File renamed successfully',
      file_id: fileId,
      new_filename: filename,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to rename file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete all files
uploadRouter.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub || 'anonymous';
    
    console.log(`🗑️  Deleting ALL files for user: ${userId}`);
    
    const fileService = getFileService();
    const result = await fileService.deleteAllFiles(userId);
    
    res.json({
      message: 'All files deleted successfully',
      files_deleted: result.filesDeleted,
      vectors_deleted: result.vectorsDeleted,
    });
  } catch (error) {
    console.error('Failed to delete all files:', error);
    res.status(500).json({
      error: 'Failed to delete all files',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete file
uploadRouter.delete('/:fileId', async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.sub || 'anonymous';
    
    const fileService = getFileService();
    await fileService.deleteFile(fileId, userId);
    
    res.json({
      message: 'File deleted successfully',
      file_id: fileId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

