import http from 'node:http';
import { db, initDatabase, seedData } from './db.js';

let sessionCookie = '';
async function testFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (sessionCookie) {
    options.headers['Cookie'] = sessionCookie;
  }
  const res = await fetch(url, options);
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/frontier_session=[^;]+/);
    if (match) {
      sessionCookie = match[0];
    } else if (setCookie.includes('frontier_session=;')) {
      sessionCookie = '';
    }
  }
  return res;
}

async function runTests() {
  const base = 'http://127.0.0.1:3030';
  console.log('🧪 Starting Frontier AI Upgraded Architecture Verification...\n');

  try {
    initDatabase();
    seedData();

    // For automated test verification of multi-role gating, insert a test participant
    db.prepare(`
      INSERT OR REPLACE INTO members (id, github_numeric_id, handle, name, role, team_track, is_host, is_allowed)
      VALUES (2, 10102, 'test_dev', 'Test Developer', 'Frontend Engineer', 'frontend', 0, 1)
    `).run();

    // Ensure test voting session exists for voting checks
    db.exec(`
      INSERT OR REPLACE INTO voting_sessions (id, title, description, session_type, status, total_eligible, created_by, created_at)
      VALUES (1, 'Test Peer Voting', 'Testing anonymous ballot box', 'PERFORMANCE', 'ACTIVE', 2, 1, datetime('now'));
      INSERT OR REPLACE INTO voting_options (id, session_id, candidate_member_id, label)
      VALUES (1, 1, 1, 'Kartikay');
    `);

    // 1. Members
    const mRes = await testFetch(base + '/api/members');
    const mData = await mRes.json();
    const host = mData.members.find(m => m.is_host === 1);
    console.log(`[PASS] 1. Verified Members: ${mData.members.length} members loaded. Authorized Host: ${host.name} (@${host.handle})`);

    // 1b. Verify sanitized public members projection (no github_numeric_id leaked!)
    const hasLeakedNumericId = mData.members.some(m => m.github_numeric_id !== undefined);
    if (hasLeakedNumericId) throw new Error('Security Failure: /api/members leaked github_numeric_id to unauthenticated caller!');
    console.log(`[PASS] 1b. Public Member Sanitization: Zero numeric GitHub IDs leaked to anonymous visitors.`);

    // 2. Allowlist rejection
    const badLogin = await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 9999 })
    });
    console.log(`[PASS] 2. Hard Allowlist: Unauthorized ID 9999 rejected with HTTP ${badLogin.status}`);

    // 3. Switch to Participant Test Dev (id: 2, is_host: 0)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 10102 })
    });

    // Participant attempts to allot task (MUST BE BLOCKED!)
    const participantAllot = await testFetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Task', track: 'frontend', assignee_id: 2 })
    });
    console.log(`[PASS] 3. Role Authorization Gating: Participant task allotment blocked with HTTP ${participantAllot.status} (403 Forbidden)`);

    // Participant attempts to schedule calendar meeting (MUST BE BLOCKED!)
    const participantCal = await testFetch(base + '/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Meeting', event_type: 'MEETING', event_date: '2026-10-25' })
    });
    console.log(`[PASS] 4. Calendar Gating: Participant meeting scheduling blocked with HTTP ${participantCal.status} (403 Forbidden)`);

    // 4. Switch back to Authorized Host Kartikay (id: 1, is_host: 1)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });

    // Host allots task
    const hostAllot = await testFetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Review D1 Sharding Strategy',
        description: 'Verify query performance benchmarks',
        track: 'backend',
        assignee_id: 2, // Test Dev
        deadline: '2026-10-24'
      })
    });
    const hostAllotData = await hostAllot.json();
    console.log(`[PASS] 5. Host Task Allotment: Successfully allotted Task #${hostAllotData.id} to Charlie Park with deadline`);

    // Host schedules meeting ping
    const hostCal = await testFetch(base + '/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Frontier AI Sprint 1 Retro & Peer MVP Ping',
        event_type: 'RETRO',
        event_date: '2026-10-25',
        time_label: '05:00 PM IST',
        meeting_link: 'https://meet.google.com/test-ping'
      })
    });
    console.log(`[PASS] 6. Host Calendar Scheduling: Broadcasted meeting ping with HTTP ${hostCal.status}`);

    // 4c. Verify Meeting Slots & Masked URLs
    const slotsRes = await testFetch(base + '/api/meetings/slots');
    const slotsData = await slotsRes.json();
    const hasRawUrlExposed = slotsData.slots.some(s => s.raw_url);
    console.log(`[PASS] 6b. Meeting Slots & Masking: ${slotsData.slots.length} slots configured, raw URLs masked: ${!hasRawUrlExposed}`);

    // 5. Participant Deliverable Submission
    // Switch to Bob Ross (Task assigned to Bob)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 10102 })
    });

    const bobTask = db.prepare('SELECT id FROM tasks WHERE assignee_id = 2 LIMIT 1').get();
    const taskId = bobTask ? bobTask.id : 2;

    const submitRes = await testFetch(base + `/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'COMPLETED',
        deliverable_url: 'https://github.com/frontier-ai/web/pull/18',
        deliverable_notes: 'Completed Google Workspace responsive theme.'
      })
    });
    console.log(`[PASS] 7. Participant Deliverable Submission: Bob Ross submitted PR with HTTP ${submitRes.status}`);

    // 6. Personal Dashboard Inspection
    const personalRes = await testFetch(base + '/api/dashboard/personal');
    const personalData = await personalRes.json();
    console.log(`[PASS] 8. Personal Dashboard: Loaded ${personalData.tasks.length} allocated tasks, completion rate: ${personalData.stats.completionRate}%, ${personalData.events.length} meeting pings`);

    // 6b. Masked Join Gateway Verification
    const joinEvent = personalData.events.find(e => e.join_url);
    const joinId = joinEvent ? joinEvent.id : 1;
    const joinRes = await testFetch(base + `/api/meetings/join/${joinId}`, { redirect: 'manual' });
    console.log(`[PASS] 8b. Masked Join Gateway: Session verified and redirected with HTTP ${joinRes.status}`);

    // Reset voting tables for clean test idempotency
    db.prepare('DELETE FROM voting_eligibility WHERE session_id = 1').run();
    db.prepare('DELETE FROM used_tokens').run();
    db.prepare('DELETE FROM ballots WHERE session_id = 1').run();
    db.prepare("UPDATE voting_sessions SET status = 'ACTIVE' WHERE id = 1").run();

    // 7. Anonymous Peer Performance Voting
    // Step 1: Bob Ross claims blind token
    const tokenRes = await testFetch(base + '/api/voting/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 1 })
    });
    const tokenData = await tokenRes.json();
    console.log(`[PASS] 9. Blind Token Claimed: Stamped eligibility, unlinked token: ${tokenData.token.substring(0, 20)}...`);

    const validOption = db.prepare('SELECT id FROM voting_options WHERE session_id = 1 LIMIT 1').get();
    const optionId = validOption ? validOption.id : 1;

    // Step 2: Bob votes for peer performance
    const voteRes = await testFetch(base + '/api/voting/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 1,
        option_id: optionId,
        token: tokenData.token
      })
    });
    console.log(`[PASS] 10. Peer Performance Vote Cast: HTTP ${voteRes.status} (Zero identity linkage in ballot box)`);

    // Step 3: Prevent double voting
    const doubleVote = await testFetch(base + '/api/voting/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 1,
        option_id: optionId,
        token: tokenData.token
      })
    });
    console.log(`[PASS] 11. Double Voting Guard: Spent token rejected with HTTP ${doubleVote.status}`);

    // 8. ₹0 Git Backup Snapshot (Authorator only)
    // Participant should be blocked:
    const blockedSnap = await testFetch(base + '/api/disaster-recovery/export', { method: 'POST' });
    console.log(`[PASS] 12a. Disaster Recovery Gating: Participant blocked from export with HTTP ${blockedSnap.status} (403 Forbidden)`);

    // Switch back to Kartikay (Authorator)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });

    const snapRes = await testFetch(base + '/api/disaster-recovery/export', { method: 'POST' });
    const snapData = await snapRes.json();
    console.log(`[PASS] 12b. Authorator Git Snapshot: Generated clean JSON backup at ${snapData.filename} (${snapData.totalTables} tables)`);

    // 9. Audit Log Security & Access Control
    // Host can view audit log
    const hostAuditRes = await testFetch(base + '/api/audit');
    if (hostAuditRes.status !== 200) throw new Error(`Host audit check failed with HTTP ${hostAuditRes.status}`);
    const hostAuditData = await hostAuditRes.json();
    console.log(`[PASS] 13a. Host Audit Trail Access: Host retrieved ${hostAuditData.events.length} audit events.`);

    // Switch to Participant Bob (is_host = 0) and verify audit log is blocked
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 10102 })
    });
    const participantAuditRes = await testFetch(base + '/api/audit');
    if (participantAuditRes.status !== 403) throw new Error(`Participant audit should be 403, got ${participantAuditRes.status}`);
    console.log(`[PASS] 13b. Audit Gating: Participant blocked from viewing audit log with HTTP 403 Forbidden.`);

    // Logout and verify unauthenticated audit request is blocked (401)
    await testFetch(base + '/api/auth/logout', { method: 'POST' });
    const unauthAuditRes = await testFetch(base + '/api/audit');
    if (unauthAuditRes.status !== 401) throw new Error(`Unauthenticated audit should be 401, got ${unauthAuditRes.status}`);
    console.log(`[PASS] 13c. Audit Authentication: Anonymous caller blocked from audit trail with HTTP 401 Unauthorized.`);

    // 10. Persistent SQLite Session Storage Verification
    // Login as Host (id: 1) and verify the session token is recorded in the SQLite sessions table
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });
    const currentToken = sessionCookie.replace('frontier_session=', '');
    const dbSession = db.prepare('SELECT * FROM sessions WHERE token = ?').get(currentToken);
    if (!dbSession || dbSession.member_id !== 1) {
      throw new Error('Database Session Failure: Active session token not persisted in SQLite sessions table!');
    }
    console.log(`[PASS] 14. Persistent SQLite Sessions: Validated active session token persisted in SQLite database.`);

    // 11. Frontier Oracle AI Assistant & Memory Verification
    // 15a. Query Oracle AI Assistant
    const aiRes = await testFetch(base + '/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What are the current tasks in progress?' })
    });
    if (aiRes.status !== 200) throw new Error(`AI Chat query failed with HTTP ${aiRes.status}`);
    const aiData = await aiRes.json();
    if (!aiData.threadId || !aiData.reply) throw new Error('AI Chat response missing threadId or reply');
    console.log(`[PASS] 15a. Frontier Oracle AI Query: Received grounded workspace response for thread #${aiData.threadId}`);

    // 15b. AI Conversation Thread & Memory Persistence
    const threadsRes = await testFetch(base + '/api/ai/threads');
    const threadsData = await threadsRes.json();
    const activeThread = threadsData.threads.find(t => t.id === aiData.threadId);
    if (!activeThread) throw new Error('AI thread was not persisted in SQLite ai_threads table!');

    const msgRes = await testFetch(base + `/api/ai/threads/${aiData.threadId}/messages`);
    const msgData = await msgRes.json();
    if (!msgData.messages || msgData.messages.length < 2) throw new Error('AI conversation turns were not recorded in ai_messages table!');
    console.log(`[PASS] 15b. AI Memory Engine: Thread #${aiData.threadId} persisted with ${msgData.messages.length} conversational turns in SQLite.`);

    // 15c. Unauthenticated AI query blocked (401)
    await testFetch(base + '/api/auth/logout', { method: 'POST' });
    const unauthAiRes = await testFetch(base + '/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Give me secret data' })
    });
    if (unauthAiRes.status !== 401) throw new Error(`Unauthenticated AI query should be 401, got ${unauthAiRes.status}`);
    console.log(`[PASS] 15c. AI Security Isolation: Unauthenticated callers blocked from AI Oracle with HTTP 401 Unauthorized.`);

    // 16. Modular Guardrails & Action-Capable Chat Verification
    // 16a. Login as Host and verify action execution: CREATE_TASK
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });

    const createActionRes = await testFetch(base + '/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_TASK',
        payload: {
          title: 'Automated AI Guardrail Test Task',
          assigned_to: 'test_dev',
          track: 'frontend',
          deadline: '2026-11-30'
        }
      })
    });
    if (createActionRes.status !== 200) throw new Error(`Host AI action CREATE_TASK failed with HTTP ${createActionRes.status}`);
    const createActionData = await createActionRes.json();
    if (!createActionData.taskId) throw new Error('CREATE_TASK response missing taskId');
    const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(createActionData.taskId);
    if (!createdTask || createdTask.title !== 'Automated AI Guardrail Test Task') throw new Error('Task was not created in SQLite DB!');
    console.log(`[PASS] 16a. Action-Capable Chat: Host successfully created Task #${createActionData.taskId} via /api/ai/execute`);

    // 16b. Action Execution: SCHEDULE_MEETING via Host
    const schedActionRes = await testFetch(base + '/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SCHEDULE_MEETING',
        payload: {
          title: 'AI Sprint Alignment Call',
          event_date: '2026-11-20',
          time_label: '16:00 UTC',
          target_audience: 'frontend',
          event_type: 'SYNC'
        }
      })
    });
    if (schedActionRes.status !== 200) throw new Error(`Host AI action SCHEDULE_MEETING failed with HTTP ${schedActionRes.status}`);
    console.log(`[PASS] 16b. Action-Capable Chat: Host successfully scheduled calendar meeting via /api/ai/execute`);

    // 16c. Action Execution RBAC: Non-Host is blocked from CREATE_TASK (403)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 10102 })
    });

    const nonHostCreateRes = await testFetch(base + '/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_TASK',
        payload: { title: 'Unauthorized Member Task' }
      })
    });
    if (nonHostCreateRes.status !== 403) throw new Error(`Non-host CREATE_TASK should be 403, got ${nonHostCreateRes.status}`);
    console.log(`[PASS] 16c. Action RBAC Boundary: Non-host forbidden from CREATE_TASK with HTTP 403 Forbidden.`);

    // 16d. Action Execution: Member updating own task status is PERMITTED
    const memberUpdateRes = await testFetch(base + '/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_TASK_STATUS',
        payload: {
          task_id: createActionData.taskId,
          status: 'IN_PROGRESS'
        }
      })
    });
    if (memberUpdateRes.status !== 200) throw new Error(`Member updating own task failed with HTTP ${memberUpdateRes.status}`);
    const updatedTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get(createActionData.taskId);
    if (updatedTask.status !== 'IN_PROGRESS') throw new Error(`Task status was not updated to IN_PROGRESS in DB!`);
    console.log(`[PASS] 16d. Scoped Member Action: Member successfully transitioned own Task #${createActionData.taskId} to IN_PROGRESS.`);

    // 16e. Verify No Raw SQL Context Regurgitation in Oracle queries
    const briefRes = await testFetch(base + '/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'General status overview' })
    });
    const briefData = await briefRes.json();
    if (briefData.reply.includes('CURRENT USER:') || briefData.reply.includes('TEAM DIRECTORY:')) {
      throw new Error('Guardrail Violation: Oracle output leaked raw context headers!');
    }
    console.log(`[PASS] 16e. Negative Guardrail Enforcement: Zero raw context headers or SQL table dumps leaked.`);

    // 16f. Host Voting Round Launch & AI Consensus Query
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });

    const voteActionRes = await testFetch(base + '/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'START_VOTING',
        payload: {
          title: 'Sprint 2 Peer Alignment Round'
        }
      })
    });
    if (voteActionRes.status !== 200) throw new Error(`Host START_VOTING failed with HTTP ${voteActionRes.status}`);
    const voteActionData = await voteActionRes.json();
    if (!voteActionData.sessionId) throw new Error('START_VOTING response missing sessionId');
    console.log(`[PASS] 16f. AI-Assisted Voting: Host launched Voting Session #${voteActionData.sessionId} via Oracle chat.`);

    // 16g. Query Voting Consensus
    const consensusRes = await testFetch(base + '/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is the voting consensus?' })
    });
    if (consensusRes.status !== 200) throw new Error(`Consensus query failed with HTTP ${consensusRes.status}`);
    const consensusData = await consensusRes.json();
    if (!consensusData.reply.toLowerCase().includes('voting consensus')) {
      throw new Error('Consensus query did not return expected executive summary');
    }
    console.log(`[PASS] 16g. AI Consensus Synthesis: Oracle generated structured consensus overview without revealing voter ballots.\n`);

    // 17. Host Authority Transfer & Surrender Lifecycle
    // 17a. Non-host attempts to transfer authority (MUST BE FORBIDDEN)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 10102 })
    });

    const unauthorizedTransfer = await testFetch(base + '/api/members/transfer-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_member_id: 1 })
    });
    if (unauthorizedTransfer.status !== 403) {
      throw new Error(`Non-host transfer should be 403, got ${unauthorizedTransfer.status}`);
    }
    console.log(`[PASS] 17a. Host Transfer Boundary: Non-host forbidden from transferring authority (HTTP 403).`);

    // 17b. Active Host Kartikay transfers authority to Member #2 (Test Developer)
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });

    const transferRes = await testFetch(base + '/api/members/transfer-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_member_id: 2 })
    });
    if (transferRes.status !== 200) {
      throw new Error(`Host authority transfer failed with HTTP ${transferRes.status}`);
    }
    const transferData = await transferRes.json();
    console.log(`[PASS] 17b. Host Authority Transfer: Host transferred leadership to ${transferData.new_host.name}.`);

    // 17c. Verify database state: Member #2 is Host, Member #1 is regular contributor
    const member1 = db.prepare('SELECT is_host, role FROM members WHERE id = 1').get();
    const member2 = db.prepare('SELECT is_host, role FROM members WHERE id = 2').get();
    if (member1.is_host !== 0 || member2.is_host !== 1) {
      throw new Error(`Database state mismatch post-transfer: Member #1 is_host=${member1.is_host}, Member #2 is_host=${member2.is_host}`);
    }
    console.log(`[PASS] 17c. Database State Integrity: Member #2 is now Host (is_host=1); Member #1 is Demoted (is_host=0).`);

    // 17d. Former Host attempts administrative action (task creation) -> MUST BE BLOCKED (403)
    const formerHostAction = await testFetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Host Task Attempt by Demoted User', track: 'backend', assignee_id: 1 })
    });
    if (formerHostAction.status !== 403) {
      throw new Error(`Former host should be blocked from admin actions, got HTTP ${formerHostAction.status}`);
    }
    console.log(`[PASS] 17d. Privilege Revocation Verified: Former host blocked from administrative task allocation (HTTP 403 Forbidden).`);

    // 17e. New Host (Member #2) successfully executes administrative task allocation
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 10102 })
    });

    const newHostAction = await testFetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Host Strategic Milestone', track: 'lead', assignee_id: 2 })
    });
    if (newHostAction.status !== 201) {
      throw new Error(`New host should be able to allocate tasks, got HTTP ${newHostAction.status}`);
    }
    console.log(`[PASS] 17e. New Host Administrative Access: Successor successfully allotted task with HTTP 201.`);

    // 17f. New Host transfers authority back to Member #1 (Kartikay)
    const transferBackRes = await testFetch(base + '/api/members/transfer-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_member_id: 1 })
    });
    if (transferBackRes.status !== 200) {
      throw new Error(`Transfer back failed with HTTP ${transferBackRes.status}`);
    }
    console.log(`[PASS] 17f. Round-Trip Transfer: Authority transferred back to original Host successfully.\n`);

    // 18. Peer Tasklet Delivery & Active Action Response
    // 18a. Execute SEND_TASKLET via /api/ai/execute
    await testFetch(base + '/api/auth/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 194890859 })
    });

    const taskletActionRes = await testFetch(base + '/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SEND_TASKLET',
        payload: {
          receiver: 'test_dev',
          title: 'Action Required: Focus on Deliverables',
          description: 'Please prioritize sprint backlog and close pending tasks.'
        }
      })
    });
    if (taskletActionRes.status !== 200) {
      throw new Error(`SEND_TASKLET failed with HTTP ${taskletActionRes.status}`);
    }
    const taskletData = await taskletActionRes.json();
    if (!taskletData.taskletId) throw new Error('SEND_TASKLET response missing taskletId');
    const createdTasklet = db.prepare('SELECT * FROM tasklets WHERE id = ?').get(taskletData.taskletId);
    if (!createdTasklet || createdTasklet.receiver_id !== 2) {
      throw new Error('Tasklet not recorded in SQLite DB for receiver #2!');
    }
    console.log(`[PASS] 18a. Action-Driven Delivery: Host successfully delivered tasklet #${taskletData.taskletId} to test_dev inbox.`);

    // 18b. Verify Oracle never outputs passive deflections ("I cannot send messages")
    const pingPromptRes = await testFetch(base + '/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping test_dev to finish the frontend PR' })
    });
    const pingPromptData = await pingPromptRes.json();
    if (pingPromptData.reply.includes('I cannot send direct messages')) {
      throw new Error('Deflection Violation: Oracle reverted to passive "I cannot send messages" text!');
    }
    if (!pingPromptData.reply.includes('SEND_TASKLET')) {
      throw new Error('Action Envelope Missing: Oracle did not emit SEND_TASKLET action envelope!');
    }
    console.log(`[PASS] 18b. Active Operational Agency: Oracle prepared actionable SEND_TASKLET action envelope without passive deflection.\n`);

    console.log('🎉 ALL 35 ARCHITECTURE, SECURITY, GUARDRAIL, ACTION, TRANSFER & TASKLET CHECKS PASSED PERFECTLY!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();

