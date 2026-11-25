import { db, logAudit } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { parseBody, sendJson } from '../middleware/httpHelpers.js';

export function purgeMemberCascade(memberId, database = db) {
  // 1. Sessions
  try { database.prepare('DELETE FROM sessions WHERE member_id = ?').run(memberId); } catch (e) { }
  // 2. AI Messages & Threads
  try {
    database.prepare('DELETE FROM ai_messages WHERE thread_id IN (SELECT id FROM ai_threads WHERE member_id = ?)').run(memberId);
    database.prepare('DELETE FROM ai_threads WHERE member_id = ?').run(memberId);
  } catch (e) { }
  // 3. Member Memories
  try { database.prepare('DELETE FROM member_memories WHERE member_id = ?').run(memberId); } catch (e) { }
  // 4. Voting & Ballots (Crucial: Ballots reference voting_options)
  try { database.prepare('DELETE FROM ballots WHERE option_id IN (SELECT id FROM voting_options WHERE candidate_member_id = ?)').run(memberId); } catch (e) { }
  try { database.prepare('UPDATE ballots SET candidate_member_id = NULL WHERE candidate_member_id = ?').run(memberId); } catch (e) { }
  try { database.prepare('DELETE FROM voting_options WHERE candidate_member_id = ?').run(memberId); } catch (e) { }
  try { database.prepare('DELETE FROM voting_eligibility WHERE member_id = ?').run(memberId); } catch (e) { }
  try { database.prepare('UPDATE voting_sessions SET target_member_id = NULL WHERE target_member_id = ?').run(memberId); } catch (e) { }
  try { database.prepare('UPDATE voting_sessions SET created_by = 1 WHERE created_by = ?').run(memberId); } catch (e) { }
  // 5. Tasks (Detach assignee)
  try { database.prepare('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?').run(memberId); } catch (e) { }
  // 6. Calendar Events (Detach assignee, reassign creator to Host)
  try {
    database.prepare('UPDATE calendar_events SET assignee_id = NULL WHERE assignee_id = ?').run(memberId);
    database.prepare('UPDATE calendar_events SET created_by = 1 WHERE created_by = ?').run(memberId);
  } catch (e) { }
  // 7. Tasklets
  try { database.prepare('DELETE FROM tasklets WHERE sender_id = ? OR receiver_id = ?').run(memberId, memberId); } catch (e) { }
  // 8. Access Tickets
  try { database.prepare('DELETE FROM access_tickets WHERE requester_id = ? OR approver_id = ?').run(memberId, memberId); } catch (e) { }
  // 9. Completely purge member from database
  database.prepare('DELETE FROM members WHERE id = ?').run(memberId);
}

export async function handleMemberRoutes(req, res, pathname, method) {
  if (pathname === '/api/members' && method === 'GET') {
    const currentUser = getSessionUser(req);
    let members;
    if (currentUser && currentUser.is_host) {
      // Full administrative member details for Host (including pending & disabled)
      members = db.prepare('SELECT id, github_numeric_id, handle, name, role, team_track, email, is_host, is_allowed FROM members').all();
    } else {
      // Public/member safe projection (only active allowed members)
      members = db.prepare('SELECT id, handle, name, role, team_track, email, is_host FROM members WHERE is_allowed = 1').all();
    }
    return sendJson(res, 200, { members });
  }

  if (pathname === '/api/members/pending' && method === 'GET') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Forbidden: Only the Team Host can view pending access requests.' });
    }
    const pending = db.prepare('SELECT id, handle, name, role, team_track, email, is_host, is_allowed FROM members WHERE is_allowed = 0 ORDER BY id DESC').all();
    return sendJson(res, 200, { pending });
  }

  if (pathname === '/api/members' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      logAudit(currentUser ? currentUser.handle : 'unauthenticated', 'MEMBER_ONBOARD_DENIED', 'members', 'Unauthorized attempt to onboard a team member.', 'DENIED');
      return sendJson(res, 403, { error: 'Forbidden: Only the Team Host can onboard members.' });
    }

    const body = await parseBody(req);
    const { email, name, handle, role, team_track, github_username } = body;
    const validTrack = ['frontend', 'backend', 'lead'].includes(team_track) ? team_track : 'backend';
    const assignedRole = String(role || 'Engineer').trim();

    // 1. Primary: Onboard via Google Email
    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
        return sendJson(res, 400, { error: 'Invalid email address provided.' });
      }

      const existingByEmail = db.prepare('SELECT id, name, handle FROM members WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
      if (existingByEmail) {
        db.prepare('UPDATE members SET is_allowed = 1, role = ?, team_track = ? WHERE id = ?').run(assignedRole, validTrack, existingByEmail.id);
        const updated = db.prepare('SELECT id, handle, name, role, team_track, email, is_host, is_allowed FROM members WHERE id = ?').get(existingByEmail.id);
        return sendJson(res, 200, { member: updated, message: `Member ${cleanEmail} is now authorized!` });
      }

      const cleanHandle = (handle || cleanEmail.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user';
      let uniqueHandle = cleanHandle;
      const existingHandle = db.prepare('SELECT id FROM members WHERE LOWER(handle) = LOWER(?)').get(uniqueHandle);
      if (existingHandle) {
        uniqueHandle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
      }
      const displayName = String(name || cleanHandle).trim();

      const insertStmt = db.prepare(`
        INSERT INTO members (handle, name, role, team_track, email, is_host, is_allowed)
        VALUES (?, ?, ?, ?, ?, 0, 1)
      `);
      const result = insertStmt.run(uniqueHandle, displayName, assignedRole, validTrack, cleanEmail);

      logAudit(
        currentUser.handle,
        'MEMBER_ONBOARDED',
        'members',
        `Onboarded ${displayName} (${cleanEmail}, @${uniqueHandle}) as ${assignedRole} [${validTrack}].`,
        'SUCCESS'
      );

      const newMember = db.prepare('SELECT id, handle, name, role, team_track, email, is_host, is_allowed FROM members WHERE id = ?').get(result.lastInsertRowid);
      return sendJson(res, 201, { member: newMember, message: `Successfully onboarded ${displayName} to Frontier AI allowlist.` });
    }

    // 2. Legacy / Alternative: Onboard via GitHub username
    if (github_username) {
      const sanitizedUsername = String(github_username).trim().replace(/^@/, '');
      if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(sanitizedUsername)) {
        return sendJson(res, 400, { error: 'Invalid GitHub username format.' });
      }

      // Check if user already exists
      const existing = db.prepare('SELECT id, handle FROM members WHERE LOWER(handle) = LOWER(?)').get(sanitizedUsername);
      if (existing) {
        return sendJson(res, 409, { error: `Member @${sanitizedUsername} is already registered in the allowlist.` });
      }

      try {
        // Query GitHub public API to verify user and retrieve immutable numeric ID
        const ghRes = await fetch(`https://api.github.com/users/${encodeURIComponent(sanitizedUsername)}`, {
          headers: { 'User-Agent': 'FrontierAI-Workspace' }
        });

        if (!ghRes.ok) {
          return sendJson(res, 404, { error: `GitHub user @${sanitizedUsername} was not found on GitHub.` });
        }

        const ghData = await ghRes.json();
        const numericId = ghData.id;
        const displayName = ghData.name || sanitizedUsername;

        // Secure Parameterized Insert: Completely immune to SQL injection
        const insertStmt = db.prepare(`
          INSERT INTO members (github_numeric_id, handle, name, role, team_track, is_host, is_allowed)
          VALUES (?, ?, ?, ?, ?, 0, 1)
        `);
        const result = insertStmt.run(numericId, sanitizedUsername, displayName, assignedRole, validTrack);

        logAudit(
          currentUser.handle,
          'MEMBER_ONBOARDED',
          'members',
          `Onboarded @${sanitizedUsername} (${displayName}, GitHub ID: ${numericId}) as ${assignedRole} [${validTrack}].`,
          'SUCCESS'
        );

        const newMember = db.prepare('SELECT id, github_numeric_id, handle, name, role, team_track, is_host, is_allowed FROM members WHERE id = ?').get(result.lastInsertRowid);
        return sendJson(res, 201, { member: newMember, message: `Successfully onboarded @${sanitizedUsername} to Frontier AI allowlist.` });
      } catch (err) {
        console.error('Failed to onboard GitHub member:', err);
        return sendJson(res, 500, { error: 'Failed to query GitHub API or store member.' });
      }
    }

    return sendJson(res, 400, { error: 'Either email or github_username and role are required.' });
  }

  if (pathname.startsWith('/api/members/') && method === 'DELETE') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Forbidden: Only the Team Host can remove members.' });
    }
    const memberId = parseInt(pathname.split('/')[3], 10);
    if (isNaN(memberId)) {
      return sendJson(res, 400, { error: 'Invalid member ID.' });
    }
    if (memberId === currentUser.id) {
      return sendJson(res, 400, { error: 'Host cannot remove themselves from the allowlist.' });
    }
    const targetMember = db.prepare('SELECT id, handle, name FROM members WHERE id = ?').get(memberId);
    if (!targetMember) {
      return sendJson(res, 404, { error: 'Member not found.' });
    }
    // Complete cascade purge via unified helper
    purgeMemberCascade(memberId, db);

    logAudit(currentUser.handle, 'MEMBER_REMOVED', 'members', `Permanently removed member @${targetMember.handle} (${targetMember.name}, ID: ${memberId}) from allowlist.`, 'SUCCESS');
    return sendJson(res, 200, { message: `Member @${targetMember.handle} permanently removed.` });
  }

  if (pathname.match(/^\/api\/members\/\d+\/approve$/) && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Forbidden: Only the Team Host can approve members.' });
    }
    const memberId = parseInt(pathname.split('/')[3], 10);
    const targetMember = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!targetMember) {
      return sendJson(res, 404, { error: 'Member not found.' });
    }
    const body = await parseBody(req);
    const role = (body && body.role && body.role.trim()) || (targetMember.role === 'Pending Review' ? 'Engineer' : targetMember.role);
    const candidateTrack = (body && body.team_track && String(body.team_track).trim().toLowerCase());
    const validTrack = (candidateTrack && /^[a-z0-9_-]{2,20}$/.test(candidateTrack)) ? candidateTrack : (targetMember.team_track === 'unassigned' ? 'backend' : targetMember.team_track);

    db.prepare('UPDATE members SET is_allowed = 1, role = ?, team_track = ? WHERE id = ?').run(role, validTrack, memberId);

    logAudit(
      currentUser.handle,
      'MEMBER_APPROVED',
      'members',
      `Host approved access for ${targetMember.name} (${targetMember.email || targetMember.handle}). Assigned Role: ${role}, Track: ${validTrack}.`,
      'SUCCESS'
    );

    return sendJson(res, 200, { success: true, message: `Access approved for ${targetMember.name}!` });
  }

  if (pathname.match(/^\/api\/members\/\d+\/reject$/) && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Forbidden: Only the Team Host can reject requests.' });
    }
    const memberId = parseInt(pathname.split('/')[3], 10);
    const targetMember = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!targetMember) {
      return sendJson(res, 404, { error: 'Member not found.' });
    }
    if (targetMember.is_host) {
      return sendJson(res, 400, { error: 'Host cannot be rejected.' });
    }
    // Complete cascade purge via unified helper
    purgeMemberCascade(memberId, db);

    logAudit(
      currentUser.handle,
      'MEMBER_REJECTED',
      'members',
      `Permanently rejected and purged access request for ${targetMember.name} (${targetMember.email || targetMember.handle}).`,
      'SUCCESS'
    );

    return sendJson(res, 200, { success: true, message: `Access request for ${targetMember.name} was rejected.` });
  }

  // Transfer Team Host authority to another member
  if (pathname === '/api/members/transfer-host' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Forbidden: Only the active Team Host can transfer admin authority.' });
    }

    const body = await parseBody(req);
    const targetMemberId = parseInt(body.target_member_id, 10);
    if (!targetMemberId) {
      return sendJson(res, 400, { error: 'target_member_id is required.' });
    }

    if (targetMemberId === currentUser.id) {
      return sendJson(res, 400, { error: 'You are already the Team Host.' });
    }

    const targetMember = db.prepare('SELECT * FROM members WHERE id = ?').get(targetMemberId);
    if (!targetMember) {
      return sendJson(res, 404, { error: 'Target member not found.' });
    }

    if (targetMember.is_allowed !== 1) {
      return sendJson(res, 400, { error: 'Cannot transfer authority to an unapproved member.' });
    }

    try {
      const nextRole = (body.new_role && String(body.new_role).trim()) || 'Software Engineer';
      const nextTrack = ['frontend', 'backend', 'lead'].includes(body.new_track) ? body.new_track : 'backend';
      db.exec('BEGIN');
      db.prepare("UPDATE members SET is_host = 1, role = 'Team Host & Lead', team_track = 'lead' WHERE id = ?").run(targetMemberId);
      db.prepare('UPDATE members SET is_host = 0, role = ?, team_track = ? WHERE id = ?').run(nextRole, nextTrack, currentUser.id);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Failed to transfer host authority:', err);
      return sendJson(res, 500, { error: 'Failed to transfer host authority.' });
    }

    logAudit(
      currentUser.handle,
      'HOST_AUTHORITY_TRANSFERRED',
      `member_${targetMemberId}`,
      `Team Host authority transferred from ${currentUser.name} (@${currentUser.handle}) to ${targetMember.name} (@${targetMember.handle}).`,
      'SUCCESS'
    );

    return sendJson(res, 200, {
      success: true,
      message: `Team Host authority transferred to ${targetMember.name}. You have surrendered administrative privileges.`,
      new_host: { id: targetMember.id, name: targetMember.name, handle: targetMember.handle },
      previous_host: { id: currentUser.id, name: currentUser.name, handle: currentUser.handle }
    });
  }

  if (pathname.match(/^\/api\/members\/\d+$/) && method === 'PATCH') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Forbidden: Only the Team Host can update member roles.' });
    }
    const memberId = parseInt(pathname.split('/')[3], 10);
    const targetMember = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!targetMember) {
      return sendJson(res, 404, { error: 'Member not found.' });
    }
    const body = await parseBody(req);
    const nextRole = (body.role && String(body.role).trim()) || targetMember.role;
    const candidateTrack = body.team_track ? String(body.team_track).trim().toLowerCase() : targetMember.team_track;
    const nextTrack = ['frontend', 'backend', 'lead'].includes(candidateTrack) ? candidateTrack : targetMember.team_track;
    db.prepare('UPDATE members SET role = ?, team_track = ? WHERE id = ?').run(nextRole, nextTrack, memberId);
    logAudit(currentUser.handle, 'MEMBER_UPDATED', `member_${memberId}`, `Updated ${targetMember.name} role to "${nextRole}" [${nextTrack}].`, 'SUCCESS');
    return sendJson(res, 200, { success: true, message: `Updated ${targetMember.name}'s role.` });
  }

  return false;
}
