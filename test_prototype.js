import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const persistDir = path.join(os.tmpdir(), `frontier_cf_test_${Date.now()}`);
const port = 8799;
const base = `http://127.0.0.1:${port}`;

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForWorker(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/members`);
      if (res.ok) return;
    } catch { }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Wrangler dev did not become ready within ${timeoutMs}ms`);
}

async function runTests() {
  const wranglerEntry = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js');
  const workerProc = spawn(
    process.execPath,
    [wranglerEntry, 'dev', '--local', '--port', String(port), '--persist-to', persistDir],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderrBuf = '';
  workerProc.stderr.on('data', d => { stderrBuf += d.toString(); });

  try {
    console.log(`🧪 Starting Frontier AI Cloudflare Worker + D1 Verification (port ${port})...\n`);
    await waitForWorker();

    // 1. Public Members & Sanitization
    const mRes = await testFetch(`${base}/api/members`);
    const mData = await mRes.json();
    assert(mRes.status === 200 && Array.isArray(mData.members), 'Expected /api/members to return members array');
    const host = mData.members.find(m => m.is_host === 1);
    assert(host, 'Expected seeded Host member');
    const hasLeakedNumericId = mData.members.some(m => m.github_numeric_id !== undefined);
    assert(!hasLeakedNumericId, 'Security Failure: /api/members leaked github_numeric_id to anonymous caller!');
    console.log(`[PASS] 1. Verified Members & Sanitization: Host ${host.name} (@${host.handle}), zero leaked IDs.`);

    // 2. Hard Allowlist
    const badLogin = await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_numeric_id: 9999 })
    });
    assert(badLogin.status === 403, `Expected 403 for unknown login-as, got ${badLogin.status}`);
    console.log(`[PASS] 2. Hard Allowlist: Unauthorized ID 9999 rejected with HTTP ${badLogin.status}`);

    // 3. Host Login & Onboard Participant
    const hostLogin = await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: host.id })
    });
    assert(hostLogin.status === 200, `Host login failed: ${hostLogin.status}`);

    const onboardRes = await testFetch(`${base}/api/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_dev@frontier.local',
        name: 'Test Developer',
        handle: 'test_dev',
        role: 'Frontend Engineer',
        team_track: 'frontend'
      })
    });
    const onboardData = await onboardRes.json();
    assert(onboardRes.status === 201 || onboardRes.status === 200, `Onboard failed: ${JSON.stringify(onboardData)}`);
    const devId = onboardData.id || onboardData.member?.id;
    assert(devId, `Expected onboarded member ID, got: ${JSON.stringify(onboardData)}`);
    console.log(`[PASS] 3. Host Onboarded Participant #${devId} (@test_dev).`);

    // 4. Switch to Participant & Verify RBAC Boundaries
    const devLogin = await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: devId })
    });
    assert(devLogin.status === 200, 'Participant login failed');

    const pTask = await testFetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Task', track: 'frontend', assignee_id: devId })
    });
    assert(pTask.status === 403, `Expected 403 for participant task create, got ${pTask.status}`);

    const pCal = await testFetch(`${base}/api/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Meeting', event_type: 'MEETING', event_date: '2026-12-01' })
    });
    assert(pCal.status === 403, `Expected 403 for participant calendar create, got ${pCal.status}`);

    const pDr = await testFetch(`${base}/api/disaster-recovery/export`, { method: 'POST' });
    assert(pDr.status === 403, `Expected 403 for participant DR export, got ${pDr.status}`);

    const pAudit = await testFetch(`${base}/api/audit`);
    assert(pAudit.status === 403, `Expected 403 for participant audit log, got ${pAudit.status}`);

    const pAiExec = await testFetch(`${base}/api/ai/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE_TASK', payload: { title: 'Bypass Attempt' } })
    });
    assert(pAiExec.status === 403, `Expected 403 for participant AI CREATE_TASK, got ${pAiExec.status}`);
    console.log(`[PASS] 4. RBAC Boundaries: Participant blocked from tasks, calendar, DR, audit, and AI admin actions (HTTP 403).`);

    // 5. Host Task Allotment, Calendar, Meeting Slots & DR Export
    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: host.id })
    });

    const createTaskRes = await testFetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Build Cloudflare Edge UI', track: 'frontend', assignee_id: devId, deadline: '2026-12-10' })
    });
    const createdTask = await createTaskRes.json();
    const createdTaskId = createdTask.taskId || createdTask.id;
    assert(createTaskRes.status === 201 && createdTaskId, `Host task creation failed: ${JSON.stringify(createdTask)}`);

    const slotsRes = await testFetch(`${base}/api/meetings/slots`);
    const slotsData = await slotsRes.json();
    assert(slotsRes.status === 200 && slotsData.slots.length === 6, 'Expected 6 meeting slots');
    assert(!slotsData.slots.some(s => s.raw_url), 'Security Failure: raw_url leaked in /api/meetings/slots');

    const drRes = await testFetch(`${base}/api/disaster-recovery/export`, { method: 'POST' });
    assert(drRes.status === 200, 'Host DR export failed');
    console.log(`[PASS] 5. Host Operations: Task #${createdTaskId} allotted, 6 masked meeting slots, DR export succeeded.`);

    // 6. Participant Deliverable Update & Personal Dashboard
    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: devId })
    });

    const patchTask = await testFetch(`${base}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED', deliverable_url: 'https://github.com/example/pr/1', version: 1 })
    });
    assert(patchTask.status === 200, `Participant task update failed: ${patchTask.status}`);

    const dashRes = await testFetch(`${base}/api/dashboard/personal`);
    assert(dashRes.status === 200, 'Personal dashboard failed');
    console.log(`[PASS] 6. Participant Deliverable & Personal Dashboard verified.`);

    // 7. Cryptographic Blind Voting & Double-Claim Guard
    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: host.id })
    });

    const voteCreate = await testFetch(`${base}/api/voting/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Sprint Review Vote', session_type: 'PEER_PERFORMANCE' })
    });
    const voteCreateData = await voteCreate.json();
    assert(voteCreate.status === 201 || voteCreate.status === 200, `Voting create failed: ${JSON.stringify(voteCreateData)}`);
    const sessionId = voteCreateData.session_id || voteCreateData.sessionId || voteCreateData.session?.id;
    assert(sessionId, `Expected session_id, got: ${JSON.stringify(voteCreateData)}`);

    const claim1 = await testFetch(`${base}/api/voting/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const claim1Data = await claim1.json();
    assert(claim1.status === 200 && claim1Data.token, 'Failed to claim blind ballot token');

    // Verify double-claim is blocked even when 0 ballots have been cast
    const claim2 = await testFetch(`${base}/api/voting/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert(claim2.status === 400, `Double-claim loophole! Expected 400, got ${claim2.status}`);

    const cast1 = await testFetch(`${base}/api/voting/cast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: claim1Data.token, session_id: sessionId, candidate_id: devId, rating: 5 })
    });
    assert(cast1.status === 200, `Ballot cast failed: ${cast1.status}`);

    const cast2 = await testFetch(`${base}/api/voting/cast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: claim1Data.token, session_id: sessionId, candidate_id: devId, rating: 5 })
    });
    assert(cast2.status === 409, `Expected 409 double-spend rejection, got ${cast2.status}`);
    console.log(`[PASS] 7. Blind Voting: Token claim, double-claim guard, ballot cast, and 409 double-spend guard passed.`);

    // 8. Frontier Oracle AI Chat & Action Execution (verifying logAudit fix)
    const aiChat = await testFetch(`${base}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Who is on the team?' })
    });
    const aiChatData = await aiChat.json();
    assert(aiChat.status === 200 && aiChatData.reply, 'AI chat failed');

    const aiExec = await testFetch(`${base}/api/ai/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_TASK',
        payload: { title: 'Oracle Action Task', track: 'backend', assigned_to: 'test_dev' }
      })
    });
    assert(aiExec.status === 200, `AI execute CREATE_TASK failed: ${aiExec.status}`);
    console.log(`[PASS] 8. Frontier Oracle AI Chat & Action Execution verified on Cloudflare Worker.`);

    // 9. Host Transfer Round-Trip
    const transfer1 = await testFetch(`${base}/api/members/transfer-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_member_id: devId })
    });
    assert(transfer1.status === 200, `Transfer host failed: ${transfer1.status}`);

    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: devId })
    });
    const transferBack = await testFetch(`${base}/api/members/transfer-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_member_id: host.id })
    });
    assert(transferBack.status === 200, `Transfer host back failed: ${transferBack.status}`);
    console.log(`[PASS] 9. Host Authority Transfer round-trip verified.`);

    // 10. Meeting Slot Editing (Host-only + HTTPS validation)
    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: devId })
    });
    const devSlotEdit = await testFetch(`${base}/api/meetings/slots/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_name: 'Hacked Bridge' })
    });
    assert(devSlotEdit.status === 403, `Expected 403 for participant slot edit, got ${devSlotEdit.status}`);

    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: host.id })
    });
    const badSlotUrl = await testFetch(`${base}/api/meetings/slots/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_url: 'http://insecure.example.com' })
    });
    assert(badSlotUrl.status === 400, `Expected 400 for non-HTTPS slot URL, got ${badSlotUrl.status}`);

    const goodSlotEdit = await testFetch(`${base}/api/meetings/slots/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_name: 'Xenon Core Bridge 1', raw_url: 'https://meet.google.com/abc-defg-hij' })
    });
    assert(goodSlotEdit.status === 200, `Host slot edit failed: ${goodSlotEdit.status}`);
    console.log(`[PASS] 10. Meeting Slot Editing: RBAC 403, HTTPS validation 400, and Host update 200 verified.`);

    // 11. 2-Man Governance Tickets & Audit Hash Chain
    const ticketRes = await testFetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Prod D1 Migration', reason: 'Schema update', scope: 'd1_admin', duration_minutes: 30 })
    });
    const ticketData = await ticketRes.json();
    const ticketId = ticketData.id || ticketData.ticketId;
    assert(ticketRes.status === 201 && ticketId, `Ticket creation failed: ${JSON.stringify(ticketData)}`);

    const selfApprove = await testFetch(`${base}/api/tickets/${ticketId}/approve`, { method: 'POST' });
    assert(selfApprove.status === 403, `Expected 403 for self-approval, got ${selfApprove.status}`);

    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: devId })
    });
    const peerApprove = await testFetch(`${base}/api/tickets/${ticketId}/approve`, { method: 'POST' });
    assert(peerApprove.status === 200, `Peer approval failed: ${peerApprove.status}`);

    await testFetch(`${base}/api/auth/login-as`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: host.id })
    });
    const verifyRes = await testFetch(`${base}/api/audit/verify`);
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 200 && verifyData.valid === true, `Audit chain verification failed: ${JSON.stringify(verifyData)}`);
    console.log(`[PASS] 11. 2-Man Governance & Audit Hash Chain: Self-approval blocked (403), peer sign-off (200), chain valid (${verifyData.totalChecked} events).`);

    // 12. Peer Tasklets CRUD
    const tlCreate = await testFetch(`${base}/api/tasklets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiver_id: devId, title: 'Review Xenon UI', description: 'Check mobile header' })
    });
    const tlData = await tlCreate.json();
    const tlId = tlData.id || tlData.taskletId;
    assert(tlCreate.status === 201 && tlId, `Tasklet create failed: ${JSON.stringify(tlData)}`);

    const tlPatch = await testFetch(`${base}/api/tasklets/${tlId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DONE' })
    });
    assert(tlPatch.status === 200, `Tasklet update failed: ${tlPatch.status}`);

    const tlDel = await testFetch(`${base}/api/tasklets/${tlId}`, { method: 'DELETE' });
    assert(tlDel.status === 200, `Tasklet delete failed: ${tlDel.status}`);
    console.log(`[PASS] 12. Peer Tasklets CRUD verified.`);

    // 13. Registration Apply, Status Check, Approve & Reject
    const applyRes = await fetch(`${base}/api/auth/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Applicant', email: 'applicant@example.com', role: 'ML Engineer', team_track: 'backend' })
    });
    assert(applyRes.status === 201, `Registration apply failed: ${applyRes.status}`);

    const statusPending = await fetch(`${base}/api/auth/application-status?email=applicant@example.com`);
    const statusPendingData = await statusPending.json();
    assert(statusPendingData.status === 'PENDING', `Expected PENDING status, got ${JSON.stringify(statusPendingData)}`);

    // Host rejects applicant -> status becomes REJECTED
    const pendListRes = await testFetch(`${base}/api/members/pending`);
    const pendList = await pendListRes.json();
    const applicant = (pendList.pending || []).find(p => p.email === 'applicant@example.com');
    assert(applicant, 'Applicant not found in pending list');

    const rejectRes = await testFetch(`${base}/api/members/${applicant.id}/reject`, { method: 'POST' });
    assert(rejectRes.status === 200, `Reject failed: ${rejectRes.status}`);

    const statusRejected = await fetch(`${base}/api/auth/application-status?email=applicant@example.com`);
    const statusRejectedData = await statusRejected.json();
    assert(statusRejectedData.status === 'REJECTED', `Expected REJECTED status, got ${JSON.stringify(statusRejectedData)}`);
    console.log(`[PASS] 13. Registration Apply, Pending Queue, Reject & Status Check verified.`);

    // 14. AI SEND_TASKLET with formatted receiver string "Test Developer (@test_dev)"
    const formattedTasklet = await testFetch(`${base}/api/ai/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SEND_TASKLET',
        payload: { receiver: 'Test Developer (@test_dev)', title: 'Formatted Handle Ping', description: 'Testing @handle extraction' }
      })
    });
    assert(formattedTasklet.status === 200, `Formatted SEND_TASKLET failed: ${formattedTasklet.status}`);
    console.log(`[PASS] 14. AI SEND_TASKLET with formatted "Name (@handle)" resolved cleanly.`);

    // 15. Voting Finality (No Reopen), Compact History, & Delete
    const closeVoteRes = await testFetch(`${base}/api/voting/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert(closeVoteRes.status === 200, `Voting close failed: ${closeVoteRes.status}`);

    const reopenRes = await testFetch(`${base}/api/voting/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert(reopenRes.status === 410, `Expected 410 for reopen, got ${reopenRes.status}`);

    const afterClose = await testFetch(`${base}/api/voting/current`);
    const afterCloseData = await afterClose.json();
    assert(afterCloseData.session === null, 'Expected session to be null after close');
    assert(Array.isArray(afterCloseData.history) && afterCloseData.history.length === 1, 'Expected 1 closed session in history');
    assert(afterCloseData.history[0].participants.length === 1, 'Expected 1 participant in history row');

    const delVoteRes = await testFetch(`${base}/api/voting/${sessionId}`, { method: 'DELETE' });
    assert(delVoteRes.status === 200, `Voting delete failed: ${delVoteRes.status}`);

    const afterDel = await testFetch(`${base}/api/voting/current`);
    const afterDelData = await afterDel.json();
    assert(afterDelData.history.length === 0, 'Expected history to be empty after delete');
    console.log(`[PASS] 15. Voting Finality (410 on reopen), Compact History Row, & Delete verified.`);

    console.log('\n🎉 ALL CLOUDFLARE WORKER + D1 VERIFICATION CHECKS PASSED!');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    if (stderrBuf) console.error('Wrangler stderr:\n', stderrBuf);
    process.exitCode = 1;
  } finally {
    try { workerProc.kill('SIGTERM'); } catch { }
    try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch { }
  }
}

runTests();
