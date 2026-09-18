/**
 * ForgetMeNot — Interactive Onboarding
 * 
 * Quick 2-step tutorial injected on first install.
 * Teaches the two keyboard shortcuts, then gets out of the way.
 */

(function () {
  const STEPS = [
    {
      keys: 'Ctrl + Space',
      title: 'Voice Search — Anywhere',
      desc: 'Press this shortcut on any page to search your Gmail and Drive with your voice.',
      icon: '🎤',
    },
    {
      keys: 'Ctrl + Shift + K',
      title: 'Full Search Panel',
      desc: 'Opens the ForgetMeNot side panel for typing queries, viewing results, and managing connections.',
      icon: '🔍',
    },
  ];

  let currentStep = 0;

  // ─── Build the overlay ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'fmn-onboarding';
  overlay.innerHTML = `
    <style>
      #fmn-onboarding {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fmnOb-fadeIn 0.3s ease;
      }

      @keyframes fmnOb-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .fmnOb-card {
        background: white;
        border-radius: 20px;
        width: 400px;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(99, 102, 241, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.08);
        animation: fmnOb-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes fmnOb-pop {
        from { opacity: 0; transform: scale(0.9) translateY(20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      .fmnOb-header {
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%);
        padding: 28px 28px 24px;
        text-align: center;
        color: white;
      }

      .fmnOb-logo {
        font-size: 36px;
        margin-bottom: 8px;
      }

      .fmnOb-brand {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .fmnOb-subtitle {
        font-size: 13px;
        opacity: 0.85;
      }

      .fmnOb-body {
        padding: 28px;
        text-align: center;
      }

      .fmnOb-step-icon {
        font-size: 40px;
        margin-bottom: 12px;
      }

      .fmnOb-keys {
        display: inline-flex;
        gap: 6px;
        margin-bottom: 16px;
      }

      .fmnOb-key {
        background: #f1f0fb;
        border: 1.5px solid #d4d0f0;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 15px;
        font-weight: 600;
        color: #4338ca;
        font-family: inherit;
        box-shadow: 0 2px 0 #d4d0f0;
      }

      .fmnOb-step-title {
        font-size: 18px;
        font-weight: 700;
        color: #1e1b4b;
        margin-bottom: 8px;
      }

      .fmnOb-step-desc {
        font-size: 14px;
        color: #6b7280;
        line-height: 1.5;
        max-width: 320px;
        margin: 0 auto;
      }

      .fmnOb-footer {
        padding: 0 28px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .fmnOb-dots {
        display: flex;
        gap: 6px;
      }

      .fmnOb-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #e0e0e0;
        transition: background 0.2s, transform 0.2s;
      }

      .fmnOb-dot.active {
        background: #6366f1;
        transform: scale(1.25);
      }

      .fmnOb-next {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
      }

      .fmnOb-next:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
      }

      .fmnOb-skip {
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 13px;
        cursor: pointer;
        padding: 4px 0;
      }
      .fmnOb-skip:hover { color: #6b7280; }
    </style>

    <div class="fmnOb-card">
      <div class="fmnOb-header">
        <div class="fmnOb-logo">🌸</div>
        <div class="fmnOb-brand">Welcome to ForgetMeNot</div>
        <div class="fmnOb-subtitle">Two shortcuts. That's all you need.</div>
      </div>
      <div class="fmnOb-body" id="fmnOb-body"></div>
      <div class="fmnOb-footer">
        <div class="fmnOb-dots" id="fmnOb-dots"></div>
        <div style="display:flex;gap:12px;align-items:center;">
          <button class="fmnOb-skip" id="fmnOb-skip">Skip</button>
          <button class="fmnOb-next" id="fmnOb-next">Next</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const body = document.getElementById('fmnOb-body')!;
  const dots = document.getElementById('fmnOb-dots')!;
  const nextBtn = document.getElementById('fmnOb-next')!;
  const skipBtn = document.getElementById('fmnOb-skip')!;

  // ─── Render a step ──────────────────────────────────────────────
  function renderStep(idx: number): void {
    const step = STEPS[idx];
    const keys = step.keys.split(' + ');

    body.innerHTML = `
      <div class="fmnOb-step-icon">${step.icon}</div>
      <div class="fmnOb-keys">
        ${keys.map((k) => `<span class="fmnOb-key">${k}</span>`).join('<span style="color:#9ca3af;font-size:18px;display:flex;align-items:center;">+</span>')}
      </div>
      <div class="fmnOb-step-title">${step.title}</div>
      <div class="fmnOb-step-desc">${step.desc}</div>
    `;

    dots.innerHTML = STEPS.map(
      (_, i) => `<div class="fmnOb-dot ${i === idx ? 'active' : ''}"></div>`
    ).join('');

    nextBtn.textContent = idx === STEPS.length - 1 ? "Got it!" : 'Next';
  }

  // ─── Close ──────────────────────────────────────────────────────
  function close(): void {
    overlay.style.animation = 'fmnOb-fadeIn 0.2s ease reverse forwards';
    setTimeout(() => overlay.remove(), 200);
    // Tell background we're done so it doesn't show again
    chrome.runtime.sendMessage({ type: 'ONBOARDING_DONE' });
  }

  // ─── Events ─────────────────────────────────────────────────────
  nextBtn.addEventListener('click', () => {
    currentStep++;
    if (currentStep >= STEPS.length) {
      close();
    } else {
      renderStep(currentStep);
    }
  });

  skipBtn.addEventListener('click', close);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // ─── Start ──────────────────────────────────────────────────────
  renderStep(0);
})();
