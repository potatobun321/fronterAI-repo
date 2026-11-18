import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { Vote, Key, CheckCircle, Shield, Lock, RotateCcw, Plus, Star } from 'lucide-react';

export function VotingView() {
  const { isHost, members } = useAuth();
  const toast = useToast();
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlinkedToken, setUnlinkedToken] = useState(null);
  const [tokenMsg, setTokenMsg] = useState('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  // Launch modal form state
  const [launchType, setLaunchType] = useState('PEER_PERFORMANCE');
  const [launchTitle, setLaunchTitle] = useState('');
  const [launchDesc, setLaunchDesc] = useState('');
  const [launchTargetMember, setLaunchTargetMember] = useState('');
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
      // Pre-select first candidate if options exist
      if (res?.candidates && res.candidates.length > 0) {
        setSelectedCandidate(String(res.candidates[0].id));
      }
    } catch (e) {
      console.error('Failed to load voting data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVoting();
  }, []);

  const handleClaimToken = async () => {
    if (!sessionData?.session?.id) return;
    try {
      const res = await api.claimBallotToken(sessionData.session.id);
      if (res && res.token) {
        setUnlinkedToken(res.token);
        setTokenMsg('Voting token claimed. Your ballot is cryptographically unlinked from your account.');
        toast.info('Anonymous token issued');
      }
    } catch (err) {
      toast.error(`Could not claim token: ${err.message}`);
    }
  };

  const handleCastVote = async (e) => {
    e.preventDefault();
    if (!unlinkedToken || !selectedCandidate) {
      toast.error('Please choose an evaluation target and claim a voting token.');
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
      const payload = {
        session_type: launchType,
        title: launchTitle || (launchType === 'PEER_PERFORMANCE' ? 'Peer Performance Review' : 'Sprint Quality Review'),
        description: launchDesc || (launchType === 'PEER_PERFORMANCE' ? 'Anonymous peer performance evaluation.' : 'Sprint quality and technical review.'),
        target_member_id: launchType === 'PEER_PERFORMANCE' && launchTargetMember ? parseInt(launchTargetMember, 10) : null
      };

      await api.createVotingSession(payload);
      toast.success('Review session launched!');
      setIsLaunchModalOpen(false);
      setLaunchTitle('');
      setLaunchDesc('');
      setLaunchTargetMember('');
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
      <div className="view-header">
        <div className="view-title-group">
          <h2>Peer Review</h2>
          <p>Anonymous performance feedback and consensus evaluations</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isHost && (
            <button className="btn btn-primary" onClick={() => setIsLaunchModalOpen(true)}>
              <Plus size={16} /> Launch New Round
            </button>
          )}

          {isHost && session?.status === 'ACTIVE' && (
            <button className="btn btn-secondary" onClick={() => setIsCloseModalOpen(true)}>
              <Lock size={16} /> Close & Reveal Tally
            </button>
          )}

          {isHost && session?.status === 'CLOSED' && (
            <button className="btn btn-secondary" onClick={handleReopenSession}>
              <RotateCcw size={16} /> Reopen Round
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading peer review booth...</div>
      ) : !session ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', maxWidth: '600px', margin: '20px auto' }}>
          <Vote size={42} style={{ color: 'var(--google-blue)', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>No Active Voting Session</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '8px 0 20px', lineHeight: 1.5 }}>
            There are currently no active peer review rounds open for submission.
            {isHost ? ' As Team Lead, you can launch an anonymous performance review or quality assessment below.' : ' Check back once the Team Lead initiates a review round.'}
          </p>
          {isHost && (
            <button className="btn btn-primary" onClick={() => setIsLaunchModalOpen(true)} style={{ margin: '0 auto' }}>
              <Plus size={16} /> Launch Review Round
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: session.status === 'ACTIVE' ? '1fr 1fr' : '1fr', gap: '20px' }}>
          {/* Active Ballot Box */}
          {session.status === 'ACTIVE' && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span className="track-tag track-backend">{session.session_type}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--google-green)', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--google-green)' }}></span> Round Open
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{session.title}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '6px 0 18px', lineHeight: 1.4 }}>{session.description}</p>

              {/* Step 1: Claim unlinked blind token */}
              {!unlinkedToken && !voteSuccess && (
                <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '20px', textAlign: 'center' }}>
                  <Shield size={28} style={{ color: 'var(--google-blue)', margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.94rem' }}>Claim Voting Token</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '6px 0 16px', lineHeight: 1.4 }}>
                    Your session is stamped for eligibility and issued a cryptographic token completely unlinked from your identity.
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
                    <label>Select Candidate / Evaluation Target *</label>
                    <select
                      className="form-select"
                      value={selectedCandidate}
                      onChange={e => setSelectedCandidate(e.target.value)}
                      required
                    >
                      <option value="">Choose evaluation target...</option>
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

          {/* Results & Tallies */}
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
                Individual ballots remain cryptographically sealed until round closure.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Launch New Review Round Modal */}
      <Modal
        isOpen={isLaunchModalOpen}
        onClose={() => setIsLaunchModalOpen(false)}
        title="Launch Review Session"
      >
        <form onSubmit={handleLaunchSession} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Review Type *</label>
            <select
              className="form-select"
              value={launchType}
              onChange={e => setLaunchType(e.target.value)}
              required
            >
              <option value="PEER_PERFORMANCE">Peer Performance Review</option>
              <option value="PROJECT_QUALITY">Sprint / Project Quality Review</option>
            </select>
          </div>

          <div className="form-group">
            <label>Session Title *</label>
            <input
              className="form-input"
              value={launchTitle}
              onChange={e => setLaunchTitle(e.target.value)}
              placeholder={launchType === 'PEER_PERFORMANCE' ? 'Sprint 4 Peer Review' : 'Sprint Quality Evaluation'}
              required
            />
          </div>

          <div className="form-group">
            <label>Description / Review Criteria</label>
            <textarea
              className="form-textarea"
              value={launchDesc}
              onChange={e => setLaunchDesc(e.target.value)}
              placeholder="Provide guidelines for peer rating..."
              rows={3}
            />
          </div>

          {launchType === 'PEER_PERFORMANCE' && (
            <div className="form-group">
              <label>Target Member (Leave blank to evaluate all peers)</label>
              <select
                className="form-select"
                value={launchTargetMember}
                onChange={e => setLaunchTargetMember(e.target.value)}
              >
                <option value="">Evaluate Entire Team</option>
                {members.filter(m => m.is_allowed === 1).map(m => (
                  <option key={m.id} value={m.id}>{m.name} (@{m.handle})</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsLaunchModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={launchSubmitting}>
              {launchSubmitting ? 'Launching...' : 'Launch Round'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Close Round Confirmation Modal */}
      <ConfirmModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        onConfirm={executeCloseSession}
        title="Close Review Round"
        message="Closing this round will finalize all votes and calculate public tallies. This action cannot be undone."
        confirmText="Close & Reveal"
        isDestructive={true}
      />
    </div>
  );
}
