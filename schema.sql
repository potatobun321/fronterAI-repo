-- ==============================================================================
-- FRONTIER AI — CLOUDFLARE D1 DATABASE SCHEMA & SEED SCRIPT
-- Compatible with Cloudflare D1 (Serverless Distributed SQLite)
-- ==============================================================================

-- 1. Members (GitHub Allowlist & RBAC)
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

-- 2. Tasks (Sprint Board & Deliverables)
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

-- 3. Meeting Bridges (Permanent Google Meet Slots)
CREATE TABLE IF NOT EXISTS meeting_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_code TEXT NOT NULL UNIQUE,
  slot_name TEXT NOT NULL,
  raw_url TEXT NOT NULL,
  last_used_at TEXT
);

-- 4. Calendar Events (Deadlines & Meeting Pings)
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL, -- 'DEADLINE', 'MEETING', 'RETRO'
  event_date TEXT NOT NULL,
  time_label TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'ALL',
  assignee_id INTEGER,
  meeting_slot_id INTEGER,
  meeting_link TEXT,
  is_live INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  FOREIGN KEY (assignee_id) REFERENCES members (id),
  FOREIGN KEY (meeting_slot_id) REFERENCES meeting_slots (id),
  FOREIGN KEY (created_by) REFERENCES members (id)
);

-- 5. Voting Sessions (Cryptographic Governance)
CREATE TABLE IF NOT EXISTS voting_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'PERFORMANCE',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  total_eligible INTEGER DEFAULT 8,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT,
  target_member_id INTEGER,
  FOREIGN KEY (target_member_id) REFERENCES members (id)
);

-- 6. Voting Options (Candidates / Proposals)
CREATE TABLE IF NOT EXISTS voting_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  candidate_member_id INTEGER,
  label TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES voting_sessions (id),
  FOREIGN KEY (candidate_member_id) REFERENCES members (id)
);

-- 7. Voting Eligibility (Tracks who collected a blind ballot token)
CREATE TABLE IF NOT EXISTS voting_eligibility (
  session_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  token_issued_at TEXT NOT NULL,
  PRIMARY KEY (session_id, member_id),
  FOREIGN KEY (session_id) REFERENCES voting_sessions (id),
  FOREIGN KEY (member_id) REFERENCES members (id)
);

-- 8. Used Tokens (Prevents double voting via HMAC-SHA256 hash)
CREATE TABLE IF NOT EXISTS used_tokens (
  token_hash TEXT PRIMARY KEY,
  used_at TEXT NOT NULL
);

-- 9. Ballots (Strict Anonymity: NO MEMBER_ID!)
CREATE TABLE IF NOT EXISTS ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES voting_sessions (id),
  FOREIGN KEY (option_id) REFERENCES voting_options (id)
);

-- 10. Sessions (Persistent User Authentication Sessions)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);

-- 11. Access Tickets (2-Man Rule Emergency Elevation)
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

-- 12. Audit Events (Tamper-evident Audit Log)
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  actor_handle TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL
);

-- 13. Tasklets (Peer-to-Peer Informal Micro-tasks)
CREATE TABLE IF NOT EXISTS tasklets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sender_id) REFERENCES members (id),
  FOREIGN KEY (receiver_id) REFERENCES members (id)
);

-- 14. AI Threads (Short-term Conversation History)
CREATE TABLE IF NOT EXISTS ai_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
);

-- 15. AI Messages (Turn-by-turn User and Oracle Model Messages)
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES ai_threads (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages (thread_id);

-- 16. Member Memories (Long-term Profile & Objectives)
CREATE TABLE IF NOT EXISTS member_memories (
  member_id INTEGER PRIMARY KEY,
  memory_data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
);

-- ==============================================================================
-- INITIAL SEED DATA
-- ==============================================================================

-- 6 Pre-configured Google Meet Bridges
INSERT OR REPLACE INTO meeting_slots (id, slot_code, slot_name, raw_url, last_used_at) VALUES 
  (1, 'SLOT-01', 'Meeting Bridge 1', 'https://meet.google.com/kuw-amav-swf', NULL),
  (2, 'SLOT-02', 'Meeting Bridge 2', 'https://meet.google.com/mzs-atxy-yja', NULL),
  (3, 'SLOT-03', 'Meeting Bridge 3', 'https://meet.google.com/sdj-njyx-bwm', NULL),
  (4, 'SLOT-04', 'Meeting Bridge 4', 'https://meet.google.com/zky-swdi-phk', NULL),
  (5, 'SLOT-05', 'Meeting Bridge 5', 'https://meet.google.com/nvr-adyb-wmb', NULL),
  (6, 'SLOT-06', 'Meeting Bridge 6', 'https://meet.google.com/sae-wkpe-rth', NULL);

-- Initial Authorized Member: Kartikay (@potatobun321) as Team Host & Lead
INSERT OR REPLACE INTO members (id, github_numeric_id, handle, name, role, team_track, is_host, is_allowed) VALUES
  (1, 194890859, 'potatobun321', 'Kartikay', 'Team Host & Lead', 'lead', 1, 1);

-- Initial Sprint Task
INSERT OR REPLACE INTO tasks (id, title, description, track, assignee_id, status, deadline, deliverable_url, deliverable_notes, version, updated_at) VALUES
  (1, 'Initialize Frontier AI Workspace & Onboard Core Team', 'Authorize core engineering members via GitHub allowlist, configure meeting bridges, and establish sprint deliverables.', 'lead', 1, 'IN_PROGRESS', date('now', '+5 days'), 'https://github.com/potatobun321/fronterAI-repo', 'Real GitHub OAuth 2.0 and strict allowlist gating verified and live.', 1, datetime('now'));

-- Initial Kickoff Event
INSERT OR REPLACE INTO calendar_events (id, title, description, event_type, event_date, time_label, target_audience, assignee_id, meeting_slot_id, meeting_link, is_live, created_by) VALUES
  (1, 'Sprint Architecture & Onboarding Sync', 'Team kickoff sync to review roadmap, onboard engineers, and establish review milestones.', 'MEETING', date('now'), '11:00 AM IST', 'ALL', NULL, 1, 'https://meet.google.com/kuw-amav-swf', 0, 1);

-- Initial AI Memory Profile for Host
INSERT OR REPLACE INTO member_memories (member_id, memory_data, updated_at) VALUES
  (1, '{"skills":["Architecture","Node.js","SQLite","Security Governance"],"focus_area":"Core Workspace Platform & AI Integration","notes":"Team Lead and Authorator"}', datetime('now'));

-- Platform Init Audit Entry
INSERT OR REPLACE INTO audit_events (timestamp, actor_handle, action, target, details, status) VALUES
  (datetime('now'), 'potatobun321', 'INIT_PLATFORM', 'governance', 'Frontier AI Platform initialized on Cloudflare D1.', 'SUCCESS');
