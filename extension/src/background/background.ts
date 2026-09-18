const API_BASE = 'http://localhost:3001';

// Open side panel when the extension icon is clicked (or Ctrl+Shift+K)
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
      console.error('Failed to open side panel:', err);
    }
  }
});

// Enable side panel on all pages
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Voice search command (Ctrl+Space) ───────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'voice_search') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Inject the voice overlay content script into the active tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['voice-overlay.js'],
      });
    } catch (err) {
      console.error('Failed to inject voice overlay:', err);
    }
  }
});

// Track OAuth tabs so we can auto-close them
const oauthTabs = new Set<number>();

// Listen for tab URL changes to detect OAuth callback completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (oauthTabs.has(tabId) && changeInfo.url) {
    if (changeInfo.url.startsWith(`${API_BASE}/api/auth/`) && changeInfo.url.includes('callback')) {
      setTimeout(() => {
        chrome.tabs.remove(tabId).catch(() => {});
        oauthTabs.delete(tabId);
      }, 2500);
    }
  }
});

// Clean up tracking if tab is closed manually
chrome.tabs.onRemoved.addListener((tabId) => {
  oauthTabs.delete(tabId);
});

// Handle messages from the side panel and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SEARCH') {
    handleSearch(message.query, message.context)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'EXECUTE_ACTION') {
    handleAction(message.action, message.params)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_AUTH_STATUS') {
    getAuthStatus()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'START_OAUTH') {
    startOAuth(message.provider)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_PAGE_CONTEXT') {
    getActiveTabContext()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'CLOSE_PANEL') {
    if (_sender.tab?.id) {
      (chrome.sidePanel as any).close({ tabId: _sender.tab.id });
    }
    return false;
  }
});

async function handleSearch(query: string, context?: { url: string; title: string }) {
  const response = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, context }),
  });
  if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);
  return response.json();
}

async function handleAction(action: string, params: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  });
  if (!response.ok) throw new Error(`Action failed: ${response.statusText}`);
  return response.json();
}

async function getAuthStatus() {
  const response = await fetch(`${API_BASE}/api/auth/status`);
  if (!response.ok) throw new Error('Failed to get auth status');
  return response.json();
}

async function startOAuth(provider: string) {
  const response = await fetch(`${API_BASE}/api/auth/${provider}/start`);
  if (!response.ok) throw new Error(`OAuth start failed for ${provider}`);
  const { authUrl } = await response.json();
  const tab = await chrome.tabs.create({ url: authUrl });
  if (tab.id) {
    oauthTabs.add(tab.id);
  }
  return { started: true, tabId: tab.id };
}

async function getActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    return {
      url: tab.url || '',
      title: tab.title || '',
      domain: tab.url ? new URL(tab.url).hostname : '',
    };
  }
  return { url: '', title: '', domain: '' };
}
