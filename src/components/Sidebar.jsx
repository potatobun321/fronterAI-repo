import React from 'react';
import { Kanban, Video, Vote, Users, Settings } from 'lucide-react';

export function Sidebar({ currentView, onChangeView, taskCount = 0 }) {
  const navItems = [
    { id: 'tasks', label: 'Tasks', icon: Kanban, badge: taskCount },
    { id: 'callroom', label: 'Call Room', icon: Video },
    { id: 'voting', label: 'Peer Review', icon: Vote },
    { id: 'peers', label: 'Team & Peers', icon: Users },
    { id: 'settings', label: 'Governance & Logs', icon: Settings }
  ];

  return (
    <aside className="app-sidebar">
      <nav className="nav-group">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              className={`nav-button ${isActive ? 'active' : ''}`}
              onClick={() => onChangeView(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {Boolean(item.badge) && <span className="nav-badge">{item.badge}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
