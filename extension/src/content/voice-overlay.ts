/**
 * ForgetMeNot — Voice Overlay Content Script
 * 
 * Injected into the active tab when Ctrl+Space is pressed.
 * Shows a floating mini popup, listens for voice, searches, shows top results.
 */

// Prevent double-injection
if (!(window as any).__forgetmenot_voice_loaded) {
  (window as any).__forgetmenot_voice_loaded = true;

  const API_BASE = 'http://localhost:3001';

  // ─── Create the overlay UI ──────────────────────────────────────
  function createOverlay(): HTMLDivElement {
    // Remove existing overlay if any
    const existing = document.getElementById('forgetmenot-voice-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'forgetmenot-voice-overlay';
    overlay.innerHTML = `
      <style>
        #forgetmenot-voice-overlay {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          color: #1e1b4b;
          pointer-events: auto;
        }
        #forgetmenot-voice-overlay * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .fmn-popup {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(99, 102, 241, 0.25), 0 0 0 1px rgba(99, 102, 241, 0.1);
          width: 360px;
          overflow: hidden;
          animation: fmn-slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fmn-slideIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes fmn-slideOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }

        .fmn-header {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: white;
        }

        .fmn-logo {
          font-size: 18px;
          line-height: 1;
        }

        .fmn-title {
          font-size: 13px;
          font-weight: 600;
          flex: 1;
        }

        .fmn-close {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
        }
        .fmn-close:hover { background: rgba(255,255,255,0.35); }

        .fmn-body {
          padding: 16px;
        }

        .fmn-listening {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
        }

        .fmn-mic-ring {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fmn-pulse 1.5s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes fmn-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
        }

        .fmn-mic-icon {
          color: white;
          font-size: 18px;
        }

        .fmn-status-text {
          font-size: 13px;
          color: #6b7280;
        }
        .fmn-status-text strong {
          color: #1e1b4b;
          display: block;
          margin-bottom: 2px;
        }

        .fmn-transcript {
          background: #f5f3ff;
          border-radius: 10px;
          padding: 10px 14px;
          margin: 10px 0 0 0;
          font-size: 13px;
          color: #4338ca;
          font-style: italic;
          min-height: 20px;
        }

        .fmn-searching {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 0;
        }

        .fmn-spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid #e0e7ff;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: fmn-spin 0.6s linear infinite;
          flex-shrink: 0;
        }

        @keyframes fmn-spin {
          to { transform: rotate(360deg); }
        }

        .fmn-answer {
          font-size: 13px;
          line-height: 1.5;
          color: #374151;
          padding: 4px 0 8px;
        }

        .fmn-results {
          list-style: none;
          padding: 0;
        }

        .fmn-result-item {
          display: flex;
          gap: 10px;
          padding: 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.15s;
          text-decoration: none;
          color: inherit;
          align-items: flex-start;
        }
        .fmn-result-item:hover { background: #f5f3ff; }

        .fmn-result-badge {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          font-weight: 600;
          color: white;
        }
        .fmn-badge-gmail { background: #ef4444; }
        .fmn-badge-drive { background: #f59e0b; }
        .fmn-badge-slack { background: #7c3aed; }
        .fmn-badge-notion { background: #1e1b4b; }

        .fmn-result-info { flex: 1; min-width: 0; }

        .fmn-result-title {
          font-size: 13px;
          font-weight: 600;
          color: #1e1b4b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .fmn-result-snippet {
          font-size: 12px;
          color: #6b7280;
          margin-top: 2px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .fmn-result-meta {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 3px;
        }

        .fmn-footer {
          border-top: 1px solid #f3f4f6;
          padding: 10px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .fmn-open-panel {
          font-size: 12px;
          color: #6366f1;
          background: none;
          border: none;
          cursor: pointer;
          font-weight: 500;
          padding: 4px 0;
        }
        .fmn-open-panel:hover { text-decoration: underline; }

        .fmn-shortcut-hint {
          font-size: 11px;
          color: #9ca3af;
        }

        .fmn-error {
          color: #dc2626;
          font-size: 13px;
          padding: 8px 0;
        }
      </style>

      <div class="fmn-popup">
        <div class="fmn-header">
          <span class="fmn-logo">🌸</span>
          <span class="fmn-title">ForgetMeNot</span>
          <button class="fmn-close" id="fmn-close-btn">✕</button>
        </div>
        <div class="fmn-body" id="fmn-body">
          <div class="fmn-listening">
            <div class="fmn-mic-ring">
              <span class="fmn-mic-icon">🎤</span>
            </div>
            <div class="fmn-status-text">
              <strong>Listening...</strong>
              Speak your search query
            </div>
          </div>
          <div class="fmn-transcript" id="fmn-transcript"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  // ─── Badge letter helper ────────────────────────────────────────
  function badgeFor(source: string): { letter: string; cls: string } {
    switch (source) {
      case 'gmail': return { letter: 'G', cls: 'fmn-badge-gmail' };
      case 'drive': return { letter: 'D', cls: 'fmn-badge-drive' };
      case 'slack': return { letter: 'S', cls: 'fmn-badge-slack' };
      case 'notion': return { letter: 'N', cls: 'fmn-badge-notion' };
      default: return { letter: '?', cls: 'fmn-badge-drive' };
    }
  }

  // ─── Time ago helper ────────────────────────────────────────────
  function timeAgo(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  // ─── Show results in the popup ──────────────────────────────────
  function showResults(
    body: HTMLElement,
    data: { answer: string; results: any[] }
  ): void {
    const topResults = data.results.slice(0, 3);

    let resultsHTML = topResults
      .map((r: any) => {
        const badge = badgeFor(r.source);
        return `
          <a class="fmn-result-item" href="${r.url}" target="_blank" rel="noopener">
            <div class="fmn-result-badge ${badge.cls}">${badge.letter}</div>
            <div class="fmn-result-info">
              <div class="fmn-result-title">${escapeHtml(r.title)}</div>
              <div class="fmn-result-snippet">${escapeHtml(r.snippet || '')}</div>
              <div class="fmn-result-meta">${r.author ? escapeHtml(r.author) + ' · ' : ''}${timeAgo(r.timestamp)}</div>
            </div>
          </a>`;
      })
      .join('');

    body.innerHTML = `
      <div class="fmn-answer">${escapeHtml(data.answer)}</div>
      <ul class="fmn-results">${resultsHTML}</ul>
    `;

    // Add footer
    const popup = body.closest('.fmn-popup');
    if (popup) {
      // Remove old footer if exists
      const oldFooter = popup.querySelector('.fmn-footer');
      if (oldFooter) oldFooter.remove();

      const footer = document.createElement('div');
      footer.className = 'fmn-footer';
      footer.innerHTML = `
        <button class="fmn-open-panel" id="fmn-open-panel-btn">Open full panel →</button>
        <span class="fmn-shortcut-hint">Ctrl+Space to search again</span>
      `;
      popup.appendChild(footer);

      footer.querySelector('#fmn-open-panel-btn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      });
    }
  }

  // ─── Show searching state ───────────────────────────────────────
  function showSearching(body: HTMLElement, transcript: string): void {
    body.innerHTML = `
      <div class="fmn-transcript">"${escapeHtml(transcript)}"</div>
      <div class="fmn-searching">
        <div class="fmn-spinner"></div>
        <span style="font-size:13px;color:#6b7280;">Searching your apps...</span>
      </div>
    `;
  }

  // ─── Show error ─────────────────────────────────────────────────
  function showError(body: HTMLElement, message: string): void {
    body.innerHTML = `
      <div class="fmn-error">⚠ ${escapeHtml(message)}</div>
    `;
  }

  // ─── HTML escape ────────────────────────────────────────────────
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Close overlay with animation ───────────────────────────────
  function closeOverlay(overlay: HTMLElement): void {
    const popup = overlay.querySelector('.fmn-popup') as HTMLElement;
    if (popup) {
      popup.style.animation = 'fmn-slideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => overlay.remove(), 200);
    } else {
      overlay.remove();
    }
    (window as any).__forgetmenot_voice_loaded = false;
  }

  // ─── Main flow ─────────────────────────────────────────────────
  async function startVoiceSearch(): Promise<void> {
    const overlay = createOverlay();
    const body = document.getElementById('fmn-body')!;
    const transcriptEl = document.getElementById('fmn-transcript')!;
    const closeBtn = document.getElementById('fmn-close-btn')!;

    // Close button
    closeBtn.addEventListener('click', () => closeOverlay(overlay));

    // Escape key to close
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeOverlay(overlay);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Auto-close after 15 seconds of showing results
    let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

    // Start speech recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showError(body, 'Speech recognition not supported in this browser.');
      setTimeout(() => closeOverlay(overlay), 3000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      transcriptEl.textContent = final || interim || '...';
    };

    recognition.onend = async () => {
      const transcript = (transcriptEl.textContent || '').trim();
      if (!transcript) {
        showError(body, 'No speech detected. Try again with Ctrl+Space.');
        setTimeout(() => closeOverlay(overlay), 2500);
        return;
      }

      // Show searching state
      showSearching(body, transcript);

      // Do the search
      try {
        const res = await fetch(`${API_BASE}/api/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: transcript }),
        });
        const data = await res.json();
        showResults(body, data);

        // Auto-close after 15s
        autoCloseTimer = setTimeout(() => closeOverlay(overlay), 15000);
      } catch (err) {
        showError(body, 'Could not reach ForgetMeNot backend. Is it running?');
        setTimeout(() => closeOverlay(overlay), 3000);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        showError(body, 'Microphone access denied. Allow it in browser settings.');
      } else {
        showError(body, `Voice error: ${event.error}`);
      }
      setTimeout(() => closeOverlay(overlay), 3000);
    };

    try {
      recognition.start();
    } catch (e) {
      showError(body, 'Could not start voice recognition.');
      setTimeout(() => closeOverlay(overlay), 3000);
    }
  }

  // ─── Listen for messages from background ────────────────────────
  chrome.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'START_VOICE_SEARCH') {
      startVoiceSearch();
    }
  });

  // Start immediately on injection
  startVoiceSearch();
}
