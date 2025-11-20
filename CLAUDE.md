# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp Gateway is a full-stack web application that provides a REST API gateway for WhatsApp messaging using the Baileys library. It supports multiple concurrent WhatsApp sessions with both QR code and phone number (pairing code) authentication methods.

## 🎯 Core Development Principles

### ⚠️ CRITICAL: Separation of Concerns
This project follows **Single Responsibility Principle**. Every file has ONE specific purpose:

#### Why This Matters:
1. **Easy Debugging**: Bug in navbar? Check `Navbar.js` (not App.js with 800+ lines)
2. **Easy AI Communication**: "Edit Navbar.js to add menu" (specific & clear)
3. **Easy Maintenance**: Each component is isolated and testable
4. **Easy Scaling**: Add features without touching existing code

#### Rules to Follow:
- ✅ **One File = One Responsibility** - Don't mix unrelated logic
- ✅ **Component Isolation** - Each component in its own folder with its CSS
- ✅ **Clear Naming** - File name describes its content (`NewSessionModal.js` not `Modal.js`)
- ✅ **Proper Structure** - Follow the folder structure below

## 📏 Code Quality Principles

### KISS (Keep It Simple, Stupid)

**Rule**: Choose the simplest solution that solves the current problem. Add complexity ONLY when absolutely needed.

**File Size Limits (Hard Rules):**
- `server.js`: MAX 100 lines (currently 88 lines ✅)
- Controllers: MAX 150 lines per file
- Services: MAX 200 lines per file
- React Components: MAX 250 lines per file
- If exceeding limit → Split into smaller files

**When to Use Simple vs Complex:**
- Functions < 20 lines → Use simple function
- Functions > 20 lines → Consider breaking down
- 1-3 similar operations → Keep inline
- 4+ similar operations → Extract to function/component

**❌ BAD Example (Over-Engineered):**
```javascript
// Don't do this for simple session display
class SessionManager {
  constructor(sessions) {
    this.sessions = sessions;
    this.filters = new FilterEngine();
    this.sorter = new SortingStrategy();
    this.renderer = new SessionRenderer();
  }

  applyFilters(criteria) {
    return this.filters.apply(this.sessions, criteria);
  }

  renderSessions() {
    const filtered = this.applyFilters(this.criteria);
    const sorted = this.sorter.sort(filtered);
    return this.renderer.render(sorted);
  }
}
```

**✅ GOOD Example (Simple & Clear):**
```javascript
// Just filter and map - simple and works
function SessionList({ sessions, folderId }) {
  const filteredSessions = folderId
    ? sessions.filter(s => s.folderId === folderId)
    : sessions;

  return filteredSessions.map(session => (
    <SessionCard key={session.id} session={session} />
  ));
}
```

**Decision Criteria:**
- Will this be used in 3+ places? → Extract it
- Is the logic complex? → Keep it simple first, refactor if needed
- Can a junior dev understand it in 30 seconds? → Good sign

---

### YAGNI (You Aren't Gonna Need It)

**Rule**: Only build features that are needed RIGHT NOW. Don't add "future-proof" features based on assumptions.

**Trigger Points for Adding Complexity:**
- Pagination: Add when >50 items, not at 3 items
- Search: Add when >20 items, not at 5 items
- Database: Add when persistence needed, not "just in case"
- Caching: Add when performance issue measured, not assumed

**❌ BAD Example (Building Too Early):**
```javascript
// Don't add pagination for 3 sessions
function Dashboard({ sessions }) {
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const paginatedSessions = useMemo(() => {
    const sorted = sortSessions(sessions, sortBy, sortOrder);
    return paginate(sorted, page, itemsPerPage);
  }, [sessions, page, itemsPerPage, sortBy, sortOrder]);

  return (
    <>
      {paginatedSessions.map(...)}
      <Pagination page={page} total={sessions.length} onChange={setPage} />
    </>
  );
}
```

**✅ GOOD Example (Build What's Needed):**
```javascript
// Just show all sessions - add pagination when needed
function Dashboard({ sessions }) {
  return sessions.map(session => (
    <SessionCard key={session.id} session={session} />
  ));
}

// Add pagination LATER when sessions.length > 50
```

**Real Project Example:**
```javascript
// Current: In-memory session storage (simple, works now)
const activeConnections = {};

// Future: Database storage (add ONLY when restart persistence needed)
// Don't build database integration until it's actually required
```

**When to Add Features:**
- User explicitly requests it → Build it
- Performance problem measured → Fix it
- Current solution breaks → Improve it
- "Might need it someday" → DON'T build it

---

### DRY (Don't Repeat Yourself)

**Rule**: If you copy-paste code 3 times, extract it to a reusable function/component.

**Thresholds:**
- 1x: Write inline
- 2x: Copy-paste is OK (might be coincidence)
- 3x: STOP! Extract to function/utility/component
- 4x+: You're creating maintenance hell

**❌ BAD Example (Repeated Validation):**
```javascript
// auth.controller.js
const startQRAuth = async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  // ... auth logic
};

// session.controller.js
const getSessionStatus = async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  // ... status logic
};

// message.controller.js
const sendMessage = async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  // ... message logic
};
```

**✅ GOOD Example (Extracted Middleware):**
```javascript
// middleware/validation.js
function validateSessionId(req, res, next) {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  next();
}

// Now use in routes
router.post('/qr', validateSessionId, authController.startQRAuth);
router.get('/status', validateSessionId, sessionController.getSessionStatus);
router.post('/send', validateSessionId, messageController.sendMessage);
```

**React Component Example:**

**❌ BAD:**
```javascript
// Repeated modal structure in NewSessionModal, NewFolderModal, DeleteConfirmModal
function NewSessionModal() {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Session</h2>
          <button onClick={onClose}>×</button>
        </div>
        {/* Unique content */}
      </div>
    </div>
  );
}
```

**✅ GOOD:**
```javascript
// components/modals/BaseModal.js
function BaseModal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Now create specific modals
function NewSessionModal({ onClose }) {
  return (
    <BaseModal title="New Session" onClose={onClose}>
      {/* Unique content only */}
    </BaseModal>
  );
}
```

---

### Function Complexity Rules

**Max Indentation: 3 levels**

**❌ BAD (Too Nested):**
```javascript
function processMessage(message) {
  if (message) {
    if (message.type === 'text') {
      if (message.from.includes('@s.whatsapp.net')) {
        if (!message.key.fromMe) {
          if (message.message.conversation) {
            // Level 5 indentation - HARD TO READ
            handleIncomingMessage(message);
          }
        }
      }
    }
  }
}
```

**✅ GOOD (Early Returns):**
```javascript
function processMessage(message) {
  // Guard clauses at top
  if (!message) return;
  if (message.type !== 'text') return;
  if (!message.from.includes('@s.whatsapp.net')) return;
  if (message.key.fromMe) return;
  if (!message.message.conversation) return;

  // Main logic at level 1 indentation - EASY TO READ
  handleIncomingMessage(message);
}
```

**Function Length: Max 30 lines**
- If function > 30 lines → Break into smaller functions
- Each function should do ONE thing
- Name functions by what they do: `validateSessionId()`, `sendWhatsAppMessage()`, `formatPhoneNumber()`

**Real Project Example:**
```javascript
// ✅ GOOD: Small, focused functions
async function sendMessage(req, res) {
  try {
    const { phone, message, sessionId = 'default' } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    const sock = sessionService.getConnection(sessionId);
    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp connection not established' });
    }

    const response = await sock.sendMessage(
      phone + '@s.whatsapp.net',
      { text: message }
    );

    res.json({ success: true, response, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
}
```

---

### Summary Checklist

Before committing code, ask:
- [ ] Is this file under the size limit?
- [ ] Is this function under 30 lines?
- [ ] Did I copy-paste code 3+ times? (Extract it!)
- [ ] Am I building features not requested? (YAGNI check)
- [ ] Can I simplify this? (KISS check)
- [ ] Max 3 levels of indentation? (Use early returns)
- [ ] Does each file have ONE clear responsibility?

**Remember**: Code quality is about making future changes EASY, not making current code "clever".

## Architecture

### Monorepo Structure
The project uses a monorepo structure with separate frontend and backend:
- **Backend** (`/backend`): Node.js/Express server that manages WhatsApp connections via Baileys
- **Frontend** (`/frontend`): React application for managing sessions and monitoring

### Frontend Structure (Modular Architecture)
```
frontend/src/
├── App.js                      # Routing & global state ONLY
├── App.css                     # Global styles only
├── components/                 # Reusable components
│   ├── Navbar/
│   │   ├── Navbar.js          # Navigation bar component
│   │   └── Navbar.css         # Navbar-specific styles
│   ├── SessionCard/
│   │   ├── SessionCard.js     # Reusable session card
│   │   └── SessionCard.css
│   └── modals/                # All modal components
│       ├── NewSessionModal.js
│       ├── NewFolderModal.js
│       └── ...
└── pages/                      # Page-level components
    ├── Dashboard/
    │   ├── Dashboard.js       # Dashboard logic
    │   └── Dashboard.css      # Dashboard styles
    ├── DetailSession/
    │   ├── DetailSession.js   # Session detail page
    │   └── DetailSession.css
    └── ...
```

**When adding new features:**
- New component? → Create in `components/ComponentName/`
- New page? → Create in `pages/PageName/`
- New modal? → Create in `components/modals/`
- Always include component's CSS in same folder

### Backend Structure (MVC-like Pattern) ✅ IMPLEMENTED
```
backend/
├── server.js                   # Entry point (88 lines - CLEAN!)
├── routes/                     # API route definitions
│   ├── auth.routes.js         # ✅ /api/auth/* endpoints
│   ├── session.routes.js      # ✅ /api/session/* endpoints
│   └── message.routes.js      # ✅ /api/message/* endpoints
├── controllers/                # Request handlers (business logic)
│   ├── auth.controller.js     # ✅ QR & Phone auth handlers
│   ├── session.controller.js  # ✅ Session management handlers
│   └── message.controller.js  # ✅ Message operations handlers
├── services/                   # Core service logic
│   ├── whatsapp.service.js    # ✅ WhatsApp connection operations
│   └── session.service.js     # ✅ Session storage & management
└── config/                     # Configuration files (future)
```

**When adding new features:**
- New API endpoint? → Add route in `routes/`, handler in `controllers/`
- New business logic? → Add to appropriate service in `services/`
- Don't put everything in `server.js`

**API Endpoint Structure:**
- **Auth**: `/api/auth/qr`, `/api/auth/phone`
- **Session**: `/api/session/status`, `/api/session/contacts`
- **Message**: `/api/message/send`, `/api/message/history`

### Current Auth Modules (Legacy - To Be Refactored)
- **whatsapp-qr-auth.js**: QR code authentication using `useSingleFileAuthState`
- **whatsapp-phone-auth.js**: Phone number authentication using `useMultiFileAuthState`
- **activeConnections object**: In-memory store mapping sessionId → WhatsApp socket
- **Auth persistence**: Credentials saved to `auth_info_${sessionId}.json` or folder

### Key Design Patterns
- Multi-session support: Each session has unique sessionId with isolated auth state
- Session-based routing: API endpoints accept sessionId for message routing
- Event-driven architecture: Baileys socket events drive authentication flow
- Component isolation: Each UI component is self-contained with its own styles

## 🤖 Working with AI (Important Guidelines)

### How to Request Changes Effectively

#### ✅ GOOD Examples:
```
"Edit Navbar.js to add a new 'Analytics' menu item"
"Update Dashboard.css to change the card background color to white"
"Create a new modal in components/modals/ called ExportModal.js for exporting data"
"Fix the delete button in SessionCard.js - it's not calling the onDelete prop"
```

#### ❌ BAD Examples:
```
"Fix the navbar" (too vague, which file?)
"Change the dashboard" (change what? which file?)
"Add export feature" (where? which files involved?)
"Make it work" (what's broken? which component?)
```

### File-Specific Responsibilities

#### Frontend:
- **App.js** → Routing, global state, passing props to pages
- **Navbar.js** → Navigation menu, active tab highlighting
- **Dashboard.js** → Session management, folder organization
- **DetailSession.js** → Individual session details, webhooks, API keys
- **LogChat.js** → Message history and contacts display
- **NewSessionModal.js** → Create new session form and logic
- **SessionCard.js** → Display session info, delete button

#### Backend:
- **server.js** → Express app setup, middleware, start server (ENTRY POINT ONLY)
- **routes/auth.routes.js** → Auth endpoints (/api/auth/*)
- **routes/session.routes.js** → Session endpoints (/api/session/*)
- **routes/message.routes.js** → Message endpoints (/api/message/*)
- **controllers/auth.controller.js** → QR & Phone auth request handlers
- **controllers/session.controller.js** → Session management handlers
- **controllers/message.controller.js** → Message operation handlers
- **services/whatsapp.service.js** → WhatsApp connection logic
- **services/session.service.js** → Session storage & retrieval
- **whatsapp-qr-auth.js** → QR authentication module (used by service)
- **whatsapp-phone-auth.js** → Phone authentication module (used by service)

### When Debugging:
1. Identify which component has the issue
2. Open the specific file for that component
3. Check that component's CSS file if it's a styling issue
4. Don't modify unrelated files

### When Adding Features:
1. Determine if it's a new component or enhancement
2. If new: Create proper folder structure
3. If enhancement: Edit only the relevant component file
4. Keep changes isolated to maintain separation of concerns

## Development Commands

### Root Level
```bash
npm install              # Install dependencies (runs in root)
npm start               # Start backend server only (runs server.js from root)
npm run dev             # Run both backend and frontend concurrently
npm run server          # Run backend with nodemon (from root)
npm run client          # Run frontend dev server (from root)
npm run build           # Build frontend for production
```

### Backend
```bash
cd backend
npm install             # Install backend dependencies
npm start               # Start server (production mode)
npm run dev             # Start server with nodemon (development mode)
```

### Frontend
```bash
cd frontend
npm install             # Install frontend dependencies
npm start               # Start React dev server (opens on localhost:3000)
npm run build           # Build for production
npm test                # Run tests
```

## API Endpoints

### Authentication
- `POST /api/auth/qr` - Start QR authentication (body: `{ sessionId }`)
- `POST /api/auth/phone` - Start phone authentication (body: `{ sessionId, phoneNumber }`)

### Messaging
- `POST /api/send-message` - Send WhatsApp message (body: `{ phone, message, sessionId? }`)

### Status & Monitoring
- `GET /` - Server health check
- `GET /api/status` - Get active sessions and connection status
- `GET /api/contacts` - Get contacts (placeholder)
- `GET /api/messages` - Get message history (placeholder)

## Important Implementation Details

### Baileys Library Integration
- Uses `@whiskeysockets/baileys` v7.0.0-rc.8
- Two authentication methods supported:
  - **QR**: Uses `useSingleFileAuthState` (single JSON file per session)
  - **Phone**: Uses `useMultiFileAuthState` (directory with multiple files per session)
- Browser identification set to `Browsers['chrome']` for compatibility
- Connection events must be handled in `sock.ev.process()` callback

### Session Management
- Sessions are stored in `activeConnections` object in memory (not persistent across restarts)
- Auth credentials persist to disk automatically via Baileys save callbacks
- QR codes and pairing codes are currently logged to console (not yet wired to frontend)

### CORS Configuration
- Backend allows all origins (`*`) for development
- All HTTP methods permitted
- Custom headers allowed for Authorization

### Port Configuration
- Backend: Port 5000 (configurable via PORT env var)
- Frontend: Port 3000 (default Create React App port)

## Current State & Known Issues

1. **QR/Pairing Code Display**: Authentication codes are logged to console but not yet sent to frontend (WebSocket integration needed)
2. **Session Persistence**: activeConnections is in-memory only; sessions lost on server restart
3. **Message History**: `/api/messages` endpoint returns empty array (no database integration yet)
4. **Contacts API**: `/api/contacts` not fully implemented
5. **Frontend Integration**: Frontend has mock data; API integration incomplete

## Dependencies

### Backend Key Dependencies
- `@whiskeysockets/baileys`: WhatsApp Web API library
- `express`: Web framework
- `@hapi/boom`: HTTP error handling
- `pino`: Structured logging
- `file-type`: File type detection for media messages

### Frontend Key Dependencies
- `react`: v19.2.0
- `react-dom`: v19.2.0
- `react-scripts`: Create React App tooling
