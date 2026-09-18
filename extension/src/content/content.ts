const SIDEBAR_WIDTH = 380;
const TOGGLE_SIZE = 48;

function createToggleButton(): HTMLElement {
  const btn = document.createElement('div');
  btn.id = 'pond-toggle';
  btn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.3-4.3"></path>
    </svg>
  `;
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: `${TOGGLE_SIZE}px`,
    height: `${TOGGLE_SIZE}px`,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: '2147483646',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    border: 'none',
  });

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 28px rgba(99, 102, 241, 0.5)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.4)';
  });

  return btn;
}

function createSidebarFrame(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = 'pond-sidebar';
  iframe.src = chrome.runtime.getURL('src/sidebar/index.html');
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: `${SIDEBAR_WIDTH}px`,
    height: '100vh',
    border: 'none',
    zIndex: '2147483647',
    boxShadow: '-4px 0 30px rgba(0, 0, 0, 0.15)',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'translateX(100%)',
    backgroundColor: 'white',
  });
  return iframe;
}

function init() {
  if (window.location.href.includes(chrome.runtime.id)) return;

  const toggle = createToggleButton();
  const sidebar = createSidebarFrame();
  let isOpen = false;

  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    sidebar.style.transform = isOpen ? 'translateX(0)' : 'translateX(100%)';
    toggle.style.right = isOpen ? `${SIDEBAR_WIDTH + 24}px` : '24px';

    toggle.innerHTML = isOpen
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`;
  });

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'POND_CLOSE') {
      isOpen = false;
      sidebar.style.transform = 'translateX(100%)';
      toggle.style.right = '24px';
      toggle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`;
    }

    if (event.data?.type === 'POND_GET_CONTEXT') {
      sidebar.contentWindow?.postMessage({
        type: 'POND_PAGE_CONTEXT',
        data: {
          url: window.location.href,
          title: document.title,
          domain: window.location.hostname,
        },
      }, '*');
    }
  });

  document.body.appendChild(sidebar);
  document.body.appendChild(toggle);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'K') {
      e.preventDefault();
      toggle.click();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
