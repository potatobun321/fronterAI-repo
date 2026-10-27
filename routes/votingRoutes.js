import { db, logAudit } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { parseBody, sendJson } from '../middleware/httpHelpers.js';
import { generateBallotToken, verifyBallotToken } from '../services/ballotCrypto.js';

export async function handleVotingRoutes(req, res, pathname, method, urlObj) {
  if (pathname === '/api/voting/current' && method === 'GET') {
    const currentUser = getSessionUser(req);
    const requestedId = parseInt(urlObj.searchParams.get('session_id') || '0', 10);
    
    let session = null;
    if (requestedId > 0) {
      session = db.prepare('SELECT * FROM voting_sessions WHERE id = ?').get(requestedId);
    }
    if (!session) {
      session = db.prepare("SELECT * FROM voting_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1").get() ||
                db.prepare('SELECT * FROM voting_sessions ORDER BY id DESC LIMIT 1').get();
    }

    const allSessions = db.prepare('SELECT id, title, description, session_type, status, target_member_id, created_at, closed_at FROM voting_sessions ORDER BY id DESC').all();

    if (!session) {
      return sendJson(res, 200, {
        session: null,
        active: false,
        hasClosedSession: allSessions.some(s => s.status === 'CLOSED'),
        allSessions,
        candidates: [],
        options: [],
        totalBallots: 0,
        totalEligible: 0,
        isRevealed: false,
        isHost: !!(currentUser && currentUser.is_host),
        tally: []
      });
    }

    const active = session.status === 'ACTIVE';
    const hasClosedSession = session.status === 'CLOSED' || allSessions.some(s => s.status === 'CLOSED');

    const allMembers = db.prepare('SELECT id, name, role, team_track, email, handle FROM members WHERE is_allowed = 1 ORDER BY id ASC').all();

    let targetMember = null;
    if (session.target_member_id) {
      targetMember = allMembers.find(m => m.id === session.target_member_id) ||
                     db.prepare('SELECT id, name, role, team_track, email, handle FROM members WHERE id = ?').get(session.target_member_id);
    }

    // Load options from voting_options table
    let sessionOptions = db.prepare('SELECT id, session_id, candidate_member_id, label FROM voting_options WHERE session_id = ?').all(session.id);

    const isProjectReview = session.session_type === 'PROJECT_QUALITY' || session.session_type === 'PROJECT_EXPERIENCE';

    let candidates = [];
    if (isProjectReview) {
      candidates = sessionOptions.length > 0 ? sessionOptions : [
        { id: 1, label: 'Team Dynamic & Working Collaboration' },
        { id: 2, label: 'Sprint Milestone Architecture & Execution' },
        { id: 3, label: 'Code Quality & Deliverable Reliability' },
        { id: 4, label: 'Overall Project Satisfaction' }
      ];
    } else if (targetMember) {
      candidates = [targetMember];
    } else {
      candidates = allMembers;
    }

    const eligibility = currentUser
      ? db.prepare('SELECT * FROM voting_eligibility WHERE session_id = ? AND member_id = ?').get(session.id, currentUser.id)
      : null;
    
    const totalBallots = db.prepare('SELECT COUNT(*) as count FROM ballots WHERE session_id = ?').get(session.id).count;
    const totalEligible = session.total_eligible || allMembers.length || 8;

    const isRevealed = totalBallots >= totalEligible || session.status === 'CLOSED';
    let tally = null;

    if (isRevealed || session.status === 'CLOSED') {
      if (isProjectReview) {
        // Project overall rating and pillar tallies
        const overallStats = db.prepare(`
          SELECT COUNT(*) as count, AVG(rating) as avg_rating
          FROM ballots WHERE session_id = ?
        `).get(session.id);

        tally = (candidates || []).map(cand => {
          const stats = db.prepare(`
            SELECT COUNT(*) as count, AVG(rating) as avg_rating
            FROM ballots 
            WHERE session_id = ? AND option_id = ?
          `).get(session.id, cand.id);

          return {
            id: cand.id,
            candidate_id: cand.id,
            candidate_name: cand.label || cand.name || 'Project Track',
            candidate_role: 'Project Review Dimension',
            team_track: 'milestone',
            total_ratings: stats?.count || (candidates.length === 1 ? overallStats?.count || 0 : 0),
            avg_rating: stats?.count ? (Math.round((stats.avg_rating || 0) * 10) / 10) : (overallStats?.count ? (Math.round((overallStats.avg_rating || 0) * 10) / 10) : 0)
          };
        });
      } else if (targetMember) {
        // Single target member evaluation round
        const stats = db.prepare(`
          SELECT COUNT(*) as count, AVG(rating) as avg_rating
          FROM ballots WHERE session_id = ?
        `).get(session.id);

        const avgScore = stats?.count ? (Math.round((stats.avg_rating || 0) * 10) / 10) : 0;
        tally = [{
          candidate_id: targetMember.id,
          candidate_name: targetMember.name,
          candidate_role: targetMember.role,
          team_track: targetMember.team_track,
          total_ratings: stats?.count || 0,
          avg_rating: avgScore
        }];
      } else {
        // All members evaluation round
        tally = allMembers.map(cand => {
          const stats = db.prepare(`
            SELECT COUNT(*) as count, AVG(rating) as avg_rating
            FROM ballots 
            WHERE session_id = ? AND (candidate_member_id = ? OR option_id = ?)
          `).get(session.id, cand.id, cand.id);

          return {
            candidate_id: cand.id,
            candidate_name: cand.name,
            candidate_role: cand.role,
            team_track: cand.team_track,
            total_ratings: stats?.count || 0,
            avg_rating: stats?.count ? (Math.round((stats.avg_rating || 0) * 10) / 10) : 0
          };
        });
      }
    }

    return sendJson(res, 200, {
      session,
      active,
      hasClosedSession,
      allSessions,
      targetMember,
      candidates,
      options: candidates,
      userHasClaimedToken: !!eligibility,
      totalBallots,
      totalEligible,
      isRevealed,
      isHost: !!(currentUser && currentUser.is_host),
      tally
    });
  }

  // Create & Launch a Voting / Review Session (Host only)
  if (pathname === '/api/voting/create' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Only the Team Host can launch a review session.' });
    }

    const body = await parseBody(req);
    const { session_type, title, description, metric, target_member_id, options } = body;

    const sType = session_type || 'PEER_PERFORMANCE';
    const sTitle = (title || (sType === 'PEER_PERFORMANCE' ? 'Peer Performance Review' : 'Sprint Project Review')).trim();
    const sDesc = (description || metric || (sType === 'PEER_PERFORMANCE' ? 'Anonymous peer performance evaluation.' : 'Anonymous project quality review.')).trim();
    const targetMemberId = target_member_id ? parseInt(target_member_id, 10) : null;

    // Count allowed members for eligibility threshold
    const totalMembers = db.prepare('SELECT COUNT(*) as count FROM members WHERE is_allowed = 1').get()?.count || 8;

    // Gracefully close any currently active session
    db.prepare("UPDATE voting_sessions SET status = 'CLOSED', closed_at = ? WHERE status = 'ACTIVE'").run(new Date().toISOString());

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO voting_sessions (title, description, session_type, status, total_eligible, created_by, created_at, target_member_id)
      VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
    `).run(sTitle, sDesc, sType, totalMembers, currentUser.id, now, targetMemberId);

    const sessionId = result.lastInsertRowid;

    // Populate options
    if (sType === 'PEER_PERFORMANCE' && targetMemberId) {
      const targetM = db.prepare('SELECT id, name FROM members WHERE id = ?').get(targetMemberId);
      if (targetM) {
        db.prepare(`
          INSERT INTO voting_options (session_id, candidate_member_id, label)
          VALUES (?, ?, ?)
        `).run(sessionId, targetM.id, targetM.name);
      }
    } else if (Array.isArray(options) && options.length > 0) {
      const insertOpt = db.prepare('INSERT INTO voting_options (session_id, candidate_member_id, label) VALUES (?, NULL, ?)');
      for (const optLabel of options) {
        if (optLabel && optLabel.trim()) {
          insertOpt.run(sessionId, optLabel.trim());
        }
      }
    } else if (sType === 'PROJECT_QUALITY' || sType === 'PROJECT_EXPERIENCE') {
      const defaultPillars = [
        'Team Dynamic & Working Collaboration',
        'Sprint Milestone Architecture & Execution',
        'Code Quality & Deliverable Reliability',
        'Overall Project Satisfaction'
      ];
      const insertOpt = db.prepare('INSERT INTO voting_options (session_id, candidate_member_id, label) VALUES (?, NULL, ?)');
      for (const pillar of defaultPillars) {
        insertOpt.run(sessionId, pillar);
      }
    }

    logAudit(
      currentUser.handle,
      'LAUNCH_VOTING_SESSION',
      `voting_session_${sessionId}`,
      `Host launched ${sType} session "${sTitle}".`,
      'SUCCESS'
    );

    return sendJson(res, 201, {
      message: `Review session "${sTitle}" successfully launched!`,
      session_id: sessionId
    });
  }

  // Phase 1: Claim blind token (Eligibility Check)
  if (pathname === '/api/voting/token' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required to claim ballot token' });
    const body = await parseBody(req);
    const sessionId = body.session_id || 1;

    const existing = db.prepare('SELECT * FROM voting_eligibility WHERE session_id = ? AND member_id = ?')
      .get(sessionId, currentUser.id);

    if (existing) {
      return sendJson(res, 400, { error: 'You have already claimed a ballot token for this review session.' });
    }

    db.prepare(`
      INSERT INTO voting_eligibility (session_id, member_id, token_issued_at)
      VALUES (?, ?, ?)
    `).run(sessionId, currentUser.id, new Date().toISOString());

    const blindToken = generateBallotToken(sessionId);

    logAudit(
      currentUser.handle,
      'CLAIM_BALLOT_TOKEN',
      `voting_session_${sessionId}`,
      `Member claimed unlinked blind token for review session #${sessionId}.`,
      'SUCCESS'
    );

    return sendJson(res, 200, {
      token: blindToken,
      instructions: 'This token is unlinked from your identity. Submit your vote with this token.'
    });
  }

  // Phase 2: Cast anonymous ballot
  if (pathname === '/api/voting/cast' && method === 'POST') {
    const body = await parseBody(req);
    const { session_id, option_id, candidate_id, rating, token } = body;
    const targetCandidateId = candidate_id || option_id || 1;
    const numRating = Math.max(1, Math.min(5, parseInt(rating || 5, 10)));

    if (!session_id || !token) {
      return sendJson(res, 400, { error: 'session_id and token are required' });
    }

    const verification = verifyBallotToken(session_id, token);
    if (!verification.valid) {
      logAudit(
        'anonymous',
        'BALLOT_REJECTED',
        `voting_session_${session_id}`,
        `Invalid ballot signature: ${verification.error}`,
        'DENIED'
      );
      return sendJson(res, 403, { error: `Invalid ballot token: ${verification.error}` });
    }

    const alreadyUsed = db.prepare('SELECT * FROM used_tokens WHERE token_hash = ?').get(verification.tokenHash);
    if (alreadyUsed) {
      const ballotsCount = db.prepare('SELECT COUNT(*) as count FROM ballots WHERE session_id = ?').get(session_id);
      if (ballotsCount?.count === 0) {
        db.prepare('DELETE FROM used_tokens WHERE token_hash = ?').run(verification.tokenHash);
      } else {
        logAudit(
          'anonymous',
          'DOUBLE_VOTE_BLOCKED',
          `voting_session_${session_id}`,
          `Attempted double-vote using spent ballot token.`,
          'DENIED'
        );
        return sendJson(res, 409, { error: 'Double-voting prevented! This ballot token has already been cast.' });
      }
    }

    // Ensure valid option_id satisfying FOREIGN KEY (option_id) REFERENCES voting_options(id)
    let optRow = db.prepare('SELECT id FROM voting_options WHERE session_id = ? AND (id = ? OR candidate_member_id = ?)').get(session_id, targetCandidateId, targetCandidateId);
    if (!optRow) {
      optRow = db.prepare('SELECT id FROM voting_options WHERE session_id = ? LIMIT 1').get(session_id);
    }
    if (!optRow) {
      const candMember = db.prepare('SELECT name FROM members WHERE id = ?').get(targetCandidateId);
      const optLabel = candMember?.name || `Option ${targetCandidateId}`;
      const ins = db.prepare('INSERT INTO voting_options (session_id, candidate_member_id, label) VALUES (?, ?, ?)').run(session_id, targetCandidateId, optLabel);
      optRow = { id: ins.lastInsertRowid };
    }
    const validOptionId = optRow.id;

    const insertTx = db.transaction(() => {
      db.prepare('INSERT INTO used_tokens (token_hash, used_at) VALUES (?, ?)').run(verification.tokenHash, new Date().toISOString());
      db.prepare('INSERT INTO ballots (session_id, option_id, candidate_member_id, rating) VALUES (?, ?, ?, ?)').run(session_id, validOptionId, targetCandidateId, numRating);
    });
    insertTx();

    logAudit(
      'anonymous_voter',
      'PEER_BALLOT_CAST',
      `voting_session_${session_id}`,
      `Anonymous rating of ${numRating}/5 stars cast in review session #${session_id}. Zero voter linkage.`,
      'SUCCESS'
    );

    return sendJson(res, 200, { message: 'Evaluation ballot safely cast into anonymous ballot box!' });
  }

  if (pathname === '/api/voting/close' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Only the Team Host can close a voting session.' });
    }

    const body = await parseBody(req);
    const targetSessionId = body.session_id || 1;

    db.prepare(`UPDATE voting_sessions SET status = 'CLOSED', closed_at = ? WHERE id = ?`).run(new Date().toISOString(), targetSessionId);
    logAudit(currentUser.handle, 'CLOSE_VOTING_SESSION', `voting_session_${targetSessionId}`, `Host closed voting session #${targetSessionId} and revealed aggregate tallies.`, 'SUCCESS');

    return sendJson(res, 200, { message: `Voting session #${targetSessionId} closed. Final tallies revealed!` });
  }

  if (pathname === '/api/voting/reopen' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Only the Team Host can reopen a voting session.' });
    }

    const body = await parseBody(req);
    const targetSessionId = body.session_id || 1;

    db.prepare(`UPDATE voting_sessions SET status = 'ACTIVE', closed_at = NULL WHERE id = ?`).run(targetSessionId);
    logAudit(currentUser.handle, 'REOPEN_VOTING_SESSION', `voting_session_${targetSessionId}`, `Host reopened voting session #${targetSessionId}.`, 'SUCCESS');

    return sendJson(res, 200, { message: `Voting session #${targetSessionId} reopened for evaluations.` });
  }

  return false;
}
