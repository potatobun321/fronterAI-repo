const assert = require('node:assert');
const fs = require('node:fs');
const {
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
} = require('./db.js');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`FAIL: ${name} - ${err.message}`);
    failedCount++;
  }
}

// Track IDs for cleanup
const createdMemberIds = [];
const createdTaskIds = [];
const createdEventIds = [];
const createdSessionIds = [];
const createdRequestIds = [];

try {
  // Ensure we have at least one lead and one member for testing
  let lead = db.prepare("SELECT * FROM members WHERE role = 'lead' LIMIT 1").get();
  let member = db.prepare("SELECT * FROM members WHERE role = 'member' LIMIT 1").get();

  if (!lead) {
    const res = db.prepare("INSERT INTO members (github_id, name, role) VALUES (?, ?, 'lead')").run(99901, 'Test Lead');
    lead = { id: Number(res.lastInsertRowid), github_id: 99901, name: 'Test Lead', role: 'lead' };
    createdMemberIds.push(lead.id);
  }
  if (!member) {
    const res = db.prepare("INSERT INTO members (github_id, name, role) VALUES (?, ?, 'member')").run(99902, 'Test Member');
    member = { id: Number(res.lastInsertRowid), github_id: 99902, name: 'Test Member', role: 'member' };
    createdMemberIds.push(member.id);
  }

  // 1. listMembers
  runTest('listMembers', () => {
    const members = listMembers();
    assert(Array.isArray(members), 'listMembers must return an array');
    assert(members.length > 0, 'listMembers should return at least 1 member');
  });

  // 2. getMemberByGithubId
  runTest('getMemberByGithubId', () => {
    const found = getMemberByGithubId(lead.github_id);
    assert(found != null, 'Member should be found by github_id');
    assert.strictEqual(found.id, lead.id);
    const notFound = getMemberByGithubId(999999999);
    assert.strictEqual(notFound, null, 'Non-existent member should return null');
  });

  // 3. createTask
  // Cases: a member creating a task gets a 403; the lead creating a task works
  runTest('createTask', () => {
    let memberThrew403 = false;
    try {
      createTask(member.id, 'Unauthorized Task', member.id, '2026-12-01');
    } catch (err) {
      if (err.code === 403) memberThrew403 = true;
    }
    assert(memberThrew403, 'A member creating a task must throw 403');

    const taskId = createTask(lead.id, 'Lead Task for Testing', member.id, '2026-12-01');
    assert(typeof taskId === 'number', 'createTask by lead should return numeric taskId');
    createdTaskIds.push(taskId);
  });

  // 4. getTasksForMember
  runTest('getTasksForMember', () => {
    const tasks = getTasksForMember(member.id);
    assert(Array.isArray(tasks), 'getTasksForMember must return an array');
    assert(tasks.some(t => createdTaskIds.includes(t.id)), 'Should find task assigned to member');
  });

  // 5. updateTaskStatus
  runTest('updateTaskStatus', () => {
    const taskId = createdTaskIds[0];
    updateTaskStatus(taskId, member.id, 'in_progress', 'https://example.com/pr/1', 'In progress note');
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    assert.strictEqual(task.status, 'in_progress');
    assert.strictEqual(task.deliverable_link, 'https://example.com/pr/1');
    assert.strictEqual(task.notes, 'In progress note');
  });

  // 6. createEvent
  runTest('createEvent', () => {
    const eventId = createEvent(lead.id, 'Test Event for Verification', 'meeting', '2026-12-15T10:00:00Z', 'https://meet.google.com/test');
    assert(typeof eventId === 'number', 'createEvent should return numeric eventId');
    createdEventIds.push(eventId);
  });

  // 7. listEvents
  runTest('listEvents', () => {
    const events = listEvents();
    assert(Array.isArray(events), 'listEvents must return an array');
    assert(events.some(e => createdEventIds.includes(e.id)), 'Should find created test event');
  });

  // 8. logAudit
  runTest('logAudit', () => {
    const auditId = logAudit('test-runner', 'TEST_ACTION_ONCE', 'test-target-unique');
    assert(typeof auditId === 'number', 'logAudit should return numeric audit id');
  });

  // 9. searchAudit
  runTest('searchAudit', () => {
    const results = searchAudit('TEST_ACTION_ONCE');
    assert(Array.isArray(results), 'searchAudit must return an array');
    assert(results.some(r => r.action === 'TEST_ACTION_ONCE'), 'Should find TEST_ACTION_ONCE audit entry');
  });

  // 10. openVoteSession
  runTest('openVoteSession', () => {
    const sessionId = openVoteSession(lead.id, 'Test Voting Session for Suite');
    assert(typeof sessionId === 'number', 'openVoteSession should return numeric sessionId');
    createdSessionIds.push(sessionId);
  });

  // 11. addEligibleVoters
  runTest('addEligibleVoters', () => {
    const sessionId = createdSessionIds[0];
    const count = addEligibleVoters(sessionId);
    assert(typeof count === 'number' && count > 0, 'addEligibleVoters should return voter count');
  });

  // 12. claimVoteToken
  // Case: a member claiming a vote token twice gets 409
  let voteToken = null;
  runTest('claimVoteToken', () => {
    const sessionId = createdSessionIds[0];
    voteToken = claimVoteToken(sessionId, member.id);
    assert(typeof voteToken === 'string' && voteToken.length > 0, 'claimVoteToken should return token string');

    let threw409 = false;
    try {
      claimVoteToken(sessionId, member.id);
    } catch (err) {
      if (err.code === 409) threw409 = true;
    }
    assert(threw409, 'Claiming vote token twice must throw 409');
  });

  // 13. castBallot
  // Case: reusing a ballot token gets 409
  runTest('castBallot', () => {
    const sessionId = createdSessionIds[0];
    const ballotId = castBallot(sessionId, voteToken, 'Option A');
    assert(typeof ballotId === 'number', 'castBallot should return numeric ballotId');

    let threw409 = false;
    try {
      castBallot(sessionId, voteToken, 'Option B');
    } catch (err) {
      if (err.code === 409) threw409 = true;
    }
    assert(threw409, 'Reusing a ballot token must throw 409');
  });

  // 14. getResults
  // Case: results are blocked while the session is open
  runTest('getResults', () => {
    const sessionId = createdSessionIds[0];
    let threw403 = false;
    try {
      getResults(sessionId);
    } catch (err) {
      if (err.code === 403) threw403 = true;
    }
    assert(threw403, 'Results must be blocked while session is open (throw 403)');
  });

  // 15. closeVoteSession
  runTest('closeVoteSession', () => {
    const sessionId = createdSessionIds[0];
    const closed = closeVoteSession(lead.id, sessionId);
    assert.strictEqual(closed, true, 'closeVoteSession should return true');

    const results = getResults(sessionId);
    assert(Array.isArray(results), 'getResults should return results array after closing');
    assert.strictEqual(results['Option A'], 1, 'Option A should have 1 vote');
  });

  // 16. requestAccess
  runTest('requestAccess', () => {
    const reqId = requestAccess(member.id, 'deploy:staging-env');
    assert(typeof reqId === 'number', 'requestAccess should return numeric requestId');
    createdRequestIds.push(reqId);
  });

  // 17. approveAccess
  // Case: a requester approving their own access request gets 403
  runTest('approveAccess', () => {
    const reqId = createdRequestIds[0];
    let threw403 = false;
    try {
      approveAccess(reqId, member.id);
    } catch (err) {
      if (err.code === 403) threw403 = true;
    }
    assert(threw403, 'Requester approving their own access request must throw 403');

    const approved = approveAccess(reqId, lead.id);
    assert.strictEqual(approved, true, 'approveAccess by lead should return true');
  });

  // 18. hasActiveAccess
  runTest('hasActiveAccess', () => {
    const hasAccess = hasActiveAccess(member.id, 'deploy:staging-env');
    assert.strictEqual(hasAccess, true, 'Approved member should have active access');
    const noAccess = hasActiveAccess(lead.id, 'deploy:staging-env');
    assert.strictEqual(noAccess, false, 'Lead without approved request should not have active access');
  });

  // 19. exportBackup
  runTest('exportBackup', () => {
    const exported = exportBackup('test-runner');
    assert.strictEqual(exported, true, 'exportBackup should return true');
    assert(fs.existsSync('backups'), 'backups directory should exist');
    assert(fs.existsSync('backups/ballots.json'), 'backups/ballots.json should exist');
  });

} finally {
  // Clean up all created test data so tests can be safely re-run
  if (createdSessionIds.length > 0) {
    for (const sid of createdSessionIds) {
      db.prepare('DELETE FROM ballots WHERE session_id = ?').run(sid);
      db.prepare('DELETE FROM vote_eligibility WHERE session_id = ?').run(sid);
      db.prepare('DELETE FROM vote_sessions WHERE id = ?').run(sid);
    }
  }
  if (createdTaskIds.length > 0) {
    for (const tid of createdTaskIds) {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(tid);
    }
  }
  if (createdEventIds.length > 0) {
    for (const eid of createdEventIds) {
      db.prepare('DELETE FROM calendar_events WHERE id = ?').run(eid);
    }
  }
  if (createdRequestIds.length > 0) {
    for (const rid of createdRequestIds) {
      db.prepare('DELETE FROM access_requests WHERE id = ?').run(rid);
    }
  }
  if (createdMemberIds.length > 0) {
    for (const mid of createdMemberIds) {
      db.prepare('DELETE FROM members WHERE id = ?').run(mid);
    }
  }
  // Delete audit entries created by the test suite
  db.exec("DELETE FROM audit_log WHERE actor = 'test-runner' OR action = 'TEST_ACTION_ONCE' OR target = 'test-target-unique' OR target = 'deploy:staging-env' OR target = 'Test Voting Session for Suite' OR target = 'Test Event for Verification' OR target = 'Lead Task for Testing'");
}

console.log(`\nTests finished: ${passedCount} passed, ${failedCount} failed.`);
if (failedCount > 0) {
  process.exit(1);
}
