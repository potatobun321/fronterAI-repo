/**
 * Frontier AI Workspace — Oracle AI Side Panel & Shared Chat Engine (oracle-panel.js)
 * Frontend-only implementation adhering strictly to all requirements:
 * 1. Top bar button: ring when open, tooltip, toggle panel.
 * 2. Docked side panel: default width 400px, 200ms slide-in, drag handle resize (340px-560px).
 *    - >= 1200px: Page canvas shrinks to make room (animated flex shrinkage).
 *    - 769px - 1199px: Floats over page with shadow.
 *    - <= 768px: Full-screen sheet.
 * 3. Header: sparkle + title, three-dot menu + close (X) button. Closing does not delete chat.
 * 4. Three-dot menu: role="menu", keyboard navigation (arrows, Home/End, Esc), outside click dismiss.
 *    - Items: New chat, History, Open full page, Wide/Narrow width, Clear all chats (modal), Keyboard shortcuts.
 * 5. Chat area:
 *    - Gemini-style empty state: sparkle, "Hi [first name], what's the move?", vertical rounded quick chips.
 *    - Messages: User right, Oracle left with sparkle avatar; loading indicator; copy button on hover.
 *    - Auto-growing textarea: Enter sends, Shift+Enter makes newline, disabled send button when empty.
 *    - History view inside panel: per-row delete button, empty text "No previous conversations".
 * 6. Shortcuts & Focus:
 *    - Ctrl+/ opens/closes panel.
 *    - Esc closes menu first, then modals, then panel.
 *    - Focus goes to textarea on open, returns to AI button on close.
 *    - aria-expanded, aria-controls, role="complementary", aria-label.
 * 7. Persistence: localStorage for panel open/close, width, and current thread id.
 * 8. Shared OracleChatEngine used by both the side panel and the full-page view (#view-oracle).
 * 9. Display-only context label ("Viewing: Tasks", etc.) adapting quick chips without changing AI prompt.
 */

// Universal Helper: HTML escaping
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Universal Helper: Markdown formatting for Oracle text
export function formatOracleText(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono, monospace); font-size: 12px;">$1</code>');
  // Headings
  html = html.replace(/### (.*?)\n/g, '<h3 style="font-size: 14px; margin-top: 10px; margin-bottom: 6px; color: var(--google-blue, #8ab4f8);">$1</h3>');
  html = html.replace(/## (.*?)\n/g, '<h2 style="font-size: 15px; margin-top: 12px; margin-bottom: 6px; color: var(--google-blue, #8ab4f8);">$1</h2>');
  // Bullet lists
  html = html.replace(/(?:^|\n)[•\-] (.*?)(?=\n|$)/g, '<li style="margin-left: 18px; margin-bottom: 4px;">$1</li>');
  // Paragraph line breaks
  html = html.replace(/\n\n/g, '<br><br>');

  return html;
}

// Universal Helper: Extract current user's first name
export function getLoggedInFirstName() {
  const user = window.appState?.currentUser;
  if (user && user.name) {
    return user.name.trim().split(/\s+/)[0];
  }
  const headerNameEl = document.getElementById('header-user-name');
  if (headerNameEl && headerNameEl.textContent.trim()) {
    return headerNameEl.textContent.trim().split(/\s+/)[0];
  }
  return 'there';
}

// Universal Helper: Toast notification helper fallback
function triggerToast(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  if (toastIcon) {
    toastIcon.innerHTML = isError
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  }
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ==============================================================================
// REUSABLE CHAT ENGINE (SHARED BETWEEN SIDE PANEL AND FULL PAGE)
// ==============================================================================

export const OracleChatEngine = {
  threads: [],
  currentThreadId: null,
  activeViewContext: 'Tasks',

  init() {
    // Restore persistent thread id if available
    const savedThread = localStorage.getItem('oracle_current_thread_id');
    if (savedThread && !isNaN(parseInt(savedThread, 10))) {
      this.currentThreadId = parseInt(savedThread, 10);
    }
  },

  getCurrentThreadId() {
    return this.currentThreadId;
  },

  setCurrentThreadId(id) {
    this.currentThreadId = id;
    if (window.appState) {
      window.appState.currentOracleThreadId = id;
    }
    if (id !== null && id !== undefined) {
      localStorage.setItem('oracle_current_thread_id', String(id));
    } else {
      localStorage.removeItem('oracle_current_thread_id');
    }
  },

  async loadThreads() {
    try {
      const res = await fetch('/api/ai/threads');
      if (!res.ok) return;
      const data = await res.json();
      this.threads = data.threads || [];
      if (window.appState) {
        window.appState.oracleThreads = this.threads;
      }
      this.renderThreadsLists();

      // If we have an active thread id, verify it still exists
      if (this.currentThreadId) {
        const exists = this.threads.some(t => t.id === this.currentThreadId);
        if (!exists) {
          this.setCurrentThreadId(null);
          this.renderEmptyStateBoth();
        }
      }
    } catch (err) {
      console.error('Failed to load Oracle threads:', err);
    }
  },

  renderThreadsLists() {
    // 1. Render in full-page sidebar (#oracle-threads-list)
    const fullContainer = document.getElementById('oracle-threads-list');
    if (fullContainer) {
      if (this.threads.length === 0) {
        fullContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;">No previous conversations.</div>';
      } else {
        fullContainer.innerHTML = this.threads.map(t => `
          <div class="oracle-thread-item ${t.id === this.currentThreadId ? 'active' : ''}" data-thread-id="${t.id}" title="${escapeHtml(t.title)}">
            <span class="oracle-thread-title">${escapeHtml(t.title)}</span>
            <button type="button" class="oracle-thread-del-btn" data-thread-id="${t.id}" title="Delete thread" aria-label="Delete thread">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `).join('');

        fullContainer.querySelectorAll('.oracle-thread-item').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.oracle-thread-del-btn')) return;
            const threadId = parseInt(el.dataset.threadId, 10);
            this.loadThreadMessages(threadId);
          });
        });

        fullContainer.querySelectorAll('.oracle-thread-del-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const threadId = parseInt(btn.dataset.threadId, 10);
            this.deleteThread(threadId);
          });
        });
      }
    }

    // 2. Render in side panel history view (#oracle-panel-history-list)
    const panelHistory = document.getElementById('oracle-panel-history-list');
    if (panelHistory) {
      if (this.threads.length === 0) {
        panelHistory.innerHTML = '<div class="oracle-history-empty">No previous conversations</div>';
      } else {
        panelHistory.innerHTML = this.threads.map(t => `
          <div class="oracle-history-item ${t.id === this.currentThreadId ? 'active' : ''}" data-thread-id="${t.id}" title="${escapeHtml(t.title)}">
            <span class="oracle-history-item-title">${escapeHtml(t.title)}</span>
            <button type="button" class="oracle-history-del-btn" data-thread-id="${t.id}" title="Delete conversation" aria-label="Delete conversation">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `).join('');

        panelHistory.querySelectorAll('.oracle-history-item').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.oracle-history-del-btn')) return;
            const threadId = parseInt(el.dataset.threadId, 10);
            this.loadThreadMessages(threadId);
            switchToChatView();
          });
        });

        panelHistory.querySelectorAll('.oracle-history-del-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const threadId = parseInt(btn.dataset.threadId, 10);
            this.deleteThread(threadId);
          });
        });
      }
    }
  },

  async loadThreadMessages(threadId) {
    this.setCurrentThreadId(threadId);
    this.renderThreadsLists();

    try {
      const res = await fetch(`/api/ai/threads/${threadId}/messages`);
      if (!res.ok) return;
      const data = await res.json();

      this.clearMessagesBoxes();
      for (const msg of data.messages) {
        this.appendBubble(msg.sender_role, msg.content);
      }
      this.scrollMessagesToBottom();
    } catch (err) {
      console.error('Failed to load messages for thread:', err);
    }
  },

  clearMessagesBoxes() {
    const fullBox = document.getElementById('oracle-messages-box');
    if (fullBox) fullBox.innerHTML = '';
    const panelBox = document.getElementById('oracle-panel-messages');
    if (panelBox) panelBox.innerHTML = '';
  },

  scrollMessagesToBottom() {
    const fullBox = document.getElementById('oracle-messages-box');
    if (fullBox) fullBox.scrollTop = fullBox.scrollHeight;
    const panelBox = document.getElementById('oracle-panel-messages');
    if (panelBox) panelBox.scrollTop = panelBox.scrollHeight;
  },

  renderEmptyStateBoth() {
    const firstName = getLoggedInFirstName();
    const chipsHtml = this.getQuickChipsHtml();

    // Side panel empty state
    const panelBox = document.getElementById('oracle-panel-messages');
    if (panelBox) {
      panelBox.innerHTML = `
        <div class="oracle-empty-state" id="oracle-empty-state">
          <div class="oracle-empty-sparkle">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <h2 class="oracle-empty-greeting">Hi ${escapeHtml(firstName)}, what's the move?</h2>
          <p class="oracle-empty-subtext">Frontier Oracle has real-time awareness of sprint deliverables, syncs, and team status.</p>
          <div class="oracle-quick-chips-stack" id="oracle-panel-quick-chips">
            ${chipsHtml}
          </div>
        </div>
      `;

      // Bind click listeners on quick buttons
      panelBox.querySelectorAll('.oracle-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const prompt = btn.dataset.prompt;
          if (prompt) this.sendMessage(prompt);
        });
      });
    }

    // Full page initial welcome bubble
    const fullBox = document.getElementById('oracle-messages-box');
    if (fullBox) {
      fullBox.innerHTML = `
        <div class="oracle-bubble oracle-bubble-model">
          <div class="oracle-bubble-avatar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <div class="oracle-bubble-content">
            <p>Hi <strong>${escapeHtml(firstName)}</strong>! What's the move today?</p>
            <p>I have real-time memory of the team's sprint deliverables, calendar syncs, peer tasklets, and track allocations. How can I help you?</p>
          </div>
        </div>
      `;
    }
  },

  getQuickChipsHtml() {
    // Dynamic context adaptation (Requirement 9)
    if (this.activeViewContext === 'Call Room') {
      return `
        <button type="button" class="oracle-quick-btn" data-prompt="When is our next team sync and call?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>Next Meeting</span>
        </button>
        <button type="button" class="oracle-quick-btn" data-prompt="What calendar events and standups are scheduled this sprint?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>Calendar Syncs</span>
        </button>
        <button type="button" class="oracle-quick-btn" data-prompt="What tasks are currently in progress?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="m9 14 2 2 4-4"></path></svg>
          <span>Active Tasks</span>
        </button>
        <button type="button" class="oracle-quick-btn" data-prompt="Who is currently on the team and what are their tracks?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>Team Directory</span>
        </button>
      `;
    } else if (this.activeViewContext === 'Peer Review') {
      return `
        <button type="button" class="oracle-quick-btn" data-prompt="What peer tasklets have been exchanged recently?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-4"></path><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"></path><path d="M22 19H2"></path></svg>
          <span>Peer Tasklets</span>
        </button>
        <button type="button" class="oracle-quick-btn" data-prompt="What is the current status of the peer review voting session?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>Review Status</span>
        </button>
        <button type="button" class="oracle-quick-btn" data-prompt="What tasks are currently in progress?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="m9 14 2 2 4-4"></path></svg>
          <span>Active Tasks</span>
        </button>
        <button type="button" class="oracle-quick-btn" data-prompt="Who is currently on the team and what are their tracks?">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>Team Directory</span>
        </button>
      `;
    }

    // Default: Tasks / Workspace
    return `
      <button type="button" class="oracle-quick-btn" data-prompt="What tasks are currently in progress?">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="m9 14 2 2 4-4"></path></svg>
        <span>Active Tasks</span>
      </button>
      <button type="button" class="oracle-quick-btn" data-prompt="When is our next team sync and call?">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Next Meeting</span>
      </button>
      <button type="button" class="oracle-quick-btn" data-prompt="Who is currently on the team and what are their tracks?">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        <span>Team Directory</span>
      </button>
      <button type="button" class="oracle-quick-btn" data-prompt="What peer tasklets have been exchanged recently?">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-4"></path><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"></path><path d="M22 19H2"></path></svg>
        <span>Peer Tasklets</span>
      </button>
    `;
  },

  setContextView(viewName) {
    this.activeViewContext = viewName;
    const labelEl = document.getElementById('oracle-context-text');
    if (labelEl) {
      labelEl.textContent = `Viewing: ${viewName}`;
    }
    // If empty state is active in panel, refresh chips
    const emptyState = document.getElementById('oracle-empty-state');
    if (emptyState) {
      const stack = emptyState.querySelector('.oracle-quick-chips-stack');
      if (stack) {
        stack.innerHTML = this.getQuickChipsHtml();
        stack.querySelectorAll('.oracle-quick-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) this.sendMessage(prompt);
          });
        });
      }
    }
  },

  appendBubble(senderRole, content) {
    const isModel = senderRole === 'model';
    const user = window.appState?.currentUser;
    const avatar = isModel
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`
      : (user && user.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ME');

    const roleClass = isModel ? 'oracle-bubble-model' : 'oracle-bubble-user';
    const formattedHtml = formatOracleText(content);

    // If empty state was showing in side panel, remove it
    const panelBox = document.getElementById('oracle-panel-messages');
    if (panelBox && panelBox.querySelector('.oracle-empty-state')) {
      panelBox.innerHTML = '';
    }

    // Helper to create bubble DOM node with copy button
    const createBubbleNode = () => {
      const bubble = document.createElement('div');
      bubble.className = `oracle-bubble ${roleClass}`;

      let copyBtnHtml = '';
      if (isModel) {
        copyBtnHtml = `
          <button type="button" class="oracle-copy-btn" title="Copy response" aria-label="Copy response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        `;
      }

      bubble.innerHTML = `
        <div class="oracle-bubble-avatar">${avatar}</div>
        <div class="oracle-bubble-content">
          ${formattedHtml}
          ${copyBtnHtml}
        </div>
      `;

      if (isModel) {
        const copyBtn = bubble.querySelector('.oracle-copy-btn');
        copyBtn?.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(content);
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            triggerToast('Copied Oracle response to clipboard');
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              `;
            }, 2000);
          } catch (err) {
            triggerToast('Failed to copy to clipboard', true);
          }
        });
      }

      return bubble;
    };

    if (panelBox) {
      panelBox.appendChild(createBubbleNode());
      panelBox.scrollTop = panelBox.scrollHeight;
    }

    const fullBox = document.getElementById('oracle-messages-box');
    if (fullBox) {
      fullBox.appendChild(createBubbleNode());
      fullBox.scrollTop = fullBox.scrollHeight;
    }
  },

  async sendMessage(userText) {
    if (!userText || !userText.trim()) return;
    const text = userText.trim();

    // 1. Immediately append user bubble to both containers
    this.appendBubble('user', text);

    // 2. Render temporary loading indicator
    const createLoadingNode = () => {
      const bubble = document.createElement('div');
      bubble.className = 'oracle-bubble oracle-bubble-model oracle-thinking-bubble';
      bubble.innerHTML = `
        <div class="oracle-bubble-avatar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <div class="oracle-bubble-content" style="color: var(--google-blue, #8ab4f8); font-style: italic;">
          Consulting workspace memory...
        </div>
      `;
      return bubble;
    };

    const panelBox = document.getElementById('oracle-panel-messages');
    const fullBox = document.getElementById('oracle-messages-box');
    const panelLoading = createLoadingNode();
    const fullLoading = createLoadingNode();

    if (panelBox) {
      panelBox.appendChild(panelLoading);
      panelBox.scrollTop = panelBox.scrollHeight;
    }
    if (fullBox) {
      fullBox.appendChild(fullLoading);
      fullBox.scrollTop = fullBox.scrollHeight;
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          threadId: this.currentThreadId
        })
      });

      panelLoading.remove();
      fullLoading.remove();

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        this.appendBubble('model', `Error: ${errData.error || 'Failed to retrieve answer from Oracle.'}`);
        return;
      }

      const data = await res.json();
      this.setCurrentThreadId(data.threadId);

      // Append model response
      this.appendBubble('model', data.reply);

      // Refresh threads
      await this.loadThreads();
    } catch (err) {
      panelLoading.remove();
      fullLoading.remove();
      this.appendBubble('model', 'Network connection error when reaching Oracle.');
    }
  },

  async newChat() {
    this.setCurrentThreadId(null);
    this.renderThreadsLists();
    this.renderEmptyStateBoth();
  },

  async deleteThread(threadId) {
    if (!confirm('Permanently delete this conversation thread?')) return;
    try {
      const res = await fetch(`/api/ai/threads/${threadId}`, { method: 'DELETE' });
      if (res.ok) {
        triggerToast('Conversation thread deleted.');
        if (this.currentThreadId === threadId) {
          await this.newChat();
        }
        await this.loadThreads();
      } else {
        triggerToast('Failed to delete thread', true);
      }
    } catch (err) {
      triggerToast('Error deleting conversation', true);
    }
  },

  async clearAllChats() {
    try {
      const res = await fetch('/api/ai/threads', { method: 'DELETE' });
      if (res.ok) {
        triggerToast('All conversations cleared.');
        this.threads = [];
        await this.newChat();
        await this.loadThreads();
      } else {
        triggerToast('Failed to clear conversations', true);
      }
    } catch (err) {
      triggerToast('Error clearing chat history', true);
    }
  },

  setupFullPageListeners() {
    const form = document.getElementById('form-oracle-chat');
    const input = document.getElementById('oracle-input-text');

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input?.value || '';
      if (!text.trim()) return;
      input.value = '';
      this.sendMessage(text);
    });

    document.querySelectorAll('#oracle-quick-chips .oracle-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        if (prompt) this.sendMessage(prompt);
      });
    });

    document.getElementById('btn-oracle-clear-all')?.addEventListener('click', () => {
      if (!this.threads || this.threads.length === 0) {
        triggerToast('No conversations to clear');
        return;
      }
      openClearModal();
    });

    document.getElementById('btn-oracle-new-thread')?.addEventListener('click', () => {
      this.newChat();
    });
  }
};

window.OracleChatEngine = OracleChatEngine;

// ==============================================================================
// SIDE PANEL UI CONTROLS, SHORTCUTS, RESIZING, AND EVENT LISTENERS
// ==============================================================================

export function openOraclePanel() {
  const panel = document.getElementById('oracle-side-panel');
  const btn = document.getElementById('btn-oracle-topbar');
  if (!panel) return;

  panel.classList.add('open');
  if (btn) {
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('active');
  }

  localStorage.setItem('oracle_panel_open', 'true');

  // Focus textarea when panel opens
  setTimeout(() => {
    const textarea = document.getElementById('oracle-panel-input');
    textarea?.focus();
  }, 100);
}

export function closeOraclePanel(returnFocus = true) {
  const panel = document.getElementById('oracle-side-panel');
  const btn = document.getElementById('btn-oracle-topbar');
  if (!panel) return;

  panel.classList.remove('open');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('active');
    if (returnFocus) {
      btn.focus();
    }
  }

  localStorage.setItem('oracle_panel_open', 'false');
  closeMenuPopover();
  closeModals();
}

export function toggleOraclePanel() {
  const panel = document.getElementById('oracle-side-panel');
  if (panel && panel.classList.contains('open')) {
    closeOraclePanel(true);
  } else {
    openOraclePanel();
  }
}

// History View switching inside side panel
export function switchToHistoryView() {
  const chatView = document.getElementById('oracle-panel-chat-view');
  const historyView = document.getElementById('oracle-panel-history-view');
  if (chatView) chatView.style.display = 'none';
  if (historyView) historyView.classList.add('active');
  OracleChatEngine.renderThreadsLists();
}

export function switchToChatView() {
  const chatView = document.getElementById('oracle-panel-chat-view');
  const historyView = document.getElementById('oracle-panel-history-view');
  if (chatView) chatView.style.display = 'flex';
  if (historyView) historyView.classList.remove('active');
  setTimeout(() => {
    document.getElementById('oracle-panel-input')?.focus();
  }, 50);
}

// Three-dot popover menu controls
export function toggleMenuPopover() {
  const menu = document.getElementById('oracle-menu-popover');
  const trigger = document.getElementById('btn-oracle-panel-menu');
  if (!menu) return;

  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    trigger?.setAttribute('aria-expanded', 'true');
    // Focus first menu item
    const firstItem = menu.querySelector('.oracle-menu-item');
    firstItem?.focus();
  } else {
    closeMenuPopover();
  }
}

export function closeMenuPopover() {
  const menu = document.getElementById('oracle-menu-popover');
  const trigger = document.getElementById('btn-oracle-panel-menu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
    trigger?.setAttribute('aria-expanded', 'false');
  }
}

// Modals
export function openClearModal() {
  closeMenuPopover();
  const modal = document.getElementById('modal-oracle-clear-confirm');
  modal?.classList.remove('hidden');
  document.getElementById('btn-confirm-clear-all')?.focus();
}

export function openShortcutsModal() {
  closeMenuPopover();
  const modal = document.getElementById('modal-oracle-shortcuts');
  modal?.classList.remove('hidden');
  document.getElementById('btn-dismiss-shortcuts')?.focus();
}

export function closeModals() {
  document.getElementById('modal-oracle-clear-confirm')?.classList.add('hidden');
  document.getElementById('modal-oracle-shortcuts')?.classList.add('hidden');
}

// Width Toggle (Wide / Narrow)
export function togglePanelWidth() {
  const root = document.documentElement;
  const currentWidth = getComputedStyle(root).getPropertyValue('--oracle-panel-width').trim();
  const widthPx = parseInt(currentWidth, 10) || 400;

  const label = document.getElementById('label-oracle-width');
  let newWidth = '400px';

  if (widthPx < 480) {
    newWidth = '560px';
    if (label) label.textContent = 'Narrow width';
  } else {
    newWidth = '400px';
    if (label) label.textContent = 'Wide width';
  }

  root.style.setProperty('--oracle-panel-width', newWidth);
  localStorage.setItem('oracle_panel_width', newWidth);
  closeMenuPopover();
}

// Initialize all UI events
export function initOraclePanel() {
  // 1. Restore persistent width
  const savedWidth = localStorage.getItem('oracle_panel_width');
  if (savedWidth) {
    document.documentElement.style.setProperty('--oracle-panel-width', savedWidth);
    const label = document.getElementById('label-oracle-width');
    if (label) {
      const widthNum = parseInt(savedWidth, 10) || 400;
      label.textContent = widthNum >= 480 ? 'Narrow width' : 'Wide width';
    }
  }

  // 2. Initialize chat engine
  OracleChatEngine.init();

  // 3. Top bar AI button toggle
  const btnTopBar = document.getElementById('btn-oracle-topbar');
  btnTopBar?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOraclePanel();
  });

  // 4. Panel Header Close (X) button
  document.getElementById('btn-oracle-panel-close')?.addEventListener('click', () => {
    closeOraclePanel(true);
  });

  // 5. Panel Header Three-Dot Menu trigger
  const btnMenu = document.getElementById('btn-oracle-panel-menu');
  btnMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenuPopover();
  });

  // 6. Three-Dot Menu Items
  document.getElementById('menu-oracle-new')?.addEventListener('click', () => {
    closeMenuPopover();
    switchToChatView();
    OracleChatEngine.newChat();
    setTimeout(() => document.getElementById('oracle-panel-input')?.focus(), 50);
  });

  document.getElementById('menu-oracle-history')?.addEventListener('click', () => {
    closeMenuPopover();
    switchToHistoryView();
  });

  document.getElementById('menu-oracle-fullpage')?.addEventListener('click', () => {
    closeMenuPopover();
    if (typeof window.switchView === 'function') {
      window.switchView('view-oracle');
    } else {
      document.querySelector('[data-view="view-oracle"]')?.click();
    }
  });

  document.getElementById('menu-oracle-width-toggle')?.addEventListener('click', () => {
    togglePanelWidth();
  });

  document.getElementById('menu-oracle-clear-all')?.addEventListener('click', () => {
    openClearModal();
  });

  document.getElementById('menu-oracle-shortcuts')?.addEventListener('click', () => {
    openShortcutsModal();
  });

  // Back to chat button in history view
  document.getElementById('btn-oracle-history-back')?.addEventListener('click', () => {
    switchToChatView();
  });

  // Modal actions
  document.getElementById('btn-close-clear-modal')?.addEventListener('click', closeModals);
  document.getElementById('btn-cancel-clear-all')?.addEventListener('click', closeModals);
  document.getElementById('btn-confirm-clear-all')?.addEventListener('click', async () => {
    closeModals();
    await OracleChatEngine.clearAllChats();
  });

  document.getElementById('btn-close-shortcuts-modal')?.addEventListener('click', closeModals);
  document.getElementById('btn-dismiss-shortcuts')?.addEventListener('click', closeModals);

  // Outside click to close popover or modals
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('oracle-menu-popover');
    const menuBtn = document.getElementById('btn-oracle-panel-menu');
    if (menu && !menu.classList.contains('hidden')) {
      if (!menu.contains(e.target) && !menuBtn?.contains(e.target)) {
        closeMenuPopover();
      }
    }

    const clearModal = document.getElementById('modal-oracle-clear-confirm');
    if (clearModal && !clearModal.classList.contains('hidden') && e.target === clearModal) {
      closeModals();
    }

    const shortcutsModal = document.getElementById('modal-oracle-shortcuts');
    if (shortcutsModal && !shortcutsModal.classList.contains('hidden') && e.target === shortcutsModal) {
      closeModals();
    }
  });

  // Keyboard navigation inside three-dot menu
  const menuPopover = document.getElementById('oracle-menu-popover');
  menuPopover?.addEventListener('keydown', (e) => {
    const items = Array.from(menuPopover.querySelectorAll('.oracle-menu-item'));
    const currentIndex = items.indexOf(document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenuPopover();
      document.getElementById('btn-oracle-panel-menu')?.focus();
    } else if (e.key === 'Tab') {
      closeMenuPopover();
    }
  });

  // Auto-growing textarea & send button enabling
  const textarea = document.getElementById('oracle-panel-input');
  const sendBtn = document.getElementById('btn-oracle-panel-send');
  const form = document.getElementById('oracle-panel-form');

  textarea?.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(140, Math.max(24, textarea.scrollHeight)) + 'px';
    if (sendBtn) {
      sendBtn.disabled = !textarea.value.trim();
    }
  });

  textarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (textarea.value.trim()) {
        form?.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textarea?.value || '';
    if (!text.trim()) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;
    OracleChatEngine.sendMessage(text);
  });

  // Drag handle for resizing (Desktop)
  const resizeHandle = document.getElementById('oracle-resize-handle');
  if (resizeHandle) {
    let isResizing = false;

    const onPointerMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(340, Math.min(560, window.innerWidth - e.clientX));
      document.documentElement.style.setProperty('--oracle-panel-width', `${newWidth}px`);
    };

    const onPointerUp = () => {
      if (!isResizing) return;
      isResizing = false;
      resizeHandle.classList.remove('resizing');
      document.body.style.userSelect = '';
      const finalWidth = getComputedStyle(document.documentElement).getPropertyValue('--oracle-panel-width').trim();
      localStorage.setItem('oracle_panel_width', finalWidth);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    resizeHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isResizing = true;
      resizeHandle.classList.add('resizing');
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  // Global Keyboard Shortcuts (Ctrl+/ and Escape)
  window.addEventListener('keydown', (e) => {
    // Ctrl + / or Cmd + /: Toggle Oracle Panel
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      toggleOraclePanel();
      return;
    }

    // Escape precedence:
    // 1. Menu popover if open
    // 2. Any confirmation/shortcuts modal if open
    // 3. Side panel if open
    if (e.key === 'Escape') {
      const menu = document.getElementById('oracle-menu-popover');
      if (menu && !menu.classList.contains('hidden')) {
        e.preventDefault();
        closeMenuPopover();
        document.getElementById('btn-oracle-panel-menu')?.focus();
        return;
      }

      const clearModal = document.getElementById('modal-oracle-clear-confirm');
      const shortcutsModal = document.getElementById('modal-oracle-shortcuts');
      if ((clearModal && !clearModal.classList.contains('hidden')) || (shortcutsModal && !shortcutsModal.classList.contains('hidden'))) {
        e.preventDefault();
        closeModals();
        return;
      }

      const historyView = document.getElementById('oracle-panel-history-view');
      if (historyView && historyView.classList.contains('active')) {
        e.preventDefault();
        switchToChatView();
        return;
      }

      const panel = document.getElementById('oracle-side-panel');
      if (panel && panel.classList.contains('open')) {
        e.preventDefault();
        closeOraclePanel(true);
        return;
      }
    }
  });

  // Track active view changes to update context pill label (Requirement 9)
  const observeViewChanges = () => {
    const observer = new MutationObserver(() => {
      const activeView = document.querySelector('.workspace-view.active');
      if (activeView) {
        let viewTitle = 'Workspace';
        if (activeView.id === 'view-tasks') viewTitle = 'Tasks';
        else if (activeView.id === 'view-callroom') viewTitle = 'Call Room';
        else if (activeView.id === 'view-voting') viewTitle = 'Peer Review';
        else if (activeView.id === 'view-peers') viewTitle = 'Peers';
        else if (activeView.id === 'view-settings') viewTitle = 'Settings & Logs';
        else if (activeView.id === 'view-oracle') viewTitle = 'Frontier Oracle';

        OracleChatEngine.setContextView(viewTitle);
      }
    });

    const canvas = document.querySelector('.workspace-canvas');
    if (canvas) {
      observer.observe(canvas, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  };
  observeViewChanges();

  // Load threads and restore view state
  OracleChatEngine.loadThreads().then(() => {
    if (OracleChatEngine.currentThreadId) {
      OracleChatEngine.loadThreadMessages(OracleChatEngine.currentThreadId);
    } else {
      OracleChatEngine.renderEmptyStateBoth();
    }
  });

  // Restore panel open state from persistence
  const savedOpen = localStorage.getItem('oracle_panel_open');
  if (savedOpen === 'true') {
    openOraclePanel();
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initOraclePanel());
} else {
  initOraclePanel();
}
