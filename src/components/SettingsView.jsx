import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { Shield, FileText, Download, Check, X, Search, Plus } from 'lucide-react';

export function SettingsView() {
  const { currentUser, isHost } = useAuth();
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchAudit, setSearchAudit] = useState('');
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketScope, setTicketScope] = useState('production_d1_write');
  const [ticketReason, setTicketReason] = useState('');
  const [ticketDuration, setTicketDuration] = useState(30);

  const loadSettingsData = async () => {
    try {
      if (currentUser) {
        try {
          const tRes = await api.getTickets();
          if (tRes && tRes.tickets) setTickets(tRes.tickets);
        } catch (_) { }
      }
      if (isHost) {
        try {
          const aRes = await api.getAuditEvents();
          if (aRes && aRes.events) setAuditEvents(aRes.events);
        } catch (_) { }
      }
    } catch (e) {
      console.error('Failed to load settings data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, [currentUser?.id, isHost]);

  const handleRaiseTicket = async (e) => {
    e.preventDefault();
    if (!ticketTitle.trim() || !ticketReason.trim() || !ticketScope.trim()) return;
    try {
      await api.createTicket({
        title: ticketTitle.trim(),
        scope: ticketScope.trim(),
        reason: ticketReason.trim(),
        duration_minutes: parseInt(ticketDuration, 10) || 30
      });
      setIsTicketModalOpen(false);
      setTicketTitle('');
      setTicketReason('');
      toast.success('Access ticket raised for 2-Man Rule approval');
      await loadSettingsData();
    } catch (err) {
      toast.error(`Failed to raise ticket: ${err.message}`);
    }
  };

  const handleSignOffTicket = async (ticketId) => {
    try {
      await api.signOffTicket(ticketId);
      toast.success('Ticket approved');
      await loadSettingsData();
    } catch (err) {
      toast.error(`Approval failed: ${err.message}`);
    }
  };

  const handleDenyTicket = async (ticketId) => {
    try {
      await api.denyTicket(ticketId);
      toast.info('Ticket denied');
      await loadSettingsData();
    } catch (err) {
      toast.error(`Denial failed: ${err.message}`);
    }
  };

  const handleVerifyChain = async () => {
    try {
      const res = await api.verifyAuditChain();
      if (res?.valid) {
        toast.success(`Audit chain verified (${res.totalChecked} entries intact)`);
      } else {
        toast.error(`Audit chain broken at entry #${res?.brokenAtId}`);
      }
    } catch (err) {
      toast.error(`Verification failed: ${err.message}`);
    }
  };

  const handleExportBackup = async () => {
    try {
      const res = await api.exportBackup();
      if (res && res.snapshot) {
        const blob = new Blob([JSON.stringify(res.snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `frontier_backup_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Snapshot exported');
      }
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    }
  };

  const filteredAudit = auditEvents.filter(ev => {
    if (!searchAudit.trim()) return true;
    const query = searchAudit.toLowerCase();
    return (
      (ev.actor_handle && ev.actor_handle.toLowerCase().includes(query)) ||
      (ev.action && ev.action.toLowerCase().includes(query)) ||
      (ev.details && ev.details.toLowerCase().includes(query)) ||
      (ev.status && ev.status.toLowerCase().includes(query))
    );
  });

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h2>Governance & Audit</h2>
          <p>Access approvals, system audit events, and data snapshots</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {currentUser && (
            <button className="btn btn-primary" onClick={() => setIsTicketModalOpen(true)}>
              <Plus size={15} /> Raise Access Ticket
            </button>
          )}
          {isHost && (
            <button className="btn btn-secondary" onClick={handleExportBackup}>
              <Download size={15} /> Export Snapshot
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>
      ) : (
        <>
          {/* 2-Man Rule Access Tickets */}
          {currentUser ? (
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} style={{ color: 'var(--google-amber)' }} /> 2-Man Rule Governance Tickets
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tickets.map(ticket => (
                  <div key={ticket.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ticket.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Scope: {ticket.scope} • Requester: @{ticket.requester_handle || ticket.requester_name || ticket.requester_id} • Status: {ticket.status}
                      </div>
                      {ticket.reason && <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '4px' }}>"{ticket.reason}"</div>}
                    </div>

                    {ticket.status === 'PENDING_APPROVAL' && (
                      ticket.requester_id === currentUser.id ? (
                        <span style={{ fontSize: '0.74rem', color: 'var(--google-amber)', fontWeight: 500 }}>
                          Awaiting peer sign-off
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => handleSignOffTicket(ticket.id)}>
                            <Check size={12} /> Sign Off
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.76rem', color: 'var(--google-red)' }} onClick={() => handleDenyTicket(ticket.id)}>
                            <X size={12} /> Deny
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ))}

                {tickets.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    No pending multi-party governance tickets.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Sign in to raise or review 2-Man Rule governance tickets.
            </div>
          )}

          {/* Tamper-Evident Audit Trail (Host Only) */}
          {isHost && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} style={{ color: 'var(--google-blue)' }} /> Tamper-Evident Audit Events
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.76rem' }} onClick={handleVerifyChain}>
                  Verify Hash Chain
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface-elevated)', padding: '6px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-default)' }}>
                <Search size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter audit events..."
                  value={searchAudit}
                  onChange={e => setSearchAudit(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.82rem', width: '180px' }}
                />
                </div>
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.slice(0, 30).map(ev => (
                  <tr key={ev.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ fontWeight: 500 }}>@{ev.actor_handle}</td>
                    <td>
                      <span className="track-tag track-frontend" style={{ fontSize: '0.68rem' }}>
                        {ev.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{ev.details}</td>
                    <td>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: ev.status === 'SUCCESS' ? 'var(--google-green)' : ev.status === 'DENIED' ? 'var(--google-red)' : 'var(--google-amber)' }}>
                        {ev.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredAudit.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No audit events match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title="Raise 2-Man Rule Access Ticket"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsTicketModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRaiseTicket}>Submit Request</button>
          </>
        }
      >
        <form onSubmit={handleRaiseTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Request Title *</label>
            <input
              className="form-input"
              value={ticketTitle}
              onChange={e => setTicketTitle(e.target.value)}
              placeholder="e.g. Temporary Production D1 Migration Access"
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Privilege Scope *</label>
              <input
                className="form-input"
                value={ticketScope}
                onChange={e => setTicketScope(e.target.value)}
                placeholder="e.g. production_d1_write"
                required
              />
            </div>
            <div className="form-group">
              <label>Duration (min)</label>
              <input
                type="number"
                min={5}
                max={240}
                className="form-input"
                value={ticketDuration}
                onChange={e => setTicketDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Justification / Reason *</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={ticketReason}
              onChange={e => setTicketReason(e.target.value)}
              placeholder="Explain why temporary elevated access is needed..."
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
