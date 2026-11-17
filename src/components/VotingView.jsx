import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmModal } from './ConfirmModal';
import { Vote, Key, CheckCircle, Shield, Lock } from 'lucide-react';

export function VotingView() {
  const { isHost } = useAuth();
  const toast = useToast();
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlinkedToken, setUnlinkedToken] = useState(null);
  const [tokenMsg, setTokenMsg] = useState('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Voting state
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);

  const loadVoting = async () => {
    try {
      const res = await api.getVotingCurrent();
      setSessionData(res);
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
        setTokenMsg('Voting token claimed. Your ballot is unlinked from your account.');
        toast.info('Anonymous token issued');
      }
    } catch (err) {
      toast.error(`Could not claim token: ${err.message}`);
    }
  };

  const handleCastVote = async (e) => {
    e.preventDefault();
    if (!unlinkedToken || !selectedCandidate) return;

    setSubmitting(true);
    try {
      await api.castBallot({
        session_id: sessionData.session.id,
        token: unlinkedToken,
        candidate_member_id: parseInt(selectedCandidate, 10),
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
      toast.success('Review round closed. Results published.');
      await loadVoting();
    } catch (err) {
      toast.error(`Error closing session: ${err.message}`);
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

        {isHost && session?.status === 'ACTIVE' && (
          <button className="btn btn-secondary" onClick={() => setIsCloseModalOpen(true)}>
            <Lock size={16} /> Close Round & Reveal Tally
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading peer review booth...</div>
      ) : !session ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <Vote size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <h3>No Active Voting Session</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px' }}>
            There are currently no active peer review rounds open for submission.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: session.status === 'ACTIVE' ? '1fr 1fr' : '1fr', gap: '20px' }}>
          {/* Active Ballot Box */}
          {session.status === 'ACTIVE' && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span className="track-tag track-backend">{session.session_type}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--google-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--google-green)' }}></span> Round Open
                </span>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{session.title}</h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '6px 0 16px' }}>{session.description}</p>

              {/* Step 1: Claim unlinked blind token */}
              {!unlinkedToken && !voteSuccess && (
                <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
                  <Shield size={24} style={{ color: 'var(--google-blue)', margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Claim Voting Token</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 14px' }}>
                    Authorizes your ballot without linking it to your account.
                  </div>
                  <button className="btn btn-primary" onClick={handleClaimToken} style={{ margin: '0 auto' }}>
                    <Key size={14} /> Claim Token
                  </button>
                </div>
              )}

              {/* Step 2: Cast vote */}
              {unlinkedToken && !voteSuccess && (
                <form onSubmit={handleCastVote} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: 'var(--google-green-container)', color: 'var(--google-green-text)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={14} />
                    <span>{tokenMsg}</span>
                  </div>

                  <div className="form-group">
                    <label>Select Candidate / Category *</label>
                    <select
                      className="form-select"
                      value={selectedCandidate}
                      onChange={e => setSelectedCandidate(e.target.value)}
                      required
                    >
                      <option value="">Choose peer...</option>
                      {candidates.map(c => (
                        <option key={c.id} value={c.id}>{c.name || c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Performance Rating (1 to 5 Stars): {rating} / 5</label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={rating}
                      onChange={e => setRating(e.target.value)}
                      style={{ accentColor: 'var(--google-blue)' }}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: '6px' }}>
                    {submitting ? 'Encrypting & Depositing...' : 'Deposit Anonymous Ballot'}
                  </button>
                </form>
              )}

              {voteSuccess && (
                <div style={{ background: 'var(--google-green-container)', color: 'var(--google-green-text)', padding: '20px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <CheckCircle size={32} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 600 }}>Ballot Deposited!</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    Your vote has been cryptographically secured in the anonymous ballot ledger.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results & Tallies */}
          <div className="card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '14px' }}>
              {session.status === 'CLOSED' ? 'Final Consensus Tally' : 'Session Progress & Status'}
            </h3>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)', flex: 1 }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ballots Deposited</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '4px', color: 'var(--google-blue)' }}>
                  {sessionData.totalBallots} / {sessionData.totalEligible}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)', flex: 1 }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Anonymity</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, marginTop: '8px', color: 'var(--google-green)' }}>
                  Enforced
                </div>
              </div>
            </div>

            {tally.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tally.map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', fontWeight: 500 }}>
                      <span>{item.name || item.label || `Option #${idx + 1}`}</span>
                      <span style={{ color: 'var(--google-amber)', fontWeight: 600 }}>{Number(item.avg_rating || 0).toFixed(1)} / 5.0</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.count} votes cast
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                Individual ballots remain sealed until round closure.
              </div>
            )}
          </div>
        </div>
      )}

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
