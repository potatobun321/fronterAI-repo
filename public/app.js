/**
 * Frontier AI Workspace — Client Application
 * Personal vs. Global Dashboards, Host Authorization, Calendar & Peer Performance Voting
 */

// ==============================================================================
// AUTHENTICATION BYPASS TOGGLE (Direct Access Mode)
// Set to true to bypass Google OAuth and directly access all pages as Lead.
// Set to false to reconnect Google OAuth authentication.
// ==============================================================================
const AUTH_BYPASS = false;

// Universal fetch interceptor for dual-persistent sessions (Bearer token + Cookie)
const originalFetch = window.fetch;
window.fetch = function (resource, options = {}) {
  options = options || {};
  if (!options.credentials) {
    options.credentials = 'include';
  }
  const token = localStorage.getItem('frontier_session');
  if (token) {
    if (!options.headers) {
      options.headers = { 'Authorization': `Bearer ${token}` };
    } else if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (Array.isArray(options.headers)) {
      if (!options.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
        options.headers.push(['Authorization', `Bearer ${token}`]);
      }
    } else {
      if (!options.headers['Authorization'] && !options.headers['authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return originalFetch.call(this, resource, options);
};

const state = {
  currentUser: null,
  members: [],
  tasks: [],
  personalData: null,
  calendarEvents: [],
  taskFilter: 'all',
  currentVotingSessionId: 1,
  votingSession: null,
  unlinkedBallotToken: null,
  tickets: [],
  auditEvents: [],
  auditSearchTerm: '',
  tasklets: [],
  taskletTab: 'received',
  dockedCallActive: false,
  dockedCallMuted: false,
  dockedCallCamOff: false,
  oauthConfigured: true,
  currentOracleThreadId: null,
  oracleThreads: [],
  currentSettingsSubtab: 'directory'
};
window.appState = state;
window.showToast = showToast;

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

export function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  toastMsg.textContent = message;
  toastIcon.innerHTML = isError
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// -------------------------------------------------------------
// CALENDAR & CALL ROOM DATE/COUNTDOWN HELPERS
// -------------------------------------------------------------
function formatEventDate(eventDate) {
  if (!eventDate) return '';
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (eventDate === todayStr) return 'Today';
  if (eventDate === tomorrowStr) return 'Tomorrow';
  if (eventDate === yesterdayStr) return 'Yesterday';
  return eventDate;
}

function formatEventDisplayDateTime(eventDate, timeLabel) {
  const d = formatEventDate(eventDate);
  if (d === 'Today' || d === 'Tomorrow' || d === 'Yesterday') {
    return `${d}, ${timeLabel || ''}`;
  }
  return `${eventDate} · ${timeLabel || ''}`;
}

function getEventCountdownMs(eventDate, timeLabel) {
  if (!eventDate || !timeLabel) return null;
  const parts = eventDate.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  
  const match = timeLabel.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?(?:\s*([A-Z]+))?/i);
  if (!match) return null;
  let [_, hrs, mins, ampm, tz] = match;
  hrs = parseInt(hrs, 10);
  mins = parseInt(mins, 10);
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hrs < 12) hrs += 12;
    if (ampm.toUpperCase() === 'AM' && hrs === 12) hrs = 0;
  }
  
  // Parse target timestamp (assuming IST UTC+5:30)
  let targetMs;
  if (!tz || tz.toUpperCase() === 'IST') {
    targetMs = Date.UTC(y, m - 1, d, hrs - 5, mins - 30);
  } else {
    targetMs = new Date(y, m - 1, d, hrs, mins).getTime();
  }

  const now = Date.now();
  let diffMs = targetMs - now;

  // If the target has passed today (e.g. 11:00 AM IST demo meeting), provide a live countdown starting at 2h 15m
  if (diffMs <= 0 && formatEventDate(eventDate) === 'Today') {
    if (!window.__callRoomCountdownAnchor) {
      window.__callRoomCountdownAnchor = now + (2 * 3600 + 15 * 60) * 1000;
    }
    diffMs = window.__callRoomCountdownAnchor - now;
  }

  return diffMs;
}

function getLiveCountdownString(eventDate, timeLabel, isLive) {
  if (isLive) return 'LIVE NOW';
  const diffMs = getEventCountdownMs(eventDate, timeLabel);
  if (diffMs === null) return '';
  if (diffMs <= 0) return 'starting now';

  const totalSecs = Math.floor(diffMs / 1000);
  const totalMins = Math.floor(totalSecs / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hours > 0) {
    return `starts in ${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `starts in ${mins}m`;
  }
  return `starts in ${totalSecs}s`;
}

function updateLiveCountdowns() {
  document.querySelectorAll('.cal-live-countdown').forEach(el => {
    const d = el.dataset.date;
    const t = el.dataset.time;
    const isLive = el.dataset.live === 'true';
    const str = getLiveCountdownString(d, t, isLive);
    if (str && el.textContent !== str) {
      el.textContent = str;
    }
  });

  const heroCountdown = document.getElementById('room-hero-countdown');
  if (heroCountdown) {
    const d = heroCountdown.dataset.date;
    const t = heroCountdown.dataset.time;
    const str = getLiveCountdownString(d, t, false);
    if (str && heroCountdown.textContent !== str) {
      heroCountdown.textContent = str;
    }
  }
}
setInterval(updateLiveCountdowns, 1000);

// -------------------------------------------------------------
// PROGRESS BAR & NUMBER COUNT-UP ANIMATION HELPERS
// -------------------------------------------------------------
function animateNumberCountUp(el, target, duration = 850, suffix = '%') {
  if (!el) return;
  const currentText = el.textContent || '';
  const match = currentText.match(/\d+/);
  const startVal = match ? parseInt(match[0], 10) : 0;
  if (startVal === target && currentText.includes(suffix)) {
    return;
  }
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * easeOut);
    el.textContent = `${current}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = `${target}${suffix}`;
    }
  }
  requestAnimationFrame(step);
}

function animateProgressBar(elFill, targetPct) {
  if (!elFill) return;
  requestAnimationFrame(() => {
    elFill.style.width = `${Math.max(0, Math.min(100, targetPct))}%`;
  });
}

// -------------------------------------------------------------
// TASK DUE DATE HELPERS (MONOSPACE, CALENDAR ICON, URGENCY COLORING)
// -------------------------------------------------------------
function getTaskDueStatus(deadlineStr) {
  if (!deadlineStr || deadlineStr === 'Flexible') {
    return {
      statusClass: 'due-grey',
      label: deadlineStr || 'Flexible',
      tooltip: 'Flexible Deadline'
    };
  }

  const parts = deadlineStr.split('-').map(Number);
  if (parts.length !== 3) {
    return {
      statusClass: 'due-grey',
      label: deadlineStr,
      tooltip: deadlineStr
    };
  }

  const [year, month, day] = parts;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dueUtc = Date.UTC(year, month - 1, day);
  const diffDays = Math.round((dueUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      statusClass: 'due-red',
      label: deadlineStr,
      tooltip: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`
    };
  } else if (diffDays <= 2) {
    return {
      statusClass: 'due-amber',
      label: deadlineStr,
      tooltip: diffDays === 0 ? 'Due Today' : (diffDays === 1 ? 'Due Tomorrow' : 'Due in 2 days')
    };
  } else {
    return {
      statusClass: 'due-grey',
      label: deadlineStr,
      tooltip: `Due in ${diffDays} days`
    };
  }
}

function renderTaskDueBadge(deadlineStr) {
  const due = getTaskDueStatus(deadlineStr);
  const calIcon = `<svg class="task-due-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
  return `<span class="task-due-badge ${due.statusClass}" title="${due.tooltip}">${calIcon}<span>${due.label}</span></span>`;
}

// -------------------------------------------------------------
// INITIALIZATION & AUTH STATE
// -------------------------------------------------------------
async function init() {
  setupNavigation();
  setupModals();
  setupPersonaDropdown();
  setupGlobalSearch();
  setupCommandPalette();
  setupAuthScreen();

  // Check URL query parameters for OAuth callbacks and alerts
  const params = new URLSearchParams(window.location.search);
  const sid = params.get('sid');
  if (sid) {
    localStorage.setItem('frontier_session', sid);
  }

  const authAlert = document.getElementById('auth-alert');
  const authAlertText = document.getElementById('auth-alert-text');

  if (params.get('error') === 'oauth_not_configured') {
    authAlert?.classList.remove('hidden');
    if (authAlertText) {
      authAlertText.innerHTML = `<strong>Google OAuth Not Configured:</strong><br>
      Please configure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Cloudflare Worker settings.`;
    }
  } else if (params.get('error') === 'csrf_state_mismatch') {
    authAlert?.classList.remove('hidden');
    if (authAlertText) {
      authAlertText.innerHTML = `<strong>Sign-in Session Expired:</strong><br>
      The browser session timed out or was interrupted. Please click <strong>"Sign in with Google"</strong> again to continue.`;
    }
  } else if (params.get('auth') === 'pending_approval') {
    const userEmail = params.get('email') || 'your account';
    authAlert?.classList.remove('hidden');
    if (authAlertText) {
      authAlertText.innerHTML = `
        <div style="text-align: left; line-height: 1.45;">
          <strong style="color: #f59e0b; display: flex; align-items: center; gap: 6px; font-size: 13.5px;">
            <span>⏳</span> Access Request Received
          </strong>
          <div style="margin-top: 4px; font-size: 12.5px;">
            Google account <strong>${escapeHtml(userEmail)}</strong> has been registered and is waiting for <strong>Host Approval</strong>.
          </div>
          <div style="margin-top: 6px; font-size: 12px; color: var(--text-muted);">
            The Team Lead has been notified to review and activate your access. Once approved, simply click <strong>"Sign in with Google"</strong> to enter.
          </div>
        </div>
      `;
    }
  } else if (params.get('error') === 'unauthorized_allowlist') {
    const userEmail = params.get('email') || 'Unknown';
    authAlert?.classList.remove('hidden');
    if (authAlertText) {
      authAlertText.innerHTML = `<strong>403 Access Denied:</strong><br>
      Account <strong>${escapeHtml(userEmail)}</strong> does not have active access permissions on Frontier AI.`;
    }
  } else if (params.get('error') === 'token_exchange_failed') {
    authAlert?.classList.remove('hidden');
    if (authAlertText) {
      authAlertText.innerHTML = `<strong>Google Authentication Failed:</strong><br>
      Unable to exchange authentication token with Google. Please verify that <code>GOOGLE_CLIENT_SECRET</code> is configured and matches your OAuth client credentials.`;
    }
  } else if (params.get('error')) {
    authAlert?.classList.remove('hidden');
    if (authAlertText) {
      authAlertText.innerHTML = `<strong>Authentication Error:</strong><br>
      ${escapeHtml(params.get('error'))}. Please try again.`;
    }
  } else if (params.get('auth') === 'oauth_success') {
    showToast('Authenticated via Google OAuth 2.0!');
  }

  if (params.has('error') || params.has('auth') || params.has('sid')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  await loadCurrentAuth();
  await loadMembers();

  if (AUTH_BYPASS || state.currentUser) {
    if (!state.currentUser && AUTH_BYPASS) {
      state.currentUser = {
        id: 1,
        github_numeric_id: 194890859,
        handle: 'potatobun321',
        name: 'Kartikay',
        role: 'Team Host & Lead',
        team_track: 'lead',
        email: 'kart123.san@gmail.com',
        is_host: 1,
        is_allowed: 1
      };
      updateHeaderUserChip();
    }
    showWorkspace();
    await loadTasks();
    await loadPersonalDashboard();
    await loadCalendarEvents();
    await loadVotingSession();
    await loadTickets();
    await loadAuditTrail();
    await loadTasklets();
    renderGlobalHub();
  } else {
    showAuthScreen();
  }

  setupEventListeners();
}

function showAuthScreen() {
  if (AUTH_BYPASS) {
    showWorkspace();
    return;
  }
  document.documentElement.classList.remove('has-session');
  document.getElementById('auth-screen')?.classList.remove('hidden');
  document.getElementById('auth-screen')?.removeAttribute('style');
  document.getElementById('workspace-app')?.classList.add('hidden');
}

function showWorkspace() {
  document.documentElement.classList.add('has-session');
  document.getElementById('auth-screen')?.classList.add('hidden');
  document.getElementById('auth-screen')?.setAttribute('style', 'display: none !important;');
  document.getElementById('workspace-app')?.classList.remove('hidden');
  applyRolePermissions();
  requestAnimationFrame(() => {
    updateAllSegmentedGliders();
  });
}

// =============================================================
// Fluid Segmented Control Toggle Glider Engine
// =============================================================
function updateSegmentedGlider(control) {
  if (!control) return;
  let glider = control.querySelector('.segmented-glider');
  let isNew = false;
  if (!glider) {
    glider = document.createElement('div');
    glider.className = 'segmented-glider';
    control.prepend(glider);
    control.classList.add('has-glider');
    isNew = true;
  }

  const activeTab = control.querySelector('.segmented-tab.active');
  if (!activeTab || activeTab.offsetWidth === 0 || control.offsetParent === null) {
    glider.style.opacity = '0';
    return;
  }

  if (isNew) {
    glider.style.transition = 'none';
    glider.style.width = `${activeTab.offsetWidth}px`;
    glider.style.height = `${activeTab.offsetHeight}px`;
    glider.style.transform = `translate3d(${activeTab.offsetLeft}px, ${activeTab.offsetTop}px, 0)`;
    glider.style.opacity = '1';
    void glider.offsetHeight;
    glider.style.transition = '';
  } else {
    glider.style.width = `${activeTab.offsetWidth}px`;
    glider.style.height = `${activeTab.offsetHeight}px`;
    glider.style.transform = `translate3d(${activeTab.offsetLeft}px, ${activeTab.offsetTop}px, 0)`;
    glider.style.opacity = '1';
  }
}

function updateAllSegmentedGliders() {
  document.querySelectorAll('.segmented-control').forEach(control => {
    updateSegmentedGlider(control);
  });
}

function initSegmentedControls() {
  document.querySelectorAll('.segmented-control').forEach(ctrl => {
    updateSegmentedGlider(ctrl);
    ctrl.addEventListener('click', (e) => {
      if (e.target.closest('.segmented-tab')) {
        requestAnimationFrame(() => updateSegmentedGlider(ctrl));
      }
    });
  });
  window.addEventListener('resize', updateAllSegmentedGliders, { passive: true });
}

// Settings Submenu Navigation Helpers
function setSettingsSubmenuOpen(isOpen) {
  const toggleBtn = document.getElementById('btn-toggle-settings-subitems');
  const subitemsContainer = document.getElementById('nav-settings-subitems');
  if (!subitemsContainer || !toggleBtn) return;
  if (isOpen) {
    subitemsContainer.classList.remove('collapsed');
    toggleBtn.classList.add('expanded');
    toggleBtn.setAttribute('aria-expanded', 'true');
  } else {
    subitemsContainer.classList.add('collapsed');
    toggleBtn.classList.remove('expanded');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }
}

function toggleSettingsSubmenu() {
  const subitemsContainer = document.getElementById('nav-settings-subitems');
  if (!subitemsContainer) return;
  const isCurrentlyCollapsed = subitemsContainer.classList.contains('collapsed');
  setSettingsSubmenuOpen(isCurrentlyCollapsed);
}

function updateActiveSubitem(activeTab) {
  document.querySelectorAll('.nav-subitem').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsTab === activeTab);
  });
}

function switchSettingsSubtab(subtab = 'directory') {
  const isHost = state.currentUser && !!state.currentUser.is_host;
  if (!isHost && (subtab === 'permissions' || subtab === 'history' || subtab === 'snapshot')) {
    showToast('Team Lead Only: This administrative section is managed by the Team Lead.', true);
    return;
  }

  state.currentSettingsSubtab = subtab;

  document.querySelectorAll('.settings-subpanel').forEach(p => p.classList.add('hidden'));
  const targetPanel = document.getElementById(`panel-settings-${subtab}`);
  targetPanel?.classList.remove('hidden');

  if (subtab === 'directory') {
    loadMembers().then(renderTeamRoster);
  } else if (subtab === 'permissions') {
    loadTickets();
  } else if (subtab === 'history') {
    loadAuditTrail();
  }

  updateActiveSubitem(subtab);

  const titleEl = document.getElementById('settings-view-title');
  const subtitleEl = document.getElementById('settings-view-subtitle');
  if (titleEl && subtitleEl) {
    if (subtab === 'directory') {
      titleEl.textContent = 'Team Directory';
      subtitleEl.textContent = 'Allowlisted team members, active participants, and role assignments';
    } else if (subtab === 'permissions') {
      titleEl.textContent = 'Permissions';
      subtitleEl.textContent = 'Two-person rule approval pipeline and sensitive access governance';
    } else if (subtab === 'history') {
      titleEl.textContent = 'Activity History';
      subtitleEl.textContent = 'Comprehensive audit log of system events, actions, and security trails';
    } else if (subtab === 'snapshot') {
      titleEl.textContent = 'Database Snapshots';
      subtitleEl.textContent = 'Database backups, table snapshots, and disaster recovery exports';
    }
  }
}

// -------------------------------------------------------------
// NAVIGATION (SIMPLIFIED 4-MODULE RAIL)
// -------------------------------------------------------------
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchView(item.dataset.view);
    });
  });

  // Task Segmented Tabs ("Assigned to Me" vs "All Tasks")
  const tabMine = document.getElementById('tab-tasks-mine');
  const tabAll = document.getElementById('tab-tasks-all');
  const containerMine = document.getElementById('container-tasks-mine');
  const containerAll = document.getElementById('container-tasks-all');

  const filterPills = document.getElementById('task-filter-pills');

  tabMine?.addEventListener('click', () => {
    tabMine.classList.add('active');
    tabAll?.classList.remove('active');
    containerMine?.classList.remove('hidden');
    containerAll?.classList.add('hidden');
    filterPills?.classList.add('hidden');
    updateSegmentedGlider(document.getElementById('task-view-mode-tabs'));
    loadPersonalDashboard();
  });

  tabAll?.addEventListener('click', () => {
    tabAll.classList.add('active');
    tabMine?.classList.remove('active');
    containerAll?.classList.remove('hidden');
    containerMine?.classList.add('hidden');
    filterPills?.classList.remove('hidden');
    updateSegmentedGlider(document.getElementById('task-view-mode-tabs'));
    requestAnimationFrame(() => {
      const glider = filterPills?.querySelector('.segmented-glider');
      if (glider && glider.style.opacity === '0') {
        glider.style.transition = 'none';
        updateSegmentedGlider(filterPills);
        void glider.offsetHeight;
        glider.style.transition = '';
      } else {
        updateSegmentedGlider(filterPills);
      }
    });
    renderKanbanBoard();
  });

  // Tasklets Segmented Tabs ("Received" vs "Sent")
  document.querySelectorAll('#tasklets-tab-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tasklets-tab-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.taskletTab = btn.dataset.taskletTab;
      updateSegmentedGlider(document.getElementById('tasklets-tab-group'));
      renderTasklets();
    });
  });

  // Peer Review Template Tabs (Template 1 vs Template 2)
  document.querySelectorAll('#voting-template-tabs button').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#voting-template-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSegmentedGlider(document.getElementById('voting-template-tabs'));
      state.currentVotingSessionId = parseInt(btn.dataset.templateId, 10);
      state.unlinkedBallotToken = sessionStorage.getItem('ballot_token_' + state.currentVotingSessionId) || null;
      await loadVotingSession();
    });
  });



  // Settings & Logs Subtabs
  document.querySelectorAll('#settings-subtabs .segmented-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.dataset.subtab;
      const isHost = state.currentUser && !!state.currentUser.is_host;
      if (!isHost && subtab === 'history') {
        showToast('Team Lead Only: The administrative audit trail is restricted to the Team Lead.', true);
        return;
      }

      document.querySelectorAll('#settings-subtabs .segmented-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.settings-subpanel').forEach(p => p.classList.add('hidden'));
      const targetPanel = document.getElementById(`panel-settings-${subtab}`);
      targetPanel?.classList.remove('hidden');

      if (subtab === 'directory') renderTeamRoster();
      else if (subtab === 'permissions') loadTickets();
      else if (subtab === 'history') loadAuditTrail();
    });
  });


  // Call Room Quick Card Jump
  document.getElementById('card-call-room-quick')?.addEventListener('click', () => switchView('view-callroom'));

  // Deep links & jump buttons
  document.getElementById('btn-jump-to-calendar')?.addEventListener('click', () => switchView('view-callroom'));
  document.getElementById('btn-global-view-cal')?.addEventListener('click', () => switchView('view-callroom'));
  document.getElementById('btn-global-open-voting')?.addEventListener('click', () => switchView('view-voting'));
  document.getElementById('card-global-vote')?.addEventListener('click', () => switchView('view-voting'));
  document.getElementById('btn-jump-to-roster')?.addEventListener('click', () => {
    if (state.currentUser?.is_host) {
      switchView('view-settings');
    } else {
      switchView('view-peers');
    }
  });

  // Sidebar toggle button
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('collapsed');
  });
}

function switchView(viewId) {
  window.switchView = switchView;
  // Graceful redirects from legacy view names
  if (viewId === 'view-personal') {
    viewId = 'view-tasks';
    document.getElementById('tab-tasks-mine')?.click();
  } else if (viewId === 'view-global') {
    viewId = 'view-tasks';
    document.getElementById('tab-tasks-all')?.click();
  } else if (viewId === 'view-calendar') {
    viewId = 'view-callroom';
  } else if (viewId === 'view-team') {
    viewId = state.currentUser?.is_host ? 'view-settings' : 'view-peers';
    if (state.currentUser?.is_host) switchSettingsSubtab('directory');
  } else if (viewId === 'view-governance') {
    viewId = 'view-settings';
    switchSettingsSubtab('permissions');
  } else if (viewId === 'view-audit') {
    viewId = 'view-settings';
    switchSettingsSubtab('history');
  } else if (viewId === 'view-recovery') {
    viewId = 'view-settings';
    switchSettingsSubtab('snapshot');
  }

  // Non-lead trying to view settings -> redirect to peers
  if (viewId === 'view-settings' && state.currentUser && !state.currentUser.is_host) {
    viewId = 'view-peers';
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  document.querySelectorAll('.workspace-view').forEach(view => {
    view.classList.toggle('active', view.id === viewId);
  });

  requestAnimationFrame(() => {
    updateAllSegmentedGliders();
  });

  if (viewId === 'view-settings') {
    switchSettingsSubtab(state.currentSettingsSubtab || 'directory');
  } else {
    updateActiveSubitem(null);
  }

  if (viewId === 'view-tasks') {
    loadPersonalDashboard();
    renderKanbanBoard();
    updateTaskKPIs();
    updateRoomStatusWidget();
  } else if (viewId === 'view-callroom') {
    loadCalendarEvents();
  } else if (viewId === 'view-voting') {
    loadVotingSession();
  } else if (viewId === 'view-peers') {
    loadMembers().then(renderTeamRoster);
    loadTasklets();
  } else if (viewId === 'view-settings') {
    switchSettingsSubtab(state.currentSettingsSubtab || 'directory');
  } else if (viewId === 'view-oracle') {
    loadOracleThreads();
  }
}

// -------------------------------------------------------------
// ACTUAL LOGIN UI & ROLE SEGMENTATION LOGIC
// -------------------------------------------------------------
function setupAuthScreen() {
  // Visual feedback on Google OAuth sign-in click without blocking navigation
  const btnGoogle = document.getElementById('btn-google-oauth');
  btnGoogle?.addEventListener('click', (e) => {
    if (state.oauthConfigured === false) {
      e.preventDefault();
      const authAlert = document.getElementById('auth-alert');
      const authAlertText = document.getElementById('auth-alert-text');
      authAlert?.classList.remove('hidden');
      if (authAlertText) {
        authAlertText.innerHTML = `<strong>OAuth 2.0 Credentials Missing:</strong><br>
        <code>GOOGLE_CLIENT_ID</code> or <code>GOOGLE_CLIENT_SECRET</code> is missing from the environment.<br>
        Set these in your <code>.env</code> file or deployment settings to connect Google OAuth.`;
      }
      return;
    }
    btnGoogle.style.opacity = '0.7';
    btnGoogle.style.cursor = 'wait';
  });

  // Login Form Submission
  const formLogin = document.getElementById('form-login');
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    if (!identifier) return showToast('Please enter your username or ID', true);
    await submitLogin(identifier);
  });

  // Demo One-Click Pills in Login Screen
  document.querySelectorAll('.btn-demo-pill').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await submitLogin(id);
    });
  });

  // Sign Out Button in Account Menu
  document.getElementById('btn-header-signout')?.addEventListener('click', async () => {
    if (AUTH_BYPASS) {
      showToast('Authentication is currently bypassed. Direct access remains active.');
      document.getElementById('persona-dropdown-menu')?.classList.add('hidden');
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    localStorage.removeItem('frontier_session');
    state.currentUser = null;
    document.getElementById('persona-dropdown-menu')?.classList.add('hidden');
    showToast('You have been signed out.');
    showAuthScreen();
  });
}

async function submitLogin(identifier) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Login rejected: account not on team roster', true);
      return;
    }

    state.currentUser = data.user;
    if (data.token) {
      localStorage.setItem('frontier_session', data.token);
    }
    updateHeaderUserChip();
    populatePersonaDropdown();
    showToast(`Signed in as ${state.currentUser.name} (${state.currentUser.is_host ? 'Team Lead' : 'Team Member'}).`);
    showWorkspace();

    // Load data
    await loadTasks();
    await loadPersonalDashboard();
    await loadCalendarEvents();
    await loadVotingSession();
    await loadTickets();
    await loadTasklets();
    updateTaskKPIs();
    updateRoomStatusWidget();

    // Default view: Tasks
    switchView('view-tasks');
    if (state.currentUser.is_host) {
      document.getElementById('tab-tasks-all')?.click();
    } else {
      document.getElementById('tab-tasks-mine')?.click();
    }
  } catch (err) {
    showToast('Failed to sign in', true);
  }
}

function applyRolePermissions() {
  if (!state.currentUser) return;
  const isHost = !!state.currentUser.is_host;

  // Header and Sidebar branding and host indicator
  const hostPill = document.getElementById('header-host-indicator');
  const sidebarHost = document.getElementById('sidebar-host-indicator');
  const roleIndicator = document.getElementById('sidebar-role-indicator');
  const roleDesc = document.getElementById('sidebar-role-desc');
  const productTag = document.querySelector('.workspace-product-tag');

  // Sidebar Item 4: Team & Peers (All) & Item 5: Settings & Logs (Lead)
  const navItem4 = document.getElementById('nav-item-peers-settings');
  const navLabel4 = document.getElementById('nav-label-peers-settings');
  const navIcon4 = document.getElementById('nav-icon-peers-settings');
  const badgeTasklets = document.getElementById('badge-tasklets-count');
  const directSettingsBtn = document.getElementById('nav-item-direct-settings');
  const btnOnboardPeers = document.getElementById('btn-open-onboard-peers');

  if (navItem4) navItem4.dataset.view = 'view-peers';
  if (navLabel4) navLabel4.textContent = 'Team & Peers';

  if (isHost) {
    if (productTag) productTag.textContent = 'Team Workspace';
    if (hostPill) {
      hostPill.textContent = 'LEAD';
      hostPill.style.display = 'inline-block';
      hostPill.style.backgroundColor = 'var(--google-blue-container)';
      hostPill.style.color = 'var(--google-blue-text)';
    }
    if (sidebarHost) {
      sidebarHost.textContent = 'LEAD';
      sidebarHost.style.display = 'inline-block';
      sidebarHost.style.backgroundColor = 'var(--google-blue-container)';
      sidebarHost.style.color = 'var(--google-blue-text)';
    }
    if (roleIndicator) roleIndicator.textContent = 'Role: Team Lead';
    if (roleDesc) roleDesc.textContent = 'Lead access: allot tasks, trigger sync calls, review sessions.';

    if (directSettingsBtn) directSettingsBtn.style.display = 'flex';
    if (btnOnboardPeers) btnOnboardPeers.style.display = 'inline-flex';
    if (badgeTasklets) badgeTasklets.style.display = 'none';
  } else {
    if (productTag) productTag.textContent = 'Student Workspace';
    if (hostPill) {
      hostPill.textContent = 'MEMBER';
      hostPill.style.display = 'inline-block';
      hostPill.style.backgroundColor = 'var(--bg-surface-elevated)';
      hostPill.style.color = 'var(--text-secondary)';
    }
    if (sidebarHost) {
      sidebarHost.textContent = 'MEMBER';
      sidebarHost.style.display = 'inline-block';
      sidebarHost.style.backgroundColor = 'var(--bg-surface-elevated)';
      sidebarHost.style.color = 'var(--text-secondary)';
    }
    if (roleIndicator) roleIndicator.textContent = 'Role: Member';
    if (roleDesc) roleDesc.textContent = 'Member access: my tasks, call room, peer review, and peers.';

    if (directSettingsBtn) directSettingsBtn.style.display = 'none';
    if (btnOnboardPeers) btnOnboardPeers.style.display = 'none';
    updateTaskletBadges();
  }

  // Authorator-only action buttons in the UI
  const allotBtn = document.getElementById('btn-open-task-modal');
  const hostAllotTrigger = document.getElementById('btn-host-allot-trigger');
  const schedCalBtn = document.getElementById('btn-open-calendar-modal');
  const closeVoteBtn = document.getElementById('btn-host-close-voting');
  const reopenVoteBtn = document.getElementById('btn-host-reopen-voting');

  if (!isHost) {
    if (allotBtn) allotBtn.style.display = 'none';
    if (hostAllotTrigger) hostAllotTrigger.style.display = 'none';
    if (schedCalBtn) schedCalBtn.style.display = 'none';
    if (closeVoteBtn) closeVoteBtn.style.display = 'none';
    if (reopenVoteBtn) reopenVoteBtn.style.display = 'none';
  } else {
    if (allotBtn) allotBtn.style.display = 'inline-flex';
    if (hostAllotTrigger) hostAllotTrigger.style.display = 'inline-flex';
    if (schedCalBtn) schedCalBtn.style.display = 'inline-flex';
  }
}

async function loadCurrentAuth() {
  try {
    const res = await fetch('/api/auth/current');
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user || data.member || null;
      state.oauthConfigured = data.oauthConfigured !== false;
      if (data.token) {
        localStorage.setItem('frontier_session', data.token);
      } else if (!state.currentUser) {
        localStorage.removeItem('frontier_session');
      }
      updateHeaderUserChip();
    } else if (res.status === 401) {
      state.currentUser = null;
      localStorage.removeItem('frontier_session');
    }
  } catch (err) {
    console.error('Failed to load current auth:', err);
  }
}

async function loadMembers() {
  try {
    const res = await fetch('/api/members');
    const data = await res.json();
    state.members = data.members || [];

    // If current logged-in user is Host, fetch pending access requests
    if (state.currentUser && state.currentUser.is_host === 1) {
      try {
        const pRes = await fetch('/api/members/pending');
        if (pRes.ok) {
          const pData = await pRes.json();
          state.pendingMembers = pData.pending || [];
        } else {
          state.pendingMembers = (state.members || []).filter(m => m.is_allowed === 0);
        }
      } catch (pe) {
        state.pendingMembers = (state.members || []).filter(m => m.is_allowed === 0);
      }
    } else {
      state.pendingMembers = [];
    }

    populatePersonaDropdown();
    populateSelects();
    renderTeamRoster();
  } catch (err) {
    console.error('Failed to load members:', err);
  }
}

function updateHeaderUserChip() {
  if (!state.currentUser) return;
  const initials = getInitials(state.currentUser.name);
  const roleText = `${state.currentUser.role} (${state.currentUser.team_track})`;

  // Header chip (Mobile circular avatar + desktop fallback)
  const headerAvatar = document.getElementById('header-user-avatar');
  const headerName = document.getElementById('header-user-name');
  const headerRole = document.getElementById('header-user-role');
  if (headerAvatar) headerAvatar.textContent = initials;
  if (headerName) headerName.textContent = state.currentUser.name;
  if (headerRole) headerRole.textContent = roleText;

  // Sidebar profile card (Desktop bottom-left)
  const sidebarAvatar = document.getElementById('sidebar-user-avatar');
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  const sidebarHost = document.getElementById('sidebar-host-indicator');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = state.currentUser.name;
  if (sidebarRole) sidebarRole.textContent = roleText;
  if (sidebarHost) {
    sidebarHost.style.display = state.currentUser.is_host ? 'inline-block' : 'none';
  }

  applyRolePermissions();
}

function setupPersonaDropdown() {
  const triggerHeader = document.getElementById('user-chip-menu-trigger');
  const triggerSidebar = document.getElementById('sidebar-user-profile');
  const menu = document.getElementById('persona-dropdown-menu');
  if (!menu) return;

  function toggleDropdown(e, source) {
    e.stopPropagation();
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      if (source === 'sidebar' && window.innerWidth > 768) {
        menu.classList.add('desktop-sidebar-menu');
        if (triggerSidebar) {
          const rect = triggerSidebar.getBoundingClientRect();
          menu.style.position = 'fixed';
          // Ensure menu bottom is placed safely 12px above the top edge of the sidebar user card
          const clearanceFromBottom = Math.max(Math.round(window.innerHeight - rect.top + 12), 96);
          menu.style.bottom = `${clearanceFromBottom}px`;
          menu.style.left = `${Math.max(Math.round(rect.left), 14)}px`;
          menu.style.width = `${Math.max(Math.round(rect.width), 310)}px`;
          menu.style.top = 'auto';
          menu.style.right = 'auto';
        }
      } else {
        menu.classList.remove('desktop-sidebar-menu');
        menu.style.position = '';
        menu.style.bottom = '';
        menu.style.left = '';
        menu.style.width = '';
        menu.style.top = '';
        menu.style.right = '';
      }
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  }

  triggerHeader?.addEventListener('click', (e) => toggleDropdown(e, 'header'));
  triggerSidebar?.addEventListener('click', (e) => toggleDropdown(e, 'sidebar'));
  triggerSidebar?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDropdown(e, 'sidebar');
    }
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) &&
        !triggerHeader?.contains(e.target) &&
        !triggerSidebar?.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
}

function populatePersonaDropdown() {
  const container = document.getElementById('persona-list-items');
  if (!container) return;
  container.innerHTML = '';

  if (state.currentUser) {
    const row = document.createElement('div');
    row.className = 'persona-option active';
    row.innerHTML = `
      <div class="user-avatar">${getInitials(state.currentUser.name)}</div>
      <div class="persona-info-wrap">
        <div class="persona-opt-name">${state.currentUser.name} ${state.currentUser.is_host ? '<span class="host-pill-tag">LEAD</span>' : '<span class="nav-badge">MEMBER</span>'}</div>
        <div class="persona-opt-sub">${state.currentUser.role} • ${state.currentUser.email || '@' + state.currentUser.handle}</div>
      </div>
      <span class="persona-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
    `;
    container.appendChild(row);
  }
}

async function loginAs(identifier) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Access Denied: Account not in allowlist', true);
      return;
    }

    state.currentUser = data.user;
    state.unlinkedBallotToken = null;
    updateHeaderUserChip();
    populatePersonaDropdown();
    applyRolePermissions();
    showToast(`Signed in as ${state.currentUser.name} (${state.currentUser.role})`);

    // Switch to role-appropriate view
    switchView('view-tasks');
    if (state.currentUser.is_host) {
      document.getElementById('tab-tasks-all')?.click();
    } else {
      document.getElementById('tab-tasks-mine')?.click();
    }

    await loadTasks();
    await loadPersonalDashboard();
    await loadVotingSession();
    await loadCalendarEvents();
    await loadTickets();
    await loadTasklets();
    updateTaskKPIs();
    updateRoomStatusWidget();
  } catch (err) {
    showToast('Failed to switch persona', true);
  }
}

// -------------------------------------------------------------
// VIEW 1: TASKS ("ASSIGNED TO ME" & CHECKLIST)
// -------------------------------------------------------------
async function loadPersonalDashboard() {
  try {
    const res = await fetch('/api/dashboard/personal');
    const data = await res.json();
    state.personalData = data;
    renderPersonalDashboard();
  } catch (err) {
    console.error('Failed to load personal dashboard:', err);
  }
}

function renderPersonalDashboard() {
  const p = state.personalData;
  if (!p) return;

  const elGreeting = document.getElementById('personal-greeting-name');
  if (elGreeting) elGreeting.textContent = p.user.name;
  const hostTag = document.getElementById('personal-host-tag');
  if (hostTag) hostTag.textContent = p.user.is_host ? 'Team Lead' : 'Team Member';

  // Completion stats
  const stats = p.stats || {};
  const elComp = document.getElementById('personal-completion-rate');
  const elFill = document.getElementById('personal-tasks-fill');
  const targetRate = stats.completionRate || 0;
  if (elComp) animateNumberCountUp(elComp, targetRate);
  if (elFill) animateProgressBar(elFill, targetRate);
  const elSub = document.getElementById('personal-tasks-subtext');
  if (elSub) elSub.textContent = `${stats.completed || 0} Completed · ${stats.inProgress || 0} In Progress · ${stats.todo || 0} To Do`;
  const elBadge = document.getElementById('badge-my-tasks-count');
  if (elBadge) elBadge.textContent = stats.total || 0;
  const elPill = document.getElementById('personal-task-count-pill');
  if (elPill) elPill.textContent = stats.total || 0;

  // Calendar stats
  const elEvCount = document.getElementById('personal-events-count');
  if (elEvCount) elEvCount.textContent = `${p.events?.length || 0} Events`;
  const elNextEv = document.getElementById('personal-next-event-text');
  if (elNextEv) {
    if (p.events && p.events.length > 0) {
      elNextEv.textContent = `Next: ${p.events[0].title} (${p.events[0].time_label})`;
    } else {
      elNextEv.textContent = 'No upcoming sync calls';
    }
  }

  // Voting Status
  const voteStatusText = document.getElementById('personal-vote-status-text');
  const voteStatusTag = document.getElementById('personal-ballot-status-tag');
  if (voteStatusText && voteStatusTag) {
    if (p.hasVoted) {
      voteStatusText.textContent = 'Submitted';
      voteStatusTag.className = 'kpi-tag tag-green';
      voteStatusTag.textContent = 'Completed';
    } else {
      voteStatusText.textContent = 'Pending Review';
      voteStatusTag.className = 'kpi-tag tag-amber';
      voteStatusTag.textContent = 'Action Needed';
    }
  }

  // Render My Allocated Tasks
  const taskList = document.getElementById('personal-allocated-tasks-list');
  if (taskList) {
    taskList.innerHTML = '';
    if (!p.tasks || p.tasks.length === 0) {
      taskList.innerHTML = '<div class="card"><p class="card-desc">No tasks currently assigned to you. Enjoy the breathing room or pick a task from the board!</p></div>';
    } else {
      p.tasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'compact-task-row';
        const hasDeliverable = !!task.deliverable_url;
        const dueHtml = renderTaskDueBadge(task.deadline);

        row.innerHTML = `
          <div style="flex: 1; cursor: pointer;" class="btn-inspect-task">
            <div class="compact-task-title">${task.title} <span style="font-size:11px; color:var(--google-blue); margin-left:6px;">(v${task.version || 1})</span></div>
            <div class="compact-task-assignee" style="display:flex; align-items:center; gap:6px; margin-top:3px; flex-wrap:wrap;">
              <span>Target:</span>
              ${dueHtml}
              <span style="color:var(--text-muted); margin-left:2px;">· Status: <strong>${task.status}</strong></span>
            </div>
            ${hasDeliverable ? `<div style="margin-top:4px;"><a href="${task.deliverable_url}" target="_blank" class="deliverable-link">Deliverable: ${task.deliverable_url}</a></div>` : ''}
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn btn-outlined btn-sm btn-inspect-task" title="View edit history and revisions">History</button>
            <span class="track-badge track-${task.track}">${task.status.replace('_', ' ')}</span>
          </div>
        `;

        row.querySelectorAll('.btn-inspect-task').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.deliverable-link')) return;
            openTaskRevisionInspector(task);
          });
        });

        taskList.appendChild(row);
      });
    }
  }

  // Render Live Meeting Banner if any active live session
  const liveBanner = document.getElementById('personal-live-meeting-banner');
  if (liveBanner) {
    if (p.liveMeeting) {
      liveBanner.style.display = 'flex';
      const elLiveTitle = document.getElementById('live-meeting-title');
      if (elLiveTitle) elLiveTitle.textContent = p.liveMeeting.title;
      const slotDesc = p.liveMeeting.slot_name ? `${p.liveMeeting.slot_name} (${p.liveMeeting.slot_code || 'SLOT'})` : 'Secure Bridge';
      const elLiveMeta = document.getElementById('live-meeting-meta');
      if (elLiveMeta) elLiveMeta.textContent = `Hosted by Team Lead · ${slotDesc} · Scheduled for ${p.liveMeeting.time_label || 'Now'}`;
      
      const liveBtn = document.getElementById('btn-join-live-meeting');
      if (liveBtn) {
        liveBtn.onclick = () => {
          window.open(p.liveMeeting.join_url, 'FrontierMeetingWindow', 'width=1200,height=800,menubar=no,toolbar=no');
        };
      }

      const actionsContainer = document.getElementById('live-banner-actions');
      if (actionsContainer && state.currentUser && state.currentUser.is_host) {
        if (!document.getElementById('btn-end-live-meeting')) {
          const endBtn = document.createElement('button');
          endBtn.id = 'btn-end-live-meeting';
          endBtn.className = 'btn btn-outlined btn-cal-end';
          endBtn.style.marginLeft = '8px';
          endBtn.textContent = 'End Call';
          endBtn.onclick = async () => {
            try {
              const res = await fetch(`/api/calendar/${p.liveMeeting.id}/end`, { method: 'POST' });
              if (res.ok) {
                showToast('Meeting session ended.');
                await loadPersonalDashboard();
                await loadCalendarEvents();
              }
            } catch (err) {
              showToast('Failed to end meeting session.', true);
            }
          };
          actionsContainer.appendChild(endBtn);
        }
      } else {
        const endBtn = document.getElementById('btn-end-live-meeting');
        if (endBtn) endBtn.remove();
      }
    } else {
      liveBanner.style.display = 'none';
    }
  }

  // Render My Upcoming Calendar Pings
  const pingsList = document.getElementById('personal-calendar-pings-list');
  if (pingsList) {
    pingsList.innerHTML = '';
    if (!p.events || p.events.length === 0) {
      pingsList.innerHTML = '<div class="card"><p class="card-desc">No upcoming calendar syncs or deadlines.</p></div>';
    } else {
      p.events.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'ping-card-row';
        const isMeeting = ev.event_type === 'MEETING' || ev.event_type === 'RETRO';
        const slotLabel = ev.slot_name || 'Call Room';

        let audienceLabel = 'Everyone';
        if (ev.target_audience === 'BACKEND') audienceLabel = 'Backend';
        else if (ev.target_audience === 'FRONTEND') audienceLabel = 'Frontend';
        else if (ev.target_audience && ev.target_audience.startsWith('[')) audienceLabel = 'Selected';
        else if (ev.assignee_name) audienceLabel = ev.assignee_name;

        const dtFormatted = formatEventDisplayDateTime(ev.event_date, ev.time_label);
        const countdownStr = getLiveCountdownString(ev.event_date, ev.time_label, ev.is_live);
        row.innerHTML = `
          <div>
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
              <span class="ping-title">${ev.title}</span>
              ${ev.is_live ? '<span class="live-pulse-badge" style="font-size:9.5px; padding:2px 6px;">LIVE NOW</span>' : ''}
            </div>
            <div class="ping-meta">${dtFormatted} · <span class="cal-countdown-badge cal-live-countdown" data-date="${ev.event_date}" data-time="${ev.time_label}" data-live="${ev.is_live ? 'true' : 'false'}">${countdownStr}</span> · <span style="color:var(--google-blue);">${slotLabel}</span> · <span style="color:var(--text-muted);">For: ${audienceLabel}</span></div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${ev.join_url ? `<button class="meet-link-btn" onclick="openDockedCallById(${ev.id})">Join Call</button>` : `<span class="cal-type-badge cal-tag-${ev.event_type}">${ev.event_type}</span>`}
            ${state.currentUser && state.currentUser.is_host && isMeeting ? `
              ${ev.is_live ? `<button class="btn-cal-action btn-cal-end" onclick="endMeetingSession(${ev.id})">End</button>` : `<button class="btn-cal-action btn-cal-ping" onclick="pingMeetingSession(${ev.id})">Ping Now</button>`}
            ` : ''}
          </div>
        `;
        pingsList.appendChild(row);
      });
    }
  }

  // Populate deliverable modal task select
  if (p.tasks) populateDeliverableModalSelect(p.tasks);
}

// -------------------------------------------------------------
// MODULE 1 HELPERS: TASK KPIS & CALL ROOM STATUS
// -------------------------------------------------------------
function updateTaskKPIs() {
  if (!state.tasks) return;
  const todo = state.tasks.filter(t => t.status === 'TODO').length;
  const inProgress = state.tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const done = state.tasks.filter(t => t.status === 'COMPLETED').length;

  const elTodo = document.getElementById('kpi-open-tasks');
  const elProg = document.getElementById('kpi-in-progress');
  const elDone = document.getElementById('kpi-done');
  if (elTodo) elTodo.textContent = todo;
  if (elProg) elProg.textContent = inProgress;
  if (elDone) elDone.textContent = done;

  const elBadge = document.getElementById('badge-tasks-count');
  if (elBadge) elBadge.textContent = state.tasks.length;
}

function updateRoomStatusWidget() {
  const liveEv = state.calendarEvents?.find(e => e.is_live);
  const scheduledEv = state.calendarEvents?.find(e => (e.event_type === 'MEETING' || e.event_type === 'RETRO') && !e.is_live);
  const dot = document.getElementById('room-status-dot');
  const sidebarCallDot = document.getElementById('badge-call-status');
  const statusText = document.getElementById('room-status-text');
  const subtitleText = document.getElementById('room-subtitle-text');
  const btnJoin = document.getElementById('btn-room-join-main');
  const btnToggle = document.getElementById('btn-toggle-instant-call');
  const quickBadge = document.getElementById('quick-call-room-status-badge');
  const isHost = state.currentUser && !!state.currentUser.is_host;

  // Hero card elements
  const heroCard = document.getElementById('call-room-hero-card');
  const heroDot = document.getElementById('room-hero-dot');
  const heroBadge = document.getElementById('room-hero-badge');
  const heroTitle = document.getElementById('room-hero-title');
  const heroDesc = document.getElementById('room-hero-desc');

  // Sidebar badge dot update & Nav Item State Color (Green if live, Yellow/Amber if scheduled, Blue if idle)
  const callNavItem = document.querySelector('.nav-item[data-view="view-callroom"]');
  if (callNavItem) {
    callNavItem.classList.remove('status-live', 'status-scheduled', 'status-idle');
    if (liveEv) {
      callNavItem.classList.add('status-live');
    } else if (scheduledEv) {
      callNavItem.classList.add('status-scheduled');
    } else {
      callNavItem.classList.add('status-idle');
    }
  }

  if (sidebarCallDot) {
    if (liveEv) {
      sidebarCallDot.className = 'room-status-dot pulse-green';
    } else if (scheduledEv) {
      sidebarCallDot.className = 'room-status-dot dot-scheduled';
    } else {
      sidebarCallDot.className = 'room-status-dot idle-gray';
    }
  }

  if (liveEv) {
    if (dot) dot.className = 'room-status-dot pulse-green';
    if (statusText) statusText.textContent = `Live: ${liveEv.title}`;
    if (subtitleText) subtitleText.textContent = `Call in progress · ${liveEv.time_label || 'Now'} · 1 sync call active`;

    if (heroDot) heroDot.className = 'room-status-dot pulse-green';
    if (heroBadge) {
      heroBadge.textContent = 'LIVE CALL';
      heroBadge.style.color = 'var(--google-green)';
    }
    if (heroTitle) heroTitle.textContent = liveEv.title;
    if (heroDesc) heroDesc.textContent = `${liveEv.description || 'Google Meet bridge live.'} Real-time attendance verified via server gateway.`;
    if (heroCard) heroCard.style.borderLeft = '3px solid var(--google-green)';

    if (btnJoin) {
      btnJoin.style.display = 'inline-flex';
      btnJoin.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 21 5 3"></polygon></svg> Join Google Meet ↗`;
      btnJoin.onclick = () => joinMeetingGateway(liveEv);
    }

    if (btnToggle) {
      if (isHost) {
        btnToggle.textContent = 'End Active Call';
        btnToggle.className = 'btn btn-outlined btn-cal-end';
        btnToggle.style.display = 'inline-flex';
        btnToggle.onclick = async () => {
          try {
            const res = await fetch(`/api/calendar/${liveEv.id}/end`, { method: 'POST' });
            if (res.ok) {
              showToast('Sync call concluded.');
              await loadCalendarEvents();
              await loadPersonalDashboard();
            }
          } catch (err) {
            showToast('Failed to end call', true);
          }
        };
      } else {
        btnToggle.style.display = 'none';
      }
    }
    if (quickBadge) {
      quickBadge.innerHTML = `<span class="room-status-dot pulse-green" style="display:inline-block; margin-right:4px; vertical-align:middle; width:8px; height:8px;"></span> Live Sync`;
    }
    const quickRoomText = document.getElementById('quick-room-text');
    const quickRoomSubtext = document.getElementById('quick-room-subtext');
    if (quickRoomText) quickRoomText.textContent = liveEv.title;
    if (quickRoomSubtext) quickRoomSubtext.textContent = 'Live call in progress · Click to join';
  } else if (scheduledEv) {
    if (dot) dot.className = 'room-status-dot dot-scheduled';
    if (statusText) statusText.textContent = `Scheduled: ${scheduledEv.title}`;
    const dtFormatted = formatEventDisplayDateTime(scheduledEv.event_date, scheduledEv.time_label);
    const countdown = getLiveCountdownString(scheduledEv.event_date, scheduledEv.time_label, false);
    if (subtitleText) subtitleText.textContent = `${dtFormatted} · ${countdown} · Google Meet bridge ready`;

    if (heroDot) heroDot.className = 'room-status-dot dot-scheduled';
    if (heroBadge) {
      heroBadge.textContent = 'SCHEDULED';
      heroBadge.style.color = 'var(--google-amber)';
    }
    if (heroTitle) heroTitle.textContent = `Upcoming: ${scheduledEv.title}`;
    if (heroDesc) heroDesc.innerHTML = `Scheduled for <strong>${dtFormatted}</strong> (<span class="cal-hero-countdown-text" id="room-hero-countdown" data-date="${scheduledEv.event_date}" data-time="${scheduledEv.time_label}">${countdown}</span>). Bridge slot reserved. Lead can start call early.`;
    if (heroCard) heroCard.style.borderLeft = '3px solid var(--google-amber)';

    if (btnJoin) {
      btnJoin.style.display = 'inline-flex';
      btnJoin.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 21 5 3"></polygon></svg> Open Google Meet Bridge ↗`;
      btnJoin.onclick = () => joinMeetingGateway(scheduledEv);
    }

    if (btnToggle) {
      if (isHost) {
        btnToggle.textContent = 'Start Call Early';
        btnToggle.className = 'btn btn-filled btn-cal-ping';
        btnToggle.style.display = 'inline-flex';
        btnToggle.onclick = async () => {
          await pingMeetingSession(scheduledEv.id);
        };
      } else {
        btnToggle.style.display = 'none';
      }
    }
    if (quickBadge) {
      quickBadge.innerHTML = `<span class="room-status-dot dot-scheduled" style="display:inline-block; margin-right:4px; vertical-align:middle; width:8px; height:8px;"></span> Scheduled`;
    }
    const quickRoomText = document.getElementById('quick-room-text');
    const quickRoomSubtext = document.getElementById('quick-room-subtext');
    if (quickRoomText) quickRoomText.textContent = dtFormatted;
    if (quickRoomSubtext) quickRoomSubtext.innerHTML = `<span class="cal-live-countdown" data-date="${scheduledEv.event_date}" data-time="${scheduledEv.time_label}">${countdown}</span> · Click to open Call Room`;
  } else {
    if (dot) dot.className = 'room-status-dot idle-gray';
    if (statusText) statusText.textContent = 'Room Available (No Active Call)';
    if (subtitleText) subtitleText.textContent = 'Google Meet bridge ready. 1 active call max.';

    if (heroDot) heroDot.className = 'room-status-dot idle-gray';
    if (heroBadge) {
      heroBadge.textContent = 'STANDBY';
      heroBadge.style.color = 'var(--text-muted)';
    }
    if (heroTitle) heroTitle.textContent = 'No call active right now';
    if (heroDesc) heroDesc.textContent = 'Rotating across 6 pre-configured Google Meet bridges. Project lead can start a live call anytime.';
    if (heroCard) heroCard.style.borderLeft = '3px solid var(--border-default)';

    if (btnJoin) {
      btnJoin.style.display = 'inline-flex';
      btnJoin.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 21 5 3"></polygon></svg> Enter Google Meet Bridge ↗`;
      btnJoin.onclick = () => joinMeetingGateway({ id: 1, title: 'Frontier Call Room' });
    }

    if (btnToggle) {
      if (isHost) {
        btnToggle.textContent = 'Start Team Call';
        btnToggle.className = 'btn btn-outlined btn-cal-ping';
        btnToggle.style.display = 'inline-flex';
        btnToggle.onclick = async () => {
          const nextEv = state.calendarEvents?.find(e => e.event_type === 'MEETING' || e.event_type === 'RETRO');
          if (nextEv) {
            await pingMeetingSession(nextEv.id);
          } else {
            showToast('No scheduled call found to start. Schedule one below.', true);
          }
        };
      } else {
        btnToggle.style.display = 'none';
      }
    }
    if (quickBadge) {
      quickBadge.innerHTML = `<span class="room-status-dot idle-gray" style="display:inline-block; margin-right:4px; vertical-align:middle; width:8px; height:8px;"></span> Available`;
    }
    const quickRoomText = document.getElementById('quick-room-text');
    const quickRoomSubtext = document.getElementById('quick-room-subtext');
    if (quickRoomText) quickRoomText.textContent = 'No active call';
    if (quickRoomSubtext) quickRoomSubtext.textContent = 'Click to open Call Room';
  }
}

// -------------------------------------------------------------
// VIEW 2: GLOBAL TEAM HUB (PUBLIC TEAM PROFILE)
// -------------------------------------------------------------
function renderGlobalHub() {
  if (!state.tasks || !state.tasks.length) return;

  const completed = state.tasks.filter(t => t.status === 'COMPLETED').length;
  const inProgress = state.tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const todo = state.tasks.filter(t => t.status === 'TODO').length;
  const total = state.tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const elComp = document.getElementById('global-team-completion');
  const elFill = document.getElementById('global-team-fill');
  if (elComp) animateNumberCountUp(elComp, pct);
  if (elFill) animateProgressBar(elFill, pct);
  const elBrk = document.getElementById('global-team-breakdown');
  if (elBrk) elBrk.textContent = `${completed} Completed • ${inProgress} In Progress • ${todo} Backlog`;

  if (state.votingSession) {
    const ballots = state.votingSession.totalBallots || 0;
    const eligible = state.votingSession.totalEligible || 8;
    const votePct = Math.round((ballots / eligible) * 100);
    const elRatio = document.getElementById('global-vote-ratio');
    if (elRatio) elRatio.textContent = `${ballots} / ${eligible}`;
    const elVFill = document.getElementById('global-vote-fill');
    if (elVFill) elVFill.style.width = `${votePct}%`;
  }

  // Populate Global Team Overview Table
  const tbody = document.getElementById('global-team-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.members.forEach(m => {
    const memberTasks = state.tasks.filter(t => t.assignee_id === m.id);
    const mCompleted = memberTasks.filter(t => t.status === 'COMPLETED').length;
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="user-avatar" style="width:24px; height:24px; font-size:10px;">${getInitials(m.name)}</div>
          <strong>${m.name}</strong> ${m.is_host ? '<span class="host-pill-tag">HOST</span>' : ''}
        </div>
      </td>
      <td>${m.role}</td>
      <td><span class="track-badge track-${m.team_track}">${m.team_track.toUpperCase()}</span></td>
      <td>${memberTasks.length} Assigned (${mCompleted} Completed)</td>
      <td><span class="kpi-tag ${mCompleted === memberTasks.length && memberTasks.length > 0 ? 'tag-green' : 'tag-blue'}">Active</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// VIEW 3: KANBAN SPRINT BOARD (HOST ALLOTS, PARTICIPANTS ADVANCE)
// -------------------------------------------------------------
async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    state.tasks = data.tasks;
    const badgeTasks = document.getElementById('badge-tasks-count');
    if (badgeTasks) badgeTasks.textContent = state.tasks.length;
    renderKanbanBoard();
    updateTaskKPIs();
    renderGlobalHub();
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
}

function renderKanbanBoard() {
  const colTodo = document.getElementById('cards-todo');
  const colProgress = document.getElementById('cards-in-progress');
  const colCompleted = document.getElementById('cards-completed');

  colTodo.innerHTML = '';
  colProgress.innerHTML = '';
  colCompleted.innerHTML = '';

  const filteredTasks = state.tasks.filter(t => {
    if (state.taskFilter === 'all') return true;
    return t.track === state.taskFilter;
  });

  let countTodo = 0, countProgress = 0, countCompleted = 0;

  filteredTasks.forEach(task => {
    const card = createKanbanCard(task);

    if (task.status === 'TODO') {
      colTodo.appendChild(card);
      countTodo++;
    } else if (task.status === 'IN_PROGRESS') {
      colProgress.appendChild(card);
      countProgress++;
    } else if (task.status === 'COMPLETED') {
      colCompleted.appendChild(card);
      countCompleted++;
    }
  });

  document.getElementById('count-todo').textContent = countTodo;
  document.getElementById('count-in-progress').textContent = countProgress;
  document.getElementById('count-completed').textContent = countCompleted;

  // Empty-state placeholders for empty columns
  const emptyTodoHtml = `<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1"></rect></svg><p>No tasks here</p></div>`;
  if (countTodo === 0) colTodo.innerHTML = emptyTodoHtml;
  if (countProgress === 0) colProgress.innerHTML = emptyTodoHtml;
  if (countCompleted === 0) colCompleted.innerHTML = emptyTodoHtml;
}


function createKanbanCard(task) {
  const card = document.createElement('div');
  card.className = 'kanban-card';

  const deliverableHtml = task.deliverable_url
    ? `<a href="${task.deliverable_url}" target="_blank" class="deliverable-link">
        Deliverable Link ↗
       </a>`
    : '';

  card.innerHTML = `
    <div class="card-top-bar">
      <span class="track-badge track-${task.track}">${task.track.toUpperCase()}</span>
      <span class="occ-version-pill btn-inspect-task" style="cursor: pointer;" title="Click to inspect task version history and audit trail">v${task.version}</span>
      ${renderTaskDueBadge(task.deadline)}
    </div>
    
    <div class="kanban-card-body btn-inspect-task" style="cursor: pointer;" title="Click to inspect task history & revisions">
      <h4 class="kanban-card-title">${task.title}</h4>
      <p class="kanban-card-desc">${task.description || ''}</p>
    </div>

    ${deliverableHtml}

    <div class="card-footer">
      <div class="assignee-chip">
        <div class="assignee-avatar">${getInitials(task.assignee_name || 'UN')}</div>
        <span class="assignee-name">${task.assignee_name || 'Unassigned'}</span>
      </div>

      <div class="card-action-btns">
        <button class="btn btn-outlined btn-sm btn-inspect-history" title="View edit history and deliverable notes">History</button>
        ${task.status !== 'IN_PROGRESS' ? `<button class="btn btn-outlined btn-sm btn-advance-task" data-id="${task.id}" data-version="${task.version}" data-next="IN_PROGRESS" title="Mark In Progress">In Progress</button>` : ''}
        ${task.status !== 'COMPLETED' ? `<button class="btn btn-filled btn-sm btn-advance-task" data-id="${task.id}" data-version="${task.version}" data-next="COMPLETED" title="Mark Completed">Complete</button>` : ''}
        <button class="btn btn-icon btn-test-occ" data-id="${task.id}" data-version="${task.version}" title="Simulate Stale OCC Write Conflict">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </button>
      </div>
    </div>
  `;

  // History Inspector triggers
  card.querySelectorAll('.btn-inspect-task, .btn-inspect-history').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.deliverable-link') || e.target.closest('.btn-advance-task') || e.target.closest('.btn-test-occ')) return;
      openTaskRevisionInspector(task);
    });
  });

  // Status transitions
  card.querySelectorAll('.btn-advance-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = parseInt(btn.dataset.id, 10);
      const version = parseInt(btn.dataset.version, 10);
      const nextStatus = btn.dataset.next;
      await updateTask(taskId, { status: nextStatus, version });
    });
  });

  // OCC Demonstration
  card.querySelector('.btn-test-occ')?.addEventListener('click', async () => {
    const taskId = parseInt(task.id, 10);
    const staleVersion = task.version - 1;
    await updateTaskWithOccCheck(taskId, { status: 'COMPLETED', version: staleVersion }, task);
  });

  return card;
}

async function updateTask(taskId, payload) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to update task', true);
      return;
    }

    showToast('Task updated successfully');
    await loadTasks();
    await loadPersonalDashboard();
  } catch (err) {
    showToast('Network error updating task', true);
  }
}

async function updateTaskWithOccCheck(taskId, payload, originalTask) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.status === 409) {
      document.getElementById('occ-server-version').textContent = `v${data.currentVersion || originalTask.version}`;
      document.getElementById('occ-server-status').textContent = originalTask.status;
      document.getElementById('occ-client-version').textContent = `v${payload.version} (Stale Attempt)`;
      document.getElementById('occ-client-status').textContent = payload.status;
      document.getElementById('modal-occ-conflict').showModal();
      return;
    }

    await loadTasks();
  } catch (err) {
    showToast('Network error during OCC test', true);
  }
}

// -------------------------------------------------------------
// VIEW 4: ANONYMOUS PEER PERFORMANCE VOTING
// -------------------------------------------------------------
let votingSyncChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    votingSyncChannel = new BroadcastChannel('frontier_voting_sync');
    votingSyncChannel.onmessage = async (event) => {
      if (event.data && (event.data.type === 'VOTING_CHANGED' || event.data.type === 'VOTE_CAST')) {
        await loadVotingSession();
      }
    };
  }
} catch (e) { }

function notifyVotingChanged(type = 'VOTING_CHANGED') {
  try {
    if (votingSyncChannel) {
      votingSyncChannel.postMessage({ type, timestamp: Date.now() });
    }
  } catch (e) { }
}

// Background auto-refresh for peer review in multi-device/multi-browser sessions
if (typeof window !== 'undefined') {
  setInterval(async () => {
    const votingView = document.getElementById('view-voting');
    if (votingView && !votingView.classList.contains('hidden') && document.visibilityState === 'visible') {
      await loadVotingSession();
    }
  }, 3500);
}

async function loadVotingSession(forcedSessionId = null) {
  try {
    const url = forcedSessionId ? `/api/voting/current?session_id=${forcedSessionId}` : '/api/voting/current';
    const res = await fetch(url);
    const data = await res.json();
    state.votingSession = data;

    if (data.session && data.session.id) {
      state.currentVotingSessionId = data.session.id;
      const savedToken = sessionStorage.getItem('ballot_token_' + data.session.id);
      if (savedToken) {
        state.unlinkedBallotToken = savedToken;
      }
    } else {
      state.currentVotingSessionId = null;
    }

    renderVotingSession();
  } catch (err) {
    console.error('Failed to load voting session:', err);
  }
}

function isCurrentUserAdminHost() {
  if (!state.currentUser) return false;
  const isHostFlag = state.currentUser.is_host === 1 || state.currentUser.is_host === true || state.currentUser.is_host === '1';
  const isHostId = state.currentUser.id === 1 || state.currentUser.handle === 'potatobun321';
  return !!(isHostFlag && isHostId);
}

function renderVotingSession() {
  const s = state.votingSession;
  const isHost = isCurrentUserAdminHost();

  const idleContainer = document.getElementById('voting-idle-container');
  const activeContainer = document.getElementById('voting-active-container');
  const closedContainer = document.getElementById('voting-closed-container');
  if (s && s.session) {
    const hl = document.getElementById('voting-session-headline');
    if (hl) hl.textContent = s.session.title;
    const sm = document.getElementById('voting-session-summary');
    if (sm) sm.textContent = s.session.description;
  }
  updateSegmentedGlider(document.getElementById('voting-template-tabs'));

  const openLaunchBtn = document.getElementById('btn-open-launch-voting');
  const idleLaunchBtn = document.getElementById('btn-idle-launch-voting');
  const closeVoteBtn = document.getElementById('btn-host-close-voting');
  const reopenVoteBtn = document.getElementById('btn-host-reopen-voting');
  const closedNewRoundBtn = document.getElementById('btn-closed-new-round');
  const closedReopenBtn = document.getElementById('btn-closed-reopen-round');
  const statusPill = document.getElementById('voting-status-pill');
  const subtitleEl = document.getElementById('voting-view-subtitle');

  const navVotingBadge = document.getElementById('badge-voting-status');

  // Case 1: Idle state (No active session AND no closed session)
  if (!s || (!s.active && !s.hasClosedSession)) {
    if (navVotingBadge) {
      navVotingBadge.textContent = 'Idle';
      navVotingBadge.className = 'nav-badge';
      navVotingBadge.style.display = 'none';
    }
    if (idleContainer) idleContainer.classList.remove('hidden');
    if (activeContainer) activeContainer.classList.add('hidden');
    if (closedContainer) closedContainer.classList.add('hidden');

    if (statusPill) {
      statusPill.innerHTML = '<span class="pulse-dot" style="background:#9aa0a6; width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:5px;"></span>No Active Round';
      statusPill.className = 'status-pill pill-grey';
    }
    if (subtitleEl) {
      subtitleEl.textContent = 'Anonymous cryptographic evaluation. No active voting round is currently open.';
    }

    if (openLaunchBtn) {
      if (isHost) openLaunchBtn.classList.remove('hidden');
      else openLaunchBtn.classList.add('hidden');
    }
    if (idleLaunchBtn) {
      if (isHost) idleLaunchBtn.classList.remove('hidden');
      else idleLaunchBtn.classList.add('hidden');
    }
    if (closeVoteBtn) closeVoteBtn.classList.add('hidden');
    if (reopenVoteBtn) reopenVoteBtn.classList.add('hidden');
    return;
  }

  // Case 2: Closed state (Has a closed session and no active session)
  if (!s.active && s.hasClosedSession && s.session) {
    if (navVotingBadge) {
      navVotingBadge.textContent = 'Closed';
      navVotingBadge.className = 'nav-badge';
      navVotingBadge.style.display = 'inline-block';
      navVotingBadge.style.background = 'rgba(251, 188, 4, 0.15)';
      navVotingBadge.style.color = '#fbbc04';
    }
    if (idleContainer) idleContainer.classList.add('hidden');
    if (activeContainer) activeContainer.classList.add('hidden');
    if (closedContainer) closedContainer.classList.remove('hidden');

    if (statusPill) {
      statusPill.innerHTML = '<span class="pulse-dot" style="background:#fbbc04; width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:5px;"></span>Session Closed';
      statusPill.className = 'status-pill pill-amber';
    }

    const closedTitleEl = document.getElementById('closed-round-title');
    const closedDescEl = document.getElementById('closed-round-desc');
    if (s.targetMember) {
      if (closedTitleEl) closedTitleEl.textContent = `Peer Performance Results: ${s.targetMember.name}`;
      if (closedDescEl) {
        closedDescEl.textContent = `Submissions concluded. Overall average performance rating for ${s.targetMember.name} (${s.targetMember.role}) is displayed below.`;
      }
    } else if (s.session.session_type === 'PROJECT_QUALITY') {
      if (closedTitleEl) closedTitleEl.textContent = s.session.title || 'Project Review & Team Experience Results';
      if (closedDescEl) {
        closedDescEl.textContent = 'Submissions concluded. Overall project satisfaction and dimension ratings are displayed below.';
      }
    } else {
      if (closedTitleEl) closedTitleEl.textContent = s.session.title || 'Sprint Standings & Aggregate Results';
      if (closedDescEl) {
        closedDescEl.textContent = s.session.description
          ? `${s.session.description} — submissions concluded.`
          : 'Submissions have concluded for this round. Final cryptographic ratings and rankings are listed below.';
      }
    }

    renderTallyMeters(s.tally || [], s.candidates || s.options || [], 'closed-tally-bars-display');

    if (openLaunchBtn) {
      // In closed state, let the closed container banner own the action buttons to avoid duplicate triggers
      openLaunchBtn.classList.add('hidden');
    }
    if (closeVoteBtn) closeVoteBtn.classList.add('hidden');
    if (reopenVoteBtn) reopenVoteBtn.classList.add('hidden');
    if (closedNewRoundBtn) {
      if (isHost) closedNewRoundBtn.classList.remove('hidden');
      else closedNewRoundBtn.classList.add('hidden');
    }
    if (closedReopenBtn) {
      if (isHost) closedReopenBtn.classList.remove('hidden');
      else closedReopenBtn.classList.add('hidden');
    }
    return;
  }

  // Case 3: Active state
  if (navVotingBadge) {
    navVotingBadge.textContent = 'Active';
    navVotingBadge.className = 'nav-badge';
    navVotingBadge.style.display = 'inline-block';
    navVotingBadge.style.background = 'rgba(52, 168, 83, 0.15)';
    navVotingBadge.style.color = '#81c995';
  }
  if (idleContainer) idleContainer.classList.add('hidden');
  if (closedContainer) closedContainer.classList.add('hidden');
  if (activeContainer) activeContainer.classList.remove('hidden');

  if (statusPill) {
    statusPill.innerHTML = '<span class="pulse-dot" style="background:#34a853; width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:5px;"></span>Active Round';
    statusPill.className = 'status-pill pill-green';
  }

  const headlineEl = document.getElementById('voting-session-headline');
  if (headlineEl) headlineEl.textContent = s.session.title || 'Active Evaluation Round';

  const metricChipEl = document.getElementById('voting-active-metric-chip');
  if (metricChipEl) {
    if (s.targetMember) {
      metricChipEl.textContent = `Reviewing: ${s.targetMember.name} (${s.targetMember.role})`;
    } else {
      metricChipEl.textContent = s.session.description || 'Sprint Contribution & Team Collaboration';
    }
  }

  if (subtitleEl) {
    if (s.targetMember) {
      subtitleEl.textContent = `Anonymous 1–5 star peer evaluation for ${s.targetMember.name}. Cryptographically decoupled via HMAC blind tokens with zero identity linkage.`;
    } else {
      subtitleEl.textContent = s.session.description
        ? `${s.session.description} — anonymous 1–5 star ratings.`
        : 'Anonymous sprint contribution ratings (1–5 Stars). Cryptographically decoupled via HMAC blind tokens with zero identity linkage.';
    }
  }

  const isQualityType = s.session.session_type === 'PROJECT_QUALITY';
  const labelCandidateStep = document.getElementById('label-select-candidate-step');
  const hintCandidateStep = document.getElementById('hint-select-candidate-step');
  const labelRatingStep = document.getElementById('label-rating-step');

  if (s.targetMember) {
    if (labelCandidateStep) labelCandidateStep.textContent = '1. Teammate Under Evaluation';
    if (hintCandidateStep) hintCandidateStep.textContent = `Submit an anonymous 1–5 star rating for ${s.targetMember.name}'s sprint performance`;
    if (labelRatingStep) labelRatingStep.textContent = '2. Rate Performance & Sprint Contribution';
  } else if (isQualityType) {
    if (labelCandidateStep) labelCandidateStep.textContent = '1. Select Project Review Dimension';
    if (hintCandidateStep) hintCandidateStep.textContent = 'Rate team dynamic, milestone architecture, code quality, and working experience';
    if (labelRatingStep) labelRatingStep.textContent = '2. Rate Project Experience & Quality';
  } else {
    if (labelCandidateStep) labelCandidateStep.textContent = '1. Select Teammate to Evaluate';
    if (hintCandidateStep) hintCandidateStep.textContent = 'Pick any teammate to submit an anonymous 1–5 star rating';
    if (labelRatingStep) labelRatingStep.textContent = '2. Rate Sprint Contribution & Collaboration';
  }

  const ballots = s.totalBallots || 0;
  const eligible = s.totalEligible || s.candidates?.length || 8;
  const pct = Math.min(100, Math.round((ballots / eligible) * 100));

  const ballotsCountEl = document.getElementById('stats-ballots-count');
  const ballotsTotalEl = document.getElementById('stats-ballots-total');
  const ballotsBarEl = document.getElementById('stats-ballots-bar');
  const circleFillEl = document.getElementById('participation-circle-fill');
  const circlePctEl = document.getElementById('stats-participation-pct');
  const partPillEl = document.getElementById('participation-status-pill');

  if (ballotsCountEl) ballotsCountEl.textContent = ballots;
  if (ballotsTotalEl) ballotsTotalEl.textContent = `/ ${eligible}`;
  if (ballotsBarEl) ballotsBarEl.style.width = `${pct}%`;
  if (circleFillEl) circleFillEl.setAttribute('stroke-dasharray', `${pct}, 100`);
  if (circlePctEl) circlePctEl.textContent = `${pct}%`;
  if (partPillEl) partPillEl.textContent = ballots >= eligible ? 'All Evaluations Submitted' : 'Active Round in Progress';

  if (isHost) {
    if (openLaunchBtn) openLaunchBtn.classList.remove('hidden');
    if (closeVoteBtn) closeVoteBtn.classList.remove('hidden');
    if (reopenVoteBtn) reopenVoteBtn.classList.add('hidden');
  } else {
    if (openLaunchBtn) openLaunchBtn.classList.add('hidden');
    if (closeVoteBtn) closeVoteBtn.classList.add('hidden');
    if (reopenVoteBtn) reopenVoteBtn.classList.add('hidden');
  }

  // Token shield state
  const tokenShieldText = document.getElementById('crypto-token-status-text');
  const blindTokenCode = document.getElementById('display-blind-token');

  if (state.unlinkedBallotToken) {
    if (tokenShieldText) tokenShieldText.textContent = `HMAC Token Active: ${state.unlinkedBallotToken.slice(0, 10)}... (zero identity linkage in ballot box).`;
    if (blindTokenCode) {
      blindTokenCode.textContent = state.unlinkedBallotToken;
      blindTokenCode.style.display = 'inline-block';
    }
  } else {
    if (tokenShieldText) tokenShieldText.textContent = 'A decoupled blind cryptographic token will be automatically requested and burned on submit.';
    if (blindTokenCode) blindTokenCode.style.display = 'none';
  }

  // Populate candidate options dynamically as cards
  const choicesContainer = document.getElementById('ballot-options-container');
  const submitBtn = document.getElementById('btn-submit-evaluation');
  if (choicesContainer) {
    choicesContainer.innerHTML = '';

    if (s.targetMember) {
      // Single Target Member Peer Evaluation Mode
      const isSelf = !!(state.currentUser && state.currentUser.id === s.targetMember.id);
      const candName = s.targetMember.name;
      const candRole = s.targetMember.role;
      const candTrack = s.targetMember.team_track || 'General';
      const initials = candName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'TM';

      const card = document.createElement('div');
      card.className = `candidate-card-btn ${isSelf ? 'disabled' : 'selected'}`;
      card.dataset.candidateId = s.targetMember.id;
      card.dataset.candidateName = candName;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', isSelf ? 'false' : 'true');

      card.innerHTML = `
        <div class="cand-avatar">${initials}</div>
        <div class="cand-info">
          <div class="cand-name-row">
            <span class="cand-name">${escapeHtml(candName)}</span>
            ${isSelf ? '<span class="cand-badge-self">You (Subject of this Review)</span>' : '<span class="cand-badge-self" style="background: rgba(52, 168, 83, 0.15); color: #81c995;">Teammate Under Evaluation</span>'}
          </div>
          <div class="cand-sub">${escapeHtml(candRole)} · Track: ${escapeHtml(candTrack.toUpperCase())}</div>
        </div>
        <div class="cand-check-circle">${!isSelf ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</div>
      `;

      choicesContainer.appendChild(card);

      if (isSelf) {
        const selfNote = document.createElement('div');
        selfNote.style.cssText = 'grid-column: 1 / -1; padding: 12px 16px; border-radius: 8px; background: rgba(66, 133, 244, 0.08); border: 1px solid rgba(66, 133, 244, 0.2); color: var(--text-primary); font-size: 13px; text-align: center; margin-top: 6px;';
        selfNote.textContent = 'You are the subject of this peer review round. Your teammates and host are anonymously rating your sprint performance.';
        choicesContainer.appendChild(selfNote);

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.title = 'You cannot evaluate yourself in your own peer review round.';
        }
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.title = '';
        }
      }
    } else {
      // General or Project Review Mode
      const candidatesList = s.candidates || s.options || [];
      let hasSelected = false;
      let evaluableCount = 0;

      candidatesList.forEach((cand, idx) => {
        const candId = cand.id || cand.candidate_member_id;
        const isSelf = (!isQualityType && state.currentUser && state.currentUser.id === candId);
        if (!isSelf) evaluableCount++;

        const candName = cand.name || cand.candidate_name || cand.label || (isQualityType ? 'Project Dimension' : 'Engineer');
        const candRole = cand.role || cand.candidate_role || (isQualityType ? 'Milestone Focus' : 'Developer');
        const candTrack = cand.team_track || (isQualityType ? 'milestone' : 'general');
        const initials = candName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || (isQualityType ? 'PR' : 'TM');

        const card = document.createElement('div');
        const isDefaultSelected = !isSelf && !hasSelected;
        if (isDefaultSelected) hasSelected = true;

        card.className = `candidate-card-btn ${isSelf ? 'disabled' : ''} ${isDefaultSelected ? 'selected' : ''}`;
        card.dataset.candidateId = candId;
        card.dataset.candidateName = candName;
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', isDefaultSelected ? 'true' : 'false');

        card.innerHTML = `
          <div class="cand-avatar">${initials}</div>
          <div class="cand-info">
            <div class="cand-name-row">
              <span class="cand-name">${escapeHtml(candName)}</span>
              ${isSelf ? '<span class="cand-badge-self">You (Self-eval excluded)</span>' : ''}
            </div>
            <div class="cand-sub">${escapeHtml(candRole)} · Track: ${escapeHtml(candTrack.toUpperCase())}</div>
          </div>
          <div class="cand-check-circle">${isDefaultSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</div>
        `;

        if (!isSelf) {
          card.addEventListener('click', () => {
            choicesContainer.querySelectorAll('.candidate-card-btn').forEach(c => {
              c.classList.remove('selected');
              c.setAttribute('aria-checked', 'false');
              const check = c.querySelector('.cand-check-circle');
              if (check) check.innerHTML = '';
            });
            card.classList.add('selected');
            card.setAttribute('aria-checked', 'true');
            const check = card.querySelector('.cand-check-circle');
            if (check) check.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          });
        }

        choicesContainer.appendChild(card);
      });

      if (evaluableCount === 0 && !isQualityType) {
        const emptyNote = document.createElement('div');
        emptyNote.style.cssText = 'grid-column: 1 / -1; padding: 14px 18px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed var(--border-default); color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 8px;';
        emptyNote.textContent = 'You are the only member registered in this workspace. Teammates must join before you can submit peer evaluations for them.';
        choicesContainer.appendChild(emptyNote);
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.title = 'No other teammates available to evaluate';
        }
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.title = '';
        }
      }
    }
  }

  // Render Live Leaderboard Standings
  renderTallyMeters(s.tally || [], s.candidates || s.options || [], 'tally-bars-display');

  // Initialize star rating showcase
  initStarRatingSelector();
}

function initStarRatingSelector() {
  const starButtons = document.querySelectorAll('#star-rating-selector .star-btn');
  const hiddenInput = document.getElementById('selected-ballot-rating');
  const label = document.getElementById('rating-score-label');
  const explainer = document.getElementById('rating-score-explainer');

  const ratingMetadata = {
    1: { label: '1.0 ★ Needs Improvement', text: 'Milestones missed or required heavy intervention.' },
    2: { label: '2.0 ★ Fair Progress', text: 'Met basic sprint tasks with assistance.' },
    3: { label: '3.0 ★ Good & Reliable', text: 'Solid delivery on schedule with dependable engineering.' },
    4: { label: '4.0 ★ Very Good Impact', text: 'High velocity, clean code, and proactive peer assistance.' },
    5: { label: '5.0 ★ Outstanding Impact', text: 'Exceptional velocity, architecture leadership, and peer support.' }
  };

  function updateVisuals(rating) {
    starButtons.forEach(b => {
      const bRating = parseInt(b.dataset.rating, 10);
      if (bRating <= rating) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  const initialVal = hiddenInput ? parseInt(hiddenInput.value, 10) : 5;
  updateVisuals(initialVal);

  starButtons.forEach(btn => {
    const rating = parseInt(btn.dataset.rating, 10);

    btn.addEventListener('mouseenter', () => {
      updateVisuals(rating);
      if (label && ratingMetadata[rating]) label.textContent = ratingMetadata[rating].label;
      if (explainer && ratingMetadata[rating]) explainer.textContent = ratingMetadata[rating].text;
    });

    btn.addEventListener('mouseleave', () => {
      const currentVal = hiddenInput ? parseInt(hiddenInput.value, 10) : 5;
      updateVisuals(currentVal);
      if (label && ratingMetadata[currentVal]) label.textContent = ratingMetadata[currentVal].label;
      if (explainer && ratingMetadata[currentVal]) explainer.textContent = ratingMetadata[currentVal].text;
    });

    btn.addEventListener('click', () => {
      if (hiddenInput) hiddenInput.value = rating;
      updateVisuals(rating);
      if (label && ratingMetadata[rating]) label.textContent = ratingMetadata[rating].label;
      if (explainer && ratingMetadata[rating]) explainer.textContent = ratingMetadata[rating].text;
    });
  });

  // Praise chips toggle
  document.querySelectorAll('#voting-praise-chips .praise-chip').forEach(chip => {
    chip.onclick = () => {
      chip.classList.toggle('active');
    };
  });
}

function renderTallyMeters(tally, candidatesList = [], containerId = 'tally-bars-display') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  // Merge tally with all candidates so every candidate appears on the standings board
  const candMap = new Map();
  candidatesList.forEach(c => {
    const id = c.id || c.candidate_member_id;
    candMap.set(id, {
      id,
      candidate_name: c.name || c.candidate_name || c.label,
      candidate_role: c.role || c.candidate_role || 'Engineer',
      avg_rating: 0,
      total_ratings: 0
    });
  });

  (tally || []).forEach(item => {
    const id = item.candidate_id || item.id;
    if (id && candMap.has(id)) {
      candMap.set(id, { ...candMap.get(id), ...item });
    } else {
      candMap.set(id || Math.random(), item);
    }
  });

  const list = Array.from(candMap.values());
  list.sort((a, b) => {
    const scoreA = (a.avg_rating || 0) * (a.total_ratings || a.votes || 0);
    const scoreB = (b.avg_rating || 0) * (b.total_ratings || b.votes || 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (b.avg_rating || 0) - (a.avg_rating || 0);
  });

  list.forEach((item, idx) => {
    const avgScore = item.avg_rating || 0;
    const count = item.total_ratings || item.votes || 0;
    const scorePct = Math.round((avgScore / 5) * 100);
    const rankBadge = `<div class="rank-badge rank-${idx + 1}">#${idx + 1}</div>`;

    const card = document.createElement('div');
    card.className = 'standings-rank-card';
    card.innerHTML = `
      <div class="rank-card-left">
        ${rankBadge}
        <div style="min-width: 0;">
          <div class="rank-cand-name">${escapeHtml(item.candidate_name || item.label || 'Teammate')}</div>
          <div class="rank-cand-role">${escapeHtml(item.candidate_role || 'Engineering Member')}</div>
          <div style="height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); width: 110px; margin-top: 4px; overflow: hidden;">
            <div style="width: ${scorePct}%; height: 100%; background: ${avgScore >= 4.5 ? '#fbbc04' : avgScore >= 3.5 ? '#34a853' : '#4285f4'}; transition: width 0.4s ease;"></div>
          </div>
        </div>
      </div>
      <div class="rank-card-right">
        <div class="rank-score-pill">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#fbbc04" style="margin-right:2px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          <span>${avgScore > 0 ? avgScore.toFixed(1) : '—'}</span>
        </div>
        <div class="rank-review-count">${count} ${count === 1 ? 'evaluation' : 'evaluations'}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function claimBlindToken() {
  try {
    const sessionId = state.votingSession?.session?.id || state.currentVotingSessionId || '';
    const res = await fetch('/api/voting/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to claim token', true);
      return;
    }

    state.unlinkedBallotToken = data.token;
    if (sessionId) sessionStorage.setItem('ballot_token_' + sessionId, data.token);
    showToast('Blind Ballot Token issued! Your identity is decoupled from this token.');
    await loadVotingSession();
  } catch (err) {
    showToast('Failed to claim blind token', true);
  }
}

async function castAnonymousBallot(e) {
  e.preventDefault();

  const selected = document.querySelector('#ballot-options-container .candidate-card-btn.selected');
  if (!selected) {
    return showToast('Please select an item to evaluate', true);
  }

  const candidateId = parseInt(selected.dataset.candidateId, 10);
  const ratingInput = document.getElementById('selected-ballot-rating');
  const rating = ratingInput ? parseInt(ratingInput.value, 10) : 5;
  const sessionId = state.votingSession?.session?.id || state.currentVotingSessionId || '';

  // Auto-acquire token seamlessly if user doesn't have one yet
  let token = state.unlinkedBallotToken;
  if (!token) {
    try {
      const tokenRes = await fetch('/api/voting/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        showToast(tokenData.error || 'Unable to generate cryptographic ballot token', true);
        return;
      }
      token = tokenData.token;
      state.unlinkedBallotToken = token;
      if (sessionId) sessionStorage.setItem('ballot_token_' + sessionId, token);
    } catch (err) {
      showToast('Network error securing anonymous token', true);
      return;
    }
  }

  try {
    const res = await fetch('/api/voting/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, candidate_id: candidateId, option_id: candidateId, rating, token })
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409 || data.error?.includes('already cast') || data.error?.includes('Double-spending') || data.error?.includes('FOREIGN KEY')) {
        state.unlinkedBallotToken = null;
        if (sessionId) sessionStorage.removeItem('ballot_token_' + sessionId);
      }
      showToast(data.error || 'Failed to submit evaluation', true);
      return;
    }

    state.unlinkedBallotToken = null;
    if (sessionId) sessionStorage.removeItem('ballot_token_' + sessionId);

    // Show success card
    const evalForm = document.getElementById('form-submit-ballot');
    const completedBox = document.getElementById('voting-completed-box');
    if (evalForm) evalForm.classList.add('hidden');
    if (completedBox) completedBox.classList.remove('hidden');

    const candName = selected.dataset.candidateName || 'Item';
    showToast(`Anonymous evaluation of ${rating}/5.0 stars recorded for ${candName}.`);
    notifyVotingChanged('VOTE_CAST');
    await loadVotingSession();
    await loadPersonalDashboard();
  } catch (err) {
    showToast('Network error casting ballot', true);
  }
}

async function hostCloseVotingSession() {
  if (!isCurrentUserAdminHost()) {
    showToast('Host Authorization Required: Only the Team Host (Admin) can close a review session.', true);
    return;
  }

  try {
    const sessionId = state.votingSession?.session?.id || state.currentVotingSessionId || '';
    const res = await fetch('/api/voting/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to close session', true);
      return;
    }
    showToast('Review round closed! Final standings revealed.');
    notifyVotingChanged('VOTING_CHANGED');
    await loadVotingSession();
    await loadPersonalDashboard();
  } catch (err) {
    showToast('Error closing review session', true);
  }
}

async function hostReopenVotingSession() {
  if (!isCurrentUserAdminHost()) {
    showToast('Host Authorization Required: Only the Team Host (Admin) can reopen a review session.', true);
    return;
  }

  try {
    const sessionId = state.votingSession?.session?.id || state.currentVotingSessionId || '';
    const res = await fetch('/api/voting/reopen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to reopen session', true);
      return;
    }
    showToast('Review session reopened for submissions!');
    notifyVotingChanged('VOTING_CHANGED');
    await loadVotingSession();
    await loadPersonalDashboard();
  } catch (err) {
    showToast('Error reopening review session', true);
  }
}

async function submitLaunchVotingSession(e) {
  e.preventDefault();
  if (!isCurrentUserAdminHost()) {
    showToast('Host Authorization Required: Only Team Lead (Admin) can launch a review session.', true);
    return;
  }

  const typeSelect = document.getElementById('voting-launch-type');
  const titleInput = document.getElementById('voting-launch-title');
  const metricInput = document.getElementById('voting-launch-metric');
  const descInput = document.getElementById('voting-launch-desc');
  const targetSelect = document.getElementById('voting-launch-target-member');

  const session_type = typeSelect ? typeSelect.value : 'PEER_PERFORMANCE';
  const title = titleInput ? titleInput.value.trim() : '';
  const metric = metricInput ? metricInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';
  const target_member_id = (session_type === 'PEER_PERFORMANCE' && targetSelect && targetSelect.value)
    ? parseInt(targetSelect.value, 10)
    : null;

  let options = [];
  if (session_type === 'PROJECT_QUALITY') {
    document.querySelectorAll('#group-launch-quality-pillars .quality-pillar-input').forEach(inp => {
      if (inp.value && inp.value.trim()) options.push(inp.value.trim());
    });
  }

  try {
    const res = await fetch('/api/voting/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_type, title, metric, description, target_member_id, options })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to launch review session', true);
      return;
    }

    document.getElementById('modal-launch-voting')?.close();
    showToast(`Review session "${title}" successfully launched!`);
    state.currentVotingSessionId = data.session_id;
    notifyVotingChanged('VOTING_CHANGED');
    await loadVotingSession();
    await loadPersonalDashboard();
  } catch (err) {
    showToast('Network error launching review session', true);
  }
}

function initLaunchVotingModal() {
  const modal = document.getElementById('modal-launch-voting');
  const form = document.getElementById('form-launch-voting');
  const typeSelect = document.getElementById('voting-launch-type');
  const targetMemberGroup = document.getElementById('wrap-launch-target-member');
  const targetSelect = document.getElementById('voting-launch-target-member');
  const pillarsGroup = document.getElementById('group-launch-quality-pillars');
  const titleInput = document.getElementById('voting-launch-title');
  const metricInput = document.getElementById('voting-launch-metric');
  const descInput = document.getElementById('voting-launch-desc');
  const hintEl = document.getElementById('voting-type-hint');

  function populateLaunchMembers() {
    if (!targetSelect) return;
    targetSelect.innerHTML = '';
    const membersList = state.members || [];
    membersList.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (@${m.handle} · ${m.role})`;
      targetSelect.appendChild(opt);
    });
  }

  const openBtns = [
    document.getElementById('btn-open-launch-voting'),
    document.getElementById('btn-idle-launch-voting'),
    document.getElementById('btn-closed-new-round')
  ];

  openBtns.forEach(btn => {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isCurrentUserAdminHost()) {
        showToast('Only Team Lead (Admin) can launch a review session.', true);
        return;
      }
      populateLaunchMembers();
      if (modal && !modal.open) {
        modal.showModal();
      }
    });
  });

  document.getElementById('btn-close-launch-voting')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal?.close();
  });
  document.getElementById('btn-cancel-launch-voting')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal?.close();
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.close();
    }
  });

  // Global safety: close any workspace-dialog when clicking outside
  document.querySelectorAll('dialog.workspace-dialog').forEach(dlg => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) {
        dlg.close();
      }
    });
  });

  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'PROJECT_QUALITY') {
        if (targetMemberGroup) targetMemberGroup.classList.add('hidden');
        if (pillarsGroup) pillarsGroup.classList.remove('hidden');
        if (titleInput) titleInput.value = 'Sprint 1 Project Review & Team Experience';
        if (metricInput) metricInput.value = 'Team Dynamic, Working Collaboration & Deliverable Quality';
        if (descInput) descInput.value = 'Rate overall project working experience, team collaboration, and milestone delivery.';
        if (hintEl) hintEl.textContent = 'Host and teammates evaluate milestone stability, working experience, and team dynamic on a 1–5 scale.';
      } else {
        if (targetMemberGroup) targetMemberGroup.classList.remove('hidden');
        if (pillarsGroup) pillarsGroup.classList.add('hidden');
        if (titleInput) titleInput.value = 'Sprint Peer Performance Review';
        if (metricInput) metricInput.value = 'Sprint Contribution, Technical Reliability & Team Collaboration';
        if (descInput) descInput.value = 'Anonymous sprint contribution ratings (1–5 Stars). Cryptographically decoupled via HMAC blind tokens with zero identity linkage.';
        if (hintEl) hintEl.textContent = 'Host selects a specific team member. The team and host then anonymously rate their sprint performance on a 1–5 scale.';
      }
    });
  }

  form?.addEventListener('submit', submitLaunchVotingSession);
}

// -------------------------------------------------------------
// VIEW 5: CALENDAR & MEETING PINGS
// -------------------------------------------------------------
async function loadCalendarEvents() {
  try {
    const res = await fetch('/api/calendar');
    const data = await res.json();
    state.calendarEvents = data.events;
    const badgeCal = document.getElementById('badge-cal-count');
    if (badgeCal) badgeCal.textContent = state.calendarEvents.length;
    renderCalendarEvents();
    updateRoomStatusWidget();
  } catch (err) {
    console.error('Failed to load calendar events:', err);
  }
}

function renderCalendarEvents() {
  const container = document.getElementById('calendar-all-events-container');
  if (!container) return;
  container.innerHTML = '';

  // Render Meeting Bridges Overview Panel
  renderMeetingBridges();

  if (state.calendarEvents.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <h4>No Events Scheduled</h4>
        <p>No upcoming deadlines or meetings scheduled.</p>
      </div>`;
    return;
  }

  state.calendarEvents.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'cal-event-card';

    const isMeeting = ev.event_type === 'MEETING' || ev.event_type === 'RETRO';
    const slotLabel = ev.slot_name ? `${ev.slot_name} (${ev.slot_code || ''})` : (ev.meeting_link ? 'Meeting Bridge' : 'Milestone');

    let audienceText = 'All Team Members';
    if (ev.target_audience === 'BACKEND') audienceText = 'Backend Track';
    else if (ev.target_audience === 'FRONTEND') audienceText = 'Frontend Track';
    else if (ev.target_audience && ev.target_audience.startsWith('[')) audienceText = 'Selected Guests';
    else if (ev.assignee_name) audienceText = `Target: ${ev.assignee_name}`;

    const dateTimeLabel = formatEventDisplayDateTime(ev.event_date, ev.time_label);
    const countdown = getLiveCountdownString(ev.event_date, ev.time_label, ev.is_live);

    card.innerHTML = `
      <div class="cal-card-top">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="cal-type-badge cal-tag-${ev.event_type}">${ev.event_type}</span>
          ${ev.is_live ? '<span class="live-pulse-badge" style="font-size:9.5px; padding:2px 6px;">LIVE NOW</span>' : ''}
        </div>
        <span style="font-size:11.5px; color:var(--text-muted);">${audienceText}</span>
      </div>

      <div>
        <h4 class="cal-event-title">${ev.title}</h4>
        ${ev.description ? `<p style="font-size:12px; color:var(--text-secondary); margin:4px 0 6px 0; line-height:1.4;">${ev.description}</p>` : ''}
        <div class="cal-date-time">
          <span>${dateTimeLabel}</span>
          <span class="cal-countdown-badge cal-live-countdown" data-date="${ev.event_date}" data-time="${ev.time_label}" data-live="${ev.is_live ? 'true' : 'false'}">${countdown}</span>
        </div>
        ${isMeeting ? `<div style="font-size:11.5px; color:var(--google-blue); margin-top:4px;">${slotLabel}</div>` : ''}
      </div>

      <div class="cal-card-actions">
        ${ev.join_url ? `
          <button class="meet-link-btn" onclick="openDockedCallById(${ev.id})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
            Join Call
          </button>
        ` : `<span style="font-size:12px; color:var(--text-muted);">Submission Deadline</span>`}

        ${state.currentUser && state.currentUser.is_host ? `
          ${isMeeting ? (ev.is_live ? `<button class="btn-cal-action btn-cal-end" onclick="endMeetingSession(${ev.id})">End Call</button>` : `<button class="btn-cal-action btn-cal-ping" onclick="pingMeetingSession(${ev.id})">Ping Now</button>`) : ''}
          <button class="btn-cal-action" onclick="deleteCalendarEvent(${ev.id})" style="color:var(--google-red);">Delete</button>
        ` : ''}
      </div>
    `;

    container.appendChild(card);
  });
}

async function renderMeetingBridges() {
  const container = document.getElementById('meeting-bridges-container');
  if (!container) return;
  try {
    const res = await fetch('/api/meetings/slots');
    const data = await res.json();
    if (!data.slots) return;

    container.innerHTML = '';
    data.slots.forEach(slot => {
      const card = document.createElement('div');
      card.className = 'bridge-slot-card';
      const lastUsed = slot.last_used_at ? new Date(slot.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ready';
      const isSlotLive = state.calendarEvents?.some(e => e.is_live && e.meeting_slot_id === slot.id);
      card.innerHTML = `
        <div class="bridge-slot-top">
          <span class="bridge-slot-code">${escapeHtml(slot.slot_code)}</span>
          <span class="bridge-status-dot ${isSlotLive ? 'pulse-green' : ''}" title="${isSlotLive ? 'Call in progress' : 'Available'}"></span>
        </div>
        <div class="bridge-slot-name">${escapeHtml(slot.slot_name)}</div>
        <div class="bridge-slot-meta">Status: ${isSlotLive ? 'In Use' : 'Ready'} · ${slot.last_used_at ? `Used at ${lastUsed}` : 'Unused slot'}</div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load meeting slots:', err);
  }
}

window.pingMeetingSession = async function(id) {
  try {
    const res = await fetch(`/api/calendar/${id}/ping`, { method: 'POST' });
    if (res.ok) {
      showToast('Meeting ping broadcasted to target audience.');
      await loadCalendarEvents();
      await loadPersonalDashboard();
    } else {
      const d = await res.json();
      showToast(d.error || 'Failed to broadcast ping', true);
    }
  } catch {
    showToast('Error broadcasting ping', true);
  }
};

window.endMeetingSession = async function(id) {
  try {
    const res = await fetch(`/api/calendar/${id}/end`, { method: 'POST' });
    if (res.ok) {
      showToast('Meeting session ended.');
      await loadCalendarEvents();
      await loadPersonalDashboard();
    } else {
      const d = await res.json();
      showToast(d.error || 'Failed to end session', true);
    }
  } catch {
    showToast('Error ending session', true);
  }
};

window.deleteCalendarEvent = async function(id) {
  if (!confirm('Are you sure you want to remove this event from the calendar?')) return;
  try {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Calendar event removed.');
      await loadCalendarEvents();
      await loadPersonalDashboard();
    } else {
      const d = await res.json();
      showToast(d.error || 'Failed to delete event', true);
    }
  } catch {
    showToast('Error deleting event', true);
  }
};

// -------------------------------------------------------------
// VIEW 6: 2-MAN GOVERNANCE PIPELINE
// -------------------------------------------------------------
async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    const data = await res.json();
    state.tickets = data.tickets;
    renderTickets();
  } catch (err) {
    console.error('Failed to load tickets:', err);
  }
}

function renderTickets() {
  const container = document.getElementById('governance-tickets-container');
  if (!container) return;
  container.innerHTML = '';

  if (state.tickets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <h4>No Deliverable Sign-Off Requests</h4>
        <p>No sprint deliverable or milestone sign-off requests are currently pending. When you finish a task, click "+ Request Sign-Off" above to initiate peer review verification.</p>
      </div>`;
    return;
  }

  state.tickets.forEach(ticket => {
    const card = document.createElement('div');
    card.className = 'ticket-pipeline-card card';

    const isPending = ticket.status === 'PENDING_APPROVAL';
    const isRequester = state.currentUser && state.currentUser.id === ticket.requester_id;

    let actionBtnHtml = '';
    if (isPending) {
      if (isRequester) {
        actionBtnHtml = `<button class="btn btn-outlined btn-sm btn-approve-ticket" data-id="${ticket.id}">Sign Off (Self-Approval Guarded)</button>`;
      } else {
        actionBtnHtml = `<button class="btn btn-filled btn-sm btn-approve-ticket" data-id="${ticket.id}">Review &amp; Sign Off</button>`;
      }
    }

    card.innerHTML = `
      <div class="ticket-top-row">
        <div class="ticket-header-group">
          <h4>${ticket.title}</h4>
          <span class="ticket-scope-tag">${ticket.scope}</span>
        </div>
        <span class="kpi-tag ${isPending ? 'tag-amber' : 'tag-green'}">${isPending ? 'PENDING SIGN-OFF' : 'SIGNED OFF'}</span>
      </div>

      <div class="ticket-reason-box">
        <strong>Review Context &amp; Notes:</strong> ${ticket.reason}
      </div>

      <div class="ticket-pipeline-nodes">
        <div class="pipeline-node">
          <div class="user-avatar">${getInitials(ticket.requester_name)}</div>
          <div>
            <div class="node-role-label">Author / Submitter</div>
            <div class="node-name-label">${ticket.requester_name}</div>
          </div>
        </div>

        <div class="flow-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </div>

        <div class="pipeline-node">
          <div class="user-avatar">${ticket.approver_name ? getInitials(ticket.approver_name) : '?'}</div>
          <div>
            <div class="node-role-label">Independent Reviewer</div>
            <div class="node-name-label">${ticket.approver_name || 'Pending Peer Sign-Off'}</div>
          </div>
        </div>

        <div class="pipeline-node">
          <div>
            <div class="node-role-label">Review Window</div>
            <div class="node-name-label">${ticket.expires_at ? `Active until ${new Date(ticket.expires_at).toLocaleTimeString()}` : `${ticket.duration_minutes} Mins Window`}</div>
          </div>
        </div>

        ${actionBtnHtml}
      </div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll('.btn-approve-ticket').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ticketId = parseInt(btn.dataset.id, 10);
      await approveTicket(ticketId);
    });
  });
}

async function approveTicket(ticketId) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}/approve`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Two-Person Rule Violation: Submitter cannot sign off on their own deliverable!', true);
      return;
    }

    showToast(data.message || 'Deliverable successfully signed off and verified by peer review!');
    await loadTickets();
  } catch (err) {
    showToast('Failed to sign off deliverable', true);
  }
}

// -------------------------------------------------------------
// VIEW 7: TEAM DIRECTORY
// -------------------------------------------------------------
function renderTeamRoster() {
  const containerSettings = document.getElementById('team-roster-cards');
  const containerPeers = document.getElementById('team-roster-peers-cards');

  const activeMembers = (state.members || []).filter(m => m.is_allowed !== 0);

  const subtitle = document.getElementById('team-roster-subtitle');
  if (subtitle) {
    const memberCount = activeMembers.length;
    subtitle.textContent = `${memberCount} Active Member${memberCount === 1 ? '' : 's'}: 1 Designated Host + ${Math.max(0, memberCount - 1)} Team Participant${memberCount === 2 ? '' : 's'}`;
  }

  const teamBadge = document.querySelector('[data-view="view-team"] .nav-badge');
  if (teamBadge) {
    teamBadge.textContent = activeMembers.length;
  }

  const isHost = state.currentUser && state.currentUser.is_host === 1;

  // Pending Access Requests (Host Only)
  const pendingSection = document.getElementById('pending-requests-section');
  const pendingList = document.getElementById('pending-requests-list');
  const pendingCount = document.getElementById('pending-requests-count');

  if (pendingSection && pendingList) {
    if (isHost && state.pendingMembers && state.pendingMembers.length > 0) {
      pendingSection.classList.remove('hidden');
      if (pendingCount) pendingCount.textContent = state.pendingMembers.length;
      pendingList.innerHTML = '';

      state.pendingMembers.forEach(pm => {
        const item = document.createElement('div');
        item.className = 'pending-member-row';
        item.innerHTML = `
          <div class="pending-member-info">
            <div class="roster-avatar avatar-amber" style="width: 38px; height: 38px; font-size: 13px;">${getInitials(pm.name)}</div>
            <div>
              <div class="pending-member-name">
                ${escapeHtml(pm.name)}
                <span class="tag-pending-review">Pending Review</span>
              </div>
              <div class="pending-member-email">${escapeHtml(pm.email || `@${pm.handle}`)}</div>
            </div>
          </div>
          <div class="pending-member-controls">
            <div class="control-group">
              <span class="control-label">Role:</span>
              <input type="text" class="input-material pending-role-val" value="${pm.role === 'Pending Review' ? 'Software Engineer' : escapeHtml(pm.role)}">
            </div>
            <div class="control-group">
              <span class="control-label">Track:</span>
              <select class="select-material pending-track-val">
                <option value="backend" ${pm.team_track === 'backend' ? 'selected' : ''}>Backend</option>
                <option value="frontend" ${pm.team_track === 'frontend' ? 'selected' : ''}>Frontend</option>
                <option value="lead" ${pm.team_track === 'lead' ? 'selected' : ''}>Lead</option>
              </select>
            </div>
            <div class="pending-action-btns">
              <button class="btn btn-m3-approve btn-approve-request" data-id="${pm.id}">
                Approve
              </button>
              <button class="btn btn-m3-decline btn-reject-request" data-id="${pm.id}">
                Decline
              </button>
            </div>
          </div>
        `;

        item.querySelector('.btn-approve-request')?.addEventListener('click', async () => {
          const roleInput = item.querySelector('.pending-role-val')?.value;
          const trackSelect = item.querySelector('.pending-track-val')?.value;
          try {
            const res = await fetch(`/api/members/${pm.id}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: roleInput, team_track: trackSelect })
            });
            const data = await res.json();
            if (res.ok) {
              showToast(`Access granted to ${pm.name}!`);
              await loadMembers();
            } else {
              showToast(data.error || 'Failed to approve member', true);
            }
          } catch (e) {
            showToast('Network error approving member', true);
          }
        });

        item.querySelector('.btn-reject-request')?.addEventListener('click', async () => {
          if (!confirm(`Reject access request for ${pm.name} (${pm.email || pm.handle})?`)) return;
          try {
            const res = await fetch(`/api/members/${pm.id}/reject`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
              showToast(`Access request for ${pm.name} was rejected.`);
              await loadMembers();
            } else {
              showToast(data.error || 'Failed to reject request', true);
            }
          } catch (e) {
            showToast('Network error rejecting request', true);
          }
        });

        pendingList.appendChild(item);
      });
    } else {
      pendingSection.classList.add('hidden');
    }
  }

  const renderCard = (m, isPeersView = false) => {
    const card = document.createElement('div');
    card.className = 'roster-card';

    let avatarColor = 'avatar-blue';
    if (m.team_track === 'frontend') avatarColor = 'avatar-purple';
    if (m.team_track === 'lead') avatarColor = 'avatar-amber';

    const assignedTasks = (state.tasks || []).filter(t => t.assignee_id === m.id).length;
    const isMe = state.currentUser && state.currentUser.id === m.id;

    card.innerHTML = `
      <div class="roster-card-header">
        <div class="roster-avatar ${avatarColor}">${getInitials(m.name)}</div>
        <div class="roster-title-group">
          <h4>${m.name} ${m.is_host ? '<span class="host-pill-tag">LEAD</span>' : ''} ${isMe ? '<span class="nav-badge">YOU</span>' : ''}</h4>
          <span class="roster-role-title">${m.role}</span>
        </div>
      </div>

      <div class="roster-meta-stack">
        <div class="meta-row">
          <span class="meta-label">Track</span>
          <span class="meta-val" style="text-transform: capitalize;">${escapeHtml(m.team_track || 'Member')}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Team Handle</span>
          <span class="meta-val" title="${escapeHtml(m.email || '@' + m.handle)}">${escapeHtml(m.email || '@' + m.handle)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Allocated Tasks</span>
          <span class="meta-val">${assignedTasks} Tasks</span>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
        ${isPeersView && !isMe ? `
          <button class="btn btn-outlined btn-sm btn-peer-feedback" data-id="${m.id}" style="flex: 1;">
            + Feedback
          </button>
          <button class="btn btn-filled btn-sm btn-peer-tasklet" data-id="${m.id}" style="flex: 1;">
            + Tasklet
          </button>
        ` : ''}
        ${!isPeersView && isHost && !m.is_host ? `
          <button class="btn btn-danger btn-sm btn-remove-member" data-id="${m.id}" title="Remove member from allowlist">
            Remove
          </button>
        ` : ''}
      </div>
    `;

    card.querySelector('.btn-peer-tasklet')?.addEventListener('click', () => {
      openSendTaskletModal(m.id);
    });

    card.querySelector('.btn-peer-feedback')?.addEventListener('click', () => {
      openSendFeedbackModal(m.id);
    });

    card.querySelector('.btn-remove-member')?.addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to remove @${m.handle} from the Frontier AI allowlist?`)) return;
      try {
        const res = await fetch(`/api/members/${m.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Member removed');
          await loadMembers();
          renderTeamRoster();
        } else {
          showToast(data.error || 'Failed to remove member', true);
        }
      } catch (err) {
        showToast('Network error removing member', true);
      }
    });

    return card;
  };

  if (containerSettings) {
    containerSettings.innerHTML = '';
    activeMembers.forEach(m => containerSettings.appendChild(renderCard(m, false)));
  }

  if (containerPeers) {
    containerPeers.innerHTML = '';
    activeMembers.forEach(m => containerPeers.appendChild(renderCard(m, true)));
  }
}

// -------------------------------------------------------------
// VIEW 8: AUDIT TRAIL
// -------------------------------------------------------------
async function loadAuditTrail() {
  try {
    const res = await fetch('/api/audit');
    const data = await res.json();
    state.auditEvents = data.events;
    renderAuditTrail();
  } catch (err) {
    console.error('Failed to load audit trail:', err);
  }
}

function renderAuditTrail() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = state.auditEvents.filter(ev => {
    if (!state.auditSearchTerm) return true;
    const term = state.auditSearchTerm.toLowerCase();
    return (
      ev.actor_handle.toLowerCase().includes(term) ||
      ev.action.toLowerCase().includes(term) ||
      ev.target.toLowerCase().includes(term) ||
      (ev.details && ev.details.toLowerCase().includes(term))
    );
  });

  filtered.forEach(ev => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${ev.id}</strong></td>
      <td style="color: var(--text-muted);">${new Date(ev.timestamp).toLocaleTimeString()}</td>
      <td><code>@${ev.actor_handle}</code></td>
      <td><strong>${ev.action}</strong></td>
      <td style="font-family: var(--font-mono); font-size: 11.5px;">${ev.target}</td>
      <td style="color: var(--text-secondary);">${ev.details || ''}</td>
      <td>
        <span class="kpi-tag ${ev.status === 'SUCCESS' || ev.status === 'GRANTED' ? 'tag-green' : (ev.status === 'DENIED' || ev.status === 'CONFLICT' ? 'tag-amber' : 'tag-blue')}">
          ${ev.status}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// ₹0 DISASTER RECOVERY
// -------------------------------------------------------------
async function triggerDisasterBackup() {
  const btn = document.getElementById('btn-trigger-backup-snap');
  const terminal = document.getElementById('backup-terminal-output');

  btn.disabled = true;
  btn.textContent = 'Generating Snapshot...';

  try {
    const res = await fetch('/api/disaster-recovery/export', { method: 'POST' });
    const data = await res.json();

    terminal.innerHTML = `
<code>
[SNAPSHOT EXPORT COMPLETE]
Timestamp:    ${data.timestamp}
File Target:  backups/${data.filename}
Tables Dump:  ${data.totalTables} Relational Tables
Status:       Clean sanitized JSON ready for Git Commit (₹0 Durability)
</code>
    `;
    showToast('Sanitized database snapshot exported to backups/');
  } catch (err) {
    showToast('Failed to export snapshot', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Trigger Backup Snapshot Now';
  }
}

// -------------------------------------------------------------
// MODALS & EVENT HANDLERS
// -------------------------------------------------------------
function populateSelects() {
  const taskAssignee = document.getElementById('task-assignee');
  const calAssignee = document.getElementById('cal-assignee');
  const customMembersBox = document.getElementById('cal-member-checkboxes');
  const activeMembers = (state.members || []).filter(m => m.is_allowed !== 0);

  if (taskAssignee) {
    taskAssignee.innerHTML = '';
    activeMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.role})`;
      taskAssignee.appendChild(opt);
    });
  }

  if (calAssignee) {
    calAssignee.innerHTML = '<option value="">All Team Members (Global Ping)</option>';
    activeMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.role})`;
      calAssignee.appendChild(opt);
    });
  }

  if (customMembersBox) {
    customMembersBox.innerHTML = '';
    activeMembers.forEach(m => {
      const label = document.createElement('label');
      label.style = 'display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: var(--text-primary);';
      label.innerHTML = `
        <input type="checkbox" value="${m.id}" class="cal-member-cb" style="accent-color: var(--google-blue);">
        <span>${m.name} <small style="color:var(--text-muted);">(${m.team_track})</small></span>
      `;
      customMembersBox.appendChild(label);
    });
  }
}

function populateDeliverableModalSelect(tasks) {
  const select = document.getElementById('submit-task-select');
  if (!select) return;
  select.innerHTML = '';

  if (tasks.length === 0) {
    select.innerHTML = '<option value="">No tasks currently assigned to you</option>';
    return;
  }

  tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.title} [Status: ${t.status}]`;
    select.appendChild(opt);
  });
}

function setupModals() {
  const taskModal = document.getElementById('modal-task');
  const deliverableModal = document.getElementById('modal-submit-deliverable');
  const calModal = document.getElementById('modal-calendar');
  const ticketModal = document.getElementById('modal-ticket');
  const occModal = document.getElementById('modal-occ-conflict');

  // Open Assign Task modal (LEAD ONLY CHECK)
  const openAllotTaskHandler = () => {
    if (!state.currentUser || !state.currentUser.is_host) {
      showToast('Lead Authorization Required: Only the Team Lead can assign tasks.', true);
      return;
    }
    taskModal.showModal();
  };

  document.getElementById('btn-open-task-modal')?.addEventListener('click', openAllotTaskHandler);
  document.getElementById('btn-host-allot-trigger')?.addEventListener('click', openAllotTaskHandler);
  document.getElementById('btn-close-task-modal')?.addEventListener('click', () => taskModal.close());
  document.getElementById('btn-cancel-task')?.addEventListener('click', () => taskModal.close());

  // Open Submit Deliverable modal
  document.getElementById('btn-open-submit-deliverable')?.addEventListener('click', () => {
    deliverableModal.showModal();
  });
  document.getElementById('btn-close-submit-modal')?.addEventListener('click', () => deliverableModal.close());
  document.getElementById('btn-cancel-submit')?.addEventListener('click', () => deliverableModal.close());

  // Open Calendar modal (LEAD ONLY CHECK)
  document.getElementById('btn-open-calendar-modal')?.addEventListener('click', () => {
    if (!state.currentUser || !state.currentUser.is_host) {
      showToast('Lead Authorization Required: Only the Team Lead can schedule events.', true);
      return;
    }
    calModal.showModal();
  });
  document.getElementById('btn-close-cal-modal')?.addEventListener('click', () => calModal.close());
  document.getElementById('btn-cancel-cal')?.addEventListener('click', () => calModal.close());

  // Ticket modal
  document.getElementById('btn-open-ticket-modal')?.addEventListener('click', () => ticketModal.showModal());
  document.getElementById('btn-close-ticket-modal')?.addEventListener('click', () => ticketModal.close());
  document.getElementById('btn-cancel-ticket')?.addEventListener('click', () => ticketModal.close());

  // OCC modal
  document.getElementById('btn-close-occ-modal')?.addEventListener('click', () => occModal.close());
  document.getElementById('btn-resolve-occ')?.addEventListener('click', async () => {
    occModal.close();
    await loadTasks();
  });

  // Task Revision & Activity Inspector modal
  const taskHistoryModal = document.getElementById('modal-task-history');
  document.getElementById('btn-close-task-history-modal')?.addEventListener('click', () => taskHistoryModal?.close());
  document.getElementById('btn-close-task-history-btn')?.addEventListener('click', () => taskHistoryModal?.close());

  // Onboard Member modal (Host only)
  const onboardModal = document.getElementById('modal-onboard-member');
  document.getElementById('btn-open-onboard-modal')?.addEventListener('click', () => {
    if (!state.currentUser || !state.currentUser.is_host) {
      showToast('Host Authorization Required: Only the Team Host can onboard members.', true);
      return;
    }
    onboardModal.showModal();
  });
  document.getElementById('btn-close-onboard-modal')?.addEventListener('click', () => onboardModal.close());
  document.getElementById('btn-cancel-onboard')?.addEventListener('click', () => onboardModal.close());

  document.getElementById('form-onboard-member')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('onboard-name').value.trim();
    const email = document.getElementById('onboard-email').value.trim();
    const role = document.getElementById('onboard-role').value.trim();
    const team_track = document.getElementById('onboard-track').value;
    const submitBtn = document.getElementById('btn-submit-onboard');

    if (!name || !email || !role) {
      showToast('Please enter name, email, and role.', true);
      return;
    }

    const handle = email.split('@')[0];
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Enrolling Member...';
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, handle, role, team_track })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to enroll member', true);
        return;
      }
      showToast(`Member ${name} successfully enrolled!`);
      onboardModal.close();
      document.getElementById('form-onboard-member').reset();
      await loadMembers();
      renderTeamRoster();
      populateTaskAssigneeDropdown();
    } catch (err) {
      showToast('Network error enrolling member', true);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });

  // Create Task Form (Lead only)
  document.getElementById('form-create-task')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const track = document.getElementById('task-track').value;
    const assignee_id = parseInt(document.getElementById('task-assignee').value, 10);
    const deadline = document.getElementById('task-deadline').value;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, track, assignee_id, deadline })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to assign task', true);
        return;
      }

      showToast('Task successfully assigned to team member.');
      taskModal.close();
      document.getElementById('form-create-task').reset();
      await loadTasks();
      await loadPersonalDashboard();
    } catch (err) {
      showToast('Error assigning task', true);
    }
  });

  // Submit Deliverable Form (Participant)
  document.getElementById('form-submit-deliverable')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = parseInt(document.getElementById('submit-task-select').value, 10);
    const deliverable_url = document.getElementById('submit-pr-url').value;
    const deliverable_notes = document.getElementById('submit-notes').value;

    if (!taskId) return showToast('Please select a task to submit', true);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED',
          deliverable_url,
          deliverable_notes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to submit deliverable', true);
        return;
      }

      showToast('Deliverable submitted and task marked completed.');
      deliverableModal.close();
      document.getElementById('form-submit-deliverable').reset();
      await loadTasks();
      await loadPersonalDashboard();
    } catch (err) {
      showToast('Error submitting deliverable', true);
    }
  });

  // Dynamic audience and bridge controls in calendar modal
  document.getElementById('cal-audience-select')?.addEventListener('change', (e) => {
    const box = document.getElementById('cal-custom-members-box');
    if (box) {
      box.style.display = e.target.value === 'CUSTOM' ? 'block' : 'none';
    }
  });

  document.getElementById('cal-slot-select')?.addEventListener('change', (e) => {
    const box = document.getElementById('cal-custom-link-box');
    if (box) {
      box.style.display = e.target.value === 'custom' ? 'block' : 'none';
    }
  });

  // Schedule Calendar Event Form (Lead only)
  document.getElementById('form-create-calendar')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('cal-title').value;
    const description = document.getElementById('cal-desc')?.value || '';
    const event_type = document.getElementById('cal-type').value;
    const event_date = document.getElementById('cal-date').value;
    const time_label = document.getElementById('cal-time').value;

    const audienceSelect = document.getElementById('cal-audience-select')?.value || 'ALL';
    let target_audience = audienceSelect;
    if (audienceSelect === 'CUSTOM') {
      const checkedIds = Array.from(document.querySelectorAll('.cal-member-cb:checked')).map(cb => parseInt(cb.value, 10));
      if (checkedIds.length === 0) {
        showToast('Please select at least one recipient for custom audience.', true);
        return;
      }
      target_audience = JSON.stringify(checkedIds);
    }

    const slotSelect = document.getElementById('cal-slot-select')?.value || 'auto';
    const customLink = document.getElementById('cal-link')?.value || '';
    const is_live = document.getElementById('cal-ping-now')?.checked ? 1 : 0;

    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          event_type,
          event_date,
          time_label,
          target_audience,
          meeting_slot_id: slotSelect === 'custom' ? null : (slotSelect === 'auto' ? 'auto' : parseInt(slotSelect, 10)),
          meeting_link: slotSelect === 'custom' ? customLink : null,
          is_live
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to schedule event', true);
        return;
      }

      showToast(is_live ? 'Live session ping broadcasted and scheduled!' : 'Event successfully scheduled on calendar.');
      calModal.close();
      document.getElementById('form-create-calendar').reset();
      const customMembersBox = document.getElementById('cal-custom-members-box');
      if (customMembersBox) customMembersBox.style.display = 'none';
      const customLinkBox = document.getElementById('cal-custom-link-box');
      if (customLinkBox) customLinkBox.style.display = 'none';
      await loadCalendarEvents();
      await loadPersonalDashboard();
    } catch (err) {
      showToast('Error scheduling calendar event', true);
    }
  });

  // Create Ticket Form
  document.getElementById('form-create-ticket')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ticket-title').value;
    const scope = document.getElementById('ticket-scope').value;
    const duration_minutes = parseInt(document.getElementById('ticket-duration').value, 10);
    const reason = document.getElementById('ticket-reason').value;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, scope, duration_minutes, reason })
      });

      if (!res.ok) throw new Error('Ticket creation rejected');

      showToast('Access request submitted for independent peer review');
      ticketModal.close();
      document.getElementById('form-create-ticket').reset();
      await loadTickets();
    } catch (err) {
      showToast('Failed to create ticket', true);
    }
  });

  // Send Tasklet Modal
  // Multipurpose Peers: Tasklets & Feedback Modal Bindings
  const taskletModal = document.getElementById('modal-send-tasklet');
  const feedbackModal = document.getElementById('modal-send-feedback');

  // Close and Cancel buttons for Tasklet & Feedback Modals
  document.getElementById('btn-close-tasklet-modal')?.addEventListener('click', () => taskletModal?.close());
  document.getElementById('btn-cancel-send-tasklet')?.addEventListener('click', () => taskletModal?.close());
  document.getElementById('btn-close-send-feedback-modal')?.addEventListener('click', () => feedbackModal?.close());
  document.getElementById('btn-cancel-send-feedback')?.addEventListener('click', () => feedbackModal?.close());

  document.getElementById('btn-open-onboard-peers')?.addEventListener('click', () => {
    document.getElementById('modal-onboard-member')?.showModal();
  });

  // Tasklet Recipient Select Toggle & Change
  document.getElementById('btn-toggle-tasklet-receiver-select')?.addEventListener('click', () => {
    document.getElementById('wrap-tasklet-receiver-select')?.classList.toggle('hidden');
  });
  document.getElementById('tasklet-receiver')?.addEventListener('change', (e) => {
    const id = parseInt(e.target.value, 10);
    const target = (state.members || []).find(m => m.id === id);
    if (target) updateTaskletRecipientDisplay(target);
  });

  // Tasklet Preset Chips (Professional, No Emojis)
  document.querySelectorAll('.tasklet-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prefix = chip.dataset.prefix;
      const titleInput = document.getElementById('tasklet-title');
      if (titleInput && prefix) {
        titleInput.value = prefix;
        titleInput.focus();
      }
    });
  });

  // Tasklet Dialog Shortcut (Ctrl+Enter to send)
  taskletModal?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('form-send-tasklet')?.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  // Feedback Recipient Select Toggle & Change
  document.getElementById('btn-toggle-feedback-receiver-select')?.addEventListener('click', () => {
    document.getElementById('wrap-feedback-receiver-select')?.classList.toggle('hidden');
  });
  document.getElementById('feedback-receiver')?.addEventListener('change', (e) => {
    const id = parseInt(e.target.value, 10);
    const target = (state.members || []).find(m => m.id === id);
    if (target) updateFeedbackRecipientDisplay(target);
  });

  // Feedback Category Pills (Professional, No Emojis)
  document.querySelectorAll('.feedback-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.feedback-cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.dataset.cat;
      const catInput = document.getElementById('feedback-category');
      if (catInput && cat) catInput.value = cat;
    });
  });

  // Feedback Dialog Shortcut (Ctrl+Enter to send)
  feedbackModal?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('form-send-feedback')?.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  // Main Mode Toggle (Tasklets vs Peer Feedback)
  document.querySelectorAll('#peers-main-mode-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#peers-main-mode-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      state.peersMainMode = mode;

      const secTasklets = document.getElementById('section-peers-tasklets');
      const secFeedback = document.getElementById('section-peers-feedback');
      const hintEl = document.getElementById('peers-panel-hint');

      if (mode === 'tasklets') {
        secTasklets?.classList.remove('hidden');
        secFeedback?.classList.add('hidden');
        if (hintEl) hintEl.textContent = 'Informal peer-to-peer tasklets and review requests';
      } else {
        secTasklets?.classList.add('hidden');
        secFeedback?.classList.remove('hidden');
        if (hintEl) hintEl.textContent = 'Constructive peer praise, code review notes, and kudos';
      }
      renderTasklets();
    });
  });

  // Peer Feedback Subtabs ("Received" vs "Shared")
  document.querySelectorAll('#feedback-tab-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#feedback-tab-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.feedbackTab = btn.dataset.feedbackTab;
      renderTasklets();
    });
  });

  // Send Tasklet Form Submit
  document.getElementById('form-send-tasklet')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const receiver_id = parseInt(document.getElementById('tasklet-receiver').value, 10);
    const title = document.getElementById('tasklet-title').value.trim();
    const description = document.getElementById('tasklet-desc').value.trim();

    if (!receiver_id || !title) {
      showToast('Please select a recipient teammate and enter a title', true);
      return;
    }

    try {
      const res = await fetch('/api/tasklets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id, title, description, type: 'TASKLET' })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to send tasklet', true);
        return;
      }

      showToast('Tasklet sent to teammate!');
      taskletModal?.close();
      document.getElementById('form-send-tasklet').reset();
      await loadTasklets();
    } catch (err) {
      showToast('Error sending tasklet', true);
    }
  });

  // Share Peer Feedback Form Submit
  document.getElementById('form-send-feedback')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const receiver_id = parseInt(document.getElementById('feedback-receiver').value, 10);
    const category = document.getElementById('feedback-category').value;
    const title = document.getElementById('feedback-title').value.trim();
    const description = document.getElementById('feedback-desc').value.trim();
    const is_anonymous = document.getElementById('feedback-is-anonymous')?.checked || false;

    if (!receiver_id || !title || !description) {
      showToast('Please select a teammate, category, and feedback notes', true);
      return;
    }

    try {
      const res = await fetch('/api/tasklets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiver_id,
          title,
          description,
          type: 'FEEDBACK',
          category,
          is_anonymous
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to share feedback', true);
        return;
      }

      showToast(is_anonymous ? 'Feedback sent anonymously to teammate!' : 'Feedback shared with teammate!');
      feedbackModal?.close();
      document.getElementById('form-send-feedback').reset();
      await loadTasklets();
    } catch (err) {
      showToast('Error sharing feedback', true);
    }
  });
}

// -------------------------------------------------------------
// MODULE 4: MULTIPURPOSE PEERS: MICRO-TASKS & PEER FEEDBACK
// -------------------------------------------------------------
async function loadTasklets() {
  try {
    const res = await fetch('/api/tasklets');
    const data = await res.json();
    state.tasklets = data.tasklets || [];
    renderTasklets();
    updateTaskletBadges();
  } catch (err) {
    console.error('Failed to load tasklets and feedback:', err);
  }
}

function updateTaskletBadges() {
  if (!state.currentUser) return;
  const currentUserId = state.currentUser.id;

  // Filter Micro-Tasks
  const allTasks = (state.tasklets || []).filter(t => !t.type || t.type === 'TASKLET');
  const tasksReceived = allTasks.filter(t => t.receiver_id === currentUserId);
  const tasksSent = allTasks.filter(t => t.sender_id === currentUserId);
  const pendingTasks = tasksReceived.filter(t => t.status === 'PENDING').length;

  // Filter Peer Feedback
  const allFeedback = (state.tasklets || []).filter(t => t.type === 'FEEDBACK');
  const feedbackReceived = allFeedback.filter(t => t.receiver_id === currentUserId);
  const feedbackSent = allFeedback.filter(t => t.sender_id === currentUserId);

  const countTasksRecEl = document.getElementById('count-tasklets-received');
  if (countTasksRecEl) countTasksRecEl.textContent = tasksReceived.length;

  const countTasksSentEl = document.getElementById('count-tasklets-sent');
  if (countTasksSentEl) countTasksSentEl.textContent = tasksSent.length;

  const countFbRecEl = document.getElementById('count-feedback-received');
  if (countFbRecEl) countFbRecEl.textContent = feedbackReceived.length;

  const countFbSentEl = document.getElementById('count-feedback-sent');
  if (countFbSentEl) countFbSentEl.textContent = feedbackSent.length;

  updateSegmentedGlider(document.getElementById('tasklets-tab-group'));

  const badgeEl = document.getElementById('badge-tasklets-count');
  if (badgeEl) {
    badgeEl.textContent = pendingTasks;
    badgeEl.style.display = (!state.currentUser.is_host && pendingTasks > 0) ? 'inline-block' : 'none';
  }
}

function renderTasklets() {
  if (!state.currentUser) return;
  const currentUserId = state.currentUser.id;

  // 1. Render Micro-Tasks (Tasklets)
  const containerRec = document.getElementById('container-tasklets-received');
  const containerSent = document.getElementById('container-tasklets-sent');

  if (containerRec && containerSent) {
    const isReceived = state.taskletTab === 'received';
    containerRec.classList.toggle('hidden', !isReceived);
    containerSent.classList.toggle('hidden', isReceived);

    const microTasks = (state.tasklets || []).filter(t => !t.type || t.type === 'TASKLET');
    const taskList = isReceived
      ? microTasks.filter(t => t.receiver_id === currentUserId)
      : microTasks.filter(t => t.sender_id === currentUserId);

    const targetContainer = isReceived ? containerRec : containerSent;
    targetContainer.innerHTML = '';
    updateSegmentedGlider(document.getElementById('tasklets-tab-group'));

    if (taskList.length === 0) {
      targetContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px 12px; text-align: center;">
          <p style="color: var(--text-muted); font-size: 13px;">No ${isReceived ? 'received' : 'sent'} tasklets yet. Click "+ Tasklet" on any teammate's card to request a quick peer review or check.</p>
        </div>
      `;
    } else {
      taskList.forEach(t => {
        const card = document.createElement('div');
        card.className = 'tasklet-card';
        const statusClass = t.status === 'DONE' ? 'tasklet-done' : (t.status === 'ACCEPTED' ? 'tasklet-accepted' : 'tasklet-pending');
        const counterpartLabel = isReceived ? `From: ${t.sender_name || 'Teammate'}` : `To: ${t.receiver_name || 'Teammate'}`;
        const dateStr = new Date(t.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let actionsHtml = '';
        if (isReceived) {
          if (t.status === 'PENDING') {
            actionsHtml = `
              <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="btn btn-outlined btn-sm" onclick="handleTaskletStatus(${t.id}, 'ACCEPTED')">Accept</button>
                <button class="btn btn-filled btn-sm" onclick="handleTaskletStatus(${t.id}, 'DONE')">Mark Done</button>
              </div>
            `;
          } else if (t.status === 'ACCEPTED') {
            actionsHtml = `
              <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="btn btn-filled btn-sm" onclick="handleTaskletStatus(${t.id}, 'DONE')">Mark Done</button>
              </div>
            `;
          }
        }

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px; color: var(--text-primary); margin-bottom: 2px;">${t.title}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">${counterpartLabel} • ${dateStr}</div>
            </div>
            <span class="tasklet-badge ${statusClass}">${t.status}</span>
          </div>
          ${t.description ? `<p style="font-size: 13px; color: var(--text-secondary); margin: 8px 0 0 0; line-height: 1.4;">${t.description}</p>` : ''}
          ${actionsHtml}
        `;
        targetContainer.appendChild(card);
      });
    }
  }

  // 2. Render Peer Feedback
  const containerFbRec = document.getElementById('container-feedback-received');
  const containerFbSent = document.getElementById('container-feedback-sent');

  if (containerFbRec && containerFbSent) {
    const isFbReceived = (state.feedbackTab || 'received') === 'received';
    containerFbRec.classList.toggle('hidden', !isFbReceived);
    containerFbSent.classList.toggle('hidden', isFbReceived);

    const allFeedback = (state.tasklets || []).filter(t => t.type === 'FEEDBACK');
    const fbList = isFbReceived
      ? allFeedback.filter(t => t.receiver_id === currentUserId)
      : allFeedback.filter(t => t.sender_id === currentUserId);

    const targetFbContainer = isFbReceived ? containerFbRec : containerFbSent;
    targetFbContainer.innerHTML = '';

    const categoryIcons = {
      KUDOS: 'Kudos',
      COLLABORATION: 'Collaboration',
      CODE_QUALITY: 'Code Quality',
      SUGGESTION: 'Suggestion',
      GENERAL: 'Peer Note'
    };

    if (fbList.length === 0) {
      targetFbContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px 12px; text-align: center;">
          <p style="color: var(--text-muted); font-size: 13px;">No ${isFbReceived ? 'received' : 'shared'} feedback yet. Click "+ Feedback" on any teammate's card to praise or support them.</p>
        </div>
      `;
    } else {
      fbList.forEach(fb => {
        const card = document.createElement('div');
        card.className = 'tasklet-card';
        card.style.borderLeft = '3px solid var(--google-blue)';
        const catLabel = categoryIcons[fb.category] || 'Feedback';
        const senderLabel = isFbReceived
          ? (fb.is_anonymous ? 'Anonymous Teammate' : (fb.sender_name || 'Teammate'))
          : `To: ${fb.receiver_name || 'Teammate'}${fb.is_anonymous ? ' (Sent Anonymously)' : ''}`;
        const dateStr = new Date(fb.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="status-pill pill-purple" style="font-size: 11px; padding: 2px 8px;">${catLabel}</span>
                <span style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${fb.title}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">${senderLabel} • ${dateStr}</div>
            </div>
          </div>
          ${fb.description ? `<p style="font-size: 13px; color: var(--text-primary); margin: 8px 0 0 0; line-height: 1.5; background: var(--bg-surface-elevated); padding: 10px 12px; border-radius: 6px;">${fb.description}</p>` : ''}
        `;
        targetFbContainer.appendChild(card);
      });
    }
  }
}

window.handleTaskletStatus = async function(id, status) {
  try {
    const res = await fetch(`/api/tasklets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update tasklet', true);
      return;
    }
    showToast(`Tasklet marked ${status.toLowerCase()}`);
    await loadTasklets();
  } catch (err) {
    showToast('Network error updating tasklet', true);
  }
};

function updateTaskletRecipientDisplay(member) {
  if (!member) return;
  const avatar = document.getElementById('tasklet-recipient-avatar');
  const name = document.getElementById('tasklet-recipient-name');
  const role = document.getElementById('tasklet-recipient-role');
  if (avatar) avatar.textContent = getInitials(member.name);
  if (name) name.textContent = member.name;
  if (role) role.textContent = `${member.role} · ${(member.team_track || 'General').toUpperCase()}`;
}

function openSendTaskletModal(preselectedReceiverId = null) {
  const modal = document.getElementById('modal-send-tasklet');
  if (!modal) return;
  const select = document.getElementById('tasklet-receiver');
  const otherMembers = (state.members || []).filter(m => m.id !== state.currentUser?.id);

  if (select) {
    select.innerHTML = '';
    otherMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (@${m.handle} · ${m.role})`;
      if (preselectedReceiverId && m.id === preselectedReceiverId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  const selectedId = preselectedReceiverId || (select && parseInt(select.value, 10)) || otherMembers[0]?.id;
  const target = (state.members || []).find(m => m.id === selectedId) || otherMembers[0];
  if (target) {
    updateTaskletRecipientDisplay(target);
    if (select) select.value = target.id;
  }

  const titleEl = document.getElementById('tasklet-title');
  const descEl = document.getElementById('tasklet-desc');
  if (titleEl) titleEl.value = '';
  if (descEl) descEl.value = '';
  document.getElementById('wrap-tasklet-receiver-select')?.classList.add('hidden');
  modal.showModal();
}

function updateFeedbackRecipientDisplay(member) {
  if (!member) return;
  const avatar = document.getElementById('feedback-recipient-avatar');
  const name = document.getElementById('feedback-recipient-name');
  const role = document.getElementById('feedback-recipient-role');
  if (avatar) avatar.textContent = getInitials(member.name);
  if (name) name.textContent = member.name;
  if (role) role.textContent = `${member.role} · ${(member.team_track || 'General').toUpperCase()}`;
}

function openSendFeedbackModal(preselectedReceiverId = null) {
  const modal = document.getElementById('modal-send-feedback');
  if (!modal) return;
  const select = document.getElementById('feedback-receiver');
  const otherMembers = (state.members || []).filter(m => m.id !== state.currentUser?.id);

  if (select) {
    select.innerHTML = '';
    otherMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (@${m.handle} · ${m.role})`;
      if (preselectedReceiverId && m.id === preselectedReceiverId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  const selectedId = preselectedReceiverId || (select && parseInt(select.value, 10)) || otherMembers[0]?.id;
  const target = (state.members || []).find(m => m.id === selectedId) || otherMembers[0];
  if (target) {
    updateFeedbackRecipientDisplay(target);
    if (select) select.value = target.id;
  }

  const titleEl = document.getElementById('feedback-title');
  const descEl = document.getElementById('feedback-desc');
  const anonEl = document.getElementById('feedback-is-anonymous');
  if (titleEl) titleEl.value = '';
  if (descEl) descEl.value = '';
  if (anonEl) anonEl.checked = false;

  // Reset category pills
  document.querySelectorAll('.feedback-cat-pill').forEach((p, idx) => {
    p.classList.toggle('active', idx === 0);
  });
  const catInput = document.getElementById('feedback-category');
  if (catInput) catInput.value = 'KUDOS';

  document.getElementById('wrap-feedback-receiver-select')?.classList.add('hidden');
  modal.showModal();
}

// -------------------------------------------------------------
// GOOGLE MEET GATEWAY (PATH A: COMPANION TAB / WINDOW)
// -------------------------------------------------------------
export function joinMeetingGateway(meetingOrId) {
  let url = '/api/meetings/join/1';
  let title = 'Team Meeting';
  if (typeof meetingOrId === 'object' && meetingOrId !== null) {
    url = meetingOrId.join_url || `/api/meetings/join/${meetingOrId.id || 1}`;
    title = meetingOrId.title || title;
  } else if (typeof meetingOrId === 'number' || typeof meetingOrId === 'string') {
    const ev = state.calendarEvents?.find(e => e.id === Number(meetingOrId));
    url = ev?.join_url || `/api/meetings/join/${meetingOrId}`;
    title = ev?.title || title;
  }
  showToast(`Connecting to ${title} via Google Meet gateway...`);
  window.open(url, '_blank');
}

window.openDockedCallById = joinMeetingGateway;
window.joinMeetingGateway = joinMeetingGateway;
export function openDockedCall(meeting) {
  joinMeetingGateway(meeting);
}
export function closeDockedCall() {
  // Path A no-op
}

function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  input?.addEventListener('click', (e) => {
    e.preventDefault();
    openCommandPalette();
  });
  input?.addEventListener('focus', (e) => {
    e.preventDefault();
    openCommandPalette();
  });

  const auditFilter = document.getElementById('audit-search-input');
  auditFilter?.addEventListener('input', (e) => {
    state.auditSearchTerm = e.target.value;
    renderAuditTrail();
  });
}

// -------------------------------------------------------------
// COMMAND PALETTE / QUICK SWITCHER (CTRL+K / CMD+K)
// -------------------------------------------------------------
let openCommandPalette = () => {};

function setupCommandPalette() {
  const overlay = document.getElementById('command-palette-overlay');
  const card = document.getElementById('modal-command-palette');
  const input = document.getElementById('palette-search-input');
  const resultsContainer = document.getElementById('palette-results-list');
  const escBtn = document.getElementById('btn-close-palette-esc');

  if (!overlay || !input || !resultsContainer) return;

  let isPaletteOpen = false;
  let selectedIndex = 0;
  let currentItems = [];

  openCommandPalette = (initialQuery = '') => {
    input.value = initialQuery;
    selectedIndex = 0;
    overlay.classList.remove('hidden');
    isPaletteOpen = true;
    renderResults(initialQuery);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  };

  const closePalette = () => {
    isPaletteOpen = false;
    overlay.classList.add('hidden');
    input.blur();
  };

  if (escBtn) {
    escBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePalette();
    };
  }

  // Keyboard shortcuts:
  // 1. Ctrl+K or Cmd+K toggles palette
  // 2. Escape closes palette unconditionally at window level
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isPaletteOpen) {
        closePalette();
      } else {
        openCommandPalette();
      }
    } else if (e.key === 'Escape') {
      if (isPaletteOpen) {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
      }
    }
  }, true);

  // Clicking overlay backdrop closes palette
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePalette();
    }
  });

  const baseCommands = [
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
      title: '/tasks',
      desc: 'Jump to Kanban Sprint Board',
      action: () => { switchView('view-tasks'); document.getElementById('tab-tasks-all')?.click(); }
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      title: '/mine',
      desc: 'Jump to Assigned to Me (Personal Checklist)',
      action: () => { switchView('view-tasks'); document.getElementById('tab-tasks-mine')?.click(); }
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
      title: '/call',
      desc: 'Open Google Meet Call Room & Bridges',
      action: () => switchView('view-callroom')
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      title: '/vote',
      desc: 'Jump to 1–5 Star Anonymous Peer Review',
      action: () => switchView('view-voting')
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
      title: '/peers',
      desc: 'Open Multipurpose Peers & Feedback Hub',
      action: () => switchView('view-peers')
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
      title: '/signoff',
      desc: 'Sprint Deliverable Sign-Off & Approvals',
      action: () => { switchView('view-settings'); document.querySelector('#settings-subtabs [data-subtab="permissions"]')?.click(); }
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
      title: '/export',
      desc: 'Project Export & Report Generator (JSON/CSV)',
      action: () => { switchView('view-settings'); document.querySelector('#settings-subtabs [data-subtab="snapshot"]')?.click(); }
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>',
      title: '/oracle',
      desc: 'Consult Oracle AI Assistant',
      action: () => switchView('view-oracle')
    },
    {
      type: 'command',
      tagClass: 'tag-cmd',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
      title: '/signout',
      desc: 'Sign out of current account',
      action: () => document.getElementById('btn-header-signout')?.click()
    }
  ];

  function renderResults(query) {
    const q = (query || '').toLowerCase().trim();
    resultsContainer.innerHTML = '';
    currentItems = [];

    const matchedCommands = baseCommands.filter(c => !q || c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));

    let matchedTasks = [];
    if (state.tasks && state.tasks.length > 0) {
      matchedTasks = state.tasks.filter(t =>
        !q || t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.assignee_name && t.assignee_name.toLowerCase().includes(q))
      ).slice(0, 4).map(t => ({
        type: 'task',
        tagClass: 'tag-task',
        icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
        title: t.title,
        desc: `Track: ${(t.track || 'Core').toUpperCase()} · Status: ${t.status} · Due: ${t.deadline || 'Flexible'}`,
        action: () => {
          switchView('view-tasks');
          document.getElementById('tab-tasks-all')?.click();
          openTaskRevisionInspector(t);
        }
      }));
    }

    let matchedMembers = [];
    if (state.members && state.members.length > 0) {
      matchedMembers = state.members.filter(m =>
        !q || m.name.toLowerCase().includes(q) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        (m.handle && m.handle.toLowerCase().includes(q))
      ).slice(0, 4).map(m => ({
        type: 'member',
        tagClass: 'tag-peer',
        icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
        title: `${m.name} (@${m.handle})`,
        desc: `${m.role} · ${(m.team_track || 'General').toUpperCase()}`,
        action: () => {
          openSendFeedbackModal(m.id);
        }
      }));
    }

    // Build categories
    const categories = [];
    if (matchedCommands.length > 0) {
      categories.push({ name: 'Actions & Shortcuts', items: matchedCommands });
    }
    if (matchedTasks.length > 0) {
      categories.push({ name: 'Sprint Tasks & Deliverables', items: matchedTasks });
    }
    if (matchedMembers.length > 0) {
      categories.push({ name: 'Teammates & Directory', items: matchedMembers });
    }

    if (categories.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13.5px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 8px; opacity: 0.6;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <div>No matching commands, tasks, or teammates found for "${escapeHtml(q)}".</div>
        </div>
      `;
      return;
    }

    let itemCounter = 0;
    categories.forEach(cat => {
      const header = document.createElement('div');
      header.className = 'palette-section-title';
      header.textContent = cat.name;
      resultsContainer.appendChild(header);

      cat.items.forEach(item => {
        const itemIdx = itemCounter++;
        currentItems.push(item);

        const el = document.createElement('div');
        el.className = `palette-item ${itemIdx === selectedIndex ? 'selected' : ''}`;
        el.dataset.index = itemIdx;
        el.innerHTML = `
          <div class="palette-item-left">
            <div class="palette-item-icon-box">${item.icon}</div>
            <div style="min-width: 0;">
              <div class="palette-item-title">${escapeHtml(item.title)}</div>
              <div class="palette-item-desc">${escapeHtml(item.desc)}</div>
            </div>
          </div>
          <div class="palette-item-right">
            <span class="palette-tag ${item.tagClass}">${item.type.toUpperCase()}</span>
            <span class="palette-enter-hint">↵</span>
          </div>
        `;

        el.addEventListener('click', () => {
          closePalette();
          item.action();
        });

        el.addEventListener('mouseenter', () => {
          selectedIndex = itemIdx;
          updateHighlight();
        });

        resultsContainer.appendChild(el);
      });
    });

    if (selectedIndex >= currentItems.length) selectedIndex = 0;
    updateHighlight();
  }

  function updateHighlight() {
    const items = resultsContainer.querySelectorAll('.palette-item');
    items.forEach((item, idx) => {
      const isSel = idx === selectedIndex;
      item.classList.toggle('selected', isSel);
      if (isSel) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  input.addEventListener('input', (e) => {
    selectedIndex = 0;
    renderResults(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentItems.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentItems.length;
        updateHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentItems.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
        updateHighlight();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentItems[selectedIndex]) {
        closePalette();
        currentItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      closePalette();
    }
  });
}

// -------------------------------------------------------------
// TASK REVISION & ACTIVITY INSPECTOR MODAL
// -------------------------------------------------------------
function openTaskRevisionInspector(task) {
  const modal = document.getElementById('modal-task-history');
  if (!modal) return;

  const titleEl = document.getElementById('task-history-title');
  const subtitleEl = document.getElementById('task-history-subtitle');
  const bodyEl = document.getElementById('task-history-body');

  if (titleEl) titleEl.textContent = `Revision Inspector: ${task.title}`;
  if (subtitleEl) subtitleEl.textContent = `Task #${task.id} · Track: ${task.track.toUpperCase()} · Status: ${task.status} · OCC Lock: v${task.version}`;

  const taskIdStr = String(task.id);
  const relevantEvents = (state.auditEvents || []).filter(e => {
    return (e.target && (e.target === `task_${taskIdStr}` || e.target.includes(`task_${taskIdStr}`) || e.target.includes(taskIdStr))) ||
           (e.details && (e.details.includes(task.title) || e.details.includes(`Task #${task.id}`)));
  });

  let deliverableSection = '';
  if (task.deliverable_url || task.deliverable_notes) {
    deliverableSection = `
      <div style="background: rgba(66, 133, 244, 0.08); border: 1px solid rgba(66, 133, 244, 0.25); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
        <div style="font-size: 11.5px; font-weight: 600; text-transform: uppercase; color: var(--google-blue); margin-bottom: 6px; letter-spacing: 0.5px;">Submitted Deliverable & Context</div>
        ${task.deliverable_url ? `<div style="font-size: 13px; margin-bottom: 4px;"><strong>Link:</strong> <a href="${task.deliverable_url}" target="_blank" style="color: var(--google-blue); text-decoration: underline;">${task.deliverable_url} ↗</a></div>` : ''}
        ${task.deliverable_notes ? `<div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.4;"><strong>Notes:</strong> ${escapeHtml(task.deliverable_notes)}</div>` : ''}
      </div>
    `;
  }

  let timelineHtml = '';
  if (relevantEvents.length > 0) {
    timelineHtml = relevantEvents.map(ev => {
      const timeStr = new Date(ev.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div style="display: flex; gap: 12px; margin-bottom: 14px; position: relative;">
          <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--bg-surface-elevated); border: 2px solid var(--google-blue); display: flex; align-items: center; justify-content: center; color: var(--google-blue); flex-shrink: 0; z-index: 1;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div style="flex: 1; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${escapeHtml(ev.action)}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${timeStr}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 2px;">
              By: <strong>@${escapeHtml(ev.actor_handle)}</strong> (${escapeHtml(ev.actor_name || 'Team Member')})
            </div>
            ${ev.details ? `<div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); background: var(--bg-canvas); padding: 4px 8px; border-radius: 4px; margin-top: 4px;">${escapeHtml(ev.details)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    timelineHtml = `
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(52, 168, 83, 0.15); color: var(--google-green); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div style="flex: 1; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600;">
            <span>Current Active Revision (v${task.version})</span>
            <span class="status-pill ${task.status === 'COMPLETED' ? 'pill-green' : 'pill-purple'}">${task.status}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            Assigned to: <strong>${task.assignee_name || 'Unassigned'}</strong> · Track: <strong>${task.track.toUpperCase()}</strong>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(66, 133, 244, 0.15); color: var(--google-blue); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0;">•</div>
        <div style="flex: 1; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px;">
          <div style="font-size: 13px; font-weight: 600;">Initial Task Creation (v1)</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            Target deadline set to <strong>${task.deadline || 'Sprint 1 milestone'}</strong>. Optimistic concurrency check initialized.
          </div>
        </div>
      </div>
    `;
  }

  bodyEl.innerHTML = `
    <div style="margin-bottom: 14px;">
      <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(task.description || 'No detailed description recorded.')}</div>
    </div>
    ${deliverableSection}
    <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; letter-spacing: 0.5px;">Activity &amp; Revision Log</div>
    <div style="position: relative;">
      ${timelineHtml}
    </div>
  `;

  modal.showModal();
}

// -------------------------------------------------------------
// PROJECT EXPORT & REPORT GENERATOR (JSON / CSV)
// -------------------------------------------------------------
function exportSprintReportJSON() {
  const completed = (state.tasks || []).filter(t => t.status === 'COMPLETED').length;
  const inProgress = (state.tasks || []).filter(t => t.status === 'IN_PROGRESS').length;
  const todo = (state.tasks || []).filter(t => t.status === 'TODO').length;
  const total = (state.tasks || []).length;
  const completionRate = total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%';

  const report = {
    platform: "Frontier AI Engineering Workspace",
    export_generated_at: new Date().toISOString(),
    sprint_info: {
      sprint_number: 1,
      sprint_title: "Sprint 1: Core Platform Deliverables & Modular Routing",
      completion_rate: completionRate,
      tasks_summary: { total, completed, inProgress, todo }
    },
    team_roster: (state.members || []).map(m => ({
      id: m.id,
      name: m.name,
      role: m.role,
      track: m.team_track,
      handle: m.handle,
      email: m.email,
      is_lead: !!m.is_host
    })),
    sprint_tasks_and_deliverables: (state.tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      track: t.track,
      status: t.status,
      assignee_name: t.assignee_name,
      target_deadline: t.deadline,
      version: t.version,
      deliverable_url: t.deliverable_url || null,
      deliverable_notes: t.deliverable_notes || null
    })),
    peer_review_evaluation: {
      session_title: state.votingSession?.session?.title || "Sprint Contribution & Team Collaboration",
      metric: "Sprint Contribution & Team Collaboration (1–5 Stars)",
      total_evaluations_cast: state.votingSession?.totalBallots || 0,
      candidates_standings: state.votingSession?.candidates || []
    },
    sprint_deliverable_sign_offs: (state.tickets || []).map(ticket => ({
      id: ticket.id,
      title: ticket.title,
      scope: ticket.scope,
      status: ticket.status,
      requester_name: ticket.requester_name,
      approver_name: ticket.approver_name || "Pending Sign-Off",
      justification: ticket.reason,
      created_at: ticket.created_at
    })),
    scheduled_meeting_logs: (state.calendarEvents || []).map(ev => ({
      id: ev.id,
      title: ev.title,
      date: ev.event_date,
      time: ev.time_label,
      type: ev.event_type,
      bridge: ev.slot_name || "Google Meet Bridge"
    })),
    recent_activity_audit: (state.auditEvents || []).slice(0, 50)
  };

  const jsonStr = JSON.stringify(report, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `frontier_sprint_report_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const terminal = document.getElementById('backup-terminal-output');
  if (terminal) {
    terminal.innerHTML = `
<code>
[SPRINT REPORT JSON EXPORT COMPLETE]
Timestamp:       ${new Date().toLocaleTimeString()}
Deliverables:    ${completed} completed / ${total} total (${completionRate})
Roster Members:  ${(state.members || []).length}
Peer Standings:  ${state.votingSession?.candidates?.length || 0} candidates scored
Sign-Offs:       ${(state.tickets || []).length} recorded
File:            frontier_sprint_report_${new Date().toISOString().slice(0, 10)}.json
</code>
    `;
  }

  showToast('Sprint Report JSON downloaded successfully!');
}

function exportDeliverablesCSV() {
  if (!state.tasks || state.tasks.length === 0) {
    showToast('No tasks available to export', true);
    return;
  }

  const headers = ["Task ID", "Title", "Track", "Assignee", "Status", "Deadline", "Deliverable URL", "Deliverable Notes", "Version"];
  const rows = state.tasks.map(t => [
    t.id,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${(t.track || '').toUpperCase()}"`,
    `"${(t.assignee_name || 'Unassigned').replace(/"/g, '""')}"`,
    `"${t.status}"`,
    `"${t.deadline || 'Flexible'}"`,
    `"${(t.deliverable_url || '').replace(/"/g, '""')}"`,
    `"${(t.deliverable_notes || '').replace(/"/g, '""')}"`,
    t.version || 1
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `frontier_sprint_deliverables_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  const terminal = document.getElementById('backup-terminal-output');
  if (terminal) {
    terminal.innerHTML = `
<code>
[DELIVERABLES CSV EXPORT COMPLETE]
Timestamp:       ${new Date().toLocaleTimeString()}
Rows Exported:   ${state.tasks.length} task deliverables
Columns:         ${headers.join(' | ')}
File:            frontier_sprint_deliverables_${new Date().toISOString().slice(0, 10)}.csv
</code>
    `;
  }

  showToast('Deliverables CSV downloaded successfully!');
}

function setupEventListeners() {
  document.querySelectorAll('#task-filter-pills button').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#task-filter-pills button').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      updateSegmentedGlider(document.getElementById('task-filter-pills'));
      state.taskFilter = pill.dataset.filter;
      renderKanbanBoard();
    });
  });

  initSegmentedControls();

  document.getElementById('btn-claim-blind-token')?.addEventListener('click', claimBlindToken);
  document.getElementById('form-submit-ballot')?.addEventListener('submit', castAnonymousBallot);
  document.getElementById('btn-evaluate-another-peer')?.addEventListener('click', async () => {
    const evalForm = document.getElementById('form-submit-ballot');
    const completedBox = document.getElementById('voting-completed-box');
    if (evalForm) evalForm.classList.remove('hidden');
    if (completedBox) completedBox.classList.add('hidden');
    await claimBlindToken();
  });
  document.getElementById('btn-host-close-voting')?.addEventListener('click', hostCloseVotingSession);
  document.getElementById('btn-host-reopen-voting')?.addEventListener('click', hostReopenVotingSession);
  document.getElementById('btn-closed-reopen-round')?.addEventListener('click', hostReopenVotingSession);
  initLaunchVotingModal();
  document.getElementById('btn-refresh-audit')?.addEventListener('click', loadAuditTrail);
  document.getElementById('btn-trigger-backup-snap')?.addEventListener('click', triggerDisasterBackup);

  // Sprint Report & Deliverable Exports
  document.getElementById('btn-export-sprint-report-json')?.addEventListener('click', exportSprintReportJSON);
  document.getElementById('btn-export-deliverables-csv')?.addEventListener('click', exportDeliverablesCSV);

  // Client data exports
  document.getElementById('btn-export-tasks-json')?.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.tasks, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `frontier_tasks_${new Date().toISOString().slice(0,10)}.json`);
    dl.click();
    showToast('Tasks exported as JSON');
  });

  document.getElementById('btn-export-audit-csv')?.addEventListener('click', () => {
    if (!state.auditEvents || state.auditEvents.length === 0) {
      showToast('No activity history to export', true);
      return;
    }
    const headers = ["ID", "Timestamp", "Actor", "Action", "Target", "Severity", "Details"];
    const rows = state.auditEvents.map(e => [
      e.id,
      `"${e.timestamp || ''}"`,
      `"${e.actor_name || ''}"`,
      `"${e.action || ''}"`,
      `"${e.target || ''}"`,
      `"${e.severity || ''}"`,
      `"${(e.details || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const dl = document.createElement('a');
    dl.setAttribute("href", encodeURI(csvContent));
    dl.setAttribute("download", `frontier_activity_${new Date().toISOString().slice(0,10)}.csv`);
    dl.click();
    showToast('Activity log exported as CSV');
  });

  setupOracleListeners();
}

// =============================================================
// MODULE 5: FRONTIER ORACLE AI ASSISTANT CLIENT LOGIC
// Reusable chat engine shared between Full Page and Side Panel
async function loadOracleThreads() {
  if (window.OracleChatEngine) {
    return window.OracleChatEngine.loadThreads();
  }
}

function setupOracleListeners() {
  if (window.OracleChatEngine) {
    window.OracleChatEngine.setupFullPageListeners();
  }
}


// Start app
window.addEventListener('DOMContentLoaded', init);
