const { db } = require('./db.js');

// 8 sample members: Alice Vance as lead, Bob Ross and six more as members
const sampleMembers = [
  { github_id: 10001, name: 'Alice Vance', role: 'lead' },
  { github_id: 10002, name: 'Bob Ross', role: 'member' },
  { github_id: 10003, name: 'Charlie Brown', role: 'member' },
  { github_id: 10004, name: 'Diana Prince', role: 'member' },
  { github_id: 10005, name: 'Evan Wright', role: 'member' },
  { github_id: 10006, name: 'Fiona Gallagher', role: 'member' },
  { github_id: 10007, name: 'George Clark', role: 'member' },
  { github_id: 10008, name: 'Hannah Abbott', role: 'member' }
];

const insertMemberStmt = db.prepare(
  'INSERT OR IGNORE INTO members (github_id, name, role) VALUES (?, ?, ?)'
);

for (const m of sampleMembers) {
  insertMemberStmt.run(m.github_id, m.name, m.role);
}

// Fetch member IDs for foreign key relationships
const getMemberStmt = db.prepare('SELECT id FROM members WHERE github_id = ?');
const alice = getMemberStmt.get(10001);
const bob = getMemberStmt.get(10002);
const charlie = getMemberStmt.get(10003);
const diana = getMemberStmt.get(10004);

// 3 sample tasks
const sampleTasks = [
  {
    title: 'Setup CI/CD pipeline',
    assigned_to: bob?.id ?? null,
    assigned_by: alice?.id ?? null,
    deadline: '2026-11-01',
    status: 'todo',
    deliverable_link: 'https://github.com/org/repo/actions',
    notes: 'Configure GitHub Actions workflow for linting and tests'
  },
  {
    title: 'Implement authentication flow',
    assigned_to: charlie?.id ?? null,
    assigned_by: alice?.id ?? null,
    deadline: '2026-11-05',
    status: 'in_progress',
    deliverable_link: null,
    notes: 'OAuth integration with GitHub'
  },
  {
    title: 'Database schema migration',
    assigned_to: diana?.id ?? null,
    assigned_by: alice?.id ?? null,
    deadline: '2026-11-10',
    status: 'completed',
    deliverable_link: 'https://github.com/org/repo/pull/42',
    notes: 'Added tables and audit logging'
  }
];

const checkTaskStmt = db.prepare('SELECT id FROM tasks WHERE title = ?');
const insertTaskStmt = db.prepare(
  'INSERT INTO tasks (title, assigned_to, assigned_by, deadline, status, deliverable_link, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

for (const t of sampleTasks) {
  const existing = checkTaskStmt.get(t.title);
  if (!existing) {
    insertTaskStmt.run(
      t.title,
      t.assigned_to,
      t.assigned_by,
      t.deadline,
      t.status,
      t.deliverable_link,
      t.notes
    );
  }
}

// 3 sample calendar events
const sampleEvents = [
  {
    title: 'Sprint Planning',
    type: 'meeting',
    event_date: '2026-10-25T10:00:00Z',
    meet_link: 'https://meet.google.com/abc-defg-hij',
    created_by: alice?.id ?? null
  },
  {
    title: 'Mid-Sprint Sync',
    type: 'sprint_sync',
    event_date: '2026-10-28T14:00:00Z',
    meet_link: 'https://meet.google.com/klm-nopq-rst',
    created_by: alice?.id ?? null
  },
  {
    title: 'Sprint 1 Deliverable Deadline',
    type: 'deadline',
    event_date: '2026-11-02T18:00:00Z',
    meet_link: null,
    created_by: alice?.id ?? null
  }
];

const checkEventStmt = db.prepare('SELECT id FROM calendar_events WHERE title = ?');
const insertEventStmt = db.prepare(
  'INSERT INTO calendar_events (title, type, event_date, meet_link, created_by) VALUES (?, ?, ?, ?, ?)'
);

for (const e of sampleEvents) {
  const existing = checkEventStmt.get(e.title);
  if (!existing) {
    insertEventStmt.run(
      e.title,
      e.type,
      e.event_date,
      e.meet_link,
      e.created_by
    );
  }
}

console.log('Database seeded successfully.');
