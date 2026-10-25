// Import DatabaseSync from Node's built-in sqlite module, crypto for tokens, and fs/path for file operations
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Open the frontier.db SQLite database file
const db = new DatabaseSync('frontier.db');

// Enable foreign key constraint checks
db.exec('PRAGMA foreign_keys = ON;');

// Create members table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER UNIQUE,
    name TEXT,
    role TEXT CHECK (role IN ('lead', 'member'))
  );
`);

// Create tasks table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    assigned_to INTEGER REFERENCES members(id),
    assigned_by INTEGER REFERENCES members(id),
    deadline TEXT,
    status TEXT CHECK (status IN ('todo', 'in_progress', 'completed')),
    deliverable_link TEXT,
    notes TEXT
  );
`);

// Create calendar_events table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    type TEXT CHECK (type IN ('meeting', 'deadline', 'sprint_sync')),
    event_date TEXT,
    meet_link TEXT,
    created_by INTEGER REFERENCES members(id)
  );
`);

// Create vote_sessions table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS vote_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    created_by INTEGER REFERENCES members(id)
  );
`);

// Create vote_eligibility table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS vote_eligibility (
    session_id INTEGER REFERENCES vote_sessions(id),
    member_id INTEGER REFERENCES members(id),
    claimed INTEGER DEFAULT 0,
    PRIMARY KEY (session_id, member_id)
  );
`);

// Create ballots table if it does not exist (anonymous vote, no member_id column)
db.exec(`
  CREATE TABLE IF NOT EXISTS ballots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES vote_sessions(id),
    token_hash TEXT UNIQUE NOT NULL,
    choice TEXT NOT NULL
  );
`);

// Create access_requests table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER REFERENCES members(id),
    scope TEXT NOT NULL,
    approver_id INTEGER REFERENCES members(id),
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    expires_at TEXT
  );
`);

// Create audit_log table if it does not exist (actor is plain text without FK)
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    actor TEXT,
    action TEXT NOT NULL,
    target TEXT
  );
`);

// Return all members from the database
function listMembers() {
  const stmt = db.prepare('SELECT * FROM members');
  return stmt.all();
}

// Return a member by their GitHub ID, or null if not found
function getMemberByGithubId(githubId) {
  const stmt = db.prepare('SELECT * FROM members WHERE github_id = ?');
  const member = stmt.get(githubId);
  return member || null;
}

// Record an audit log entry
function logAudit(actor, action, target) {
  const stmt = db.prepare(
    'INSERT INTO audit_log (actor, action, target) VALUES (?, ?, ?)'
  );
  const result = stmt.run(
    actor != null ? String(actor) : null,
    action,
    target != null ? String(target) : null
  );
  return Number(result.lastInsertRowid);
}

// Search audit log entries matching actor, action, or target using LIKE, newest first
function searchAudit(text) {
  const stmt = db.prepare(
    'SELECT * FROM audit_log WHERE actor LIKE ? OR action LIKE ? OR target LIKE ? ORDER BY timestamp DESC, id DESC'
  );
  const pattern = `%${text}%`;
  return stmt.all(pattern, pattern, pattern);
}

// Create a new task if actor is a lead; returns the new task ID
function createTask(actorId, title, assignedTo, deadline) {
  const actorStmt = db.prepare('SELECT role FROM members WHERE id = ?');
  const actor = actorStmt.get(actorId);
  if (!actor || actor.role !== 'lead') {
    logAudit(actorId, 'TASK_CREATE_DENIED', title);
    const error = new Error('Forbidden: Only leads can create tasks');
    error.code = 403;
    throw error;
  }
  const insertStmt = db.prepare(
    'INSERT INTO tasks (title, assigned_to, assigned_by, deadline, status) VALUES (?, ?, ?, ?, ?)'
  );
  const result = insertStmt.run(title, assignedTo, actorId, deadline ?? null, 'todo');
  const taskId = Number(result.lastInsertRowid);
  logAudit(actorId, 'TASK_CREATE', title);
  return taskId;
}

// Return all tasks assigned to a specific member
function getTasksForMember(memberId) {
  const stmt = db.prepare('SELECT * FROM tasks WHERE assigned_to = ?');
  return stmt.all(memberId);
}

// Update status, link, and notes for a task if caller is the assignee
function updateTaskStatus(taskId, memberId, status, link, notes) {
  const taskStmt = db.prepare('SELECT assigned_to FROM tasks WHERE id = ?');
  const task = taskStmt.get(taskId);
  if (!task) {
    logAudit(memberId, 'TASK_UPDATE_DENIED', taskId);
    const error = new Error('Not Found: Task does not exist');
    error.code = 404;
    throw error;
  }
  if (Number(task.assigned_to) !== Number(memberId)) {
    logAudit(memberId, 'TASK_UPDATE_DENIED', taskId);
    const error = new Error('Forbidden: Only the assignee can update this task');
    error.code = 403;
    throw error;
  }
  const updateStmt = db.prepare(
    'UPDATE tasks SET status = ?, deliverable_link = ?, notes = ? WHERE id = ?'
  );
  updateStmt.run(status, link ?? null, notes ?? null, taskId);
  logAudit(memberId, 'TASK_UPDATE', taskId);
}

// Create a calendar event if actor is a lead; returns the new event ID
function createEvent(actorId, title, type, eventDate, meetLink) {
  const actorStmt = db.prepare('SELECT role FROM members WHERE id = ?');
  const actor = actorStmt.get(actorId);
  if (!actor || actor.role !== 'lead') {
    logAudit(actorId, 'EVENT_CREATE_DENIED', title);
    const error = new Error('Forbidden: Only leads can create events');
    error.code = 403;
    throw error;
  }
  const insertStmt = db.prepare(
    'INSERT INTO calendar_events (title, type, event_date, meet_link, created_by) VALUES (?, ?, ?, ?, ?)'
  );
  const result = insertStmt.run(title, type, eventDate, meetLink ?? null, actorId);
  const eventId = Number(result.lastInsertRowid);
  logAudit(actorId, 'EVENT_CREATE', title);
  return eventId;
}

// Return all calendar events from the database
function listEvents() {
  const stmt = db.prepare('SELECT * FROM calendar_events ORDER BY event_date');
  return stmt.all();
}

// Open a new vote session if actor is a lead; returns the new session ID
function openVoteSession(leadId, title) {
  const leadStmt = db.prepare('SELECT role FROM members WHERE id = ?');
  const lead = leadStmt.get(leadId);
  if (!lead || lead.role !== 'lead') {
    logAudit(leadId, 'VOTE_SESSION_OPEN_DENIED', title);
    const error = new Error('Forbidden: Only leads can open vote sessions');
    error.code = 403;
    throw error;
  }
  const insertStmt = db.prepare(
    "INSERT INTO vote_sessions (title, status, created_by) VALUES (?, 'open', ?)"
  );
  const result = insertStmt.run(title, leadId);
  const sessionId = Number(result.lastInsertRowid);
  logAudit(leadId, 'VOTE_SESSION_OPEN', title);
  return sessionId;
}

// Add all existing members as eligible voters with claimed = 0 for a session
function addEligibleVoters(sessionId) {
  const sessionStmt = db.prepare('SELECT id FROM vote_sessions WHERE id = ?');
  const session = sessionStmt.get(sessionId);
  if (!session) {
    logAudit(null, 'ADD_ELIGIBLE_VOTERS_DENIED', sessionId);
    const error = new Error('Vote session not found');
    error.code = 404;
    throw error;
  }
  const members = db.prepare('SELECT id FROM members').all();
  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO vote_eligibility (session_id, member_id, claimed) VALUES (?, ?, 0)'
  );
  db.exec('BEGIN');
  try {
    for (const member of members) {
      insertStmt.run(sessionId, member.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  logAudit(null, 'ADD_ELIGIBLE_VOTERS', sessionId);
  return members.length;
}

// Helper to verify HMAC signature of a vote token for a specific session
function verifyVoteToken(sessionId, token) {
  if (typeof token !== 'string') return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [tokenSessionId, nonce, sig] = parts;
  if (Number(tokenSessionId) !== Number(sessionId)) return false;
  const secret = process.env.VOTE_SECRET || 'dev_vote_secret';
  const expectedSig = crypto.createHmac('sha256', secret).update(`${tokenSessionId}:${nonce}`).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

// Claim a single-use anonymous HMAC vote token for an eligible member
function claimVoteToken(sessionId, memberId) {
  const sessionStmt = db.prepare('SELECT status FROM vote_sessions WHERE id = ?');
  const session = sessionStmt.get(sessionId);
  if (!session || session.status !== 'open') {
    logAudit(memberId, 'CLAIM_TOKEN_DENIED', sessionId);
    const error = new Error('Session is not open');
    error.code = !session ? 404 : 400;
    throw error;
  }

  const eligStmt = db.prepare(
    'SELECT claimed FROM vote_eligibility WHERE session_id = ? AND member_id = ?'
  );
  const elig = eligStmt.get(sessionId, memberId);
  if (!elig) {
    logAudit(memberId, 'CLAIM_TOKEN_DENIED', sessionId);
    const error = new Error('Member is not eligible to vote in this session');
    error.code = 403;
    throw error;
  }
  if (elig.claimed === 1 || elig.claimed) {
    logAudit(memberId, 'CLAIM_TOKEN_DENIED', sessionId);
    const error = new Error('Vote token has already been claimed');
    error.code = 409;
    throw error;
  }

  db.exec('BEGIN');
  try {
    const updateStmt = db.prepare(
      'UPDATE vote_eligibility SET claimed = 1 WHERE session_id = ? AND member_id = ?'
    );
    updateStmt.run(sessionId, memberId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const secret = process.env.VOTE_SECRET || 'dev_vote_secret';
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', secret).update(`${sessionId}:${nonce}`).digest('hex');
  const token = `${sessionId}:${nonce}:${signature}`;

  logAudit(memberId, 'CLAIM_TOKEN', sessionId);
  return token;
}

// Cast an anonymous ballot using a valid session token, storing only its SHA-256 hash
function castBallot(sessionId, token, choice) {
  const sessionStmt = db.prepare('SELECT status FROM vote_sessions WHERE id = ?');
  const session = sessionStmt.get(sessionId);
  if (!session || session.status !== 'open') {
    logAudit(null, 'CAST_BALLOT_DENIED', sessionId);
    const error = new Error('Session is closed or does not exist');
    error.code = !session ? 404 : 400;
    throw error;
  }

  if (!verifyVoteToken(sessionId, token)) {
    logAudit(null, 'CAST_BALLOT_DENIED', sessionId);
    const error = new Error('Invalid vote token for this session');
    error.code = 403;
    throw error;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const existing = db.prepare('SELECT id FROM ballots WHERE token_hash = ?').get(tokenHash);
  if (existing) {
    logAudit(null, 'CAST_BALLOT_DENIED', sessionId);
    const error = new Error('Vote token has already been used');
    error.code = 409;
    throw error;
  }

  const insertStmt = db.prepare(
    'INSERT INTO ballots (session_id, token_hash, choice) VALUES (?, ?, ?)'
  );
  const result = insertStmt.run(sessionId, tokenHash, choice);
  logAudit(null, 'CAST_BALLOT', sessionId);
  return Number(result.lastInsertRowid);
}

// Close an active vote session if actor is a lead
function closeVoteSession(leadId, sessionId) {
  const leadStmt = db.prepare('SELECT role FROM members WHERE id = ?');
  const lead = leadStmt.get(leadId);
  if (!lead || lead.role !== 'lead') {
    logAudit(leadId, 'CLOSE_SESSION_DENIED', sessionId);
    const error = new Error('Forbidden: Only leads can close vote sessions');
    error.code = 403;
    throw error;
  }

  const sessionStmt = db.prepare('SELECT status FROM vote_sessions WHERE id = ?');
  const session = sessionStmt.get(sessionId);
  if (!session) {
    logAudit(leadId, 'CLOSE_SESSION_DENIED', sessionId);
    const error = new Error('Vote session not found');
    error.code = 404;
    throw error;
  }

  const updateStmt = db.prepare("UPDATE vote_sessions SET status = 'closed' WHERE id = ?");
  updateStmt.run(sessionId);
  logAudit(leadId, 'CLOSE_SESSION', sessionId);
  return true;
}

// Return vote counts per choice for a closed vote session
function getResults(sessionId) {
  const sessionStmt = db.prepare('SELECT status FROM vote_sessions WHERE id = ?');
  const session = sessionStmt.get(sessionId);
  if (!session || session.status !== 'closed') {
    logAudit(null, 'GET_RESULTS_DENIED', sessionId);
    const error = new Error('Forbidden: Session is not closed');
    error.code = !session ? 404 : 403;
    throw error;
  }

  const stmt = db.prepare(
    'SELECT choice, COUNT(*) AS count FROM ballots WHERE session_id = ? GROUP BY choice'
  );
  const rows = stmt.all(sessionId);
  for (const r of rows) {
    Object.defineProperty(rows, r.choice, {
      value: Number(r.count),
      enumerable: false,
      writable: true,
      configurable: true
    });
  }
  logAudit(null, 'GET_RESULTS', sessionId);
  return rows;
}

// Create a new pending access request for a member and scope; returns the request ID
function requestAccess(requesterId, scope) {
  const insertStmt = db.prepare(
    "INSERT INTO access_requests (requester_id, scope, status) VALUES (?, ?, 'pending')"
  );
  const result = insertStmt.run(requesterId, scope);
  const requestId = Number(result.lastInsertRowid);
  logAudit(requesterId, 'REQUEST_ACCESS', scope);
  return requestId;
}

// Approve an access request; verifies requester/approver and status, then updates within a transaction
function approveAccess(requestId, approverId) {
  const reqStmt = db.prepare('SELECT * FROM access_requests WHERE id = ?');
  const request = reqStmt.get(requestId);
  if (!request) {
    logAudit(approverId, 'APPROVE_ACCESS_DENIED', requestId);
    const error = new Error('Not Found: Access request does not exist');
    error.code = 404;
    throw error;
  }

  if (Number(request.requester_id) === Number(approverId)) {
    logAudit(approverId, 'APPROVE_ACCESS_DENIED', requestId);
    const error = new Error('Forbidden: Approver cannot be the same person as the requester');
    error.code = 403;
    throw error;
  }

  if (request.status !== 'pending') {
    logAudit(approverId, 'APPROVE_ACCESS_DENIED', requestId);
    const error = new Error('Conflict: Access request is not pending');
    error.code = 409;
    throw error;
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.exec('BEGIN');
  try {
    const updateStmt = db.prepare(
      "UPDATE access_requests SET status = 'approved', approver_id = ?, expires_at = ? WHERE id = ?"
    );
    updateStmt.run(approverId, expiresAt, requestId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  logAudit(approverId, 'APPROVE_ACCESS', requestId);
  return true;
}

// Return true only if there is an approved request for member and scope with expires_at in the future
function hasActiveAccess(memberId, scope) {
  const stmt = db.prepare(
    "SELECT expires_at FROM access_requests WHERE requester_id = ? AND scope = ? AND status = 'approved'"
  );
  const rows = stmt.all(memberId, scope);
  const now = Date.now();
  const hasAccess = rows.some((row) => {
    if (!row.expires_at) return false;
    const expiry = new Date(row.expires_at).getTime();
    return !Number.isNaN(expiry) && expiry > now;
  });
  return hasAccess;
}

// Export all tables to JSON files in the backups/ folder, omitting token_hash from ballots, and log an audit entry
function exportBackup(actorId = null) {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const tables = [
    'members',
    'tasks',
    'calendar_events',
    'vote_sessions',
    'vote_eligibility',
    'ballots',
    'access_requests',
    'audit_log'
  ];

  for (const table of tables) {
    let rows = db.prepare(`SELECT * FROM ${table}`).all();
    if (table === 'ballots') {
      rows = rows.map(({ token_hash, ...rest }) => rest);
    }
    const filePath = path.join(backupDir, `${table}.json`);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
  }

  logAudit(actorId, 'EXPORT_BACKUP', 'backups');
  return true;
}

// Export database instance and all helper functions
module.exports = {
  db,
  listMembers,
  getMemberByGithubId,
  createTask,
  getTasksForMember,
  updateTaskStatus,
  createEvent,
  listEvents,
  logAudit,
  searchAudit,
  openVoteSession,
  addEligibleVoters,
  claimVoteToken,
  castBallot,
  closeVoteSession,
  getResults,
  requestAccess,
  approveAccess,
  hasActiveAccess,
  exportBackup
};


