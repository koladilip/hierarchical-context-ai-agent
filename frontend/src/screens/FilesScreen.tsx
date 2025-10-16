// frontend/src/screens/FilesScreen.tsx
/**
 * File library management screen
 * - Upload files
 * - View all files
 * - Rename/delete files
 * - See storage quota
 * - Copy @file-name for chat
 */
import { useState, useEffect, useRef } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { API_ENDPOINT } from '../aws-config';
import './FilesScreen.css';

interface FileItem {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  textLength: number;
}

interface Quota {
  used_mb: number;
  limit_mb: number;
  usage_percent: number;
}

export default function FilesScreen() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || '';
  };

  const loadFiles = async () => {
    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      const response = await axios.get(`${API_ENDPOINT}/api/v1/upload`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      setFiles(response.data.files || []);
      setQuota(response.data.quota || null);
    } catch (err: any) {
      console.error('Failed to load files:', err);
      setError(err.response?.data?.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      
      for (const file of Array.from(selectedFiles)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post(
          `${API_ENDPOINT}/api/v1/upload`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        console.log(`✅ Uploaded: ${response.data.filename}`);
      }

      await loadFiles(); // Refresh list
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.response?.data?.message || 'Failed to upload file');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRename = async (fileId: string) => {
    if (!editName.trim()) return;

    try {
      const token = await getAuthToken();
      await axios.patch(
        `${API_ENDPOINT}/api/v1/upload/${fileId}`,
        { filename: editName },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      setEditingId(null);
      setEditName('');
      await loadFiles();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to rename file');
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;

    try {
      const token = await getAuthToken();
      await axios.delete(`${API_ENDPOINT}/api/v1/upload/${fileId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      await loadFiles();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete file');
    }
  };

  const handleDeleteAll = async () => {
    if (files.length === 0) {
      alert('No files to delete');
      return;
    }

    if (!confirm(`Delete ALL ${files.length} files? This cannot be undone.`)) {
      return;
    }

    // Double confirmation for safety
    if (!confirm('Are you absolutely sure? This will permanently delete all uploaded files and their data.')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      const response = await axios.delete(`${API_ENDPOINT}/api/v1/upload`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      console.log(`Deleted ${response.data.files_deleted} files and ${response.data.vectors_deleted} vectors`);
      alert(`Successfully deleted ${response.data.files_deleted} files`);
      await loadFiles();
    } catch (err: any) {
      console.error('Failed to delete all files:', err);
      setError(err.response?.data?.message || 'Failed to delete all files');
    } finally {
      setLoading(false);
    }
  };

  const copyMention = (filename: string) => {
    const mention = `@${filename}`;
    navigator.clipboard.writeText(mention);
    alert(`Copied: ${mention}\n\nPaste in chat to reference this file!`);
  };

  const startEdit = (file: FileItem) => {
    setEditingId(file.fileId);
    setEditName(file.filename);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.startsWith('text/')) return '📃';
    return '📎';
  };

  return (
    <div className="files-screen">
      <div className="files-header">
        <h2>📁 File Library</h2>
        <p className="subtitle">Permanent storage - Use across all chats with @filename</p>
      </div>

      {/* Quota Display */}
      {quota && (
        <div className="quota-card">
          <div className="quota-info">
            <span className="quota-label">Storage Used:</span>
            <span className="quota-value">{quota.used_mb}MB / {quota.limit_mb}MB</span>
          </div>
          <div className="quota-bar">
            <div 
              className="quota-fill" 
              style={{ 
                width: `${quota.usage_percent}%`,
                background: quota.usage_percent > 90 ? '#f44336' : quota.usage_percent > 70 ? '#ff9800' : '#4caf50',
              }}
            />
          </div>
          <div className="quota-stats">
            <span>{files.length} files</span>
            <span>{quota.usage_percent}% used</span>
          </div>
        </div>
      )}

      {/* Upload Button */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          style={{ display: 'none' }}
          multiple
          accept=".txt,.pdf,.docx,.md,.png,.jpg,.jpeg,.webp"
        />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', height: '44px' }}>
          <button
            className="upload-btn-large"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || (quota?.usage_percent ?? 0) >= 100}
          >
            📤 Upload Files
          </button>
          {files.length > 0 && (
            <button
              className="delete-all-btn"
              onClick={handleDeleteAll}
              disabled={loading}
              title="Delete all files"
            >
              🗑️ Delete All Files
            </button>
          )}
          <span className="upload-hint">
            Supports: PDF, DOCX, TXT, MD, Images (10MB max per file)
          </span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Files List */}
      <div className="files-list">
        {loading && files.length === 0 && <div className="loading">Loading files...</div>}
        
        {files.length === 0 && !loading && (
          <div className="empty-state">
            <p>📭 No files uploaded yet</p>
            <p className="hint">Upload files to ask questions across all your chats!</p>
          </div>
        )}

        {files.map(file => (
          <div key={file.fileId} className="file-card">
            <div className="file-icon-large">{getFileIcon(file.mimeType)}</div>
            
            <div className="file-details">
              {editingId === file.fileId ? (
                <div className="edit-name">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRename(file.fileId)}
                    autoFocus
                  />
                  <button onClick={() => handleRename(file.fileId)}>✓</button>
                  <button onClick={() => setEditingId(null)}>×</button>
                </div>
              ) : (
                <h3 className="file-name">{file.filename}</h3>
              )}
              
              <div className="file-meta">
                <span>{formatSize(file.size)}</span>
                <span>•</span>
                <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                <span>•</span>
                <span>{file.textLength.toLocaleString()} chars extracted</span>
              </div>
            </div>

            <div className="file-actions">
              <button
                onClick={() => copyMention(file.filename)}
                className="action-btn"
                title="Copy @mention for chat"
              >
                @
              </button>
              <button
                onClick={() => startEdit(file)}
                className="action-btn"
                title="Rename file"
              >
                ✏️
              </button>
              <button
                onClick={() => handleDelete(file.fileId, file.filename)}
                className="action-btn delete"
                title="Delete file"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Usage Instructions */}
      <div className="help-section">
        <h3>💡 How to Use Files in Chat</h3>
        <div className="help-item">
          <strong>1. Upload:</strong> Click "Upload Files" above
        </div>
        <div className="help-item">
          <strong>2. Reference in chat:</strong> Type <code>@filename</code>
        </div>
        <div className="help-example">
          Example: "Summarize @report.pdf" or "Compare @doc1 and @doc2"
        </div>
        <div className="help-item">
          <strong>3. Works across all chats:</strong> Upload once, use everywhere!
        </div>
      </div>
    </div>
  );
}

