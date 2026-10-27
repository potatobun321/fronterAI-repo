import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';

export const db = new DatabaseSync(DB_PATH);

export function initDatabase() {
  // Performance & Concurrency Pragmas
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY,
      github_numeric_id INTEGER UNIQUE NOT NULL,
      handle TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      team_track TEXT NOT NULL,
      is_host INTEGER DEFAULT 0,
      is_allowed INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      track TEXT NOT NULL,
      assignee_id INTEGER,
      status TEXT NOT NULL DEFAULT 'TODO',
      deadline TEXT,
      deliverable_url TEXT,
      deliverable_notes TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (assignee_id) REFERENCES members (id)
    );

    CREATE TABLE IF NOT EXISTS meeting_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_code TEXT NOT NULL UNIQUE,
      slot_name TEXT NOT NULL,
      raw_url TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT NOT NULL, -- 'DEADLINE', 'MEETING', 'RETRO'
      event_date TEXT NOT NULL,
      time_label TEXT NOT NULL,
      target_audience TEXT NOT NULL DEFAULT 'ALL', -- 'ALL', 'BACKEND', 'FRONTEND', or JSON array '[2,3]'
      assignee_id INTEGER, -- Legacy direct member assignment
      meeting_slot_id INTEGER,
      meeting_link TEXT,
      is_live INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      FOREIGN KEY (assignee_id) REFERENCES members (id),
      FOREIGN KEY (meeting_slot_id) REFERENCES meeting_slots (id),
      FOREIGN KEY (created_by) REFERENCES members (id)
    );

    CREATE TABLE IF NOT EXISTS voting_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'PERFORMANCE',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      total_eligible INTEGER DEFAULT 8,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS voting_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      candidate_member_id INTEGER,
      label TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES voting_sessions (id),
      FOREIGN KEY (candidate_member_id) REFERENCES members (id)
    );

    -- Records WHICH member collected a ballot token (Eligibility check)
    CREATE TABLE IF NOT EXISTS voting_eligibility (
      session_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      token_issued_at TEXT NOT NULL,
      PRIMARY KEY (session_id, member_id),
      FOREIGN KEY (session_id) REFERENCES voting_sessions (id),
      FOREIGN KEY (member_id) REFERENCES members (id)
    );

    -- Cryptographic hash of used ballot tokens to prevent double-spending
    CREATE TABLE IF NOT EXISTS used_tokens (
      token_hash TEXT PRIMARY KEY,
      used_at TEXT NOT NULL
    );

    -- Anonymized ballot box: ABSOLUTELY NO MEMBER_ID!
    CREATE TABLE IF NOT EXISTS ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES voting_sessions (id),
      FOREIGN KEY (option_id) REFERENCES voting_options (id)
    );

    -- Persistent User Authentication Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      member_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);

    -- 2-Man Rule Access-Request Tickets
    CREATE TABLE IF NOT EXISTS access_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      scope TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
      approver_id INTEGER,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      expires_at TEXT,
      FOREIGN KEY (requester_id) REFERENCES members (id),
      FOREIGN KEY (approver_id) REFERENCES members (id)
    );

    -- Tamper-evident Audit Events
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      actor_handle TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL
    );

    -- Peer-to-Peer Tasklets (Member-to-Member informal micro-tasks)
    CREATE TABLE IF NOT EXISTS tasklets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'DONE'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sender_id) REFERENCES members (id),
      FOREIGN KEY (receiver_id) REFERENCES members (id)
    );

    -- AI Conversation Threads (Short-term chat session memory)
    CREATE TABLE IF NOT EXISTS ai_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );

    -- AI Conversation Turn Messages
    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL, -- 'user' or 'model'
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES ai_threads (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages (thread_id);

    -- Long-term Member Profile & Goal Memory
    CREATE TABLE IF NOT EXISTS member_memories (
      member_id INTEGER PRIMARY KEY,
      memory_data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );
  `);

  // Migrate calendar_events columns if missing
  const calCols = db.prepare('PRAGMA table_info(calendar_events)').all().map(c => c.name);
  if (!calCols.includes('target_audience')) {
    db.exec("ALTER TABLE calendar_events ADD COLUMN target_audience TEXT NOT NULL DEFAULT 'ALL'");
  }
  if (!calCols.includes('meeting_slot_id')) {
    db.exec('ALTER TABLE calendar_events ADD COLUMN meeting_slot_id INTEGER');
  }
  if (!calCols.includes('is_live')) {
    db.exec('ALTER TABLE calendar_events ADD COLUMN is_live INTEGER NOT NULL DEFAULT 0');
  }
  if (!calCols.includes('description')) {
    db.exec('ALTER TABLE calendar_events ADD COLUMN description TEXT');
  }

  try { db.exec('ALTER TABLE ballots ADD COLUMN rating INTEGER DEFAULT 5'); } catch (e) {}
  try { db.exec('ALTER TABLE ballots ADD COLUMN candidate_member_id INTEGER'); } catch (e) {}
  try { db.exec("ALTER TABLE tasklets ADD COLUMN type TEXT DEFAULT 'TASKLET'"); } catch (e) {}
  try { db.exec("ALTER TABLE tasklets ADD COLUMN category TEXT DEFAULT 'GENERAL'"); } catch (e) {}
  try { db.exec('ALTER TABLE tasklets ADD COLUMN is_anonymous INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE members ADD COLUMN google_sub TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE members ADD COLUMN email TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE voting_sessions ADD COLUMN target_member_id INTEGER'); } catch (e) {}

  // Ensure the 6 meeting slots exist
  const slotCount = db.prepare('SELECT COUNT(*) as count FROM meeting_slots').get();
  if (slotCount.count === 0) {
    seedMeetingSlots();
  }

  // Check if calendar_events exists or if seeding is needed
  const calCount = db.prepare('SELECT COUNT(*) as count FROM calendar_events').get();
  if (calCount.count === 0) {
    seedData();
  }
}

export function seedMeetingSlots() {
  db.exec('DELETE FROM meeting_slots;');
  const insertSlot = db.prepare('INSERT INTO meeting_slots (id, slot_code, slot_name, raw_url, last_used_at) VALUES (?, ?, ?, ?, ?)');
  insertSlot.run(1, 'SLOT-01', 'Meeting Bridge 1', 'https://meet.google.com/kuw-amav-swf', null);
  insertSlot.run(2, 'SLOT-02', 'Meeting Bridge 2', 'https://meet.google.com/mzs-atxy-yja', null);
  insertSlot.run(3, 'SLOT-03', 'Meeting Bridge 3', 'https://meet.google.com/sdj-njyx-bwm', null);
  insertSlot.run(4, 'SLOT-04', 'Meeting Bridge 4', 'https://meet.google.com/zky-swdi-phk', null);
  insertSlot.run(5, 'SLOT-05', 'Meeting Bridge 5', 'https://meet.google.com/nvr-adyb-wmb', null);
  insertSlot.run(6, 'SLOT-06', 'Meeting Bridge 6', 'https://meet.google.com/sae-wkpe-rth', null);
}

export function seedData() {
  // Clear old seed if re-running (delete child tables before parent tables)
  db.exec(`
    DELETE FROM ai_messages;
    DELETE FROM ai_threads;
    DELETE FROM member_memories;
    DELETE FROM tasklets;
    DELETE FROM sessions;
    DELETE FROM ballots;
    DELETE FROM used_tokens;
    DELETE FROM voting_eligibility;
    DELETE FROM voting_options;
    DELETE FROM voting_sessions;
    DELETE FROM access_tickets;
    DELETE FROM calendar_events;
    DELETE FROM tasks;
    DELETE FROM members;
    DELETE FROM sqlite_sequence;
  `);

  seedMeetingSlots();

  const insertMember = db.prepare(`
    INSERT INTO members (id, github_numeric_id, handle, name, role, team_track, is_host, is_allowed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sole authorized member: Kartikay (@potatobun321) as Team Host & Lead
  const members = [
    [1, 194890859, 'potatobun321', 'Kartikay', 'Team Host & Lead', 'lead', 1, 1]
  ];

  for (const m of members) {
    insertMember.run(...m);
  }

  // Seed tasks allocated by the Host
  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, track, assignee_id, status, deadline, deliverable_url, deliverable_notes, version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tasks = [
    [
      'Initialize Frontier AI Workspace & Onboard Core Team',
      'Authorize core engineering members via GitHub allowlist, configure meeting bridges, and establish sprint deliverables.',
      'lead',
      1, // Kartikay
      'IN_PROGRESS',
      new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
      'https://github.com/potatobun321/fronterAI-repo',
      'Real GitHub OAuth 2.0 and strict allowlist gating verified and live.',
      1,
      new Date().toISOString()
    ]
  ];

  for (const t of tasks) {
    insertTask.run(...t);
  }

  // Seed Calendar Events (Deadlines & Meeting Pings)
  const insertCal = db.prepare(`
    INSERT INTO calendar_events (title, description, event_type, event_date, time_label, target_audience, assignee_id, meeting_slot_id, meeting_link, is_live, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const events = [
    [
      'Sprint Architecture & Onboarding Sync',
      'Team kickoff sync to review roadmap, onboard engineers, and establish review milestones.',
      'MEETING',
      new Date().toISOString().split('T')[0],
      '11:00 AM IST',
      'ALL',
      null,
      1,
      'https://meet.google.com/kuw-amav-swf',
      0,
      1
    ]
  ];

  for (const ev of events) {
    insertCal.run(...ev);
  }

  // Initialize initial memory for Host
  db.prepare(`
    INSERT OR REPLACE INTO member_memories (member_id, memory_data, updated_at)
    VALUES (?, ?, datetime('now'))
  `).run(1, JSON.stringify({
    skills: ['Architecture', 'Node.js', 'SQLite', 'Security Governance'],
    focus_area: 'Core Workspace Platform & AI Integration',
    notes: 'Team Lead and Authorator'
  }));

  // Log system initialization in audit
  db.prepare(`
    INSERT INTO audit_events (timestamp, actor_handle, action, target, details, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    'potatobun321',
    'INIT_PLATFORM',
    'governance',
    'Frontier AI Platform initialized with clean slate and AI memory. Kartikay designated as Team Host & Lead.',
    'SUCCESS'
  );
}

// Audit logger helper
export function logAudit(actorHandle, action, target, details, status = 'SUCCESS') {
  try {
    db.prepare(`
      INSERT INTO audit_events (timestamp, actor_handle, action, target, details, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), actorHandle, action, target, details, status);
  } catch (err) {
    console.error('Audit log failure:', err);
  }
}
