import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Kanban, Video, Vote, Users, Settings } from 'lucide-react';

export function MobileBottomNav({ currentView, onChangeView, taskCount = 0 }) {
  const { isHost } = useAuth();

  const tabs = [
    { id: 'command', label: 'Command', icon: Sparkles },
    { id: 'tasks', label: 'Tasks', icon: Kanban, badge: taskCount },
    { id: 'callroom', label: 'Meet', icon: Video },
    { id: 'voting', label: 'Review', icon: Vote },
    { id: 'peers', label: 'Team', icon: Users },
    { id: 'settings', label: isHost ? 'Admin' : 'Gov', icon: Settings }
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {tabs.map(tab => {
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
              <Icon size={19} />
              {Boolean(tab.badge) && <span className="mobile-tab-badge">{tab.badge}</span>}
            </div>
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
