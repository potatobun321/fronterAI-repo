/**
 * Frontier AI Workspace — Mobile Navigation System (mobile-nav.js)
 * Implements:
 * 1. Native Fixed Bottom Navigation Bar (Tasks, Meet, Review, Team, Admin)
 * 2. 100% two-way state synchronization with desktop sidebar rail
 * 3. Badge & live meeting status indicators
 * 4. Role-aware Admin / Settings & Logs tab visibility (host-only)
 * 5. Accessible touch targets (>=44px), keyboard navigation, and ARIA attributes
 */

(function () {
  'use strict';

  let bottomNav = null;

  function init() {
    bottomNav = document.getElementById('mobile-bottom-nav');
    if (!bottomNav) return;

    // Remove legacy elements if any exist in DOM
    cleanupLegacyElements();

    setupBottomNavEvents();
    setupSidebarObserver();
    syncState();

    // Re-sync whenever popstate or role permissions change
    window.addEventListener('popstate', syncState);
  }

  function cleanupLegacyElements() {
    const legacyIds = ['mobile-nav-fab', 'mobile-nav-stack', 'mobile-nav-backdrop'];
    legacyIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  /* --------------------------------------------------------------------------
     BOTTOM NAVIGATION BAR EVENT HANDLERS
     -------------------------------------------------------------------------- */

  function setupBottomNavEvents() {
    if (!bottomNav) return;

    const tabs = bottomNav.querySelectorAll('.mobile-bottom-tab');
    tabs.forEach(tab => {
      const handleTabSelection = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const viewId = tab.dataset.view;
        if (!viewId) return;

        // Directly invoke switchView for immediate, robust responsiveness on touch devices
        if (typeof window.switchView === 'function') {
          window.switchView(viewId);
        } else {
          const origSidebarBtn = document.querySelector(`#sidebar .nav-item[data-view="${viewId}"]`);
          if (origSidebarBtn) {
            origSidebarBtn.click();
          }
        }

        // Highlight immediately for instantaneous UI feedback
        tabs.forEach(t => t.classList.toggle('active', t === tab));
      };

      tab.addEventListener('click', handleTabSelection);
    });
  }

  /* --------------------------------------------------------------------------
     STATE SYNCHRONIZATION WITH SIDEBAR RAIL & APPLICATION STATE
     -------------------------------------------------------------------------- */

  function syncState() {
    if (!bottomNav) return;

    // 1. Sync Active View Highlight (canonical workspace-view first, then sidebar, then session storage)
    const activeWorkspaceView = document.querySelector('.workspace-view.active');
    const activeSidebarBtn = document.querySelector('#sidebar .nav-item.active');
    const activeViewId = activeWorkspaceView?.id || (activeSidebarBtn ? activeSidebarBtn.dataset.view : null) || sessionStorage.getItem('frontier_active_view') || 'view-tasks';

    const tabs = bottomNav.querySelectorAll('.mobile-bottom-tab');
    tabs.forEach(tab => {
      const isCurrent = tab.dataset.view === activeViewId;
      tab.classList.toggle('active', isCurrent);
      tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    // 2. Sync Admin (Settings & Logs) Tab Visibility (Host-only)
    const adminTab = document.getElementById('mob-tab-admin');
    const directSettingsBtn = document.getElementById('nav-item-direct-settings');
    const isHostAdmin = document.body.classList.contains('is-admin-host');
    if (adminTab) {
      const isHostVisible = isHostAdmin && directSettingsBtn && directSettingsBtn.style.display !== 'none';
      adminTab.style.display = isHostVisible ? 'flex' : 'none';
    }

    // 3. Sync Tasks Count Badge
    const origTaskBadge = document.getElementById('badge-my-tasks-count');
    const mobTaskBadge = document.getElementById('mob-bottom-badge-tasks');
    if (origTaskBadge && mobTaskBadge) {
      const count = parseInt(origTaskBadge.textContent.trim(), 10) || 0;
      mobTaskBadge.textContent = count;
      mobTaskBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    // 4. Sync Meet / Call Room Status Dot
    const origCallDot = document.getElementById('badge-call-status');
    const mobCallDot = document.getElementById('mob-bottom-dot-call');
    if (origCallDot && mobCallDot) {
      mobCallDot.className = 'mobile-bottom-dot ' + (origCallDot.className.replace('room-status-dot', '').trim());
    }

    // 5. Sync Peer Review Voting Badge
    const origVoteBadge = document.getElementById('badge-voting-status');
    const mobVoteBadge = document.getElementById('mob-bottom-badge-voting');
    if (origVoteBadge && mobVoteBadge) {
      const isVisible = origVoteBadge.style.display !== 'none';
      const text = origVoteBadge.textContent.trim();
      mobVoteBadge.textContent = text === 'Active' ? '!' : text;
      mobVoteBadge.style.display = isVisible && text !== 'Idle' ? 'inline-block' : 'none';
    }

    // 6. Sync Team / Tasklets Count Badge
    const origTaskletBadge = document.getElementById('badge-tasklets-count');
    const mobTaskletBadge = document.getElementById('mob-bottom-badge-peers');
    if (origTaskletBadge && mobTaskletBadge) {
      const count = parseInt(origTaskletBadge.textContent.trim(), 10) || 0;
      mobTaskletBadge.textContent = count;
      mobTaskletBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  function setupSidebarObserver() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Observe active class or style changes on the sidebar rail
    const observer = new MutationObserver(() => {
      syncState();
    });

    observer.observe(sidebar, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'style']
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose sync hook for app.js
  window.syncMobileNav = syncState;

})();
