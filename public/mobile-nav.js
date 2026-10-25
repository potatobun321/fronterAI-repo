/**
 * Frontier AI Workspace — Mobile Navigation System (mobile-nav.js)
 * Implements:
 * 1. Synchronized navigation stack built dynamically from the same sidebar items
 * 2. 48px round floating action button (FAB) with safe-area spacing and 180deg rotating chevron
 * 3. Settings & Logs accordion expanding its 4 sub-pages
 * 4. Close on FAB tap, backdrop/outside tap, Escape key, or navigation item tap
 * 5. Short slide/fade animation (180ms) with reduced-motion support
 * 6. Accessibility (aria-expanded, aria-controls, changing aria-label, visible focus, Tab traversal)
 * 7. Scroll listener on .workspace-canvas & window: hide when scrolling down, show when scrolling up
 */

(function () {
  'use strict';

  // Sub-pages specification for "Settings & Logs"
  const SETTINGS_SUBPAGES = [
    {
      subtab: 'directory',
      label: 'Directory',
      iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'
    },
    {
      subtab: 'permissions',
      label: 'Deliverable Sign-Offs',
      iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>'
    },
    {
      subtab: 'history',
      label: 'Activity History',
      iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    },
    {
      subtab: 'snapshot',
      label: 'Project Export',
      iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
    }
  ];

  let fab = null;
  let stack = null;
  let backdrop = null;
  let itemsContainer = null;
  let isStackOpen = false;
  let settingsAccordionExpanded = false;

  // Scroll hide/show tracking
  let lastScrollTop = 0;
  let scrollThreshold = 8;

  function init() {
    // Only mount if not already present
    if (document.getElementById('mobile-nav-fab')) return;

    createBackdrop();
    createNavStack();
    createFab();

    buildNavItems();
    setupEventListeners();
    setupScrollListener();

    // Synchronize initial active state and badges
    syncState();

    // Observe changes to the desktop sidebar to keep mobile items 100% in sync
    setupSidebarObserver();
  }

  /* --------------------------------------------------------------------------
     DOM ELEMENT CREATION
     -------------------------------------------------------------------------- */

  function createBackdrop() {
    backdrop = document.createElement('div');
    backdrop.id = 'mobile-nav-backdrop';
    backdrop.className = 'mobile-nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
  }

  function createNavStack() {
    stack = document.createElement('nav');
    stack.id = 'mobile-nav-stack';
    stack.className = 'mobile-nav-stack';
    stack.setAttribute('role', 'navigation');
    stack.setAttribute('aria-label', 'Mobile Workspace Navigation');
    stack.setAttribute('aria-hidden', 'true');

    // Header label
    const header = document.createElement('div');
    header.className = 'mobile-nav-header';
    header.innerHTML = '<span>Workspace Menu</span>';
    stack.appendChild(header);

    // Items Container
    itemsContainer = document.createElement('div');
    itemsContainer.className = 'mobile-nav-items-container';
    itemsContainer.id = 'mobile-nav-items-container';
    stack.appendChild(itemsContainer);

    document.body.appendChild(stack);
  }

  function createFab() {
    fab = document.createElement('button');
    fab.id = 'mobile-nav-fab';
    fab.type = 'button';
    fab.className = 'mobile-nav-fab';
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'mobile-nav-stack');
    fab.setAttribute('aria-label', 'Open navigation menu');
    fab.title = 'Open navigation menu';

    // Chevron-up icon (rotates 180deg when open)
    fab.innerHTML = `
      <span class="mobile-fab-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </span>
    `;

    document.body.appendChild(fab);
  }

  /* --------------------------------------------------------------------------
     BUILD ITEMS FROM SAME LIST THAT BUILDS THE SIDEBAR
     -------------------------------------------------------------------------- */

  function buildNavItems() {
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';

    // Query all sidebar navigation buttons
    const sidebarItems = Array.from(document.querySelectorAll('#sidebar .nav-item'));

    sidebarItems.forEach(origBtn => {
      // Skip hidden buttons
      if (origBtn.style.display === 'none') return;

      const viewId = origBtn.dataset.view;
      if (!viewId) return;

      const labelEl = origBtn.querySelector('.nav-label');
      const labelText = labelEl ? labelEl.textContent.trim() : origBtn.textContent.trim();
      const iconEl = origBtn.querySelector('.nav-icon') || origBtn.querySelector('svg');
      const iconHtml = iconEl ? iconEl.outerHTML : '';

      // Special handling for Settings & Logs (expandable 4 sub-pages)
      if (viewId === 'view-settings') {
        const wrap = document.createElement('div');
        wrap.className = 'mobile-nav-expandable';

        const mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'mobile-nav-item mobile-nav-expand-btn';
        mainBtn.dataset.view = 'view-settings';
        mainBtn.setAttribute('aria-expanded', settingsAccordionExpanded ? 'true' : 'false');
        mainBtn.setAttribute('aria-controls', 'mobile-settings-subpages');

        mainBtn.innerHTML = `
          <span class="mobile-nav-icon" aria-hidden="true">${iconHtml}</span>
          <span class="mobile-nav-label">${labelText}</span>
          <span class="mobile-nav-caret" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        `;

        // Sub-pages container
        const subGroup = document.createElement('div');
        subGroup.id = 'mobile-settings-subpages';
        subGroup.className = 'mobile-subnav-group' + (settingsAccordionExpanded ? ' expanded' : '');
        subGroup.setAttribute('role', 'group');
        subGroup.setAttribute('aria-label', 'Settings sub-pages');

        SETTINGS_SUBPAGES.forEach(sub => {
          const subBtn = document.createElement('button');
          subBtn.type = 'button';
          subBtn.className = 'mobile-subnav-item';
          subBtn.dataset.subtab = sub.subtab;
          subBtn.innerHTML = `
            <span class="mobile-nav-icon" aria-hidden="true">${sub.iconSvg}</span>
            <span class="mobile-nav-label">${sub.label}</span>
          `;

          subBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // 1. Navigate to Settings view via original button
            origBtn.click();
            // 2. Activate specific subtab
            const targetSubtab = document.querySelector(`#settings-subtabs .segmented-tab[data-subtab="${sub.subtab}"]`);
            targetSubtab?.click();
            // 3. Close mobile nav
            closeMenu();
          });

          subGroup.appendChild(subBtn);
        });

        // Main button click: toggle expansion and navigate to Settings & Logs if opening
        mainBtn.addEventListener('click', (e) => {
          e.preventDefault();
          settingsAccordionExpanded = !settingsAccordionExpanded;
          subGroup.classList.toggle('expanded', settingsAccordionExpanded);
          mainBtn.setAttribute('aria-expanded', settingsAccordionExpanded ? 'true' : 'false');

          // If opening, ensure the Settings & Logs view is active
          if (settingsAccordionExpanded) {
            origBtn.click();
          }
          syncState();
        });

        wrap.appendChild(mainBtn);
        wrap.appendChild(subGroup);
        itemsContainer.appendChild(wrap);

      } else {
        // Standard Navigation Item
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-nav-item';
        btn.dataset.view = viewId;

        // Build item content with optional badge / dot
        let badgeHtml = '';
        if (viewId === 'view-tasks') {
          const origBadge = document.getElementById('badge-my-tasks-count');
          const count = origBadge ? origBadge.textContent.trim() : '0';
          badgeHtml = `<span class="mobile-nav-badge" id="mobile-badge-my-tasks-count">${count}</span>`;
        } else if (viewId === 'view-callroom') {
          const origDot = document.getElementById('badge-call-status');
          const dotClass = origDot ? origDot.className : 'room-status-dot idle';
          badgeHtml = `<span class="mobile-nav-dot ${dotClass}" id="mobile-badge-call-status"></span>`;
        } else if (viewId === 'view-voting') {
          const origBadge = document.getElementById('badge-voting-status');
          const text = origBadge ? origBadge.textContent.trim() : 'Idle';
          const isVisible = origBadge && origBadge.style.display !== 'none';
          badgeHtml = `<span class="mobile-nav-badge" id="mobile-badge-voting-status" style="${isVisible ? '' : 'display:none;'}">${text}</span>`;
        } else if (viewId === 'view-peers') {
          const origBadge = document.getElementById('badge-tasklets-count');
          const count = origBadge ? origBadge.textContent.trim() : '0';
          const isVisible = origBadge && origBadge.style.display !== 'none';
          badgeHtml = `<span class="mobile-nav-badge" id="mobile-badge-tasklets-count" style="${isVisible ? '' : 'display:none;'}">${count}</span>`;
        } else if (viewId === 'view-oracle') {
          badgeHtml = `<span class="mobile-nav-badge" style="background: rgba(168, 199, 250, 0.15); color: #a8c7fa;">AI</span>`;
        }

        btn.innerHTML = `
          <span class="mobile-nav-icon" aria-hidden="true">${iconHtml}</span>
          <span class="mobile-nav-label">${labelText}</span>
          ${badgeHtml}
        `;

        btn.addEventListener('click', () => {
          // Trigger the exact same sidebar item
          origBtn.click();
          closeMenu();
        });

        itemsContainer.appendChild(btn);
      }
    });
  }

  /* --------------------------------------------------------------------------
     SYNCHRONIZATION WITH APPLICATION STATE
     -------------------------------------------------------------------------- */

  function syncState() {
    if (!stack) return;

    // 1. Synchronize active navigation page highlight
    const activeSidebarBtn = document.querySelector('#sidebar .nav-item.active');
    const activeViewId = activeSidebarBtn ? activeSidebarBtn.dataset.view : null;

    stack.querySelectorAll('.mobile-nav-item').forEach(btn => {
      const isCurrent = btn.dataset.view === activeViewId;
      btn.classList.toggle('active', isCurrent);
    });

    // 2. Synchronize active Settings subtab highlight
    const activeSubtab = document.querySelector('#settings-subtabs .segmented-tab.active');
    const activeSubtabKey = activeSubtab ? activeSubtab.dataset.subtab : null;

    stack.querySelectorAll('.mobile-subnav-item').forEach(subBtn => {
      subBtn.classList.toggle('active', subBtn.dataset.subtab === activeSubtabKey);
    });

    // 3. Synchronize Badges & Dots
    const origTaskBadge = document.getElementById('badge-my-tasks-count');
    const mobTaskBadge = document.getElementById('mobile-badge-my-tasks-count');
    if (origTaskBadge && mobTaskBadge) {
      mobTaskBadge.textContent = origTaskBadge.textContent.trim();
    }

    const origCallDot = document.getElementById('badge-call-status');
    const mobCallDot = document.getElementById('mobile-badge-call-status');
    if (origCallDot && mobCallDot) {
      // Sync classes like idle, live, scheduled
      mobCallDot.className = 'mobile-nav-dot ' + (origCallDot.className.replace('room-status-dot', '').trim());
    }

    const origVoteBadge = document.getElementById('badge-voting-status');
    const mobVoteBadge = document.getElementById('mobile-badge-voting-status');
    if (origVoteBadge && mobVoteBadge) {
      mobVoteBadge.textContent = origVoteBadge.textContent.trim();
      mobVoteBadge.style.display = origVoteBadge.style.display === 'none' ? 'none' : 'inline-block';
    }

    const origTaskletBadge = document.getElementById('badge-tasklets-count');
    const mobTaskletBadge = document.getElementById('mobile-badge-tasklets-count');
    if (origTaskletBadge && mobTaskletBadge) {
      mobTaskletBadge.textContent = origTaskletBadge.textContent.trim();
      mobTaskletBadge.style.display = origTaskletBadge.style.display === 'none' ? 'none' : 'inline-block';
    }
  }

  function setupSidebarObserver() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Observe changes to attributes (class active, style) or child list in sidebar
    const observer = new MutationObserver(() => {
      // Check if sidebar structure or items changed
      const currentSidebarItemsCount = sidebar.querySelectorAll('.nav-item').length;
      const mobileItemsCount = stack ? stack.querySelectorAll('.mobile-nav-item').length : 0;
      if (currentSidebarItemsCount !== mobileItemsCount) {
        buildNavItems();
      }
      syncState();
    });

    observer.observe(sidebar, {
      attributes: true,
      subtree: true,
      childList: true,
      attributeFilter: ['class', 'style']
    });

    // Also observe settings subtabs
    const settingsSubtabs = document.getElementById('settings-subtabs');
    if (settingsSubtabs) {
      const subObserver = new MutationObserver(() => syncState());
      subObserver.observe(settingsSubtabs, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  }

  /* --------------------------------------------------------------------------
     OPEN / CLOSE LOGIC
     -------------------------------------------------------------------------- */

  function toggleMenu() {
    if (isStackOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function openMenu() {
    if (isStackOpen) return;
    isStackOpen = true;

    syncState();

    stack.classList.add('open');
    stack.setAttribute('aria-hidden', 'false');

    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');

    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Close navigation menu');
    fab.title = 'Close navigation menu';

    // Ensure FAB is visible when menu is opened
    fab.classList.remove('fab-hidden');

    // Focus the active item or first item for accessible keyboard navigation
    requestAnimationFrame(() => {
      const activeItem = stack.querySelector('.mobile-nav-item.active') || stack.querySelector('.mobile-nav-item');
      activeItem?.focus();
    });
  }

  function closeMenu(returnFocusToFab = false) {
    if (!isStackOpen) return;
    isStackOpen = false;

    stack.classList.remove('open');
    stack.setAttribute('aria-hidden', 'true');

    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');

    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Open navigation menu');
    fab.title = 'Open navigation menu';

    // Reset accordion to collapsed state
    settingsAccordionExpanded = false;
    const subGroup = document.getElementById('mobile-settings-subpages');
    const mainBtn = stack?.querySelector('.mobile-nav-expand-btn');
    subGroup?.classList.remove('expanded');
    mainBtn?.setAttribute('aria-expanded', 'false');

    if (returnFocusToFab) {
      fab.focus();
    }
  }

  /* --------------------------------------------------------------------------
     EVENT LISTENERS & ACCESSIBILITY
     -------------------------------------------------------------------------- */

  function setupEventListeners() {
    // FAB tap: toggle menu
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Backdrop tap: close menu
    backdrop.addEventListener('click', () => {
      closeMenu();
    });

    // Close on Escape key press & Tab trapping inside open menu
    document.addEventListener('keydown', (e) => {
      if (!isStackOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
      } else if (e.key === 'Tab') {
        handleTabNavigation(e);
      }
    });

    // Auto-close if screen resized above 768px (desktop)
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && isStackOpen) {
        closeMenu();
      }
    });

    // Also close if a global view change happens externally
    window.addEventListener('popstate', () => {
      if (isStackOpen) closeMenu();
      syncState();
    });
  }

  function handleTabNavigation(e) {
    // Focusable elements inside stack + the FAB button
    const focusable = Array.from(stack.querySelectorAll('button:not([disabled])'));
    focusable.push(fab);

    if (focusable.length === 0) return;

    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }

  /* --------------------------------------------------------------------------
     SCROLL BEHAVIOR: HIDE WHILE SCROLLING DOWN, SHOW WHEN SCROLLING UP
     -------------------------------------------------------------------------- */

  function setupScrollListener() {
    // Inner scroll container in Frontier AI workspace is .workspace-canvas
    const scrollContainer = document.querySelector('.workspace-canvas') || window;

    function onScroll(e) {
      // Do not hide while the navigation stack is actively open
      if (isStackOpen) return;

      const target = e.target;
      const currentScrollTop = (target === window || target === document)
        ? (window.pageYOffset || document.documentElement.scrollTop || 0)
        : (target.scrollTop || 0);

      // Always show near top of page (< 50px)
      if (currentScrollTop < 50) {
        fab.classList.remove('fab-hidden');
        lastScrollTop = Math.max(0, currentScrollTop);
        return;
      }

      const diff = currentScrollTop - lastScrollTop;
      if (Math.abs(diff) < scrollThreshold) return;

      if (diff > 0) {
        // Scrolling down -> hide button
        fab.classList.add('fab-hidden');
      } else {
        // Scrolling up -> show button
        fab.classList.remove('fab-hidden');
      }

      lastScrollTop = Math.max(0, currentScrollTop);
    }

    // Attach to both inner canvas and window for complete coverage
    const canvas = document.querySelector('.workspace-canvas');
    if (canvas) {
      canvas.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Self-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
