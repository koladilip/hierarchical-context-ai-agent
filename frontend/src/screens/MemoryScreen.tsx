// frontend/src/screens/MemoryScreen.tsx
import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { API_ENDPOINT } from '../aws-config';
import './MemoryScreen.css';

interface MemoryScreenProps {
  user: any;
}

interface Memory {
  id: string;
  content: string;
  category: string;
  timestamp: string;
}

export default function MemoryScreen({ }: MemoryScreenProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMemories();
  }, []);

  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || '';
  };

  const loadMemories = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const response = await axios.get(
        `${API_ENDPOINT}/api/v1/memories`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      setMemories(response.data.memories || []);
      console.log('Loaded memories:', response.data);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteMemory = async (memoryId: string) => {
    if (!confirm('Delete this memory? This cannot be undone.')) {
      return;
    }
    
    try {
      const token = await getAuthToken();
      await axios.delete(
        `${API_ENDPOINT}/api/v1/memories/${memoryId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      // Remove from local state
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (error) {
      console.error('Failed to delete memory:', error);
      alert('Failed to delete memory');
    }
  };

  const deleteAllMemories = async () => {
    if (memories.length === 0) {
      alert('No memories to delete');
      return;
    }

    if (!confirm(`Delete ALL ${memories.length} memories? This cannot be undone.`)) {
      return;
    }

    // Double confirmation for safety
    if (!confirm('Are you absolutely sure? This will permanently delete all your stored preferences.')) {
      return;
    }

    setLoading(true);
    try {
      const token = await getAuthToken();
      const response = await axios.delete(
        `${API_ENDPOINT}/api/v1/memories`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      console.log(`Deleted ${response.data.deleted_count} memories`);
      setMemories([]);
      alert(`Successfully deleted ${response.data.deleted_count} memories`);
    } catch (error) {
      console.error('Failed to delete all memories:', error);
      alert('Failed to delete all memories');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      dietary: '#10b981',
      communication: '#3b82f6',
      personal: '#8b5cf6',
      professional: '#f59e0b',
      health: '#ef4444',
      interests: '#ec4899',
      location: '#14b8a6',
      other: '#6b7280',
    };
    return colors[category] || colors.other;
  };

  return (
    <div className="memory-screen">
      <div className="memory-header">
        <div>
          <h2>Your Persistent Memories</h2>
          <p style={{ color: '#666', marginTop: '8px' }}>
            Preferences and information the AI remembers across all conversations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={loadMemories} className="refresh-btn" disabled={loading}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
          {memories.length > 0 && (
            <button 
              onClick={deleteAllMemories} 
              className="delete-all-btn" 
              disabled={loading}
              title="Delete all memories"
            >
              🗑️ Delete All
            </button>
          )}
        </div>
      </div>

      <div className="memory-info">
        <div className="info-card">
          <h4>💡 How It Works</h4>
          <ol>
            <li>Share preferences naturally: "I'm vegetarian"</li>
            <li>AI automatically stores important info using <code>remember_preference</code> tool</li>
            <li>Preferences are available in <strong>all future chats</strong></li>
            <li>Only <strong>relevant</strong> memories loaded per conversation (semantic search)</li>
          </ol>
        </div>
      </div>

      {loading && memories.length === 0 ? (
        <div className="loading-state">
          <p>Loading memories...</p>
        </div>
      ) : memories.length === 0 ? (
        <div className="empty-state">
          <p>🌟 No memories stored yet</p>
          <p style={{ color: '#666', fontSize: '14px' }}>
            Start a conversation and share your preferences. The AI will automatically remember important details!
          </p>
          <div style={{ marginTop: '20px', padding: '16px', background: '#f3f4f6', borderRadius: '8px' }}>
            <strong>Examples to try:</strong>
            <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
              <li>"I'm vegetarian and allergic to peanuts"</li>
              <li>"I prefer concise answers without long explanations"</li>
              <li>"I work as a software engineer at a startup"</li>
              <li>"I live in New York City"</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="memories-grid">
          {memories.map((memory) => (
            <div key={memory.id} className="memory-card">
              <div className="memory-header-row">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span 
                    className="memory-category"
                    style={{ background: getCategoryColor(memory.category) }}
                  >
                    {memory.category}
                  </span>
                  <span className="memory-date">
                    {new Date(memory.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="delete-memory-btn"
                  onClick={() => deleteMemory(memory.id)}
                  title="Delete memory"
                >
                  🗑️
                </button>
              </div>
              <div className="memory-content">
                {memory.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="memory-stats">
        <p>📊 Total memories: <strong>{memories.length}</strong></p>
        {memories.length > 0 && (
          <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
            These are automatically loaded into relevant conversations using semantic search
          </p>
        )}
      </div>
    </div>
  );
}
