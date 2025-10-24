// frontend/src/components/Header.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import './Header.css';

interface HeaderProps {
  user: any;
  signOut?: (() => void) | ((data?: any) => void);
}

export default function Header({ user, signOut }: HeaderProps) {
  const [userEmail, setUserEmail] = useState<string>('');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [jwtToken, setJwtToken] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadUserEmail = async () => {
      try {
        // Get email from ID token claims (works for both OAuth and email/password)
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken;
        
        console.log('ID Token payload:', idToken?.payload);
        
        const email = idToken?.payload?.email as string;
        const name = idToken?.payload?.name as string;
        const username = user?.username;
        
        setUserEmail(email || name || username || 'User');
      } catch (error) {
        console.error('Error fetching user email:', error);
        setUserEmail(user?.username || 'User');
      }
    };

    if (user) {
      loadUserEmail();
    }
  }, [user]);

  const handleShowToken = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString() || '';
      setJwtToken(token);
      setShowTokenModal(true);
      setCopied(false);
    } catch (error) {
      console.error('Error fetching token:', error);
      alert('Failed to fetch token');
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(jwtToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <span style={{ verticalAlign: 'middle', fontWeight: 'bold' }}>AI Agent</span>
        </div>
        
        <nav className="nav">
          <Link to="/chat" className="nav-link">Chat</Link>
          <Link to="/files" className="nav-link">Files</Link>
          <Link to="/memory" className="nav-link">Memory</Link>
        </nav>
        
        <div className="user-section">
          <span className="user-email">{userEmail || user?.username || 'User'}</span>
          <button onClick={handleShowToken} className="token-btn" title="Get API Token">
            🔑 API Token
          </button>
          <button onClick={() => signOut?.()} className="sign-out-btn">
            Sign Out
          </button>
        </div>
      </div>

      {/* Token Modal */}
      {showTokenModal && (
        <div className="modal-overlay" onClick={() => setShowTokenModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔑 Your API Token (JWT)</h2>
              <button className="close-btn" onClick={() => setShowTokenModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '10px', color: '#666' }}>
                Use this token for API testing. Valid for 1 hour.
              </p>
              <div className="token-container">
                <pre className="token-text">{jwtToken}</pre>
              </div>
              <div className="modal-actions">
                <button onClick={handleCopyToken} className="copy-btn">
                  {copied ? '✅ Copied!' : '📋 Copy Token'}
                </button>
                <a 
                  href="/API_TESTING_GUIDE.md" 
                  target="_blank" 
                  className="guide-link"
                  style={{ marginLeft: '10px' }}
                >
                  📖 View API Guide
                </a>
              </div>
              <div style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>
                <strong>Quick Test:</strong>
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: '10px', 
                  borderRadius: '4px',
                  marginTop: '8px',
                  overflow: 'auto'
                }}>
{`curl -X POST "YOUR_API_URL/api/v1/sessions" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

