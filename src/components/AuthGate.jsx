import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { User, Send, Clock, CheckCircle, XCircle, Sun, Moon, ShieldCheck } from 'lucide-react';

export function AuthGate() {
  const { members, theme, toggleTheme, loginAs } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('apply'); // 'apply' | 'status'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [teamTrack, setTeamTrack] = useState('backend');
  const [submitting, setSubmitting] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const [statusEmail, setStatusEmail] = useState('');
  const [statusResult, setStatusResult] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const handleApply = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setApplyResult(null);
    try {
      const res = await api.applyForAccess({
        name: name.trim(),
        email: email.trim(),
        role: role.trim() || 'Engineer',
        team_track: teamTrack
      });
      setApplyResult(res);
      toast.success(res.message || 'Registration request submitted!');
    } catch (err) {
      toast.error(err.message || 'Failed to submit registration');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async (e) => {
    e.preventDefault();
    if (!statusEmail.trim()) return;
    setCheckingStatus(true);
    setStatusResult(null);
    try {
      const res = await api.checkApplicationStatus(statusEmail.trim());
      setStatusResult(res);
    } catch (err) {
      toast.error(err.message || 'Failed to check status');
    } finally {
      setCheckingStatus(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
      background: 'radial-gradient(700px 340px at 50% 0%, rgba(138, 180, 248, 0.08), transparent 70%), var(--bg-canvas)'
    }}>
      <div style={{ position: 'fixed', top: '16px', right: '16px' }}>
        <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '24px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--google-blue)' }}>
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            <span style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Xenon</span>
            <span className="brand-badge">Xe</span>
          </div>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Private team workspace. Sign in if you're on the allowlist, or apply for Team Lead approval.
          </p>
        </div>

        {/* Google Sign-In */}
        <a
          href="/api/auth/google"
          className="btn btn-primary"
          style={{ width: '100%', padding: '10px 16px', fontSize: '0.88rem', textDecoration: 'none', marginBottom: '18px' }}
        >
          <User size={16} /> Sign In with Google
        </a>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
          <button
            type="button"
            className={`btn ${tab === 'apply' ? 'btn-secondary' : ''}`}
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem', background: tab === 'apply' ? 'var(--bg-surface-elevated)' : 'transparent' }}
            onClick={() => setTab('apply')}
          >
            Apply for Registration
          </button>
          <button
            type="button"
            className={`btn ${tab === 'status' ? 'btn-secondary' : ''}`}
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem', background: tab === 'status' ? 'var(--bg-surface-elevated)' : 'transparent' }}
            onClick={() => setTab('status')}
          >
            Check Request Status
          </button>
        </div>

        {tab === 'apply' ? (
          applyResult ? (
            <div style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: applyResult.status === 'APPROVED' ? 'var(--google-green-container)' : 'var(--google-blue-container)',
              color: applyResult.status === 'APPROVED' ? 'var(--google-green-text)' : 'var(--google-blue-text)',
              fontSize: '0.84rem',
              lineHeight: 1.45,
              textAlign: 'center'
            }}>
              <Clock size={22} style={{ margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {applyResult.status === 'APPROVED' ? 'Already Approved' : 'Request Submitted'}
              </div>
              <div>{applyResult.message}</div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '12px', fontSize: '0.76rem' }}
                onClick={() => { setStatusEmail(email); setTab('status'); setApplyResult(null); }}
              >
                Check Status Anytime
              </button>
            </div>
          ) : (
            <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  required
                />
              </div>

              <div className="form-group">
                <label>Google Email *</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Role</label>
                  <input
                    className="form-input"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="e.g. ML Engineer"
                  />
                </div>
                <div className="form-group">
                  <label>Track</label>
                  <select className="form-select" value={teamTrack} onChange={e => setTeamTrack(e.target.value)}>
                    <option value="backend">Backend / AI</option>
                    <option value="frontend">Frontend / UI</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn btn-secondary" disabled={submitting} style={{ marginTop: '4px' }}>
                <Send size={14} /> {submitting ? 'Submitting...' : 'Request Registration'}
              </button>
            </form>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <form onSubmit={handleCheckStatus} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                className="form-input"
                value={statusEmail}
                onChange={e => setStatusEmail(e.target.value)}
                placeholder="Enter your applied email..."
                required
              />
              <button type="submit" className="btn btn-secondary" disabled={checkingStatus}>
                {checkingStatus ? '...' : 'Check'}
              </button>
            </form>

            {statusResult && (
              <div style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                {statusResult.status === 'APPROVED' && (
                  <>
                    <CheckCircle size={18} style={{ color: 'var(--google-green)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--google-green)' }}>Approved</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Click "Sign In with Google" above to enter Xenon.</div>
                    </div>
                  </>
                )}
                {statusResult.status === 'PENDING' && (
                  <>
                    <Clock size={18} style={{ color: 'var(--google-amber)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--google-amber)' }}>Pending Team Lead Review</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Your request is in the Team Lead's queue.</div>
                    </div>
                  </>
                )}
                {statusResult.status === 'REJECTED' && (
                  <>
                    <XCircle size={18} style={{ color: 'var(--google-red)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--google-red)' }}>Request Declined</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Your registration request was declined by the Team Lead.</div>
                    </div>
                  </>
                )}
                {statusResult.status === 'NOT_FOUND' && (
                  <div style={{ color: 'var(--text-muted)' }}>No registration request found for that email.</div>
                )}
              </div>
            )}
          </div>
        )}

        {isLocalhost && members.length > 0 && (
          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={13} /> Local Dev Quick Sign-In
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                  onClick={() => loginAs({ member_id: m.id })}
                >
                  {m.name} {m.is_host === 1 ? '(Lead)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
