import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Kanban, Video, Vote, Users, Settings } from 'lucide-react';

export function MobileBottomNav({ currentView, onChangeView, taskCount = 0 }) {
  const { isHost } = useAuth();

  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: Kanban, badge: taskCount },
    { id: 'callroom', label: 'Meet', icon: Video },
    { id: 'voting', label: 'Review', icon: Vote },
    { id: 'peers', label: 'Team', icon: Users },
    { id: 'settings', label: 'Admin', icon: Settings, hostOnly: true }
  ];

  const visibleTabs = tabs.filter(t => !t.hostOnly || isHost);

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {visibleTabs.map(tab => {
        const Icon = tab.icon;
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            className={`mobile-bottom-tab ${isActive ? 'active' : ''}`}
            onClick={() => onChangeView(tab.id)}
            aria-selected={isActive}
          >
            <div className="mobile-tab-icon-wrap">
              <Icon size={20} />
              {Boolean(tab.badge) && <span className="mobile-tab-badge">{tab.badge}</span>}
            </div>
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
