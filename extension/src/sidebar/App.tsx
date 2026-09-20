import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import type { SearchResult, SearchResponse, ConnectedSource, ChatConversation } from './types';
import {
  loadConversations,
  saveConversation,
  deleteConversation,
  clearAllConversations,
  createConversation,
  addMessageToConversation,
} from './chatHistory';

const SOURCE_ICONS: Record<string, string> = {
  gmail: '✉️',
  drive: '📁',
  slack: '💬',
  notion: '📝',
};

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function formatConvoTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

const API_BASE = 'http://18.212.41.218:3001';

/**
 * Extracts the raw file ID from our result IDs (e.g. "drive-abc123" → "abc123")
 */
function extractFileId(result: SearchResult): string {
  return result.id.replace(/^(gmail|drive|slack|notion)-/, '');
}

/**
 * Build the download URL for drag-and-drop to desktop.
 * Drive files go through our backend proxy. Gmail results link to the web.
 */
function getDownloadUrl(result: SearchResult): string | null {
  if (result.source === 'drive') {
    const fileId = extractFileId(result);
    return `${API_BASE}/api/download/drive/${fileId}`;
  }
  // Gmail, Slack, Notion — no direct file download, use the web URL
  return null;
}

function getFilenameFromResult(result: SearchResult): string {
  const title = result.title || 'file';
  // Add extension if it doesn't have one
  if (result.source === 'drive' && !title.includes('.')) {
    const typeExt: Record<string, string> = {
      document: '.pdf',
      spreadsheet: '.xlsx',
      presentation: '.pptx',
      file: '',
    };
    return title + (typeExt[result.type] || '');
  }
  return title;
}

function fileFromBase64(data: string, filename: string, mimeType: string): File {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mimeType });
}

function ResultCard({ result }: { result: SearchResult }) {
  const [isDragging, setIsDragging] = useState(false);
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [isPreparingFile, setIsPreparingFile] = useState(false);

  const prepareDriveFile = async () => {
    if (result.source !== 'drive' || preparedFile || isPreparingFile) return;

    setIsPreparingFile(true);
    try {
      const payload = await chrome.runtime.sendMessage({
        type: 'GET_DRIVE_FILE',
        fileId: extractFileId(result),
      });
      if (payload?.error) throw new Error(payload.error);
      setPreparedFile(fileFromBase64(
        payload.data,
        getFilenameFromResult(result),
        payload.mimeType || 'application/octet-stream',
      ));
    } catch (err) {
      console.warn('Could not prepare Drive file for dragging:', err);
    } finally {
      setIsPreparingFile(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);

    // Always set the URL for web app drops (Slack, Gmail compose, etc.)
    e.dataTransfer.setData('text/uri-list', result.url);
    e.dataTransfer.setData('text/plain', result.url);

    // For desktop drops: use DownloadURL if we have a download proxy
    const downloadUrl = getDownloadUrl(result);
    if (downloadUrl) {
      const filename = getFilenameFromResult(result);
      const mime = 'application/octet-stream';
      // Chrome's DownloadURL format: "mime:filename:url"
      e.dataTransfer.setData('DownloadURL', `${mime}:${filename}:${downloadUrl}`);
    }

    // A prepared Drive document can be accepted as a real file by compatible
    // web-app drop zones. Keep the link payload above as a fallback.
    if (preparedFile) {
      e.dataTransfer.items.add(preparedFile);
      e.dataTransfer.effectAllowed = 'copy';
    } else {
      e.dataTransfer.effectAllowed = 'copyLink';
    }

    // Custom drag image
    const ghost = document.createElement('div');
    ghost.textContent = `\u{1F4CE} ${result.title}`;
    ghost.style.cssText = 'position:absolute;top:-1000px;padding:8px 14px;background:#6366f1;color:white;border-radius:8px;font-size:13px;font-family:sans-serif;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="result-card"
      onClick={() => window.open(result.url, '_blank')}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => { void prepareDriveFile(); }}
      style={{
        opacity: isDragging ? 0.6 : 1,
        cursor: 'grab',
        transition: 'opacity 0.15s, transform 0.15s',
        transform: isDragging ? 'scale(0.97)' : 'scale(1)',
      }}
    >
      <div className="result-card-header">
        <div className={`result-source-icon ${result.source}`}>
          {SOURCE_ICONS[result.source]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="result-title">{result.title}</div>
          <div className="result-meta">
            {result.author && <span>{result.author}</span>}
            {result.author && ' · '}
            <span>{formatTimestamp(result.timestamp)}</span>
            {' · '}
            <span style={{ textTransform: 'capitalize' }}>{result.source}</span>
          </div>
        </div>
        {/* Drag handle hint */}
        <div style={{
          color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0,
          opacity: 0.5, marginLeft: '4px',
        }} title={result.source === 'drive'
          ? (preparedFile ? 'File ready to drop' : isPreparingFile ? 'Preparing file…' : 'Hover, then drag to attach the file')
          : 'Drag source link to any app'}>
          ☰
        </div>
      </div>
      <div className="result-snippet">{result.snippet}</div>
      <div className="result-actions">
        <button className="result-action-btn" onClick={(e) => { e.stopPropagation(); window.open(result.url, '_blank'); }}>
          Open ↗
        </button>
        <button className="result-action-btn" onClick={(e) => e.stopPropagation()}>
          Share
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sources, setSources] = useState<ConnectedSource[]>([
    { id: 'gmail', name: 'Gmail', icon: '✉️', connected: false },
    { id: 'drive', name: 'Drive', icon: '📁', connected: false },
    { id: 'slack', name: 'Slack', icon: '💬', connected: false },
    { id: 'notion', name: 'Notion', icon: '📝', connected: false },
  ]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [currentConvo, setCurrentConvo] = useState<ChatConversation | null>(null);
  const [allConversations, setAllConversations] = useState<ChatConversation[]>([]);

  const { isListening, transcript, startListening, stopListening, resetTranscript } =
    useSpeechRecognition();

  // Load conversations on mount
  useEffect(() => {
    checkAuthStatus();
    loadConversations().then((convos) => {
      setAllConversations(convos);
    });
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConvo?.messages.length, isLoading]);

  const checkAuthStatus = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      if (res && !res.error) {
        setSources((prev) =>
          prev.map((s) => ({
            ...s,
            connected: (s.id === 'gmail' || s.id === 'drive')
              ? (res.google?.connected || false)
              : (res[s.id]?.connected || false),
          }))
        );
      }
    } catch (err) {
      console.log('Could not fetch auth status:', err);
    }
  };

  useEffect(() => {
    if (transcript) {
      setQuery(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (!isListening && transcript.trim()) {
      handleSearch(transcript.trim());
      resetTranscript();
    }
  }, [isListening]);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setShowHistory(false);

    // Create a new conversation if we don't have one
    let convo = currentConvo;
    if (!convo) {
      convo = createConversation();
      setCurrentConvo(convo);
    }

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SEARCH',
        query: searchQuery,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        const updated = addMessageToConversation(convo, searchQuery, result);
        setCurrentConvo(updated);
        await saveConversation(updated);
        // Refresh conversation list
        const convos = await loadConversations();
        setAllConversations(convos);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed — is the backend running?');
    } finally {
      setIsLoading(false);
      setQuery('');
    }
  }, [currentConvo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setQuery('');
      startListening();
    }
  };

  const handleClose = () => {
    window.close();
  };

  const handleNewChat = () => {
    setCurrentConvo(null);
    setError(null);
    setQuery('');
    setShowHistory(false);
  };

  const handleOpenConversation = (convo: ChatConversation) => {
    setCurrentConvo(convo);
    setShowHistory(false);
    setError(null);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convoId: string) => {
    e.stopPropagation();
    await deleteConversation(convoId);
    const convos = await loadConversations();
    setAllConversations(convos);
    if (currentConvo?.id === convoId) {
      setCurrentConvo(null);
    }
  };

  const handleClearAll = async () => {
    await clearAllConversations();
    setAllConversations([]);
    setCurrentConvo(null);
    setShowHistory(false);
  };

  const handleConnect = async (provider: string) => {
    try {
      setError(null);
      const res = await chrome.runtime.sendMessage({
        type: 'START_OAUTH',
        provider,
      });
      if (res?.error) {
        setError(`OAuth failed: ${res.error}. Is the backend running on localhost:3001?`);
        return;
      }
      if (res?.started) {
        setShowSettings(false);
        const poll = setInterval(async () => {
          await checkAuthStatus();
        }, 2000);
        setTimeout(() => clearInterval(poll), 120000);
      }
    } catch (err: any) {
      console.error(`Failed to start ${provider} OAuth:`, err);
      setError(`Could not connect to backend. Make sure it's running: npm run dev:backend`);
    }
  };

  const googleConnected = sources.find((s) => s.id === 'gmail')?.connected || false;

  // History view
  if (showHistory) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="logo-text">History</div>
          </div>
          <button className="close-btn" onClick={() => setShowHistory(false)} title="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="results-area" style={{ padding: '16px' }}>
          {allConversations.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                width: '100%', padding: '8px', marginBottom: '12px',
                background: 'none', border: '1px solid #fecaca',
                borderRadius: 'var(--radius-md)', color: '#dc2626',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Clear all history
            </button>
          )}

          {allConversations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '14px' }}>No conversations yet</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>Your search history will appear here</p>
            </div>
          )}

          {allConversations.map((convo) => (
            <div
              key={convo.id}
              onClick={() => handleOpenConversation(convo)}
              style={{
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '8px',
                cursor: 'pointer',
                background: currentConvo?.id === convo.id ? 'var(--bg-secondary)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = currentConvo?.id === convo.id ? 'var(--bg-secondary)' : 'transparent')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {convo.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {convo.messages.length} {convo.messages.length === 1 ? 'search' : 'searches'} &middot; {formatConvoTime(convo.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(e, convo.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '2px', flexShrink: 0,
                    fontSize: '14px', lineHeight: 1,
                  }}
                  title="Delete conversation"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Settings / Connect view
  if (showSettings) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <div className="logo-icon">
              <svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="fmnBloomGrad" cx="50%" cy="50%" r="62%"><stop offset="0%" stopColor="#c2d8f2" /><stop offset="52%" stopColor="#6f9fdb" /><stop offset="100%" stopColor="#3f6fb5" /></radialGradient></defs><circle cx="50" cy="28" r="19" fill="url(#fmnBloomGrad)" /><circle cx="71" cy="43" r="19" fill="url(#fmnBloomGrad)" /><circle cx="63" cy="68" r="19" fill="url(#fmnBloomGrad)" /><circle cx="37" cy="68" r="19" fill="url(#fmnBloomGrad)" /><circle cx="29" cy="43" r="19" fill="url(#fmnBloomGrad)" /><circle cx="50" cy="50" r="12.5" fill="#ffffff" /><circle cx="50" cy="50" r="6.5" fill="#f2c250" /></svg>
            </div>
            <div className="logo-text">ForgetMeNot</div>
          </div>
          <button className="close-btn" onClick={() => setShowSettings(false)} title="Back to search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="results-area" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Connect your apps</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            ForgetMeNot searches across your connected accounts. Connect at least one to get started.
          </p>

          {/* Google (Gmail + Drive) */}
          <div style={{
            padding: '16px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: 'var(--radius-sm)',
                background: '#f3f4f6', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px',
              }}>
                {'🔵'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>Google</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Gmail + Google Drive</div>
              </div>
            </div>
            {googleConnected ? (
              <span style={{
                padding: '4px 12px', borderRadius: 'var(--radius-full)',
                background: '#dcfce7', color: '#16a34a', fontSize: '12px', fontWeight: 600,
              }}>
                Connected
              </span>
            ) : (
              <button
                onClick={() => handleConnect('google')}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-full)',
                  background: 'var(--accent)', color: 'white', border: 'none',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Connect
              </button>
            )}
          </div>

          {/* Slack */}
          <div style={{
            padding: '16px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: 'var(--radius-sm)',
                background: '#f3f4f6', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px',
              }}>
                {'💬'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>Slack</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Messages & channels</div>
              </div>
            </div>
            <span style={{
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-secondary)', color: 'var(--text-muted)',
              fontSize: '12px', fontWeight: 600,
            }}>
              Coming soon
            </span>
          </div>

          {/* Notion */}
          <div style={{
            padding: '16px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: 'var(--radius-sm)',
                background: '#f3f4f6', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px',
              }}>
                {'📝'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>Notion</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pages & databases</div>
              </div>
            </div>
            <span style={{
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-secondary)', color: 'var(--text-muted)',
              fontSize: '12px', fontWeight: 600,
            }}>
              Coming soon
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Main search / chat view
  const hasMessages = currentConvo && currentConvo.messages.length > 0;

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon">
            <svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="fmnBloomGrad" cx="50%" cy="50%" r="62%"><stop offset="0%" stopColor="#c2d8f2" /><stop offset="52%" stopColor="#6f9fdb" /><stop offset="100%" stopColor="#3f6fb5" /></radialGradient></defs><circle cx="50" cy="28" r="19" fill="url(#fmnBloomGrad)" /><circle cx="71" cy="43" r="19" fill="url(#fmnBloomGrad)" /><circle cx="63" cy="68" r="19" fill="url(#fmnBloomGrad)" /><circle cx="37" cy="68" r="19" fill="url(#fmnBloomGrad)" /><circle cx="29" cy="43" r="19" fill="url(#fmnBloomGrad)" /><circle cx="50" cy="50" r="12.5" fill="#ffffff" /><circle cx="50" cy="50" r="6.5" fill="#f2c250" /></svg>
          </div>
          <div className="logo-text">ForgetMeNot</div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {/* New Chat button */}
          <button
            className="close-btn"
            onClick={handleNewChat}
            title="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
          {/* History button */}
          <button
            className="close-btn"
            onClick={() => setShowHistory(true)}
            title="Chat history"
            style={{ position: 'relative' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {allConversations.length > 0 && (
              <span style={{
                position: 'absolute', top: '-2px', right: '-2px',
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--accent)',
              }} />
            )}
          </button>
          {/* Settings button */}
          <button
            className="close-btn"
            onClick={() => setShowSettings(true)}
            title="Connect apps"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="close-btn" onClick={handleClose} title="Close (Ctrl+Shift+K)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Connected Sources */}
      <div className="sources-bar">
        {sources.map((source) => (
          <div
            key={source.id}
            className={`source-badge ${source.connected ? 'connected' : 'disconnected'}`}
            title={source.connected ? `${source.name} connected` : `Connect ${source.name}`}
            onClick={() => !source.connected && setShowSettings(true)}
          >
            <span className={`source-dot ${source.connected ? 'active' : 'inactive'}`} />
            {source.name}
          </div>
        ))}
      </div>

      {/* Chat / Results Area */}
      <div className="results-area">
        {/* Chat messages */}
        {hasMessages && currentConvo.messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: '16px' }}>
            {/* User query bubble */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', marginBottom: '8px',
            }}>
              <div style={{
                maxWidth: '85%', padding: '10px 14px',
                background: 'var(--accent)', color: 'white',
                borderRadius: '16px 16px 4px 16px',
                fontSize: '13px', lineHeight: '1.4',
              }}>
                {msg.query}
              </div>
            </div>
            {/* AI response */}
            <div style={{ marginBottom: '4px' }}>
              <div className="ai-response">
                <div className="label">AI Summary</div>
                {msg.response.answer}
              </div>
              {msg.response.results.map((result) => (
                <ResultCard key={result.id} result={result} />
              ))}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{ marginBottom: '16px' }}>
            {/* Show the query being searched */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', marginBottom: '8px',
            }}>
              <div style={{
                maxWidth: '85%', padding: '10px 14px',
                background: 'var(--accent)', color: 'white',
                borderRadius: '16px 16px 4px 16px',
                fontSize: '13px', lineHeight: '1.4',
              }}>
                {query || transcript || 'Searching...'}
              </div>
            </div>
            <div className="loading-container">
              <div className="loading-dots">
                <span /><span /><span />
              </div>
              <div className="loading-text">Searching across your apps...</div>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div style={{
            padding: '16px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)', marginBottom: '16px',
            fontSize: '13px', color: '#dc2626',
          }}>
            {error}
          </div>
        )}

        {/* Empty state — no current conversation */}
        {!hasMessages && !isLoading && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="fmnBloomGrad" cx="50%" cy="50%" r="62%"><stop offset="0%" stopColor="#c2d8f2" /><stop offset="52%" stopColor="#6f9fdb" /><stop offset="100%" stopColor="#3f6fb5" /></radialGradient></defs><circle cx="50" cy="28" r="19" fill="url(#fmnBloomGrad)" /><circle cx="71" cy="43" r="19" fill="url(#fmnBloomGrad)" /><circle cx="63" cy="68" r="19" fill="url(#fmnBloomGrad)" /><circle cx="37" cy="68" r="19" fill="url(#fmnBloomGrad)" /><circle cx="29" cy="43" r="19" fill="url(#fmnBloomGrad)" /><circle cx="50" cy="50" r="12.5" fill="#ffffff" /><circle cx="50" cy="50" r="6.5" fill="#f2c250" /></svg>
            </div>
            <h3>Search everything, everywhere</h3>
            <p>
              Ask a question or search across all your connected apps &mdash; Gmail, Drive, Slack & more.
              Use the mic for voice search.
            </p>
            {!googleConnected && (
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  marginTop: '16px', padding: '8px 20px',
                  background: 'var(--accent)', color: 'white', border: 'none',
                  borderRadius: 'var(--radius-full)', fontSize: '13px',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                Connect your apps to get started
              </button>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Listening Indicator */}
      {isListening && (
        <div style={{ padding: '0 20px' }}>
          <div className="listening-indicator">
            <div className="listening-bars">
              <span /><span /><span /><span /><span />
            </div>
            <span className="listening-text">
              {transcript || 'Listening — speak your query...'}
            </span>
          </div>
        </div>
      )}

      {/* Search Input — always at bottom */}
      <div className="search-area">
        <form onSubmit={handleSubmit}>
          <div className="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder={isListening ? 'Listening...' : 'Search across all your apps...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className={`mic-btn ${isListening ? 'listening' : ''}`}
              onClick={handleMicClick}
              title={isListening ? 'Stop listening' : 'Voice search'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
            <button
              type="submit"
              className="send-btn"
              disabled={!query.trim() || isLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 7-7 7 7" />
                <path d="M12 19V5" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
