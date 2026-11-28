import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Sparkles, Kanban, Video, Vote, Users, Settings, Sun, Moon, X
} from 'lucide-react';

export function CommandPalette({ isOpen, onClose, onNavigate, onToggleTheme, onToggleOracle, isHost, theme }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  const items = [
    { id: 'nav-command', label: 'Go to Command Workspace', hint: 'AI & Live Pulse', icon: Sparkles, run: () => onNavigate('command') },
    { id: 'nav-tasks', label: 'Go to Sprint Tasks', hint: 'Kanban Board', icon: Kanban, run: () => onNavigate('tasks') },
    { id: 'nav-callroom', label: 'Go to Call Room', hint: '6-Slot Meet Bridges', icon: Video, run: () => onNavigate('callroom') },
    { id: 'nav-voting', label: 'Go to Peer Review', hint: 'Blind Ballot Booth', icon: Vote, run: () => onNavigate('voting') },
    { id: 'nav-peers', label: 'Go to Team & Peers', hint: 'Roster & Tasklets', icon: Users, run: () => onNavigate('peers') },
    { id: 'nav-settings', label: `Go to ${isHost ? 'Governance & Logs' : 'Governance'}`, hint: '2-Man Rule & Audit', icon: Settings, run: () => onNavigate('settings') },
    { id: 'act-oracle', label: 'Toggle Oracle Drawer', hint: 'Side Assistant', icon: Sparkles, run: () => onToggleOracle() },
    { id: 'act-theme', label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`, hint: 'Appearance', icon: theme === 'dark' ? Sun : Moon, run: () => onToggleTheme() }
  ];

  const filtered = items.filter(it =>
    it.label.toLowerCase().includes(query.toLowerCase()) ||
    it.hint.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        filtered[0].run();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, filtered, onClose]);

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette-box" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input-row">
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            className="cmd-palette-input"
            placeholder="Jump to a workspace, view, or action..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="btn-icon" onClick={onClose} style={{ width: '28px', height: '28px' }}>
            <X size={14} />
          </button>
        </div>

        <div className="cmd-palette-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              No matching commands.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`cmd-palette-item ${idx === 0 ? 'selected' : ''}`}
                  onClick={() => { item.run(); onClose(); }}
                >
                  <Icon size={16} style={{ color: 'var(--google-blue)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.hint}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
