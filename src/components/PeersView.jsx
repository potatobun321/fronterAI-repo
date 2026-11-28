import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { Users, UserPlus, ShieldAlert, ArrowRightLeft, Send, CheckCircle2, Clock, Trash2, Pencil } from 'lucide-react';

export function PeersView() {
  const { currentUser, isHost, members, loadMembers } = useAuth();
  const toast = useToast();
  const [pendingMembers, setPendingMembers] = useState([]);
  const [tasklets, setTasklets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTaskletModalOpen, setIsTaskletModalOpen] = useState(false);
  const [rejectMemberId, setRejectMemberId] = useState(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editTrack, setEditTrack] = useState('backend');
  const [approvalTracks, setApprovalTracks] = useState({});
  const [isConfirmTransferOpen, setIsConfirmTransferOpen] = useState(false);

  // Onboard form (Google email first!)
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState('Frontend Engineer');
  const [track, setTrack] = useState('frontend');

  // Transfer form
  const [targetHostId, setTargetHostId] = useState('');
  const [outgoingRole, setOutgoingRole] = useState('Software Engineer');
  const [outgoingTrack, setOutgoingTrack] = useState('backend');

  // Tasklet form
  const [taskletReceiverId, setTaskletReceiverId] = useState('');
  const [taskletTitle, setTaskletTitle] = useState('');
  const [taskletDesc, setTaskletDesc] = useState('');

  const loadPeersData = async () => {
    try {
      await loadMembers();
      if (isHost) {
        try {
          const pRes = await api.getPendingMembers();
          if (pRes && pRes.pending) setPendingMembers(pRes.pending);
        } catch (_) { }
      }
      try {
        const tRes = await api.getTasklets();
        if (tRes && tRes.tasklets) setTasklets(tRes.tasklets);
      } catch (_) { }
    } catch (e) {
      console.error('Failed to load peers data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeersData();
  }, [isHost]);

  const handleOnboard = async (e) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    try {
      await api.onboardMember({
        email: email.trim(),
        name: name.trim(),
        handle: handle.trim() || email.split('@')[0],
        role: role.trim(),
        team_track: track
      });
      setIsOnboardModalOpen(false);
      setEmail('');
      setName('');
      setHandle('');
      toast.success('Member onboarded successfully');
      await loadPeersData();
    } catch (err) {
      toast.error(`Onboarding failed: ${err.message}`);
    }
  };

  const handleApprove = async (memberId) => {
    const selectedTrack = approvalTracks[memberId] || 'backend';
    const assignedRole = selectedTrack === 'frontend' ? 'Frontend Engineer' : 'Backend Engineer';
    try {
      await api.approveMember(memberId, assignedRole, selectedTrack);
      toast.success('Access request approved');
      await loadPeersData();
    } catch (err) {
      toast.error(`Approval failed: ${err.message}`);
    }
  };

  const executeRemoveMember = async () => {
    if (!removeMemberTarget) return;
    try {
      await api.removeMember(removeMemberTarget.id);
      toast.info(`Removed ${removeMemberTarget.name}`);
      await loadPeersData();
    } catch (err) {
      toast.error(`Removal failed: ${err.message}`);
    } finally {
      setRemoveMemberTarget(null);
    }
  };

  const executeReject = async () => {
    if (!rejectMemberId) return;
    try {
      await api.rejectMember(rejectMemberId);
      toast.info('Access request rejected');
      await loadPeersData();
    } catch (err) {
      toast.error(`Rejection failed: ${err.message}`);
    } finally {
      setRejectMemberId(null);
    }
  };

  const executeTransferAuthority = async () => {
    if (!targetHostId) return;

    try {
      await api.transferHost(parseInt(targetHostId, 10), outgoingRole.trim(), outgoingTrack);
      setIsTransferModalOpen(false);
      toast.success('Authority transferred');
      window.location.reload();
    } catch (err) {
      toast.error(`Authority transfer failed: ${err.message}`);
    }
  };

  const handleOpenEditMember = (m) => {
    setEditingMember(m);
    setEditRole(m.role || '');
    setEditTrack(m.team_track || 'backend');
  };

  const handleSaveEditMember = async (e) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      await api.updateMember(editingMember.id, { role: editRole.trim(), team_track: editTrack });
      setEditingMember(null);
      toast.success(`Updated ${editingMember.name}'s role`);
      await loadPeersData();
    } catch (err) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  const handleDeleteTasklet = async (taskletId) => {
    try {
      await api.deleteTasklet(taskletId);
      toast.info('Tasklet deleted');
      await loadPeersData();
    } catch (err) {
      toast.error(`Failed to delete tasklet: ${err.message}`);
    }
  };

  const handleSendTasklet = async (e) => {
    e.preventDefault();
    if (!taskletReceiverId || !taskletTitle.trim()) return;

    try {
      await api.createTasklet({
        receiver_id: parseInt(taskletReceiverId, 10),
        title: taskletTitle.trim(),
        description: taskletDesc.trim()
      });
      setIsTaskletModalOpen(false);
      setTaskletTitle('');
      setTaskletDesc('');
      toast.success('Tasklet dispatched');
      await loadPeersData();
    } catch (err) {
      toast.error(`Failed to send tasklet: ${err.message}`);
    }
  };

  const handleToggleTasklet = async (taskletId, currentStatus) => {
    const nextStatus = currentStatus === 'DONE' ? 'PENDING' : 'DONE';
    try {
      await api.updateTasklet(taskletId, nextStatus);
      toast.info(`Tasklet marked as ${nextStatus.toLowerCase()}`);
      await loadPeersData();
    } catch (err) {
      toast.error(`Failed to update tasklet: ${err.message}`);
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h2>Team Directory</h2>
          <p>Teammate directory, roles, and peer tasklets</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setIsTaskletModalOpen(true)}>
            <Send size={15} /> Send Peer Tasklet
          </button>

          {isHost && (
            <>
              <button className="btn btn-secondary" onClick={() => setIsTransferModalOpen(true)}>
                <ArrowRightLeft size={15} /> Transfer Lead
              </button>
              <button className="btn btn-primary" onClick={() => setIsOnboardModalOpen(true)}>
                <UserPlus size={15} /> Onboard Member
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading team...</div>
      ) : (
        <>
          {/* Pending Access Requests (Host Only) */}
          {isHost && pendingMembers.length > 0 && (
            <div className="card" style={{ border: '1px solid var(--google-amber)' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--google-amber)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <ShieldAlert size={16} /> Pending Access Requests ({pendingMembers.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pendingMembers.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{m.email || `@${m.handle}`}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        className="form-select"
                        style={{ padding: '4px 8px', fontSize: '0.76rem', width: 'auto' }}
                        value={approvalTracks[m.id] || 'backend'}
                        onChange={e => setApprovalTracks(prev => ({ ...prev, [m.id]: e.target.value }))}
                      >
                        <option value="backend">Backend</option>
                        <option value="frontend">Frontend</option>
                      </select>
                      <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => handleApprove(m.id)}>
                        Approve
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.76rem', color: 'var(--google-red)' }} onClick={() => setRejectMemberId(m.id)}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Members Grid */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Authorized Team Members</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              {members.map(m => (
                <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.96rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{m.name}</span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{m.email || `@${m.handle}`}</div>
                    </div>
                    {m.is_host === 1 ? (
                      <span className="track-tag track-lead">LEAD</span>
                    ) : (
                      <span className={`track-tag track-${(m.team_track === 'lead' ? 'backend' : m.team_track) || 'backend'}`}>
                        {(m.team_track === 'lead' ? 'backend' : m.team_track) || 'dev'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{m.role}</span>
                    {isHost && (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button
                          className="btn-icon"
                          style={{ padding: '4px' }}
                          title={`Edit ${m.name}'s role`}
                          aria-label={`Edit ${m.name}'s role`}
                          onClick={() => handleOpenEditMember(m)}
                        >
                          <Pencil size={13} />
                        </button>
                        {m.id !== currentUser?.id && (
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--google-red)', padding: '4px' }}
                            title={`Remove ${m.name}`}
                            aria-label={`Remove ${m.name}`}
                            onClick={() => setRemoveMemberTarget(m)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Peer Tasklets Feed */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} style={{ color: 'var(--google-blue)' }} /> Peer Tasklets
            </h3>

            <div className="card table-scroll-wrap" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Tasklet</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tasklets.map(t => (
                    <tr key={t.id}>
                      <td>
                        <span className={`track-tag ${t.status === 'DONE' ? 'track-backend' : 'track-lead'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        {t.description && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{t.description}</div>}
                      </td>
                      <td>@{t.sender_name || t.sender_handle}</td>
                      <td>@{t.receiver_name || t.receiver_handle}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                            onClick={() => handleToggleTasklet(t.id, t.status)}
                          >
                            {t.status === 'DONE' ? 'Reopen' : 'Mark Done'}
                          </button>
                          {(isHost || t.sender_id === currentUser?.id || t.receiver_id === currentUser?.id) && (
                            <button
                              className="btn-icon"
                              style={{ color: 'var(--google-red)', padding: '4px' }}
                              title="Delete tasklet"
                              aria-label="Delete tasklet"
                              onClick={() => handleDeleteTasklet(t.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tasklets.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        No micro-tasklets dispatched yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Onboard Member Modal */}
      <Modal
        isOpen={isOnboardModalOpen}
        onClose={() => setIsOnboardModalOpen(false)}
        title="Onboard Team Member (Host Only)"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsOnboardModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleOnboard}>Authorize Member</button>
          </>
        }
      >
        <form onSubmit={handleOnboard} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Google Account Email *</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="teammate@gmail.com"
              required
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Full Name *</label>
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>

            <div className="form-group">
              <label>Username / Handle</label>
              <input
                className="form-input"
                value={handle}
                onChange={e => setHandle(e.target.value)}
                placeholder="janedoe"
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Role</label>
              <input
                className="form-input"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Frontend Engineer"
              />
            </div>

            <div className="form-group">
              <label>Team Track</label>
              <select className="form-select" value={track} onChange={e => setTrack(e.target.value)}>
                <option value="frontend">Frontend</option>
                <option value="backend">Backend</option>
                <option value="lead">Lead</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Transfer Authority Modal */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Transfer Team Host Authority"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsTransferModalOpen(false)}>Cancel</button>
            <button
              className="btn btn-danger"
              disabled={!targetHostId}
              onClick={() => {
                if (targetHostId) setIsConfirmTransferOpen(true);
              }}
            >
              Transfer Authority
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Transferring Host authority will immediately surrender your administrative privileges and assign them to the selected teammate.
          </div>

          <div className="form-group">
            <label>Select Successor *</label>
            <select
              className="form-select"
              value={targetHostId}
              onChange={e => setTargetHostId(e.target.value)}
              required
            >
              <option value="">Select teammate...</option>
              {members.filter(m => m.id !== currentUser?.id).map(m => (
                <option key={m.id} value={m.id}>{m.name} (@{m.handle}) - {m.role}</option>
              ))}
            </select>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Your New Role</label>
              <input
                className="form-input"
                value={outgoingRole}
                onChange={e => setOutgoingRole(e.target.value)}
                placeholder="e.g. Staff Architect"
              />
            </div>
            <div className="form-group">
              <label>Your New Track</label>
              <select className="form-select" value={outgoingTrack} onChange={e => setOutgoingTrack(e.target.value)}>
                <option value="backend">Backend</option>
                <option value="frontend">Frontend</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit Member Role & Track Modal */}
      <Modal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Edit Role: ${editingMember?.name || ''}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditingMember(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveEditMember}>Save Changes</button>
          </>
        }
      >
        <form onSubmit={handleSaveEditMember} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Role Title *</label>
            <input
              className="form-input"
              value={editRole}
              onChange={e => setEditRole(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Team Track</label>
            <select className="form-select" value={editTrack} onChange={e => setEditTrack(e.target.value)}>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="lead">Lead</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Send Tasklet Modal */}
      <Modal
        isOpen={isTaskletModalOpen}
        onClose={() => setIsTaskletModalOpen(false)}
        title="Send Peer Tasklet"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsTaskletModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSendTasklet}>Send Tasklet</button>
          </>
        }
      >
        <form onSubmit={handleSendTasklet} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Recipient *</label>
            <select
              className="form-select"
              value={taskletReceiverId}
              onChange={e => setTaskletReceiverId(e.target.value)}
              required
            >
              <option value="">Choose peer...</option>
              {members.filter(m => m.id !== currentUser?.id).map(m => (
                <option key={m.id} value={m.id}>{m.name} (@{m.handle})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Tasklet Title *</label>
            <input
              className="form-input"
              value={taskletTitle}
              onChange={e => setTaskletTitle(e.target.value)}
              placeholder="e.g. Please review my PR on votingRoutes"
              required
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={taskletDesc}
              onChange={e => setTaskletDesc(e.target.value)}
              placeholder="Add context or link..."
            />
          </div>
        </form>
      </Modal>

      {/* Reject Access Request Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(rejectMemberId)}
        onClose={() => setRejectMemberId(null)}
        onConfirm={executeReject}
        title="Reject Access Request"
        message="Are you sure you want to reject and purge this access request?"
        confirmText="Reject Request"
        isDestructive={true}
      />

      {/* Remove Member Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(removeMemberTarget)}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={executeRemoveMember}
        title="Remove Team Member"
        message={`Permanently remove ${removeMemberTarget?.name} (@${removeMemberTarget?.handle}) from the Frontier AI allowlist?`}
        confirmText="Remove Member"
        isDestructive={true}
      />

      {/* Transfer Authority Confirm Modal */}
      <ConfirmModal
        isOpen={isConfirmTransferOpen}
        onClose={() => setIsConfirmTransferOpen(false)}
        onConfirm={executeTransferAuthority}
        title="Confirm Leadership Transfer"
        message="Are you sure you want to permanently transfer Host privileges to this member? You will become a regular contributor."
        confirmText="Transfer Leadership"
        isDestructive={true}
      />
    </div>
  );
}
