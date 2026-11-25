import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sun, Moon, Sparkles, User, LogOut, ShieldCheck, ChevronDown, Menu } from 'lucide-react';

export function Header({ onToggleOracle, isOracleOpen, onToggleSidebar, isSidebarCollapsed, uiMode, onChangeUiMode }) {
  const { currentUser, isHost, members, theme, toggleTheme, loginAs, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showDevMenu, setShowDevMenu] = useState(false);
  const menuRef = useRef(null);
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
        setShowDevMenu(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
        setShowDevMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="app-header">
      <div className="brand-section">
        {uiMode === 'classic' && (
          <button
            className="btn-icon sidebar-toggle-btn"
            onClick={onToggleSidebar}
            title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label="Toggle navigation menu"
            style={{ marginRight: '6px' }}
          >
            <Menu size={18} />
          </button>
        )}

        <div className="brand-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--google-blue)' }}>
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          Frontier
        </div>
      </div>

      <div className="header-actions">
        {/* Agentic / Classic Mode Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', padding: '3px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => onChangeUiMode('agentic')}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: uiMode === 'agentic' ? 'var(--google-blue-container)' : 'transparent',
              color: uiMode === 'agentic' ? 'var(--google-blue-text)' : 'var(--text-secondary)'
            }}
          >
            Agentic
          </button>
          <button
            onClick={() => onChangeUiMode('classic')}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: uiMode === 'classic' ? 'var(--google-blue-container)' : 'transparent',
              color: uiMode === 'classic' ? 'var(--google-blue-text)' : 'var(--text-secondary)'
            }}
          >
            Classic
          </button>
        </div>

        {/* Theme Toggle */}
        <button
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* User Account Menu / Login Button */}
        <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {currentUser ? (
          <div>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              {isHost ? <ShieldCheck size={16} style={{ color: 'var(--google-amber)' }} /> : <User size={16} />}
              <span>{currentUser.name}</span>
              <ChevronDown size={14} style={{ opacity: 0.6 }} />
            </button>

            {showUserMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  width: '260px',
                  padding: '12px',
                  zIndex: 100
                }}
              >
                <div style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{currentUser.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '2px' }}>{currentUser.email || `@${currentUser.handle}`}</div>
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>{currentUser.role}</span>
                    {isHost && (
                      <span style={{ fontSize: '0.64rem', padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--google-amber-container)', color: 'var(--google-amber-text)', fontWeight: 700 }}>
                        TEAM LEAD
                      </span>
                    )}
                  </div>
                </div>

                {/* Localhost-only dev simulation tool */}
                {isLocalhost && (
                  <details style={{ marginTop: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', fontSize: '0.75rem' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}>
                      Local Dev Persona Test
                    </summary>
                    <div style={{ maxHeight: '140px', overflowY: 'auto', marginTop: '6px' }}>
                      {members.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { loginAs({ member_id: m.id }); setShowUserMenu(false); }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '4px 6px',
                            background: currentUser.id === m.id ? 'var(--google-blue-container)' : 'transparent',
                            color: currentUser.id === m.id ? 'var(--google-blue-text)' : 'inherit',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: '2px'
                          }}
                        >
                          <span>{m.name}</span>
                          <span style={{ opacity: 0.6 }}>{m.is_host === 1 ? 'Lead' : 'Member'}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}

                <div style={{ paddingTop: '10px', marginTop: '4px' }}>
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--google-red)',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {isLocalhost && members.length > 0 && (
              <div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  onClick={() => setShowDevMenu(prev => !prev)}
                >
                  Dev Sign-In <ChevronDown size={14} style={{ opacity: 0.6 }} />
                </button>
                {showDevMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '6px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-md)',
                      width: '220px',
                      padding: '8px',
                      zIndex: 100
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px 6px', marginBottom: '4px' }}>
                      Local Dev Persona
                    </div>
                    {members.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { loginAs({ member_id: m.id }); setShowDevMenu(false); }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>{m.name}</span>
                        <span style={{ opacity: 0.6 }}>{m.is_host === 1 ? 'Lead' : 'Member'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <a
              href="/api/auth/google"
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.82rem', textDecoration: 'none' }}
            >
              <User size={15} /> Sign In with Google
            </a>
          </>
        )}
        </div>

        {/* Oracle AI Assistant Pill (Classic Mode) */}
        {uiMode === 'classic' && (
          <button
            className={`btn ${isOracleOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onToggleOracle}
            style={{ padding: '7px 14px' }}
          >
            <Sparkles size={16} style={{ color: isOracleOpen ? 'inherit' : 'var(--google-blue)' }} />
            <span>Oracle AI</span>
          </button>
        )}
      </div>
    </header>
  );
}
