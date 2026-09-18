import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import type { SearchResult, SearchResponse, ConnectedSource } from './types';

const HINT_QUERIES = [
  'Find the budget doc Sarah shared',
  'Unread emails about the project',
  'Latest messages in #general',
  'Meeting notes from last week',
];

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

function ResultCard({ result }: { result: SearchResult }) {
  return (
    <div
      className="result-card"
      onClick={() => window.open(result.url, '_blank')}
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
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sources, setSources] = useState<ConnectedSource[]>([
    { id: 'gmail', name: 'Gmail', icon: '✉️', connected: false },
    { id: 'drive', name: 'Drive', icon: '📁', connected: false },
    { id: 'slack', name: 'Slack', icon: '💬', connected: false },
    { id: 'notion', name: 'Notion', icon: '📝', connected: false },
  ]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isListening, transcript, startListening, stopListening, resetTranscript } =
    useSpeechRecognition();

  // Fetch auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

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

  // When speech recognition produces a transcript, put it in the input
  useEffect(() => {
    if (transcript) {
      setQuery(transcript);
    }
  }, [transcript]);

  // Auto-submit when speech recognition ends with a transcript
  useEffect(() => {
    if (!isListening && transcript.trim()) {
      handleSearch(transcript.trim());
      resetTranscript();
    }
  }, [isListening]);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SEARCH',
        query: searchQuery,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        setResponse(result);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed — is the backend running?');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        // Poll for status update after OAuth completes
        const poll = setInterval(async () => {
          await checkAuthStatus();
        }, 2000);
        // Stop polling after 2 minutes
        setTimeout(() => clearInterval(poll), 120000);
      }
    } catch (err: any) {
      console.error(`Failed to start ${provider} OAuth:`, err);
      setError(`Could not connect to backend. Make sure it's running: npm run dev:backend`);
    }
  };

  const googleConnected = sources.find((s) => s.id === 'gmail')?.connected || false;

  // Settings / Connect view
  if (showSettings) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
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
                🔵
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
                💬
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
                📝
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

  // Main search view
  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <div className="logo-text">ForgetMeNot</div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
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

      {/* Search Input */}
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

      {/* Results Area */}
      <div className="results-area">
        {isLoading && (
          <div className="loading-container">
            <div className="loading-dots">
              <span /><span /><span />
            </div>
            <div className="loading-text">Searching across your apps...</div>
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

        {response && !isLoading && (
          <>
            <div className="ai-response">
              <div className="label">AI Summary</div>
              {response.answer}
            </div>
            {response.results.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </>
        )}

        {!response && !isLoading && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h3>Search everything, everywhere</h3>
            <p>
              Ask a question or search across all your connected apps — Gmail, Drive, Slack & more.
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
            <div className="hint-chips">
              {HINT_QUERIES.map((hint) => (
                <button
                  key={hint}
                  className="hint-chip"
                  onClick={() => {
                    setQuery(hint);
                    handleSearch(hint);
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
