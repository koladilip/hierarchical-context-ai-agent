// frontend/src/screens/ChatScreen.tsx
import { useState, useEffect, useRef } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { API_ENDPOINT } from '../aws-config';
import './ChatScreen.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isSystemEvent?: boolean;
}

interface ContextStats {
  total_turns: number;
  total_tokens: number;
  has_summary: boolean;
  context_window_used: string;
  hot_context_turns: number;
  retrieved_context_turns: number;
  summary_present: boolean;
}

interface ChatScreenProps {
  user: any;
}

export default function ChatScreen({ }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [sessionTitle, setSessionTitle] = useState<string>('New Chat');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [contextStats, setContextStats] = useState<ContextStats | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{id: string; name: string; size: number}>>([]);
  const [allUserFiles, setAllUserFiles] = useState<Array<{fileId: string; filename: string}>>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSessions();
    loadUserFiles();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || '';
  };

  const loadSessions = async () => {
    try {
      const token = await getAuthToken();
      const response = await axios.get(
        `${API_ENDPOINT}/api/v1/sessions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      // Filter out empty sessions (extra safety check)
      const activeSessions = (response.data.sessions || []).filter((s: any) => s.message_count > 0);
      setSessions(activeSessions);
      
      // Auto-select most recent session if available
      if (activeSessions.length > 0) {
        const mostRecent = activeSessions[0];
        await selectSession(mostRecent.session_id);
      } else {
        // Don't create session until user sends first message
        setSessionId('');
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      // On error, just start with no session (will create on first message)
      setSessionId('');
      setMessages([]);
    }
  };

  const loadUserFiles = async () => {
    try {
      const token = await getAuthToken();
      const response = await axios.get(
        `${API_ENDPOINT}/api/v1/upload`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      setAllUserFiles(response.data.files || []);
    } catch (err) {
      console.error('Failed to load user files:', err);
    }
  };

  const createNewSession = async () => {
    // Don't create session in DB until first message is sent
    // Just reset UI state
    setSessionId('');
    setSessionTitle('New Chat');
    setMessages([]);
    setContextStats(null);
    setError('');
  };

  const selectSession = async (sessionId: string) => {
    setSessionId(sessionId);
    setMessages([]);
    setContextStats(null);
    setLoading(true);
    
    try {
      const token = await getAuthToken();
      
      // Load session details with messages
      const response = await axios.get(
        `${API_ENDPOINT}/api/v1/sessions/${sessionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      // Set session title
      setSessionTitle(response.data.title || 'New Chat');
      
      // Load messages into chat (including system events)
      const sessionMessages = response.data.messages || [];
      setMessages(sessionMessages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        isSystemEvent: m.role === 'system', // Mark system messages as events
      })));
      
      // Load context stats
      if (response.data.context_stats) {
        setContextStats(response.data.context_stats);
      }
      
      console.log(`Loaded ${sessionMessages.length} messages from session`);
      
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load session history');
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionIdToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the session
    
    if (!confirm('Delete this chat? This cannot be undone.')) {
      return;
    }
    
    try {
      const token = await getAuthToken();
      await axios.delete(
        `${API_ENDPOINT}/api/v1/sessions/${sessionIdToDelete}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      // Remove from local state
      setSessions(prev => prev.filter(s => s.session_id !== sessionIdToDelete));
      
      // If deleted current session, create new one
      if (sessionIdToDelete === sessionId) {
        createNewSession();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError('Failed to delete session');
    }
  };

  const deleteAllSessions = async () => {
    if (!confirm(`Delete all ${sessions.length} chats? This cannot be undone.`)) {
      return;
    }
    
    try {
      const token = await getAuthToken();
      await axios.delete(
        `${API_ENDPOINT}/api/v1/sessions/all/user`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      // Clear all sessions from local state
      setSessions([]);
      
      // Create new session
      createNewSession();
      
      console.log('✅ All chats deleted successfully');
    } catch (err) {
      console.error('Failed to delete all sessions:', err);
      setError('Failed to delete all sessions');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart || 0;
    
    setInput(value);
    setCursorPosition(cursor);

    // Detect @ mention
    const textBeforeCursor = value.substring(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Show autocomplete if @ is followed by word characters or nothing
      if (/^[\w\-\.]*$/.test(textAfterAt)) {
        setAutocompleteQuery(textAfterAt.toLowerCase());
        setShowAutocomplete(true);
        return;
      }
    }
    
    setShowAutocomplete(false);
  };

  const selectFile = (filename: string) => {
    // Find the @ position before cursor
    const textBeforeCursor = input.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const before = input.substring(0, lastAtIndex);
      const after = input.substring(cursorPosition);
      const newValue = `${before}@${filename} ${after}`;
      
      setInput(newValue);
      setShowAutocomplete(false);
      
      // Focus back on textarea
      setTimeout(() => {
        textareaRef.current?.focus();
        const newCursor = lastAtIndex + filename.length + 2;
        textareaRef.current?.setSelectionRange(newCursor, newCursor);
      }, 0);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      const uploadPromises = Array.from(files).map(async (file) => {
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

        return {
          id: response.data.file_id,
          name: response.data.filename,
          size: response.data.size,
        };
      });

      const uploadedFileData = await Promise.all(uploadPromises);
      setUploadedFiles(prev => [...prev, ...uploadedFileData]);
      
      // Reload user files list for autocomplete
      loadUserFiles();
      
      console.log(`✅ Uploaded ${uploadedFileData.length} file(s)`);
    } catch (err: any) {
      console.error('File upload error:', err);
      setError(err.response?.data?.message || 'Failed to upload file');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const sendMessage = async () => {
    if (!input.trim() && uploadedFiles.length === 0) return;

    // Lazy session creation - create session only when first message is sent
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        const token = await getAuthToken();
        const response = await axios.post(
          `${API_ENDPOINT}/api/v1/sessions`,
          { title: 'New Chat' },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );
        currentSessionId = response.data.session_id;
        setSessionId(currentSessionId);
      } catch (err) {
        setError('Failed to create session');
        return;
      }
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      const response = await axios.post(
        `${API_ENDPOINT}/api/v1/chat`,
        {
          session_id: currentSessionId,
          message: input,
          tools_enabled: true,
          file_ids: uploadedFiles.map(f => f.id), // Include uploaded files
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Add system events (tool calls, summarization) as special messages
      const systemEvents = response.data.system_events || [];
      const newMessages: Message[] = [];
      
      systemEvents.forEach((event: any) => {
        newMessages.push({
          role: 'system',
          content: event.message,
          timestamp: event.timestamp,
          isSystemEvent: true,
        });
      });
      
      // Add assistant response
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
      };
      newMessages.push(assistantMessage);

      setMessages((prev) => [...prev, ...newMessages]);
      
      // Update context stats if available
      if (response.data.context_stats) {
        setContextStats(response.data.context_stats);
        console.log('📊 Context Stats:', response.data.context_stats);
      }

      // Update session title if auto-generated
      if (response.data.title) {
        setSessionTitle(response.data.title);
      }
      
      // Update session in sidebar (title + message count)
      setSessions(prevSessions => 
        prevSessions.map(s => 
          s.session_id === currentSessionId 
            ? { 
                ...s, 
                message_count: (s.message_count || 0) + 2, // user + assistant
                title: response.data.title || s.title // Update title if auto-generated
              }
            : s
        )
      );

      // Refresh sessions list if this was first message (to add new session to list)
      if (messages.length === 0) {
        await loadSessions();
      }

      // Clear uploaded files after successful send
      setUploadedFiles([]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyConversation = () => {
    const conversationText = messages.map((msg) => {
      const time = new Date(msg.timestamp).toLocaleString();
      if (msg.isSystemEvent) {
        return `[SYSTEM] ${time}\n${msg.content}\n`;
      }
      const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      return `[${role}] ${time}\n${msg.content}\n`;
    }).join('\n---\n\n');

    const fullText = `Session: ${sessionTitle}\nSession ID: ${sessionId}\n\n${conversationText}`;

    navigator.clipboard.writeText(fullText)
      .then(() => alert('Conversation copied to clipboard!'))
      .catch(() => alert('Failed to copy conversation'));
  };

  const exportConversationJSON = () => {
    const exportData = {
      sessionId,
      sessionTitle,
      exportedAt: new Date().toISOString(),
      contextStats,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        isSystemEvent: msg.isSystemEvent || false,
      })),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-${sessionId || 'new'}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="chat-screen">
      {/* Sidebar with sessions */}
      {showSidebar && (
        <div className="chat-sidebar">
          <div className="sidebar-header">
            <h3>Chats</h3>
            <button onClick={() => setShowSidebar(false)} className="hide-sidebar-btn">←</button>
          </div>
          
          <button onClick={createNewSession} className="new-chat-btn">
            ➕ New Chat
          </button>
          
          {sessions.length > 0 && (
            <button onClick={deleteAllSessions} className="delete-all-btn" title="Delete all chats">
              🗑️ Delete All ({sessions.length})
            </button>
          )}
          
          <div className="sessions-list">
            {sessions.map(session => (
              <div
                key={session.session_id}
                className={`session-item ${session.session_id === sessionId ? 'active' : ''}`}
                onClick={() => selectSession(session.session_id)}
                title={session.title}
              >
                <div className="session-content">
                  <div className="session-title" title={session.title}>
                    {session.title}
                  </div>
                  <div className="session-meta">
                    {session.message_count} msgs
                    {session.has_summary && <span className="summary-badge" title="This conversation has been summarized">📝</span>}
                  </div>
                </div>
                <button
                  className="delete-session-btn"
                  onClick={(e) => deleteSession(session.session_id, e)}
                  title="Delete chat"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Main chat area */}
      <div className="chat-main">
        {!showSidebar && (
          <button onClick={() => setShowSidebar(true)} className="show-sidebar-btn">
            ☰
          </button>
        )}
        
        <div className="chat-header">
          <div className="chat-header-left">
            <h2>{sessionTitle}</h2>
            <div className="chat-metadata">
              {contextStats && (
                <>
                  <span className="meta-item" title="Total conversation turns (user + AI messages)">
                    💬 {contextStats.total_turns} turns
                  </span>
                  <span className="meta-item" title={`Total tokens consumed across all ${contextStats.total_turns} messages`}>
                    🔢 {contextStats.total_tokens.toLocaleString()} tokens
                  </span>
                  <span 
                    className="meta-item" 
                    title={`Context window usage: ${contextStats.context_window_used} of available capacity. Older messages are summarized when this approaches 60%.`}
                  >
                    📊 {contextStats.context_window_used}
                  </span>
                  {contextStats.summary_present && (
                    <span 
                      className="meta-item summary-active" 
                      title="Conversation has been summarized - older messages compressed while keeping recent messages in full. This enables unlimited conversation length!"
                    >
                      ✅ Summarized
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          {messages.length > 0 && (
            <div className="chat-header-actions">
              <button
                className="action-button"
                onClick={copyConversation}
                title="Copy conversation to clipboard"
              >
                📋 Copy
              </button>
              <button
                className="action-button"
                onClick={exportConversationJSON}
                title="Export conversation as JSON"
              >
                💾 Export
              </button>
            </div>
          )}
        </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>👋 Start a conversation!</p>
            <p>I can remember our entire conversation history using semantic search.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          if (msg.isSystemEvent) {
            return (
              <div key={idx} className="system-event">
                <div className="system-event-content">
                  {msg.content}
                </div>
                <span className="system-event-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            );
          }
          
          return (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="message-header">
                <strong>{msg.role === 'user' ? 'You' : 'AI Agent'}</strong>
                <span className="timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          );
        })}

        {loading && (
          <div className="message assistant">
            <div className="message-header">
              <strong>AI Agent</strong>
            </div>
            <div className="message-content">
              <span className="typing-indicator">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        {/* File attachments display */}
        {uploadedFiles.length > 0 && (
          <div className="file-attachments">
            {uploadedFiles.map(file => (
              <div key={file.id} className="file-chip">
                <span className="file-icon">📎</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">({(file.size / 1024).toFixed(1)}KB)</span>
                <button 
                  className="file-remove" 
                  onClick={() => removeFile(file.id)}
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="input-row">
          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            multiple
            accept=".txt,.pdf,.docx,.md,.png,.jpg,.jpeg,.webp"
          />
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Upload files (PDF, TXT, DOCX, images)"
          >
            📎
          </button>

          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="message-input"
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={uploadedFiles.length > 0 
                ? `Ask questions about ${uploadedFiles.length} attached file(s)... Type @ to mention files`
                : "Type your message... Type @ to mention files"}
              disabled={loading}
              rows={3}
            />
            
            {/* Autocomplete dropdown */}
            {showAutocomplete && allUserFiles.length > 0 && (
              <div className="autocomplete-dropdown">
                {allUserFiles
                  .filter(file => file.filename.toLowerCase().includes(autocompleteQuery))
                  .slice(0, 5)
                  .map(file => (
                    <div
                      key={file.fileId}
                      className="autocomplete-item"
                      onClick={() => selectFile(file.filename)}
                    >
                      <span className="autocomplete-icon">📎</span>
                      <span className="autocomplete-name">{file.filename}</span>
                    </div>
                  ))}
                {allUserFiles.filter(file => file.filename.toLowerCase().includes(autocompleteQuery)).length === 0 && (
                  <div className="autocomplete-item autocomplete-empty">
                    No files found
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="send-button"
            onClick={sendMessage}
            disabled={loading || (!input.trim() && uploadedFiles.length === 0)}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      <div className="chat-info">
        <div style={{ marginBottom: '10px' }}>
          <p>💡 Tip: This AI agent maintains context across all your messages using S3 Vectors</p>
          <p>Total messages: {messages.length}</p>
        </div>
        
        {contextStats && (
          <div style={{ 
            background: '#f5f5f5', 
            padding: '12px', 
            borderRadius: '8px',
            fontSize: '13px',
            marginTop: '10px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📊 Context Management Stats:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>Total Turns: {contextStats.total_turns}</div>
              <div>Total Tokens: {contextStats.total_tokens.toLocaleString()}</div>
              <div>Context Window: {contextStats.context_window_used}</div>
              <div>Hot Context: {contextStats.hot_context_turns} turns</div>
              <div>Retrieved Context: {contextStats.retrieved_context_turns} turns</div>
              <div style={{ 
                fontWeight: 'bold',
                color: contextStats.summary_present ? '#22c55e' : '#94a3b8'
              }}>
                {contextStats.summary_present ? '✅ Summary Active' : '⏸️ No Summary Yet'}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

