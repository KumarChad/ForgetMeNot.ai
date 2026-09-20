<p align="center">
  <img src="extension/public/icons/icon128.png" width="80" />
</p>

<h1 align="center">ForgetMeNot</h1>

<p align="center">
  <strong>AI search across everything you use — Gmail, Drive, and more.</strong><br/>
  One Chrome extension. One search bar. Voice or text. Drag results straight into any app.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/chrome-extension%20mv3-4285F4?logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/AI-Amazon%20Nova%20Lite-FF9900?logo=amazonaws" />
  <img src="https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/vite-6-646CFF?logo=vite&logoColor=white" />
</p>

---

## What it does

ForgetMeNot is a Chrome extension that turns natural language into targeted searches across your Gmail and Google Drive simultaneously. You type "invoices from Sarah last month" and it figures out the right Gmail operators (`from:sarah newer_than:30d has:attachment`) and Drive queries, fires them in parallel, scores and ranks the combined results, and hands you back an AI-written summary plus draggable result cards — all inside a side panel or a floating voice overlay.

### Demo flow

```
User: "budget spreadsheet that Alex shared"
  │
  ├─ AI (Bedrock Nova Lite) generates:
  │    Gmail:  ["from:alex subject:budget", "budget spreadsheet"]
  │    Drive:  ["budget", "query:sharedWithMe=true"]
  │
  ├─ Parallel API calls → 14 raw results
  ├─ Deduplicate → 9 unique
  ├─ Score & rank (keyword match + recency + intent alignment)
  ├─ AI summarizes top 8 → conversational 2-sentence answer
  │
  └─ Returns top 10 ranked results + summary to the extension
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Chrome Extension (MV3)                 │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Side Panel  │  │    Voice     │  │   Background   │  │
│  │  (React+TSX) │  │   Overlay    │  │ Service Worker │  │
│  │             │  │  (Ctrl+Space) │  │                │  │
│  │  • Chat UI   │  │  • Speech    │  │  • API proxy   │  │
│  │  • Results   │  │    Recognition│ │  • OAuth tabs  │  │
│  │  • Drag&Drop │  │  • Bloom     │  │  • File DL     │  │
│  │  • History   │  │    animation │  │  • Onboarding  │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         └────────────────┴──────────────────┘            │
│                          │ chrome.runtime.sendMessage    │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTP
┌──────────────────────────┼───────────────────────────────┐
│                    Backend (Express)                      │
│                          │                               │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │              Orchestrator Pipeline                  │  │
│  │                                                    │  │
│  │  1. generateSearchStrategies()  ──► AWS Bedrock    │  │
│  │     NL query → Gmail operators + Drive queries     │  │
│  │                                                    │  │
│  │  2. executeSearches()           ──► Google APIs    │  │
│  │     Fire all queries in parallel                   │  │
│  │                                                    │  │
│  │  3. deduplicateResults()                           │  │
│  │     Collapse by result ID                          │  │
│  │                                                    │  │
│  │  4. scoreAndRankResults()                          │  │
│  │     Keyword match + recency + intent scoring       │  │
│  │                                                    │  │
│  │  5. summarizeResults()          ──► AWS Bedrock    │  │
│  │     Ranked results → conversational summary        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Token Store  │  │   Metrics    │  │  AI Instruct  │  │
│  │  (DynamoDB)   │  │  (in-memory) │  │  (.md file)   │  │
│  │  AES-256-GCM  │  │  p50/p95/etc │  │  persona +    │  │
│  │  encrypted    │  │              │  │  search rules │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Extension** | Chrome MV3, React 18, TypeScript, Vite 6 | Side panel API, fast HMR builds |
| **AI** | AWS Bedrock — Amazon Nova Lite (`us.amazon.nova-lite-v1:0`) | Low latency, cheap, good at structured JSON output |
| **Search APIs** | Gmail API (v1), Google Drive API (v3) | Read-only scopes, parallel batch fetching |
| **Backend** | Express 4, TypeScript, tsx (watch mode) | Minimal boilerplate, fast dev loop |
| **Token Storage** | DynamoDB + AES-256-GCM encryption | Serverless, encrypted at rest, 90-day TTL auto-cleanup |
| **Auth** | Google OAuth 2.0 (offline access + auto-refresh) | Persistent tokens, no re-auth on every session |
| **Voice** | Web Speech API | Zero dependencies, works in Chrome natively |
| **Drag & Drop** | DataTransfer API + DownloadURL + File items | Desktop drops via DownloadURL, web-app drops via File objects |

---

## Project Structure

```
forgetmenot/
├── backend/
│   ├── src/
│   │   ├── server.ts                 # Express app, route mounting, startup
│   │   ├── routes/
│   │   │   ├── auth.ts               # Google OAuth flow + token management
│   │   │   ├── search.ts             # POST /api/search → orchestrator
│   │   │   └── download.ts           # Drive file proxy + Gmail attachments
│   │   └── services/
│   │       ├── orchestrator.ts        # 5-step search pipeline (core logic)
│   │       ├── google.ts             # Gmail & Drive API wrappers
│   │       ├── bedrock.ts            # AWS Bedrock client + mock mode
│   │       ├── tokenStore.ts         # DynamoDB CRUD + AES-256-GCM encryption
│   │       └── metrics.ts            # Latency tracking, p50/p95, source breakdown
│   ├── ai-instructions.md            # System prompt: persona, search strategy, tone
│   ├── package.json
│   └── tsconfig.json
│
├── extension/
│   ├── src/
│   │   ├── background/
│   │   │   └── background.ts         # Service worker: message routing, OAuth, file DL
│   │   ├── sidebar/
│   │   │   ├── App.tsx               # Main React UI (chat, settings, history)
│   │   │   ├── main.tsx              # React DOM entry
│   │   │   ├── styles.css            # Full sidebar styling
│   │   │   ├── types.ts              # Shared TypeScript interfaces
│   │   │   ├── chatHistory.ts        # chrome.storage.local CRUD for conversations
│   │   │   └── useSpeechRecognition.ts  # React hook for Web Speech API
│   │   └── content/
│   │       ├── onboarding.ts         # First-install tutorial overlay
│   │       └── voice-overlay.ts      # Ctrl+Space: bloom animation + floating results
│   ├── public/
│   │   ├── manifest.json             # MV3 manifest
│   │   └── icons/                    # Extension icons (16/48/128)
│   ├── vite.config.ts                # Multi-entry build (sidepanel + background + content scripts)
│   └── package.json
│
├── landing/
│   └── index.html                    # Product landing page (served by Express)
│
└── package.json                      # Monorepo root: dev/build/setup scripts
```

---

## Search Pipeline Deep Dive

The orchestrator (`services/orchestrator.ts`) is the heart of the system. Here's what each step actually does:

### Step 1 — AI Query Generation

The user's natural language is sent to Bedrock with a prompt that teaches Gmail search operators (`from:`, `newer_than:`, `has:attachment`, etc.) and Drive query patterns. The model returns structured JSON:

```json
{
  "gmail_queries": ["from:sarah subject:budget has:attachment", "sarah budget"],
  "drive_queries": ["budget", "query:sharedWithMe=true"],
  "intent": "documents"
}
```

A keyword-only fallback query is always appended to both lists so an over-specific operator query can't zero out recall. Queries are capped at 4 per platform.

**Fallback:** If Bedrock fails entirely, `extractKeywords()` strips stop words and uses raw keywords as queries on both platforms.

### Step 2 — Parallel Search Execution

All Gmail and Drive queries fire simultaneously via `Promise.all`. Each query failure is caught independently — one bad query doesn't kill the search.

- **Gmail:** `messages.list` → parallel `messages.get` for metadata (Subject, From, Date)
- **Drive:** Multi-word full-text search with broadening. First pass: exact phrase in filename OR all terms in content. If < 3 results, second pass: any term in name or content.

### Step 3 — Deduplication

Results are collapsed by their canonical ID (`gmail-{messageId}` / `drive-{fileId}`), keeping the first (highest-scoring) occurrence.

### Step 4 — Relevance Scoring

Each result gets a composite score based on:

| Signal | Points |
|--------|--------|
| Full query match in title | +50 |
| Individual keyword in title | +15 each |
| Keyword in snippet | +6 each |
| Keyword in author name | +20 each |
| Query term coverage bonus | up to +20 |
| Age < 1 day | +12 |
| Age < 7 days | +8 |
| Age < 30 days | +4 |
| Intent alignment (e.g. "people" → Gmail) | +8 |
| Baseline (it matched *something*) | +5 |

Results are sorted by score descending, then by recency as tiebreaker.

### Step 5 — AI Summarization

Top 8 results are formatted with source, title, author, age, and snippet, then sent to Bedrock for a 2-3 sentence conversational summary. The system prompt (loaded from `ai-instructions.md`) enforces the tone: specific names and dates, no bullet points, honest about weak matches.

**Fallback:** If summarization fails, a template string with the top result's title and source is returned.

---

## Drag & Drop

ForgetMeNot supports dragging search results to the desktop and into web apps:

1. **Desktop drops** — `DownloadURL` data transfer format (`mime:filename:url`) pointing at the backend's download proxy
2. **Web app drops** — Drive files are pre-fetched on hover via the background service worker, converted from base64 to a `File` object, and added to `DataTransfer.items` so apps like Slack or Gmail compose accept them as real file attachments
3. **Link fallback** — `text/uri-list` is always set, so if the target doesn't accept files, it gets the source URL

Google Workspace files (Docs, Sheets, Slides) are automatically exported to PDF/XLSX/PPTX during download.

---

## Google APIs — OAuth, Gmail & Drive

Google is the primary data source. ForgetMeNot connects to a user's Google account via OAuth 2.0 and searches across both Gmail and Drive in parallel.

### OAuth 2.0 Flow

```
User clicks "Connect" in extension
    │
    ▼
Extension sends START_OAUTH → background.ts
    │
    ▼
Background fetches /api/auth/google/start → gets authUrl
    │
    ▼
Opens authUrl in a new Chrome tab (tracked in oauthTabs Set)
    │
    ▼
User consents → Google redirects to /api/auth/google/callback?code=...
    │
    ▼
Backend exchanges code for tokens via oauth2Client.getToken()
    │
    ▼
Tokens encrypted (AES-256-GCM) → stored in DynamoDB
    │
    ▼
In-memory OAuth client updated, 'tokens' event listener attached
    │
    ▼
Callback page auto-closes after 2 seconds
    │
    ▼
Extension polls /api/auth/status every 2s to detect connection
```

**Scopes requested:**

| Scope | Purpose |
|-------|---------|
| `gmail.readonly` | Search and read email metadata & snippets |
| `drive.readonly` | Search and read file metadata & content |
| `userinfo.email` | Identify the connected account |

**Token lifecycle:** Access tokens expire after ~1 hour. The `googleapis` OAuth2 client emits a `tokens` event on auto-refresh — we listen for this and persist the new tokens to DynamoDB immediately, merging with existing tokens to preserve the refresh token (Google only sends it on the first consent).

### Gmail API Integration

**Endpoint:** Gmail API v1 — `users.messages.list` + `users.messages.get`

```typescript
// Step 1: Search with Gmail's powerful query syntax
const response = await gmail.users.messages.list({
  userId: 'me',
  q: 'from:sarah subject:budget has:attachment',  // Generated by AI
  maxResults: 8,
});

// Step 2: Fetch full metadata for each message — IN PARALLEL
const details = await Promise.all(
  messages.map(msg =>
    gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    })
  )
);
```

**Key design choice:** We fetch message details in parallel (`Promise.all`) instead of sequentially. For 8 messages, this cuts the Gmail portion from ~2-3 seconds to ~400-600ms.

**Gmail search operators the AI uses:** `from:`, `to:`, `subject:`, `has:attachment`, `filename:`, `newer_than:`, `after:`, `before:`, `is:starred`, `label:`, `in:sent`. These are taught to Bedrock via the prompt in Step 1.

### Google Drive API Integration

**Endpoint:** Drive API v3 — `files.list`

Drive search is more nuanced than Gmail because the `name contains` operator does literal substring matching — `name contains 'budget doc'` won't match "Q3 Budget Planning". We solve this with a **two-pass broadening strategy:**

```
Pass 1 (precise):
  name contains 'budget spreadsheet'      ← exact phrase in filename
  OR (fullText contains 'budget'           ← AND of every term in content
      AND fullText contains 'spreadsheet')

  Found < 3 results? → broaden

Pass 2 (broad):
  name contains 'budget'                  ← OR of any single term
  OR fullText contains 'budget'              in name or content
  OR name contains 'spreadsheet'
  OR fullText contains 'spreadsheet'
```

**Raw query passthrough:** Queries prefixed with `query:` bypass the keyword logic entirely and are sent as raw Drive API `q` parameters. This enables power-user queries like:

```
query:mimeType='application/pdf'
query:sharedWithMe=true
query:modifiedTime > '2024-01-01T00:00:00'
query:mimeType='application/vnd.google-apps.spreadsheet'
```

**File download proxy:** Google Workspace files (Docs, Sheets, Slides) can't be downloaded directly — they must be exported. The backend handles this transparently:

| Source MIME Type | Export Format | Extension |
|-----------------|--------------|-----------|
| `vnd.google-apps.document` | PDF | `.pdf` |
| `vnd.google-apps.spreadsheet` | XLSX | `.xlsx` |
| `vnd.google-apps.presentation` | PPTX | `.pptx` |
| `vnd.google-apps.drawing` | PDF | `.pdf` |
| Everything else | Binary stream | Original |

---

## Chrome Extension — MV3 Architecture

ForgetMeNot is a Manifest V3 Chrome extension using modern APIs: Side Panel, Service Worker, and content script injection.

### Permissions & Why

| Permission | What it enables |
|------------|----------------|
| `sidePanel` | The main search UI — opens as a browser side panel |
| `storage` | Chat history persistence via `chrome.storage.local` |
| `identity` | Reserved for Chrome Identity API (future — currently OAuth goes through backend) |
| `scripting` | Inject onboarding + voice overlay into active tabs |
| `tabs` | Read active tab URL/title for search context |
| `activeTab` | Access the current tab when user triggers the extension |

**Host permissions:** `*.googleapis.com`, `slack.com/api`, `<all_urls>` (for content script injection on any page), and the backend server IP.

### Service Worker (`background.ts`)

The background service worker is the message bus between the sidebar UI, content scripts, and backend API. It handles:

```
chrome.runtime.onMessage listener handles:
├── SEARCH          → POST /api/search, return results
├── EXECUTE_ACTION  → POST /api/action (future extensibility)
├── GET_AUTH_STATUS  → GET /api/auth/status
├── START_OAUTH     → GET /api/auth/{provider}/start → open tab
├── GET_PAGE_CONTEXT → chrome.tabs.query → return {url, title, domain}
├── GET_DRIVE_FILE  → GET /api/download/drive/{id} → base64 encode
├── ONBOARDING_DONE → chrome.storage.local.set
└── CLOSE_PANEL     → chrome.sidePanel.close
```

**Why route through the service worker?** Content scripts (voice overlay) run in the host page's security context. On HTTPS pages, direct HTTP requests to the backend would be blocked as mixed content. The service worker has its own origin and can make HTTP requests freely.

**OAuth tab tracking:** When an OAuth flow starts, the tab ID is added to an `oauthTabs` Set. A `chrome.tabs.onUpdated` listener watches for the callback URL, waits 2.5 seconds (so the user sees the "Connected!" page), then auto-closes the tab.

### Side Panel

The main UI renders inside Chrome's native Side Panel API:

```typescript
// Enable side panel on all pages
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Open on extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});
```

The side panel loads `sidepanel.html` → React app (`App.tsx`). It has three views managed by React state (no router needed for a panel this size):

1. **Chat view** — conversational search with message bubbles, AI summaries, draggable result cards
2. **Settings view** — connect/disconnect providers, connection status badges
3. **History view** — browse, reopen, delete past conversations

### Commands (Keyboard Shortcuts)

Registered in `manifest.json` and handled in the service worker:

```json
{
  "_execute_action": {
    "suggested_key": { "default": "Ctrl+Shift+K", "mac": "Command+Shift+K" },
    "description": "Toggle ForgetMeNot side panel"
  },
  "voice_search": {
    "suggested_key": { "default": "Ctrl+Space", "mac": "Command+Space" },
    "description": "Voice search with ForgetMeNot"
  }
}
```

`Ctrl+Space` triggers `chrome.scripting.executeScript` to inject `voice-overlay.js` into the active tab — this is a full content script that creates its own DOM, styles, speech recognition, and result rendering.

### Content Scripts

| Script | Trigger | What it does |
|--------|---------|-------------|
| `onboarding.ts` | `chrome.runtime.onInstalled` (first install only) | 2-step tutorial overlay teaching both shortcuts |
| `voice-overlay.ts` | `Ctrl+Space` command | Animated voice search + floating results card |

Both are injected on-demand via `chrome.scripting.executeScript` rather than declared in `content_scripts` — this keeps them from running on every page load.

### Storage

Chat conversations are stored in `chrome.storage.local` under the key `forgetmenot_conversations`. Capped at 50 conversations, sorted newest-first, with CRUD operations in `chatHistory.ts`. Each conversation holds an array of `ChatMessage` objects containing the query, full `SearchResponse` (answer + results + actions), and timestamp.

---

## Voice Search — Web Speech API

ForgetMeNot has two voice input paths, both using the browser's native Web Speech API (no external services, no API keys):

### Path 1: Side Panel Mic Button

A React hook (`useSpeechRecognition.ts`) wraps `webkitSpeechRecognition`:

```typescript
const recognition = new SpeechRecognition();
recognition.continuous = false;     // Stop after one utterance
recognition.interimResults = true;  // Show words as they're spoken
recognition.lang = 'en-US';
```

Interim results update the search input in real-time. When recognition ends, the final transcript is automatically submitted as a search query.

### Path 2: Voice Overlay (`Ctrl+Space`)

The overlay is a self-contained content script with two animation phases:

**Phase 1 — Listening:**
```
┌─────────────────────┐
│                     │
│     🌸 (bloom       │  ← CSS animated flower with pulsing ring
│      animation)     │     ripples (::before / ::after pseudo-elements)
│                     │
│  "your words here|" │  ← Live transcript with blinking caret
│                     │
│    Listening...     │  ← Status hint
└─────────────────────┘
```

The bloom uses a radial gradient SVG with 5 overlapping petal circles + white center + golden eye. While listening, two concentric ring animations (`fmn-ring`) pulse outward. The flower has a subtle breathing animation (`fmn-breathe`: scale 1 → 1.06 → 1, 2.4s loop).

**Phase 2 — Results:**

When speech ends, the overlay transitions (`.fmn-out` fade → `.fmn-cardin` slide) to a compact card:

```
┌─────────────────────────┐
│ 🌸 Found it  "query" ✕  │
│                         │
│ AI summary paragraph... │
│                         │
│ G  Email from Sarah     │  ← Draggable result items
│    snippet · 2d ago     │     with staggered entry animation
│                         │
│ D  Budget.xlsx          │
│    Google Drive · 5d    │
│                         │
│ Drop hint      🎤       │  ← "Search again" button
└─────────────────────────┘
```

Each result item has its own color-coded badge (Gmail = red gradient, Drive = gold, Slack = blue, Notion = dark), and items animate in with staggered delays (50ms, 120ms, 190ms, 260ms).

**Accessibility:** All animations respect `prefers-reduced-motion` — a `@media` query disables every animation and transition when reduced motion is preferred.

---

## Drag & Drop — DataTransfer API

ForgetMeNot lets users drag search results directly into other applications. This works across three levels of the DataTransfer API:

### Level 1: Link Drops (always works)

```typescript
e.dataTransfer.setData('text/uri-list', result.url);
e.dataTransfer.setData('text/plain', result.url);
```

Every result sets these. If you drag a result into a text editor, Slack message box, or browser tab bar, the URL is pasted/opened.

### Level 2: Desktop Downloads via `DownloadURL`

```typescript
// Chrome-specific: "mime:filename:url" triggers a file save on desktop drop
e.dataTransfer.setData('DownloadURL',
  `application/octet-stream:${filename}:${API_BASE}/api/download/drive/${fileId}`
);
```

The download URL points at the backend's proxy endpoint, which handles Google OAuth and Workspace file export transparently. Dragging a result to your desktop saves the actual file.

### Level 3: Real File Attachments for Web Apps

This is the most technically interesting part. Web apps like Slack, Gmail compose, and Notion accept file drops — but they need actual `File` objects, not URLs. The flow:

```
User hovers over a Drive result card
    │
    ▼  onMouseEnter triggers prepareDriveFile()
Background service worker downloads the file via backend proxy
    │
    ▼  Returns base64-encoded file data
Convert to File object:
    │
    const binary = atob(base64data);
    const bytes = new Uint8Array(binary.length);
    const file = new File([bytes], filename, { type: mimeType });
    │
    ▼  Cached in preparedFile state / preparedDriveFiles Map
User starts dragging
    │
    ▼  onDragStart
    e.dataTransfer.items.add(preparedFile);  // Real File object!
    e.dataTransfer.effectAllowed = 'copy';
    │
    ▼
Drop into Slack/Gmail/etc → they receive an actual file attachment
```

**Why pre-fetch on hover?** The `dragstart` event is synchronous — you can't `await` a network call inside it. By fetching on hover, the file is ready by the time the user starts dragging. Files are cached so subsequent drags don't re-fetch.

**Size limit:** Files over 12MB are rejected by `getDriveFile()` in the service worker to avoid memory issues in the base64 conversion.

**Custom drag ghost:** A styled `<div>` with a paperclip emoji and filename is created off-screen and used as the drag image via `setDragImage()`, then cleaned up on the next frame.

---

## React Frontend — Sidebar Architecture

The sidebar is a single-page React 18 app built with Vite, running inside Chrome's Side Panel.

### State Management

Pure React state — no external state library. The `App` component manages:

```typescript
const [query, setQuery] = useState('');           // Current input
const [isLoading, setIsLoading] = useState(false); // Search in progress
const [showSettings, setShowSettings] = useState(false); // Settings view
const [showHistory, setShowHistory] = useState(false);   // History view
const [sources, setSources] = useState<ConnectedSource[]>([...]); // Connection status
const [error, setError] = useState<string | null>(null);
const [currentConvo, setCurrentConvo] = useState<ChatConversation | null>(null);
const [allConversations, setAllConversations] = useState<ChatConversation[]>([]);
```

View switching is controlled by `showSettings` and `showHistory` booleans — early returns in the render function select the active view. No React Router needed.

### Communication Pattern

All backend communication goes through Chrome's message passing:

```
App.tsx                    background.ts               Backend API
───────                    ─────────────               ───────────
handleSearch()
  │
  ├─ chrome.runtime.sendMessage({type: 'SEARCH', query})
  │                            │
  │                            ├─ fetch('/api/search', {body: {query}})
  │                            │                          │
  │                            │                          ├─ Bedrock (query gen)
  │                            │                          ├─ Gmail + Drive APIs
  │                            │                          ├─ Score & rank
  │                            │                          ├─ Bedrock (summarize)
  │                            │                          │
  │                            │◄─── {answer, results} ──┘
  │◄─── sendResponse() ───────┘
  │
  ├─ Update conversation state
  ├─ Save to chrome.storage.local
  └─ Auto-scroll to bottom
```

### Key Components

**`ResultCard`** — Each search result is a self-contained draggable card with:
- Click → opens the source URL in a new tab
- Hover → pre-fetches Drive file for drag-and-drop
- Drag → attaches file (if prepared) or link to DataTransfer
- Metadata display: source icon, title, author, relative timestamp, source label

**`App` (Chat view)** — Conversation-style UI with:
- User query in a right-aligned colored bubble
- AI summary in a left-aligned card with "AI Summary" label
- Stacked ResultCards below each response
- Auto-scroll on new messages via `useRef` + `scrollIntoView({ behavior: 'smooth' })`
- Loading state with animated dots

### Build System

Vite with a multi-entry configuration for the Chrome extension:

```typescript
rollupOptions: {
  input: {
    sidepanel: 'sidepanel.html',         // React app entry
    background: 'src/background/background.ts',  // Service worker
    'voice-overlay': 'src/content/voice-overlay.ts', // Content script
    'onboarding': 'src/content/onboarding.ts',       // Content script
  },
  output: {
    // Fixed filenames for manifest.json references
    entryFileNames: (chunk) => {
      if (chunk.name === 'background') return 'background.js';
      if (chunk.name === 'voice-overlay') return 'voice-overlay.js';
      if (chunk.name === 'onboarding') return 'onboarding.js';
      return 'assets/[name]-[hash].js';  // Hashed for sidebar chunks
    }
  }
}
```

Background and content scripts get fixed filenames (referenced in `manifest.json`). Sidebar assets get content-hashed filenames for cache busting. A custom Vite plugin (`copyManifest`) copies `manifest.json` and the icons directory into `dist/` after each build.

---

## Observability — Metrics Service

The backend tracks every search and AI call in-memory, accessible via `GET /api/metrics`:

### What's Tracked

**Per search:**
- Query text, timestamp, intent classification
- Total end-to-end latency
- AI query generation latency
- Google API search latency
- AI summarization latency
- Result count by source (Gmail, Drive, Slack, Notion)
- Number of sub-queries generated
- Success/failure

**Per Bedrock call:**
- Timestamp, latency, purpose (`query_gen` | `summarize`), success, error message

### Computed Aggregates

| Metric | Calculation |
|--------|------------|
| Success rate | `successfulSearches / totalSearches × 100` |
| Avg results/search | `totalResults / totalSearches` |
| p50 latency | Median of sorted latency array |
| p95 latency | 95th percentile of sorted latency array |
| Source breakdown | Percentage of results from each source |
| Intent breakdown | Percentage of searches classified as each intent type |
| Peak hour | Hour of day (0-23) with the most searches |
| Bedrock success rate | `successfulCalls / totalCalls × 100` |

### Example Response

```json
{
  "totalSearches": 47,
  "successRate": 91.49,
  "avgTotalLatencyMs": 2340.5,
  "avgAiQueryGenMs": 680.2,
  "avgApiSearchMs": 890.1,
  "avgAiSummaryMs": 710.8,
  "p50LatencyMs": 2100,
  "p95LatencyMs": 4200,
  "sourceBreakdown": { "gmail": 62.3, "drive": 37.7 },
  "intentBreakdown": { "people": 34, "documents": 28, "topic": 25, "general": 13 },
  "searchesLast24h": 12,
  "peakHour": 14
}
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Chrome browser
- Google Cloud project with Gmail API and Drive API enabled
- AWS account with Bedrock access (Nova Lite model enabled in `us-east-1`)
- DynamoDB table (default name: `ForgetMeNot-Tokens`, partition key `PK` (String), sort key `SK` (String))

### 1. Clone & install

```bash
git clone https://github.com/your-username/forgetmenot.git
cd forgetmenot
npm run setup    # installs both backend/ and extension/ deps
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# AWS (uses default credential chain — set these or configure AWS CLI)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0

# Google OAuth — create at console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback

# DynamoDB
DYNAMODB_TABLE=ForgetMeNot-Tokens

# Encryption (change this!)
TOKEN_ENCRYPTION_KEY=your-random-32-char-secret-here

# Server
PORT=3001

# Dev: skip real Bedrock calls
# BEDROCK_MOCK=1
```

### 3. Start the backend

```bash
npm run dev:backend    # tsx watch mode on :3001
```

### 4. Build & load the extension

```bash
npm run dev:extension  # vite build --watch
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension/dist/`
4. Pin the ForgetMeNot extension in the toolbar

### 5. Connect Google

Click the extension icon → **Settings** → **Connect** next to Google. Complete the OAuth flow. Gmail and Drive are now searchable.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+K` (Mac: `Cmd+Shift+K`) | Toggle the ForgetMeNot side panel |
| `Ctrl+Space` (Mac: `Cmd+Space`) | Voice search overlay on any page |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/search` | `{ query, context? }` → AI-powered search |
| `GET` | `/api/auth/status` | Connection status for all providers |
| `GET` | `/api/auth/google/start` | Initiate Google OAuth |
| `GET` | `/api/auth/google/callback` | OAuth callback (handles token exchange) |
| `GET` | `/api/download/drive/:fileId` | Proxy download for Drive files |
| `GET` | `/api/download/gmail/:msgId/attachments/:attId` | Proxy Gmail attachment download |
| `GET` | `/api/download/info/:source/:id` | File metadata for drag-and-drop |
| `GET` | `/api/metrics` | Search performance metrics |
| `POST` | `/api/metrics/reset` | Reset all metrics |

---

## Metrics

The backend tracks detailed performance data in-memory, accessible at `/api/metrics`:

- **Latency breakdown:** total, AI query generation, API search, AI summarization (avg, p50, p95)
- **Result quality:** count by source (Gmail/Drive), success rate, results per search
- **AI stats:** Bedrock call count, success rate, avg latency
- **Usage patterns:** searches per 24h/7d, peak hour, intent distribution
- **Recent searches:** last 20 queries with latency and result counts

---

## AWS Services — How We Use Them

AWS is the backbone of ForgetMeNot's intelligence and persistence layers. Every search triggers at least two AWS service calls, and every OAuth token is stored and encrypted through AWS infrastructure.

### Amazon Bedrock — AI Engine

**Model:** Amazon Nova Lite (`us.amazon.nova-lite-v1:0`) via cross-region inference profile (`us.amazon.nova-lite-v1:0`)

**API:** [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html) — not the legacy `InvokeModel`. Converse gives us a unified message-based interface with structured `system`, `messages`, and `inferenceConfig` fields.

**Client setup:**

```typescript
// Single shared client — credentials from the default AWS provider chain
// (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION in .env)
const client = new BedrockRuntimeClient({ region: 'us-east-1' });

const command = new ConverseCommand({
  modelId: 'us.amazon.nova-lite-v1:0',
  messages: [{ role: 'user', content: [{ text: prompt }] }],
  system: [{ text: systemPrompt }],
  inferenceConfig: { maxTokens, temperature, topP },
});
```

**Two calls per search, each with a distinct purpose and tuning:**

| Call | Purpose | Temperature | Max Tokens | What it does |
|------|---------|-------------|------------|-------------|
| **Query Generation** | Convert NL → search operators | `0.2` (low creativity) | `512` | Takes "invoices from Sarah last month" and returns `{"gmail_queries": ["from:sarah newer_than:30d has:attachment"], "drive_queries": ["invoice"]}`. Low temperature because we need deterministic, valid JSON with correct Gmail operator syntax. |
| **Summarization** | Ranked results → conversational answer | `0.5` (moderate) | `300` | Takes the top 8 scored results and writes a 2-3 sentence summary like "Sarah sent you 3 invoices last Tuesday, and there's a matching spreadsheet in Drive she shared on the 5th." Higher temperature for natural language flow. |

**System prompt engineering:** The AI persona and search behavior are defined in `ai-instructions.md`, loaded once at startup and injected as Bedrock's `system` parameter. This file teaches the model Gmail search operators (`from:`, `newer_than:`, `has:attachment`, `filename:`, `label:`, etc.), Drive query patterns (single-word extraction, `query:` raw passthrough, mimeType filters), and response tone rules. Changing the AI's behavior requires editing one markdown file — no code changes.

**Resilience:** Both Bedrock calls have independent fallbacks. If query generation fails, `extractKeywords()` strips stop words and searches with raw keywords. If summarization fails, a template string with the top result's metadata is returned. The app never crashes or hangs on an AI failure.

**Performance tracking:** Every Bedrock call is recorded by the metrics service — timestamp, latency, purpose (`query_gen` | `summarize`), success/failure, and error message. This feeds the `/api/metrics` endpoint for real-time observability.

### Amazon DynamoDB — Token Persistence

**Table:** `ForgetMeNot-Tokens` (configurable via `DYNAMODB_TABLE` env var)

**Schema:**

| Key | Format | Example |
|-----|--------|---------|
| `PK` (Partition Key) | `user#{userId}` | `user#default` |
| `SK` (Sort Key) | `provider#{provider}` | `provider#google` |

**What's stored:** Google OAuth tokens (access token, refresh token, expiry, scope) — encrypted before write, decrypted after read.

**Encryption at rest (application-level):**

```
User tokens
    │
    ▼  AES-256-GCM encrypt
┌─────────────────────────┐
│ iv (12 bytes, random)   │
│ authTag (16 bytes)      │
│ ciphertext              │
│ format: "iv:tag:cipher" │
└─────────────────────────┘
    │
    ▼  stored in DynamoDB
    encryptedTokens field
```

The encryption key is derived from `TOKEN_ENCRYPTION_KEY` via SHA-256 hashing to produce a 32-byte key. A fresh random IV is generated for every write, so the same tokens produce different ciphertext each time.

**TTL:** Items have a 90-day TTL (`ttl` attribute, epoch seconds). DynamoDB automatically deletes expired tokens — no cleanup cron needed.

**Caching strategy:** Tokens are loaded from DynamoDB into an in-memory cache on server startup (`initTokens()`). Reads check memory first, falling back to DynamoDB only on cache miss. Writes update both memory and DynamoDB. If DynamoDB is unreachable, the in-memory cache keeps the app functional — it degrades to an ephemeral store rather than failing.

**Token refresh flow:**

```
Google OAuth client emits 'tokens' event
    │
    ▼
Merge new tokens with existing (preserves refresh_token)
    │
    ▼
saveTokens() → encrypt → DynamoDB PutItem + update memory cache
    │
    ▼
Log "🔄 Google tokens refreshed and saved"
```

### AWS Infrastructure

```
┌─────────────────────────────────────────────┐
│              AWS us-east-1                  │
│                                             │
│  ┌─────────────────────┐                    │
│  │   Amazon Bedrock    │                    │
│  │                     │                    │
│  │  Nova Lite v1       │◄── Converse API    │
│  │  (on-demand)        │    2 calls/search  │
│  │                     │                    │
│  └─────────────────────┘                    │
│                                             │
│  ┌─────────────────────┐                    │
│  │   DynamoDB          │                    │
│  │                     │                    │
│  │  ForgetMeNot-Tokens │◄── Token CRUD      │
│  │  (on-demand cap.)   │    AES-256-GCM     │
│  │  TTL: 90 days       │    encrypted       │
│  └─────────────────────┘                    │
│                                             │
│  ┌─────────────────────┐                    │
│  │   EC2               │                    │
│  │                     │                    │
│  │  Express backend    │◄── Port 3001       │
│  │  (18.212.41.218)    │    Node.js 18+     │
│  └─────────────────────┘                    │
└─────────────────────────────────────────────┘
```

**Auth:** All AWS calls use the default credential provider chain — `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from environment variables. The same credentials serve both Bedrock and DynamoDB. No IAM roles or instance profiles needed for local dev; on EC2, an instance role with `bedrock:InvokeModel` and `dynamodb:GetItem/PutItem/DeleteItem` permissions is sufficient.

---

## Roadmap

- [x] Gmail search with operator generation
- [x] Google Drive search with multi-word full-text
- [x] AI query generation + summarization (Bedrock Nova Lite)
- [x] Voice search with animated overlay
- [x] Drag-and-drop results to desktop and web apps
- [x] Chat history with conversation management
- [x] Onboarding tutorial on first install
- [x] Encrypted token persistence (DynamoDB + AES-256-GCM)
- [x] Performance metrics dashboard
- [ ] Slack integration
- [ ] Notion integration
- [ ] Multi-user support
- [ ] Backend authentication & rate limiting
- [ ] Configurable API endpoint (remove hardcoded IP)

---

## License

Built for hackathon — not yet licensed for production use.
