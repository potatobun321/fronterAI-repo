import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sun, Moon, Sparkles, User, LogOut, ShieldCheck, ChevronDown, Menu } from 'lucide-react';

export function Header({ onToggleOracle, isOracleOpen, onToggleSidebar, isSidebarCollapsed }) {
  const { currentUser, isHost, members, theme, toggleTheme, loginAs, logout } = useAuth();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);

  return (
    <header className="app-header">
      <div className="brand-section">
        <button
          className="btn-icon sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-label="Toggle navigation menu"
          style={{ marginRight: '6px' }}
        >
          <Menu size={18} />
        </button>

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
        {/* Theme Toggle */}
        <button
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Persona Switcher / User Profile */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
          >
            {isHost ? <ShieldCheck size={16} style={{ color: 'var(--google-amber)' }} /> : <User size={16} />}
            <span>{currentUser ? currentUser.name : 'Sign In'}</span>
            <ChevronDown size={14} style={{ opacity: 0.6 }} />
          </button>

          {showPersonaMenu && (
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
                padding: '8px',
                zIndex: 100
              }}
            >
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {currentUser ? (
                  <>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{currentUser.name}</div>
                    <div>{currentUser.email || `@${currentUser.handle}`}</div>
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{currentUser.role}</span>
                      {isHost && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--google-amber-container)', color: 'var(--google-amber-text)', fontWeight: 600 }}>
                          Host
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  'Select a persona or log in'
                )}
              </div>

              <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px 0' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '6px 10px', letterSpacing: '0.04em' }}>
                  Workspace Members
                </div>
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      loginAs({ member_id: m.id });
                      setShowPersonaMenu(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: currentUser?.id === m.id ? 'var(--google-blue-container)' : 'transparent',
                      color: currentUser?.id === m.id ? 'var(--google-blue-text)' : 'inherit',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      textAlign: 'left',
                      marginBottom: '2px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--google-blue-container)',
                        color: 'var(--google-blue-text)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {(m.name || m.handle || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.role}</div>
                      </div>
                    </div>
                    {m.is_host === 1 && (
                      <span style={{ fontSize: '0.64rem', padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--google-amber-container)', color: 'var(--google-amber-text)', fontWeight: 600, flexShrink: 0 }}>
                        LEAD
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '4px' }}>
                {currentUser ? (
                  <button
                    onClick={() => { logout(); setShowPersonaMenu(false); }}
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
                ) : (
                  <a
                    href="/api/auth/google"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      padding: '8px 10px',
                      background: 'var(--google-blue)',
                      color: 'var(--bg-canvas)',
                      textDecoration: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.82rem',
                      fontWeight: 500
                    }}
                  >
                    Sign In with Google
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Oracle AI Assistant Pill */}
        <button
          className={`btn ${isOracleOpen ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleOracle}
          style={{ padding: '7px 14px' }}
        >
          <Sparkles size={16} style={{ color: isOracleOpen ? 'inherit' : 'var(--google-blue)' }} />
          <span>Oracle AI</span>
        </button>
      </div>
    </header>
  );
}
