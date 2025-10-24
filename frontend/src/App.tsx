// frontend/src/App.tsx
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { awsConfig } from './aws-config';
import ChatScreen from './screens/ChatScreen';
import MemoryScreen from './screens/MemoryScreen';
import FilesScreen from './screens/FilesScreen';
import Header from './components/Header';
import './App.css';

// Configure Amplify
Amplify.configure(awsConfig);

function App() {
  return (
    <Authenticator
      loginMechanisms={['email']}
      signUpAttributes={['email']}
      socialProviders={['google']}
      components={{
        Header() {
          return (
            <div style={{
              textAlign: 'center',
              padding: '2rem 1rem 1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: '8px 8px 0 0',
            }}>
              <h1 style={{ 
                fontSize: '1.75rem', 
                fontWeight: 'bold', 
                margin: '0 0 0.5rem',
                letterSpacing: '-0.02em',
              }}>
                Large Context AI Agent
              </h1>
              <p style={{ 
                fontSize: '0.95rem', 
                margin: 0, 
                opacity: 0.95,
                fontWeight: '400',
              }}>
                Multi-turn agent with Intelligent Context Management
              </p>
            </div>
          );
        },
        Footer() {
          return (
            <div style={{
              textAlign: 'center',
              padding: '1.5rem 1rem',
              fontSize: '0.875rem',
              color: '#666',
              borderTop: '1px solid #eee',
              marginTop: '1rem',
            }}>
              <p style={{ margin: '0 0 0.75rem', lineHeight: '1.6' }}>
                ✨ <strong>Features:</strong> Unlimited conversation length • Auto-summarization • Tool calling • Persistent memories
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>
                Powered by AWS Bedrock (Amazon Nova) • Full-stack serverless architecture
              </p>
            </div>
          );
        },
      }}
    >
      {({ signOut, user }) => (
        <BrowserRouter>
          <div className="app">
            <Header user={user} signOut={signOut || (() => {})} />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/chat" element={<ChatScreen user={user} />} />
                <Route path="/memory" element={<MemoryScreen user={user} />} />
                <Route path="/files" element={<FilesScreen />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}

export default App;

