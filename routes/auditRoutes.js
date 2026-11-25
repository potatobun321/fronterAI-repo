import { db, verifyAuditChain } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { sendJson } from '../middleware/httpHelpers.js';

export async function handleAuditRoutes(req, res, pathname, method) {
  if (pathname === '/api/audit' && method === 'GET') {
    const currentUser = getSessionUser(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }
    if (!currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Audit log is restricted to Team Lead.' });
    }
    const events = db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 50').all();
    return sendJson(res, 200, { events });
  }

  if (pathname === '/api/audit/verify' && method === 'GET') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Audit verification is restricted to Team Lead.' });
    }
    const result = verifyAuditChain();
    return sendJson(res, 200, result);
  }

  return false;
}
