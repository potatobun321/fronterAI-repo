import { db, logAudit } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { sendJson } from '../middleware/httpHelpers.js';

export async function handleMeetingRoutes(req, res, pathname, method) {
  if (pathname === '/api/meetings/slots' && method === 'GET') {
    const slots = db.prepare('SELECT id, slot_code, slot_name, last_used_at FROM meeting_slots ORDER BY id ASC').all();
    return sendJson(res, 200, { slots });
  }

  if (pathname.startsWith('/api/meetings/join-slot/') && method === 'GET') {
    const currentUser = getSessionUser(req);
    if (!currentUser) {
      res.writeHead(302, { Location: '/?auth=login_required' });
      return res.end();
    }

    const slotId = parseInt(pathname.split('/').pop(), 10);
    const slot = db.prepare('SELECT * FROM meeting_slots WHERE id = ?').get(slotId);
    if (!slot || !slot.raw_url) {
      return sendJson(res, 404, { error: 'Meeting bridge slot not found.' });
    }

    db.prepare('UPDATE meeting_slots SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), slot.id);
    logAudit(
      currentUser.handle,
      'MEETING_JOINED',
      `slot_${slot.id}`,
      `Member ${currentUser.name} (@${currentUser.handle}) joined bridge ${slot.slot_name} (${slot.slot_code}).`,
      'SUCCESS'
    );

    res.writeHead(302, { Location: slot.raw_url });
    return res.end();
  }

  if (pathname.startsWith('/api/meetings/join/') && method === 'GET') {
    const currentUser = getSessionUser(req);
    if (!currentUser) {
      res.writeHead(302, { Location: '/?auth=login_required' });
      return res.end();
    }

    const eventId = parseInt(pathname.split('/').pop(), 10);
    const event = db.prepare(`
      SELECT c.*, s.slot_name, s.slot_code, s.raw_url as slot_raw_url
      FROM calendar_events c
      LEFT JOIN meeting_slots s ON c.meeting_slot_id = s.id
      WHERE c.id = ?
    `).get(eventId);

    if (!event || (!event.meeting_link && !event.slot_raw_url)) {
      return sendJson(res, 404, { error: 'Meeting not found or has no active link.' });
    }

    let isAllowed = false;
    if (currentUser.is_host === 1) {
      isAllowed = true;
    } else if (event.target_audience === 'ALL') {
      isAllowed = true;
    } else if (event.target_audience === 'BACKEND' && currentUser.team_track === 'backend') {
      isAllowed = true;
    } else if (event.target_audience === 'FRONTEND' && currentUser.team_track === 'frontend') {
      isAllowed = true;
    } else if (event.assignee_id && event.assignee_id === currentUser.id) {
      isAllowed = true;
    } else if (event.target_audience && event.target_audience.startsWith('[')) {
      try {
        const list = JSON.parse(event.target_audience);
        if (Array.isArray(list) && list.map(Number).includes(currentUser.id)) {
          isAllowed = true;
        }
      } catch {}
    }

    if (!isAllowed) {
      logAudit(
        currentUser.handle,
        'MEETING_JOIN_DENIED',
        `meeting_${event.id}`,
        `Unauthorized attempt to join session "${event.title}". User not in target audience.`,
        'DENIED'
      );
      return sendJson(res, 403, {
        error: 'Access Restricted: You are not on the guest list for this meeting session.'
      });
    }

    const slotLabel = event.slot_name || 'Meeting Bridge';
    logAudit(
      currentUser.handle,
      'MEETING_JOINED',
      `meeting_${event.id}`,
      `Member ${currentUser.name} (@${currentUser.handle}) joined session "${event.title}" via ${slotLabel}.`,
      'SUCCESS'
    );

    const targetUrl = event.meeting_link || event.slot_raw_url;
    res.writeHead(302, { Location: targetUrl });
    return res.end();
  }

  return false;
}
