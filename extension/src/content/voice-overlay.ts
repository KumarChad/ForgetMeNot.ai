/**
 * ForgetMeNot — Voice Overlay Content Script
 *
 * Injected into the active tab when Ctrl+Space is pressed.
 * Phase 1: a small forget-me-not blooms in the corner and listens — your words
 *          fade in beneath it with a live caret, over a transparent background.
 * Phase 2: it animates into a compact card of the top results you can drag into
 *          any app or web page.
 */

(function () {
  const existing = document.getElementById('forgetmenot-voice-overlay');
  if (existing) existing.remove();

  const API_BASE = 'http://18.212.41.218:3001';
  const preparedDriveFiles = new Map<string, File>();
  const driveFileLoads = new Map<string, Promise<File>>();

  const BLOOM = `
    <svg class="fmn-bloom" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="fmnPetalGrad" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stop-color="#c2d8f2"/>
          <stop offset="52%" stop-color="#6f9fdb"/>
          <stop offset="100%" stop-color="#3f6fb5"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="28" r="19" fill="url(#fmnPetalGrad)"/>
      <circle cx="71" cy="43" r="19" fill="url(#fmnPetalGrad)"/>
      <circle cx="63" cy="68" r="19" fill="url(#fmnPetalGrad)"/>
      <circle cx="37" cy="68" r="19" fill="url(#fmnPetalGrad)"/>
      <circle cx="29" cy="43" r="19" fill="url(#fmnPetalGrad)"/>
      <circle cx="50" cy="50" r="12.5" fill="#ffffff"/>
      <circle cx="50" cy="50" r="6.5" fill="#f2c250"/>
    </svg>`;

  const STYLES = `
    #forgetmenot-voice-overlay {
      position: fixed; top: 24px; right: 24px; z-index: 2147483647;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      pointer-events: none;
    }
    #forgetmenot-voice-overlay * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Phase 1: listening (transparent) ── */
    .fmn-stack { display: flex; flex-direction: column; align-items: center; gap: 9px; pointer-events: auto; }
    .fmn-stack.fmn-out { animation: fmn-fadeout .2s ease forwards; }
    .fmn-flower { width: 54px; height: 54px; position: relative; animation: fmn-pop .45s cubic-bezier(.2,1.3,.4,1) both; }
    .fmn-flower .fmn-bloom { width: 100%; height: 100%; display: block; filter: drop-shadow(0 6px 16px rgba(63,111,181,.4)); animation: fmn-breathe 2.4s ease-in-out infinite; transform-origin: center; }
    .fmn-flower.listening::before, .fmn-flower.listening::after {
      content: ''; position: absolute; inset: 4px; border-radius: 50%;
      border: 1.5px solid rgba(111,159,219,.55); animation: fmn-ring 2.1s ease-out infinite;
    }
    .fmn-flower.listening::after { animation-delay: 1.05s; }
    @keyframes fmn-ring { 0% { transform: scale(.5); opacity: .7; } 100% { transform: scale(1.7); opacity: 0; } }
    @keyframes fmn-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    @keyframes fmn-pop { from { opacity: 0; transform: scale(.2); } to { opacity: 1; transform: scale(1); } }
    @keyframes fmn-fadeout { to { opacity: 0; transform: scale(.9); } }

    .fmn-words {
      display: none; max-width: 250px; text-align: center; font-size: 14.5px; font-weight: 600;
      color: #233040; line-height: 1.35; padding: 6px 12px; border-radius: 12px;
      background: rgba(255,255,255,.66); backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px);
      box-shadow: 0 5px 18px rgba(31,54,84,.12);
    }
    .fmn-words.show { display: inline-block; animation: fmn-wordsin .28s cubic-bezier(.2,.9,.3,1); }
    @keyframes fmn-wordsin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .fmn-caret { display: inline-block; width: 2px; height: 1em; background: #3f6fb5; margin-left: 3px; vertical-align: -2px; border-radius: 1px; animation: fmn-blink 1s step-end infinite; }
    @keyframes fmn-blink { 50% { opacity: 0; } }

    .fmn-hint {
      font-size: 11px; font-weight: 500; color: #5a6775; letter-spacing: .3px;
      background: rgba(255,255,255,.55); padding: 3px 9px; border-radius: 9px;
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    }
    .fmn-spin { width: 13px; height: 13px; border: 2px solid rgba(111,159,219,.35); border-top-color: #3f6fb5; border-radius: 50%; animation: fmn-spin .6s linear infinite; display: inline-block; vertical-align: -2px; margin-right: 5px; }
    @keyframes fmn-spin { to { transform: rotate(360deg); } }

    /* ── Phase 2: results card ── */
    .fmn-card {
      width: 320px; background: #fff; border: 1px solid #e2eaf3; border-radius: 16px;
      box-shadow: 0 20px 60px rgba(31,54,84,.26); overflow: hidden; pointer-events: auto;
      animation: fmn-cardin .4s cubic-bezier(.2,1,.3,1) both;
    }
    @keyframes fmn-cardin { from { opacity: 0; transform: translateY(-8px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .fmn-chead { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
    .fmn-chead .fmn-bloom { width: 22px; height: 22px; flex-shrink: 0; }
    .fmn-ctitle { font-weight: 600; color: #233040; font-size: 13.5px; flex: 1; }
    .fmn-cq { font-size: 11px; color: #8b9aab; font-style: italic; max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fmn-cclose { pointer-events: auto; background: none; border: none; color: #b6c2cf; cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 4px; flex-shrink: 0; }
    .fmn-cclose:hover { color: #5a6775; }
    .fmn-answer { padding: 0 14px 10px; font-size: 12.5px; line-height: 1.5; color: #4a5765; }
    .fmn-answer b { color: #3f6fb5; }
    .fmn-list { list-style: none; padding: 0 8px 6px; }
    .fmn-item { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 10px; cursor: grab; transition: background .15s, opacity .15s, transform .15s; text-decoration: none; color: inherit; user-select: none; animation: fmn-itemin .4s ease both; }
    @keyframes fmn-itemin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .fmn-item:nth-child(1) { animation-delay: .05s; }
    .fmn-item:nth-child(2) { animation-delay: .12s; }
    .fmn-item:nth-child(3) { animation-delay: .19s; }
    .fmn-item:nth-child(4) { animation-delay: .26s; }
    .fmn-item:hover { background: #eef4fb; }
    .fmn-item.fmn-dragging { opacity: .5; transform: scale(.97); }
    .fmn-badge { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; }
    .fmn-b-gmail { background: linear-gradient(135deg,#e77a72,#d9534a); }
    .fmn-b-drive { background: linear-gradient(135deg,#f2c66a,#e0a63e); }
    .fmn-b-slack { background: linear-gradient(135deg,#7aa8e6,#5b8fd6); }
    .fmn-b-notion { background: linear-gradient(135deg,#5a6775,#33404d); }
    .fmn-it { flex: 1; min-width: 0; }
    .fmn-t { font-size: 12.5px; font-weight: 600; color: #233040; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fmn-s { font-size: 11.5px; color: #8b9aab; margin-top: 1px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .fmn-m { font-size: 10.5px; color: #3f6fb5; font-weight: 500; margin-top: 2px; }
    .fmn-hand { color: #c2ccd8; font-size: 11px; align-self: center; }
    .fmn-cfoot { border-top: 1px solid #eef2f7; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; }
    .fmn-drop { font-size: 10.5px; color: #8b9aab; }
    .fmn-again { width: 30px; height: 30px; border-radius: 50%; border: none; background: linear-gradient(135deg,#7ba6e2,#5b8fd6); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; transition: transform .15s, box-shadow .15s; }
    .fmn-again:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(91,143,214,.4); }
    .fmn-error { pointer-events: auto; background: rgba(255,255,255,.88); backdrop-filter: blur(7px); border-radius: 12px; padding: 10px 14px; font-size: 12.5px; color: #c0392b; box-shadow: 0 5px 18px rgba(31,54,84,.14); max-width: 250px; text-align: center; }
    @media (prefers-reduced-motion: reduce) {
      .fmn-flower .fmn-bloom, .fmn-flower.listening::before, .fmn-flower.listening::after, .fmn-caret, .fmn-item { animation: none !important; }
    }
  `;

  let overlay: HTMLDivElement;

  function mountOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'forgetmenot-voice-overlay';
    el.innerHTML = `<style>${STYLES}</style><div class="fmn-slot"></div>`;
    document.body.appendChild(el);
    return el;
  }

  function slot(): HTMLElement {
    return overlay.querySelector('.fmn-slot') as HTMLElement;
  }

  // ── Phase 1: listening ──
  function renderListening(): void {
    slot().innerHTML = `
      <div class="fmn-stack">
        <div class="fmn-flower listening">${BLOOM}</div>
        <div class="fmn-words" id="fmn-words"><span id="fmn-wtext"></span><span class="fmn-caret"></span></div>
        <div class="fmn-hint" id="fmn-hint">Listening&hellip;</div>
      </div>`;
  }

  function setWords(text: string): void {
    const words = document.getElementById('fmn-words');
    const wtext = document.getElementById('fmn-wtext');
    if (!words || !wtext) return;
    wtext.textContent = text;
    words.classList.toggle('show', !!text);
  }

  function renderSearching(transcript: string): void {
    setWords(transcript);
    const caret = overlay.querySelector('.fmn-caret') as HTMLElement | null;
    if (caret) caret.style.display = 'none';
    const hint = document.getElementById('fmn-hint');
    if (hint) hint.innerHTML = `<span class="fmn-spin"></span>Searching&hellip;`;
    const flower = overlay.querySelector('.fmn-flower');
    if (flower) flower.classList.remove('listening');
  }

  // ── Phase 2: results card ──
  function badgeFor(source: string): { letter: string; cls: string } {
    switch (source) {
      case 'gmail': return { letter: 'G', cls: 'fmn-b-gmail' };
      case 'drive': return { letter: 'D', cls: 'fmn-b-drive' };
      case 'slack': return { letter: 'S', cls: 'fmn-b-slack' };
      case 'notion': return { letter: 'N', cls: 'fmn-b-notion' };
      default: return { letter: '?', cls: 'fmn-b-drive' };
    }
  }

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

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sourceLabel(source: string): string {
    if (source === 'drive') return 'Google Drive';
    return source.charAt(0).toUpperCase() + source.slice(1);
  }

  function filenameForResult(result: any): string {
    const filename = result.title || 'file';
    if (result.source !== 'drive' || filename.includes('.')) return filename;
    const extensions: Record<string, string> = {
      document: '.pdf',
      spreadsheet: '.xlsx',
      presentation: '.pptx',
    };
    return filename + (extensions[result.type] || '');
  }

  function fileFromBase64(data: string, filename: string, mimeType: string): File {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], filename, { type: mimeType });
  }

  function prepareDriveFile(fileId: string, filename: string): Promise<File> {
    const prepared = preparedDriveFiles.get(fileId);
    if (prepared) return Promise.resolve(prepared);

    const existingLoad = driveFileLoads.get(fileId);
    if (existingLoad) return existingLoad;

    const load = chrome.runtime.sendMessage({ type: 'GET_DRIVE_FILE', fileId })
      .then((payload) => {
        if (payload?.error) throw new Error(payload.error);
        const file = fileFromBase64(
          payload.data,
          filename,
          payload.mimeType || 'application/octet-stream',
        );
        preparedDriveFiles.set(fileId, file);
        return file;
      })
      .finally(() => driveFileLoads.delete(fileId));

    driveFileLoads.set(fileId, load);
    return load;
  }

  function showResults(query: string, data: { answer: string; results: any[] }): void {
    const top = (data.results || []).slice(0, 4);
    if (!top.length) {
      showError('Nothing found for that. Try rephrasing with Ctrl+Space.');
      return;
    }

    const items = top.map((r: any) => {
      const badge = badgeFor(r.source);
      const rawId = String(r.id || '').replace(/^(gmail|drive|slack|notion)-/, '');
      const downloadUrl = r.source === 'drive' ? `${API_BASE}/api/download/drive/${rawId}` : '';
      const fileName = filenameForResult(r);
      const driveFileId = r.source === 'drive' ? rawId : '';
      return `
        <li><div class="fmn-item" draggable="true" role="button" tabindex="0"
               data-url="${escapeHtml(r.url)}" data-download-url="${escapeHtml(downloadUrl)}" data-drive-file-id="${escapeHtml(driveFileId)}" data-filename="${escapeHtml(fileName)}">
          <div class="fmn-badge ${badge.cls}">${badge.letter}</div>
          <div class="fmn-it">
            <div class="fmn-t">${escapeHtml(r.title || 'Untitled')}</div>
            <div class="fmn-s">${escapeHtml(r.snippet || '')}</div>
            <div class="fmn-m">${r.author ? escapeHtml(r.author) + ' · ' : ''}${sourceLabel(r.source)} · ${timeAgo(r.timestamp)}</div>
          </div>
          <span class="fmn-hand">&#10287;</span>
        </div></li>`;
    }).join('');

    const stack = overlay.querySelector('.fmn-stack');
    const paint = () => {
      slot().innerHTML = `
        <div class="fmn-card">
          <div class="fmn-chead">
            ${BLOOM}
            <span class="fmn-ctitle">Found it</span>
            <span class="fmn-cq">"${escapeHtml(query)}"</span>
            <button class="fmn-cclose" id="fmn-close">&times;</button>
          </div>
          <div class="fmn-answer">${escapeHtml(data.answer || '')}</div>
          <ul class="fmn-list">${items}</ul>
          <div class="fmn-cfoot">
            <span class="fmn-drop">Hover a Drive file, then drag it into an app &#8599;</span>
            <button class="fmn-again" id="fmn-again" title="Search again">&#127908;</button>
          </div>
        </div>`;
      attachCardHandlers();
    };

    if (stack) {
      stack.classList.add('fmn-out');
      setTimeout(paint, 190);
    } else {
      paint();
    }
  }

  function attachCardHandlers(): void {
    document.getElementById('fmn-close')?.addEventListener('click', closeOverlay);
    document.getElementById('fmn-again')?.addEventListener('click', () => startVoiceSearch());

    overlay.querySelectorAll('.fmn-item').forEach((el) => {
      el.addEventListener('pointerenter', () => {
        const item = el as HTMLElement;
        const fileId = item.getAttribute('data-drive-file-id') || '';
        if (!fileId) return;
        const filename = item.getAttribute('data-filename') || 'file';
        item.setAttribute('title', 'Preparing file for drag and drop…');
        void prepareDriveFile(fileId, filename)
          .then(() => item.setAttribute('title', 'File ready to drop'))
          .catch(() => item.setAttribute('title', 'File unavailable — dragging its source link instead'));
      });

      el.addEventListener('click', () => {
        const u = (el as HTMLElement).getAttribute('data-url');
        if (u) window.open(u, '_blank', 'noopener');
      });

      el.addEventListener('dragstart', (e: Event) => {
        const de = e as DragEvent;
        const item = de.currentTarget as HTMLElement;
        item.classList.add('fmn-dragging');
        de.stopPropagation();
        de.dataTransfer!.clearData();
        const url = item.getAttribute('data-url') || '';
        const downloadUrl = item.getAttribute('data-download-url') || '';
        const driveFileId = item.getAttribute('data-drive-file-id') || '';
        const filename = item.getAttribute('data-filename') || 'file';
        de.dataTransfer!.setData('text/uri-list', url);
        de.dataTransfer!.setData('text/plain', url);
        if (downloadUrl) {
          de.dataTransfer!.setData('DownloadURL', `application/octet-stream:${filename}:${downloadUrl}`);
        }
        const preparedFile = preparedDriveFiles.get(driveFileId);
        if (preparedFile) {
          de.dataTransfer!.items.add(preparedFile);
          de.dataTransfer!.effectAllowed = 'copy';
        } else {
          de.dataTransfer!.effectAllowed = 'copyLink';
        }
        const ghost = document.createElement('div');
        ghost.textContent = `\u{1F4CE} ${filename}`;
        ghost.style.cssText = 'position:absolute;top:-1000px;padding:7px 12px;background:#5b8fd6;color:white;border-radius:8px;font-size:12px;font-family:sans-serif;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;';
        document.body.appendChild(ghost);
        de.dataTransfer!.setDragImage(ghost, 0, 0);
        setTimeout(() => ghost.remove(), 0);
      });
      el.addEventListener('dragend', (e: Event) => {
        (e.currentTarget as HTMLElement).classList.remove('fmn-dragging');
      });
    });
  }

  function showError(message: string): void {
    slot().innerHTML = `<div class="fmn-error">&#9888; ${escapeHtml(message)}</div>`;
    setTimeout(closeOverlay, 3000);
  }

  function closeOverlay(): void {
    const target = (overlay?.querySelector('.fmn-card') || overlay?.querySelector('.fmn-stack')) as HTMLElement | null;
    if (target) {
      target.style.transition = 'opacity .2s ease, transform .2s ease';
      target.style.opacity = '0';
      target.style.transform = 'scale(.92)';
      setTimeout(() => overlay?.remove(), 200);
    } else {
      overlay?.remove();
    }
    document.removeEventListener('keydown', escHandler);
  }

  function escHandler(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeOverlay();
  }

  // ── Main flow ──
  async function startVoiceSearch(): Promise<void> {
    if (!overlay || !document.body.contains(overlay)) {
      overlay = mountOverlay();
    }
    renderListening();
    document.addEventListener('keydown', escHandler);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Speech recognition is not supported in this browser.');
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
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      setWords(final || interim || '');
    };

    recognition.onend = async () => {
      const wtext = document.getElementById('fmn-wtext');
      const transcript = (wtext?.textContent || '').trim();
      if (!transcript) {
        showError('No speech detected. Try again with Ctrl+Space.');
        return;
      }
      renderSearching(transcript);
      try {
        // Content scripts inherit the host page's security rules. Route through
        // the extension service worker so HTTPS pages never make a mixed-content
        // request to the backend.
        const data = await chrome.runtime.sendMessage({
          type: 'SEARCH',
          query: transcript,
          context: { url: window.location.href, title: document.title },
        });
        if (data?.error) throw new Error(data.error);
        showResults(transcript, data);
      } catch (err: any) {
        console.error('Voice search failed:', err);
        showError(`Search failed: ${err?.message || 'Could not reach the ForgetMeNot backend.'}`);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        showError('Microphone access denied. Allow it in your browser settings.');
      } else if (event.error === 'no-speech') {
        showError('No speech detected. Try again with Ctrl+Space.');
      } else {
        showError(`Voice error: ${event.error}`);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      showError('Could not start voice recognition.');
    }
  }

  chrome.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'START_VOICE_SEARCH') startVoiceSearch();
  });

  startVoiceSearch();
})();
