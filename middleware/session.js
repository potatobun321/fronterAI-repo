import crypto from 'node:crypto';
import { db } from '../db.js';
import { parseCookies } from './httpHelpers.js';

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(member) {
  const token = generateSessionToken();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days
  db.prepare('INSERT INTO sessions (token, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    member.id,
    createdAt,
    expiresAt
  );
  return token;
}

export function getSessionUser(req) {
  const cookies = parseCookies(req);
  let token = cookies.frontier_session;
  if (!token && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7).trim();
  }
  if (!token) return null;
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT m.id, m.github_numeric_id, m.handle, m.name, m.role, m.team_track, m.email, m.is_host, m.is_allowed
    FROM sessions s
    JOIN members m ON s.member_id = m.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);
  if (!row) return null;
  const email = (row.email || '').toLowerCase().trim();
  const isLead = email === 'kart123.san@gmail.com' || (Number(row.id) === 1 && !email);
  row.is_host = isLead ? 1 : 0;
  return row;
}

export function destroySession(token) {
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
}

export function cleanupExpiredSessions() {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  } catch (e) {
    // Graceful fallback if table is newly initialized
  }
}
