# Frontend Application

**React 19 + TypeScript single-page application for the Lyzr Agent**

Modern, responsive UI for managing AI conversations with real-time context tracking, file management, and memory visualization.

---

## 🏗️ Architecture

### Technology Stack

- **Framework**: React 19
- **Language**: TypeScript
- **Build Tool**: Vite 5
- **Authentication**: AWS Amplify UI + Cognito
- **HTTP Client**: Axios
- **Routing**: React Router DOM v6
- **Styling**: CSS (custom, no framework)
- **Deployment**: S3 + CloudFront

### Application Structure

```
frontend/
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Root component with routing
│   ├── App.css                  # Global styles
│   │
│   ├── aws-config.ts            # AWS Amplify configuration
│   │
│   ├── components/              # Reusable UI components
│   │   ├── Header.tsx           # Top navigation bar
│   │   └── Header.css
│   │
│   ├── screens/                 # Main application screens
│   │   ├── ChatScreen.tsx       # Chat interface
│   │   ├── ChatScreen.css
│   │   ├── FilesScreen.tsx      # File management
│   │   ├── FilesScreen.css
│   │   ├── MemoryScreen.tsx     # User memories
│   │   └── MemoryScreen.css
│   │
│   └── index.css                # Base styles and resets
│
├── public/
│   ├── assets/
│   │   └── lyzr-logo.png
│   └── vite.svg
│
├── build/                       # Production build output
├── index.html                   # HTML template
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript config
└── package.json
```

---

## 🎨 Screens & Components

### 1. ChatScreen (`screens/ChatScreen.tsx`)

**Purpose**: Main conversation interface with AI agent.

**Features**:
- Message input with multiline support (Shift+Enter)
- Message history display (user vs assistant)
- System event notifications (tool calls, summarization)
- Real-time context statistics panel
- Session management (create, switch, delete)
- File mention autocomplete (`@filename`)

**UI Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Header (User, Token, Navigation)                       │
├────────────────┬────────────────────────────────────────┤
│  Sidebar       │  Chat Area                             │
│  - New Chat    │  ┌──────────────────────────────────┐  │
│  - Session 1   │  │ User: What's the budget?         │  │
│  - Session 2   │  │ AI: The budget is $50,000        │  │
│  - Session 3   │  │ [Tool: Calculator]               │  │
│                │  └──────────────────────────────────┘  │
│                │                                         │
│                │  ┌──────────────────────────────────┐  │
│                │  │ Type message here...             │  │
│                │  └──────────────────────────────────┘  │
├────────────────┴────────────────────────────────────────┤
│  Context Stats                                          │
│  Turns: 12 | Tokens: 3,456 | Usage: 16% | ✅ Summarized│
└─────────────────────────────────────────────────────────┘
```

**State Management**:
```typescript
const [sessions, setSessions] = useState<Session[]>([]);
const [currentSessionId, setCurrentSessionId] = useState<string>('');
const [messages, setMessages] = useState<Message[]>([]);
const [inputMessage, setInputMessage] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [contextStats, setContextStats] = useState<ContextStats>({});
```

**Key Functions**:
```typescript
// Send message to API
const sendMessage = async () => {
  const response = await axios.post('/api/v1/chat', {
    message: inputMessage,
    sessionId: currentSessionId
  });
  
  setMessages([...messages, response.data]);
  setContextStats(response.data.context_stats);
};

// Load session history
const loadSession = async (sessionId: string) => {
  const response = await axios.get(`/api/v1/sessions/${sessionId}`);
  setMessages(response.data.messages);
  setCurrentSessionId(sessionId);
};

// Create new session
const createNewSession = async () => {
  const response = await axios.post('/api/v1/sessions', {
    title: 'New Chat'
  });
  setCurrentSessionId(response.data.sessionId);
  setSessions([...sessions, response.data]);
};
```

**File Mention Autocomplete**:
```typescript
// Detect @ symbol and show file suggestions
const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const value = e.target.value;
  const lastWord = value.split(/\s/).pop() || '';
  
  if (lastWord.startsWith('@')) {
    const query = lastWord.slice(1);
    const suggestions = files.filter(f => 
      f.fileName.toLowerCase().includes(query.toLowerCase())
    );
    setFileAutocomplete(suggestions);
  } else {
    setFileAutocomplete([]);
  }
};
```

### 2. FilesScreen (`screens/FilesScreen.tsx`)

**Purpose**: Manage uploaded files and view storage quota.

**Features**:
- File upload (drag & drop + click)
- File list with metadata (name, size, date)
- Text content preview
- File deletion
- Storage quota visualization (100MB limit)

**UI Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Header (User, Token, Navigation)                       │
├─────────────────────────────────────────────────────────┤
│  Files Management                                       │
│                                                          │
│  Storage: ████████░░ 78.5 MB / 100 MB                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  📁 Upload File (Click or Drag & Drop)           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Your Files:                                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 📄 requirements.pdf                              │  │
│  │ 1.2 MB • Oct 16, 2025                           │  │
│  │ [View Content] [Delete]                          │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 📄 budget.docx                                   │  │
│  │ 456 KB • Oct 15, 2025                           │  │
│  │ [View Content] [Delete]                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**File Upload**:
```typescript
const handleFileUpload = async (file: File) => {
  if (file.size > 10 * 1024 * 1024) {
    alert('File too large (max 10MB)');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post('/api/v1/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  
  setFiles([...files, response.data.file]);
  fetchTotalStorage();
};
```

**Drag & Drop**:
```typescript
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const droppedFiles = Array.from(e.dataTransfer.files);
  droppedFiles.forEach(file => handleFileUpload(file));
};
```

### 3. MemoryScreen (`screens/MemoryScreen.tsx`)

**Purpose**: View and manage AI-extracted user memories.

**Features**:
- List of all user memories
- Source indicator (explicit `!remember` vs AI auto-detected)
- Memory deletion
- Empty state with helpful instructions

**UI Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Header (User, Token, Navigation)                       │
├─────────────────────────────────────────────────────────┤
│  Your Memories                                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🧠 I prefer TypeScript over JavaScript           │  │
│  │ Source: Auto-detected • Oct 16, 2025            │  │
│  │ [Delete]                                          │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🧠 I like mathematics and science                │  │
│  │ Source: Explicit • Oct 15, 2025                 │  │
│  │ [Delete]                                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Load Memories**:
```typescript
const loadMemories = async () => {
  const response = await axios.get('/api/v1/memories');
  setMemories(response.data.memories);
};

const deleteMemory = async (memoryId: string) => {
  await axios.delete(`/api/v1/memories/${memoryId}`);
  setMemories(memories.filter(m => m.id !== memoryId));
};
```

### 4. Header Component (`components/Header.tsx`)

**Purpose**: Top navigation bar with user info and actions.

**Features**:
- User email display
- API token button (copy JWT)
- Navigation links (Chat, Files, Memories)
- Sign out button

**UI Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Lyzr Agent    [Chat] [Files] [Memories]             │
│                                                          │
│                          user@email.com  [🔑 Token] [⏏]│
└─────────────────────────────────────────────────────────┘
```

**Get API Token**:
```typescript
const copyToken = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  
  if (token) {
    await navigator.clipboard.writeText(token);
    alert('Token copied to clipboard!');
  }
};
```

---

## 🔐 Authentication

### AWS Amplify + Cognito

**Configuration** (`aws-config.ts`):
```typescript
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [window.location.origin],
          redirectSignOut: [window.location.origin],
          responseType: 'code'
        },
        email: true
      }
    }
  }
});
```

**Login UI** (`App.tsx`):
```typescript
import { Authenticator } from '@aws-amplify/ui-react';

export default function App() {
  return (
    <Authenticator>
      {({ user }) => (
        <Router>
          {/* App content */}
        </Router>
      )}
    </Authenticator>
  );
}
```

**Features**:
- Google OAuth sign-in
- Email/password sign-up
- Email verification
- Password reset
- Session persistence

---

## 🎨 Styling

### Design System

**Colors**:
```css
:root {
  --primary: #6366f1;        /* Indigo */
  --primary-dark: #4f46e5;
  --success: #10b981;        /* Green */
  --danger: #ef4444;         /* Red */
  --warning: #f59e0b;        /* Amber */
  
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-tertiary: #f3f4f6;
  
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;
  
  --border: #e5e7eb;
}
```

**Typography**:
```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
               'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.5rem; font-weight: 600; }
h3 { font-size: 1.25rem; font-weight: 600; }
```

**Components**:
```css
/* Button */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-dark);
}

/* Card */
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Message bubble */
.message {
  padding: 1rem;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
}

.message-user {
  background: var(--primary);
  color: white;
  margin-left: 20%;
}

.message-assistant {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  margin-right: 20%;
}
```

### Responsive Design

```css
/* Desktop first, mobile adjustments */
@media (max-width: 768px) {
  .sidebar {
    display: none; /* Hide on mobile */
  }
  
  .message-user,
  .message-assistant {
    margin-left: 0;
    margin-right: 0;
  }
  
  .header {
    flex-direction: column;
    gap: 0.5rem;
  }
}
```

---

## 🔄 State Management

### Local State (useState)

Used for component-specific state:
```typescript
// Chat input
const [inputMessage, setInputMessage] = useState('');

// Loading states
const [isLoading, setIsLoading] = useState(false);

// UI toggles
const [showSidebar, setShowSidebar] = useState(true);
```

### Shared State (Props)

Session data passed from parent:
```typescript
// App.tsx
const [sessions, setSessions] = useState<Session[]>([]);

// ChatScreen.tsx
<ChatScreen 
  sessions={sessions}
  onSessionCreate={(session) => setSessions([...sessions, session])}
/>
```

### Future: Context API

For global state (theme, user preferences):
```typescript
// Not yet implemented
const AppContext = createContext<AppState>({});
```

---

## 🌐 API Integration

### HTTP Client Setup

```typescript
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

// Configure base URL
const API_URL = import.meta.env.VITE_API_ENDPOINT || 
                'https://your-api-gateway-url.amazonaws.com';

axios.defaults.baseURL = API_URL;

// Add auth token to all requests
axios.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});
```

### API Calls

```typescript
// Chat
const sendMessage = async (message: string, sessionId: string) => {
  const response = await axios.post('/api/v1/chat', {
    message,
    sessionId
  });
  return response.data;
};

// Sessions
const createSession = async () => {
  const response = await axios.post('/api/v1/sessions', {
    title: 'New Chat'
  });
  return response.data;
};

const getSessions = async () => {
  const response = await axios.get('/api/v1/sessions');
  return response.data.sessions;
};

// Files
const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post('/api/v1/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

// Memories
const getMemories = async () => {
  const response = await axios.get('/api/v1/memories');
  return response.data.memories;
};
```

---

## 🚀 Development

### Local Development

```bash
# Install dependencies
npm install

# Start dev server (Vite)
npm run dev

# Runs at http://localhost:3000
```

**Environment Variables** (`.env.local`):
```bash
VITE_API_ENDPOINT=http://localhost:3001
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxx
VITE_COGNITO_CLIENT_ID=xxxxx
VITE_COGNITO_DOMAIN=lyzr-agent-xxxxx.auth.us-east-1.amazoncognito.com
```

### Hot Module Replacement

Vite provides instant updates:
- CSS changes: Instant reload
- Component changes: Fast refresh (preserves state)
- Config changes: Full reload

### Development Tips

1. **Mock Auth** (optional):
   ```typescript
   // Bypass auth for local testing
   if (import.meta.env.DEV) {
     axios.defaults.headers.common['Authorization'] = 'Bearer dev-token';
   }
   ```

2. **CORS**: Ensure backend allows `http://localhost:3000`

3. **Error Handling**:
   ```typescript
   try {
     const response = await axios.post('/api/v1/chat', data);
   } catch (error) {
     console.error('API Error:', error);
     alert('Something went wrong. Please try again.');
   }
   ```

---

## 📦 Build & Deployment

### Production Build

```bash
# Build static assets
npm run build

# Output: build/
#   - index.html
#   - assets/
#     - index-[hash].js
#     - index-[hash].css
```

**Build Optimizations**:
- Code splitting
- Tree shaking
- Minification
- CSS extraction
- Asset hashing

### Deploy to S3 + CloudFront

```bash
# Automated via script
npm run deploy

# Or manually:
aws s3 sync build/ s3://lyzr-app/ --delete
aws cloudfront create-invalidation \
  --distribution-id XXXXX \
  --paths "/*"
```

**Deployment Script** (`deploy-frontend.sh`):
```bash
#!/bin/bash

# Build
echo "Building frontend..."
npm run build

# Upload to S3
echo "Uploading to S3..."
aws s3 sync build/ s3://lyzr-app/ \
  --delete \
  --profile default

# Invalidate CloudFront cache
echo "Invalidating CloudFront..."
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name LyzrAgentStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text \
  --profile default)

aws cloudfront create-invalidation \
  --distribution-id $DIST_ID \
  --paths "/*" \
  --profile default

echo "Deployment complete!"
```

---

## 🧪 Testing

### Manual Testing Checklist

**Authentication**:
- [ ] Login with email/password
- [ ] Login with Google OAuth
- [ ] Sign up new user
- [ ] Sign out

**Chat**:
- [ ] Create new session
- [ ] Send message and get response
- [ ] Switch between sessions
- [ ] Delete session
- [ ] View context stats
- [ ] See system events (tool calls)

**Files**:
- [ ] Upload PDF file
- [ ] Upload DOCX file
- [ ] Upload TXT file
- [ ] View file content
- [ ] Delete file
- [ ] Check storage quota

**Memories**:
- [ ] View auto-detected memories
- [ ] Delete memory

**File Mentions**:
- [ ] Type `@` and see autocomplete
- [ ] Select file from suggestions
- [ ] Send message with file mention

### Future: Automated Tests

```typescript
// Not yet implemented
// Recommended: React Testing Library + Vitest

import { render, screen, fireEvent } from '@testing-library/react';
import ChatScreen from './ChatScreen';

test('sends message on submit', async () => {
  render(<ChatScreen />);
  
  const input = screen.getByPlaceholderText('Type your message...');
  const button = screen.getByText('Send');
  
  fireEvent.change(input, { target: { value: 'Hello' } });
  fireEvent.click(button);
  
  expect(await screen.findByText('Hello')).toBeInTheDocument();
});
```

---

## 🎯 Key Features

### Real-Time Context Stats

```typescript
interface ContextStats {
  total_turns: number;
  total_tokens: number;
  context_window_percent: number;
  summary_active: boolean;
  summary_tiers: {
    ancient: number;
    middle: number;
    recent: number;
  };
  structured_memory: {
    entities: number;
    facts: number;
    decisions: number;
    goals: number;
  };
}

// Display in UI
<div className="context-stats">
  <span>Turns: {stats.total_turns}</span>
  <span>Tokens: {stats.total_tokens.toLocaleString()}</span>
  <span>Usage: {stats.context_window_percent}%</span>
  {stats.summary_active && <span>✅ Summarized</span>}
</div>
```

### System Events

```typescript
interface SystemEvent {
  type: 'tool_use' | 'summarization' | 'error';
  message: string;
  details?: any;
}

// Display as special message bubbles
{systemEvents.map(event => (
  <div className={`system-event event-${event.type}`}>
    {event.message}
  </div>
))}
```

### File Autocomplete

Triggered when user types `@`:
```typescript
const [fileAutocomplete, setFileAutocomplete] = useState<File[]>([]);
const [autocompleteVisible, setAutocompleteVisible] = useState(false);

// Show suggestions
{autocompleteVisible && (
  <div className="autocomplete-dropdown">
    {fileAutocomplete.map(file => (
      <div 
        key={file.fileId}
        onClick={() => insertFile(file.fileName)}
        className="autocomplete-item"
      >
        📄 {file.fileName}
      </div>
    ))}
  </div>
)}
```

---

## 🐛 Common Issues

### 1. CORS Errors

**Symptom**: `Access-Control-Allow-Origin` error

**Solution**:
- Check backend CORS config includes frontend origin
- Verify API Gateway CORS settings
- Use correct CloudFront URL in production

### 2. Authentication Loop

**Symptom**: Keeps redirecting to login

**Solution**:
- Check Cognito callback URLs include your domain
- Verify `redirectSignIn` matches actual URL
- Clear cookies and retry

### 3. File Upload Fails

**Symptom**: Upload button doesn't work

**Solution**:
- Check file size (<10MB)
- Verify user hasn't exceeded 100MB quota
- Check network tab for actual error

### 4. Context Stats Not Updating

**Symptom**: Stats stuck at old values

**Solution**:
- Ensure API response includes `context_stats`
- Check state update logic
- Verify re-render on new message

---

## 📚 Further Reading

- [React 19 Docs](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)
- [AWS Amplify UI](https://ui.docs.amplify.aws/)
- [Backend API Docs](../backend/README.md)

---

**Built with**: React 19, TypeScript, Vite, AWS Amplify  
**Deployment**: S3 + CloudFront  
**Authentication**: AWS Cognito

