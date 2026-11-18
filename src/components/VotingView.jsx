import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { Vote, Key, CheckCircle, Shield, Lock, RotateCcw, Plus, Star, Users, CheckSquare, Award } from 'lucide-react';

export function VotingView() {
  const { isHost, members } = useAuth();
  const toast = useToast();
  const [sessionData, setSessionData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlinkedToken, setUnlinkedToken] = useState(null);
  const [tokenMsg, setTokenMsg] = useState('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  // Launch Form State
  // Mode: 'TEAM_MEMBER' (peer performance) or 'ACCOMPLISHED_TASK' (review completed task)
  const [launchMode, setLaunchMode] = useState('TEAM_MEMBER');
  const [launchTargetMember, setLaunchTargetMember] = useState('');
  const [launchTargetTask, setLaunchTargetTask] = useState('');
  const [launchTitle, setLaunchTitle] = useState('');
  const [launchDesc, setLaunchDesc] = useState('');
  const [launchSubmitting, setLaunchSubmitting] = useState(false);

  // Voting ballot state
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);

  const loadVoting = async () => {
    try {
      const res = await api.getVotingCurrent();
      setSessionData(res);
      if (res?.candidates && res.candidates.length > 0) {
        setSelectedCandidate(String(res.candidates[0].id));
      }
    } catch (e) {
      console.error('Failed to load voting data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      const res = await api.getTasks();
      if (res && res.tasks) {
        setTasks(res.tasks);
      }
    } catch (e) {
      console.warn('Failed to load tasks for voting review:', e);
    }
  };

  useEffect(() => {
    loadVoting();
    loadTasks();
  }, []);

  const handleClaimToken = async () => {
    if (!sessionData?.session?.id) return;
    try {
      const res = await api.claimBallotToken(sessionData.session.id);
      if (res && res.token) {
        setUnlinkedToken(res.token);
        setTokenMsg('Anonymous voting token issued. Your identity is unlinked from your ballot.');
        toast.info('Anonymous token issued');
      }
    } catch (err) {
      toast.error(`Could not claim token: ${err.message}`);
    }
  };

  const handleCastVote = async (e) => {
    e.preventDefault();
    if (!unlinkedToken || !selectedCandidate) {
      toast.error('Please choose a target option and claim a voting token.');
      return;
    }

    setSubmitting(true);
    try {
      const candidateId = parseInt(selectedCandidate, 10);
      await api.castBallot({
        session_id: sessionData.session.id,
        token: unlinkedToken,
        option_id: candidateId,
        candidate_id: candidateId,
        candidate_member_id: candidateId,
        rating: parseInt(rating, 10)
      });
      setVoteSuccess(true);
      setUnlinkedToken(null);
      toast.success('Ballot deposited successfully');
      await loadVoting();
    } catch (err) {
      toast.error(`Vote failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const executeCloseSession = async () => {
    if (!sessionData?.session?.id) return;
    try {
      await api.closeVotingSession(sessionData.session.id);
      setIsCloseModalOpen(false);
      toast.success('Review round closed. Results published.');
      await loadVoting();
    } catch (err) {
      toast.error(`Error closing session: ${err.message}`);
    }
  };

  const handleReopenSession = async () => {
    if (!sessionData?.session?.id) return;
    try {
      await api.reopenVotingSession(sessionData.session.id);
      toast.success('Review round reopened.');
      await loadVoting();
    } catch (err) {
      toast.error(`Error reopening session: ${err.message}`);
    }
  };

  const handleLaunchSession = async (e) => {
    e.preventDefault();
    setLaunchSubmitting(true);

    try {
      let finalTitle = launchTitle.trim();
      let finalDesc = launchDesc.trim();
      let sessionType = 'PEER_PERFORMANCE';
      let targetMemberId = null;
      let options = [];

      if (launchMode === 'TEAM_MEMBER') {
        sessionType = 'PEER_PERFORMANCE';
        targetMemberId = launchTargetMember ? parseInt(launchTargetMember, 10) : null;
        if (!finalTitle) {
          if (targetMemberId) {
            const m = members.find(x => x.id === targetMemberId);
            finalTitle = `Performance Review: ${m?.name || 'Team Member'}`;
          } else {
            finalTitle = 'Team-Wide Peer Performance Review';
          }
        }
        if (!finalDesc) {
          finalDesc = 'Anonymous peer performance evaluation on code quality, collaboration, and execution.';
        }
      } else {
        // ACCOMPLISHED_TASK
        sessionType = 'PROJECT_QUALITY';
        const taskObj = tasks.find(t => String(t.id) === String(launchTargetTask));
        if (!finalTitle) {
          finalTitle = taskObj ? `Deliverable Review: ${taskObj.title}` : 'Accomplished Task Review';
        }
        if (!finalDesc) {
          finalDesc = taskObj ? (taskObj.description || 'Sprint task deliverable quality evaluation.') : 'Task quality review.';
        }
        options = [
          'Implementation & Code Architecture',
          'Feature Completeness & Accuracy',
          'UI Polish & Responsiveness',
          'Reliability & Edge Case Handling'
        ];
      }

      await api.createVotingSession({
        session_type: sessionType,
        title: finalTitle,
        description: finalDesc,
        target_member_id: targetMemberId,
        options: options.length > 0 ? options : undefined
      });

      toast.success('Review session launched!');
      setIsLaunchModalOpen(false);
      setLaunchTitle('');
      setLaunchDesc('');
      setLaunchTargetMember('');
      setLaunchTargetTask('');
      setVoteSuccess(false);
      setUnlinkedToken(null);
      await loadVoting();
    } catch (err) {
      toast.error(`Failed to launch session: ${err.message}`);
    } finally {
      setLaunchSubmitting(false);
    }
  };

  const session = sessionData?.session;
  const candidates = sessionData?.candidates || [];
  const tally = sessionData?.tally || [];

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <h2>Peer Review & Consensus</h2>
          <p>Anonymous peer feedback on engineer performance and completed project deliverables</p>
        </div>

        {/* Lead-Only Action Controls */}
        {isHost && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={() => setIsLaunchModalOpen(true)}>
              <Plus size={16} /> Host Review Round
            </button>

            {session?.status === 'ACTIVE' && (
              <button className="btn btn-secondary" onClick={() => setIsCloseModalOpen(true)}>
                <Lock size={16} /> Close & Reveal Tally
              </button>
            )}

            {session?.status === 'CLOSED' && (
              <button className="btn btn-secondary" onClick={handleReopenSession}>
                <RotateCcw size={16} /> Reopen Round
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading review booth...
        </div>
      ) : !session ? (
        /* ======================================================================
           STATE 1: NO ACTIVE VOTING SESSION
           ====================================================================== */
        isHost ? (
          /* LEAD VIEW WHEN NO ROUND IS ACTIVE: HOST OPTIONS CARDS */
          <div style={{ maxWidth: '820px', margin: '16px auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
              <Vote size={40} style={{ color: 'var(--google-blue)', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>No Review Round In Progress</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '6px 0 0', lineHeight: 1.5 }}>
                As Team Lead, choose an evaluation format below to initiate an anonymous consensus round.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Option A: Review Team Members */}
              <div
                className="card"
                onClick={() => { setLaunchMode('TEAM_MEMBER'); setIsLaunchModalOpen(true); }}
                style={{
                  cursor: 'pointer',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.18s ease',
                  border: '1px solid var(--border-subtle)'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--google-blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--google-blue-container)', color: 'var(--google-blue-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 4px' }}>Review Team Members</h4>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    Launch anonymous performance evaluation for a specific contributor or evaluate the entire engineering team.
                  </p>
                </div>
                <button className="btn btn-secondary" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
                  <Plus size={14} /> Configure Peer Review
                </button>
              </div>

              {/* Option B: Review Accomplished Tasks */}
              <div
                className="card"
                onClick={() => { setLaunchMode('ACCOMPLISHED_TASK'); setIsLaunchModalOpen(true); }}
                style={{
                  cursor: 'pointer',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.18s ease',
                  border: '1px solid var(--border-subtle)'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--google-green)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--google-green-container)', color: 'var(--google-green-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckSquare size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 4px' }}>Review Accomplished Task</h4>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    Select a completed sprint task or deliverable PR and have the team grade its architecture, accuracy, and polish.
                  </p>
                </div>
                <button className="btn btn-secondary" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
                  <Plus size={14} /> Configure Task Review
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* REGULAR TEAM MEMBER VIEW WHEN NO ROUND IS ACTIVE: CLEAN, ZERO ACTION CARD */
          <div className="card" style={{ textAlign: 'center', padding: '56px 24px', maxWidth: '580px', margin: '30px auto' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg-surface-elevated)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Shield size={28} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>No Active Voting Session</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '8px auto 16px', lineHeight: 1.5, maxWidth: '420px' }}>
              There are currently no active peer review rounds open for submission.
              Check back when the Team Lead initiates a performance or deliverable consensus round.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-surface-elevated)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)' }}></span>
              Voting Booth Idle
            </div>
          </div>
        )
      ) : (
        /* ======================================================================
           STATE 2: VOTING SESSION ACTIVE OR RECENTLY CLOSED
           ====================================================================== */
        <div style={{ display: 'grid', gridTemplateColumns: session.status === 'ACTIVE' ? '1fr 1fr' : '1fr', gap: '20px' }}>
          {/* Active Ballot Box (Visible to ALL approved members) */}
          {session.status === 'ACTIVE' && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span className="track-tag track-backend" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {session.session_type === 'PEER_PERFORMANCE' ? 'Peer Performance' : 'Deliverable Review'}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--google-green)', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--google-green)' }}></span> Round Open
                </span>
              </div>

              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{session.title}</h3>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '6px 0 18px', lineHeight: 1.45 }}>{session.description}</p>

              {/* Step 1: Claim unlinked blind token */}
              {!unlinkedToken && !voteSuccess && (
                <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '20px', textAlign: 'center' }}>
                  <Shield size={28} style={{ color: 'var(--google-blue)', margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.94rem' }}>Claim Voting Token</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '6px 0 16px', lineHeight: 1.4 }}>
                    Your session is verified for eligibility and stamped with a blind token.
                    The ballot ledger retains zero identity linkage.
                  </div>
                  <button className="btn btn-primary" onClick={handleClaimToken} style={{ margin: '0 auto' }}>
                    <Key size={15} /> Claim Anonymous Token
                  </button>
                </div>
              )}

              {/* Step 2: Cast vote */}
              {unlinkedToken && !voteSuccess && (
                <form onSubmit={handleCastVote} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ background: 'var(--google-green-container)', color: 'var(--google-green-text)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={15} />
                    <span>{tokenMsg}</span>
                  </div>

                  <div className="form-group">
                    <label>Choose Evaluation Option / Pillar *</label>
                    <select
                      className="form-select"
                      value={selectedCandidate}
                      onChange={e => setSelectedCandidate(e.target.value)}
                      required
                    >
                      <option value="">Select option...</option>
                      {candidates.map(c => (
                        <option key={c.id} value={c.id}>{c.name || c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ margin: 0 }}>Rating (1 to 5 Stars)</label>
                      <span style={{ fontWeight: 600, color: 'var(--google-amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={14} fill="currentColor" /> {rating} / 5
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={rating}
                      onChange={e => setRating(e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--google-blue)' }}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: '4px' }}>
                    {submitting ? 'Encrypting & Depositing...' : 'Deposit Anonymous Ballot'}
                  </button>
                </form>
              )}

              {/* Step 3: Success Confirmation */}
              {voteSuccess && (
                <div style={{ background: 'var(--google-green-container)', color: 'var(--google-green-text)', padding: '24px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <CheckCircle size={36} style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>Ballot Deposited!</div>
                  <div style={{ fontSize: '0.82rem', marginTop: '6px', lineHeight: 1.4 }}>
                    Your vote has been cryptographically secured in the anonymous ballot ledger.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results / Status Card */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '14px' }}>
              {session.status === 'CLOSED' ? 'Final Consensus Tally' : 'Session Progress & Status'}
            </h3>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px 18px', borderRadius: 'var(--radius-md)', flex: 1 }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ballots Deposited</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: 'var(--google-blue)' }}>
                  {sessionData.totalBallots || 0} / {sessionData.totalEligible || 0}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px 18px', borderRadius: 'var(--radius-md)', flex: 1 }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 600, marginTop: '8px', color: session.status === 'ACTIVE' ? 'var(--google-green)' : 'var(--google-amber)' }}>
                  {session.status === 'ACTIVE' ? 'Active / In Progress' : 'Closed & Tallied'}
                </div>
              </div>
            </div>

            {tally.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tally.map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', fontWeight: 500 }}>
                      <span>{item.name || item.label || `Option #${idx + 1}`}</span>
                      <span style={{ color: 'var(--google-amber)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={14} fill="currentColor" /> {Number(item.avg_rating || 0).toFixed(1)} / 5.0
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {item.count} {item.count === 1 ? 'ballot' : 'ballots'} cast
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                Individual ballots remain cryptographically sealed until round closure by the Team Lead.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================
         HOST LAUNCH MODAL (TEAM LEAD EXCLUSIVE)
         ====================================================================== */}
      {isHost && (
        <Modal
          isOpen={isLaunchModalOpen}
          onClose={() => setIsLaunchModalOpen(false)}
          title="Host Consensus Review Round"
        >
          <form onSubmit={handleLaunchSession} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Review Target Category *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  className={`btn ${launchMode === 'TEAM_MEMBER' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setLaunchMode('TEAM_MEMBER')}
                  style={{ justifyContent: 'center' }}
                >
                  <Users size={16} /> Team Members
                </button>
                <button
                  type="button"
                  className={`btn ${launchMode === 'ACCOMPLISHED_TASK' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setLaunchMode('ACCOMPLISHED_TASK')}
                  style={{ justifyContent: 'center' }}
                >
                  <CheckSquare size={16} /> Accomplished Task
                </button>
              </div>
            </div>

            {/* Mode A: Select Target Member */}
            {launchMode === 'TEAM_MEMBER' && (
              <div className="form-group">
                <label>Target Contributor (Optional)</label>
                <select
                  className="form-select"
                  value={launchTargetMember}
                  onChange={e => setLaunchTargetMember(e.target.value)}
                >
                  <option value="">Evaluate Entire Engineering Team</option>
                  {members.filter(m => m.is_allowed === 1).map(m => (
                    <option key={m.id} value={m.id}>{m.name} (@{m.handle}) — {m.role}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Leave blank to allow members to evaluate all peers across the team.
                </span>
              </div>
            )}

            {/* Mode B: Select Accomplished Task */}
            {launchMode === 'ACCOMPLISHED_TASK' && (
              <div className="form-group">
                <label>Select Completed Task / Deliverable *</label>
                <select
                  className="form-select"
                  value={launchTargetTask}
                  onChange={e => {
                    setLaunchTargetTask(e.target.value);
                    const t = tasks.find(x => String(x.id) === e.target.value);
                    if (t) {
                      setLaunchTitle(`Deliverable Review: ${t.title}`);
                      setLaunchDesc(t.description || '');
                    }
                  }}
                  required={launchMode === 'ACCOMPLISHED_TASK'}
                >
                  <option value="">Choose task to evaluate...</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>
                      Task #{t.id}: {t.title} [{t.status}]
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Review Round Title *</label>
              <input
                className="form-input"
                value={launchTitle}
                onChange={e => setLaunchTitle(e.target.value)}
                placeholder={launchMode === 'TEAM_MEMBER' ? 'Sprint 4 Peer Performance Review' : 'Deliverable Review: Architecture & CI'}
                required
              />
            </div>

            <div className="form-group">
              <label>Guidelines / Evaluation Criteria</label>
              <textarea
                className="form-textarea"
                value={launchDesc}
                onChange={e => setLaunchDesc(e.target.value)}
                placeholder="Specify focus areas for this consensus evaluation..."
                rows={3}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsLaunchModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={launchSubmitting}>
                {launchSubmitting ? 'Launching...' : 'Launch Consensus Round'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Close Round Confirmation Modal (Lead Only) */}
      {isHost && (
        <ConfirmModal
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onConfirm={executeCloseSession}
          title="Close Review Round"
          message="Closing this round will finalize all votes and calculate public tallies. This action cannot be undone."
          confirmText="Close & Reveal"
          isDestructive={true}
        />
      )}
    </div>
  );
}
