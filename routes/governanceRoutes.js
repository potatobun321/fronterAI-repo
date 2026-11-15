import { db, logAudit } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { parseBody, sendJson } from '../middleware/httpHelpers.js';

export async function handleGovernanceRoutes(req, res, pathname, method) {
  if (pathname === '/api/tickets' && method === 'GET') {
    const tickets = db.prepare(`
      SELECT t.*,
             req.name as requester_name, req.handle as requester_handle,
             app.name as approver_name, app.handle as approver_handle
      FROM access_tickets t
      JOIN members req ON t.requester_id = req.id
      LEFT JOIN members app ON t.approver_id = app.id
      ORDER BY t.id DESC
    `).all();
    return sendJson(res, 200, { tickets });
  }

  if (pathname === '/api/tickets' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    const body = await parseBody(req);
    const { title, reason, scope, duration_minutes } = body;

    if (!title || !reason || !scope) {
      return sendJson(res, 400, { error: 'Title, reason, and scope are required' });
    }

    const insert = db.prepare(`
      INSERT INTO access_tickets (requester_id, title, reason, scope, duration_minutes, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?)
    `);

    const now = new Date().toISOString();
    const result = insert.run(currentUser.id, title, reason, scope, duration_minutes || 30, now);

    logAudit(
      currentUser.handle,
      'RAISE_TICKET',
      `ticket_${result.lastInsertRowid}`,
      `Created access ticket: "${title}" for scope "${scope}".`,
      'PENDING'
    );

    return sendJson(res, 201, { id: result.lastInsertRowid, message: 'Ticket raised' });
  }

  if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/approve') && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    const ticketId = parseInt(pathname.split('/')[3], 10);
    const ticket = db.prepare('SELECT * FROM access_tickets WHERE id = ?').get(ticketId);

    if (!ticket) return sendJson(res, 404, { error: 'Ticket not found' });
    if (ticket.status !== 'PENDING_APPROVAL') {
      return sendJson(res, 400, { error: `Ticket is already ${ticket.status}` });
    }

    // CRITICAL 2-MAN RULE ENFORCEMENT:
    if (ticket.requester_id === currentUser.id) {
      logAudit(
        currentUser.handle,
        'SELF_APPROVAL_VIOLATION',
        `ticket_${ticketId}`,
        `Security violation: ${currentUser.handle} attempted self-approval.`,
        'DENIED'
      );
      return sendJson(res, 403, {
        error: '2-Man Rule Violation: You cannot approve your own privileged access request! Another team member must review and approve it.'
      });
    }

    const now = new Date();
    const resolvedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ticket.duration_minutes * 60000).toISOString();

    db.prepare(`
      UPDATE access_tickets
      SET status = 'APPROVED',
          approver_id = ?,
          resolved_at = ?,
          expires_at = ?
      WHERE id = ?
    `).run(currentUser.id, resolvedAt, expiresAt, ticketId);

    logAudit(
      currentUser.handle,
      'APPROVE_TICKET',
      `ticket_${ticketId}`,
      `Approved ticket requested by member #${ticket.requester_id}. Granted temporary privilege until ${expiresAt}.`,
      'GRANTED'
    );

    return sendJson(res, 200, {
      message: `Ticket approved! Ephemeral grant active for ${ticket.duration_minutes} minutes.`,
      expiresAt
    });
  }

  if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/deny') && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    const ticketId = parseInt(pathname.split('/')[3], 10);
    const ticket = db.prepare('SELECT * FROM access_tickets WHERE id = ?').get(ticketId);

    if (!ticket) return sendJson(res, 404, { error: 'Ticket not found' });
    if (ticket.status !== 'PENDING_APPROVAL') {
      return sendJson(res, 400, { error: `Ticket is already ${ticket.status}` });
    }

    if (ticket.requester_id === currentUser.id && !currentUser.is_host) {
      return sendJson(res, 403, { error: 'You cannot deny your own ticket as non-host.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE access_tickets
      SET status = 'DENIED',
          approver_id = ?,
          resolved_at = ?
      WHERE id = ?
    `).run(currentUser.id, now, ticketId);

    logAudit(
      currentUser.handle,
      'DENY_TICKET',
      `ticket_${ticketId}`,
      `Denied access ticket requested by member #${ticket.requester_id}.`,
      'DENIED'
    );

    return sendJson(res, 200, { message: 'Ticket denied.' });
  }

  return false;
}
