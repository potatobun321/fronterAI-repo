import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Kanban, Video, Vote, Users, Settings, ShieldCheck } from 'lucide-react';

export function Sidebar({ currentView, onChangeView, taskCount = 0, isCollapsed = false }) {
  const { currentUser, isHost } = useAuth();

  const navItems = [
    { id: 'tasks', label: 'Tasks', icon: Kanban, badge: taskCount },
    { id: 'callroom', label: 'Call Room', icon: Video },
    { id: 'voting', label: 'Peer Review', icon: Vote },
    { id: 'peers', label: 'Team & Peers', icon: Users },
    { id: 'settings', label: 'Governance & Logs', icon: Settings, hostOnly: true }
  ];

  const visibleNav = navItems.filter(item => !item.hostOnly || isHost);

  return (
    <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-section-title">
        {!isCollapsed && 'WORKSPACE'}
      </div>

      <nav className="nav-group">
        {visibleNav.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              className={`nav-button ${isActive ? 'active' : ''}`}
              onClick={() => onChangeView(item.id)}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon size={18} />
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
              {Boolean(item.badge) && (
                <span className={`nav-badge ${isCollapsed ? 'collapsed-badge' : ''}`}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile Card at Sidebar Bottom */}
      <div className="sidebar-user-card" title={currentUser ? `${currentUser.name} (${currentUser.role})` : 'Not signed in'}>
        <div className="sidebar-avatar-wrap">
          <div className="user-avatar">
            {(currentUser?.name || currentUser?.handle || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="user-status-dot" style={{ backgroundColor: currentUser ? '#81c995' : '#9aa0a6' }}></span>
        </div>

        {!isCollapsed && (
          <div className="sidebar-user-info">
            <div className="sidebar-user-name-row">
              <span className="sidebar-user-name">{currentUser?.name || 'Guest User'}</span>
              {isHost && <span className="host-pill-tag">LEAD</span>}
            </div>
            <span className="sidebar-user-role">{currentUser?.role || 'Sign in to collaborate'}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
