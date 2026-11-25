import { GEMINI_API_KEY, GROQ_API_KEY, GROQ_MODEL, AI_PROVIDER } from '../config.js';
import { db } from '../db.js';
import { buildSystemPrompt } from './promptLoader.js';

/**
 * Builds a token-optimized, role-sanitized workspace snapshot in compact markdown.
 * Implements intent-based filtering to avoid the "Context Stuffing" token trap.
 */
export function buildWorkspaceContext(db, currentUser, userMessage = '') {
  const text = (userMessage || '').toLowerCase();
  const parts = [];

  // 1. User Identity & Permissions (~20 tokens)
  parts.push(`CURRENT USER: ${currentUser.name} (@${currentUser.handle}) | Role: ${currentUser.role} | Track: ${currentUser.team_track} | Is Host: ${currentUser.is_host ? 'YES' : 'NO'}`);

  // 1b. Long-term Member Memory (from member_memories)
  try {
    const memRow = db.prepare('SELECT memory_data FROM member_memories WHERE member_id = ?').get(currentUser.id);
    if (memRow?.memory_data && memRow.memory_data !== '{}') {
      parts.push(`USER PROFILE MEMORY: ${memRow.memory_data}`);
    }
  } catch (_) {}

  // 2. Member Directory (Always compact, ~60 tokens for 8 members)
  const members = db.prepare('SELECT id, name, handle, role, team_track, is_host FROM members WHERE is_allowed = 1 ORDER BY is_host DESC, id ASC').all();
  parts.push("TEAM DIRECTORY:\n" + members.map(m => `- ${m.name} (@${m.handle}): ${m.role} [Track: ${m.team_track || 'General'}]${m.is_host ? ' (Lead)' : ''}`).join("\n"));

  // 3. Sprint Analytics & Velocity Metrics (Calculated dynamically)
  const taskStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status = 'TODO' THEN 1 ELSE 0 END) as todo
    FROM tasks
  `).get() || { total: 0, completed: 0, in_progress: 0, review: 0, todo: 0 };

  const velocityPct = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
  parts.push(`SPRINT VELOCITY & HEALTH:
- Progress: ${taskStats.completed}/${taskStats.total} completed (${velocityPct}%)
- Distribution: ${taskStats.in_progress} in progress, ${taskStats.review} in review, ${taskStats.todo} in backlog`);

  // 4. Dynamic Intent Filter: Tasks (~50-100 tokens only when relevant)
  const taskKeywords = /task|todo|progress|deliverable|deadline|work|sprint|pr|blocked|status|standup|assign/;
  if (taskKeywords.test(text) || text.length < 5) {
    const tasks = db.prepare(`
      SELECT t.id, t.title, t.track, t.status, t.deadline, t.deliverable_url, m.name as assignee
      FROM tasks t
      LEFT JOIN members m ON t.assignee_id = m.id
      ORDER BY t.id ASC LIMIT 15
    `).all();
    if (tasks.length > 0) {
      parts.push("ACTIVE TASKS:\n" + tasks.map(t => `- [${t.status}] #${t.id}: "${t.title}" (Assignee: ${t.assignee || 'Unassigned'}, Due: ${t.deadline || 'None'}${t.deliverable_url ? ', Deliverable: Attached' : ''})`).join("\n"));
    }
  }

  // 5. Dynamic Intent Filter: Calendar & Google Meet Syncs (~50 tokens)
  const calKeywords = /meet|call|sync|calendar|slot|bridge|schedule|google|today|event|retro/;
  if (calKeywords.test(text) || text.length < 5) {
    const events = db.prepare(`
      SELECT id, title, event_type, event_date, time_label, target_audience, is_live
      FROM calendar_events
      ORDER BY event_date ASC, id ASC LIMIT 5
    `).all();
    if (events.length > 0) {
      parts.push("UPCOMING SYNC EVENTS:\n" + events.map(e => `- #${e.id} [${e.event_type}${e.is_live ? ' LIVE' : ''}] "${e.title}" on ${e.event_date} at ${e.time_label} (Audience: ${e.target_audience})`).join("\n"));
    }
  }

  // 6. Dynamic Intent Filter: Peer Tasklets (~40 tokens)
  const taskletKeywords = /tasklet|peer|request|micro|received|sent/;
  if (taskletKeywords.test(text)) {
    const tasklets = db.prepare(`
      SELECT t.title, t.status, s.name as sender, r.name as receiver
      FROM tasklets t
      JOIN members s ON t.sender_id = s.id
      JOIN members r ON t.receiver_id = r.id
      ORDER BY t.id DESC LIMIT 8
    `).all();
    if (tasklets.length > 0) {
      parts.push("PEER TASKLETS:\n" + tasklets.map(t => `- [${t.status}] "${t.title}" from ${t.sender} to ${t.receiver}`).join("\n"));
    }
  }

  // 7. Role-Gated Admin Context (Host Only)
  if (currentUser.is_host) {
    const ticketKeywords = /ticket|governance|access|permission|request/;
    if (ticketKeywords.test(text) || text.length < 5) {
      const tickets = db.prepare(`
        SELECT t.id, t.title, t.reason, t.scope, t.status, req.name as requester
        FROM access_tickets t
        JOIN members req ON t.requester_id = req.id
        WHERE t.status = 'PENDING_APPROVAL'
      `).all();
      if (tickets.length > 0) {
        parts.push("PENDING 2-MAN ACCESS TICKETS (Host Only):\n" + tickets.map(tk => `- #${tk.id} by ${tk.requester}: "${tk.title}" for ${tk.scope}`).join("\n"));
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Handles multi-turn chat with the AI assistant.
 * Supports Google Gemini 1.5 Flash (default) and Groq Llama 3, with zero external npm dependencies.
 */
export async function chatWithAssistant({ userMessage, threadId, currentUser }) {
  if (!userMessage || !userMessage.trim()) {
    throw new Error('Message cannot be empty.');
  }

  // 1. Get or create thread in SQLite
  let activeThreadId = threadId ? parseInt(threadId, 10) : null;
  if (!activeThreadId) {
    const threadTitle = userMessage.trim().substring(0, 50);
    const result = db.prepare(`
      INSERT INTO ai_threads (member_id, title, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).run(currentUser.id, threadTitle);
    activeThreadId = result.lastInsertRowid;
  }

  // 2. Fetch conversation history for this thread (sliding window: last 6 turns)
  const history = db.prepare(`
    SELECT sender_role, content FROM ai_messages
    WHERE thread_id = ?
    ORDER BY id DESC
    LIMIT 6
  `).all(activeThreadId).reverse();

  // 3. Build dynamic, token-optimized workspace context
  const workspaceContext = buildWorkspaceContext(db, currentUser, userMessage);

  // 4. Build modular system prompt with dominant negative guardrails
  const systemPrompt = buildSystemPrompt({ currentUser, workspaceContext });

  let replyText = '';

  // 5. Check for active API key with graceful local fallback
  try {
    if (GEMINI_API_KEY && AI_PROVIDER !== 'groq') {
      replyText = await callGeminiFlash(systemPrompt, history, userMessage);
    } else if (GROQ_API_KEY && AI_PROVIDER === 'groq') {
      replyText = await callGroqLlama(systemPrompt, history, userMessage);
    } else {
      replyText = generateLocalFallback(workspaceContext, userMessage, currentUser);
    }
  } catch (apiErr) {
    console.warn('External AI API call failed, falling back to local deterministic engine:', apiErr.message);
    replyText = generateLocalFallback(workspaceContext, userMessage, currentUser);
  }

  // 6. Extract action payload if emitted by model or fallback
  let detectedAction = null;
  const actionMatch = replyText.match(/```action\s*([\s\S]*?)```/);
  if (actionMatch) {
    try {
      detectedAction = JSON.parse(actionMatch[1].trim());
    } catch (e) {
      console.warn('Failed to parse detected action JSON:', e.message);
    }
  }

  // 7. Persist turns in SQLite
  const insertStmt = db.prepare(`
    INSERT INTO ai_messages (thread_id, sender_role, content, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  insertStmt.run(activeThreadId, 'user', userMessage.trim());
  insertStmt.run(activeThreadId, 'model', replyText);

  db.prepare(`UPDATE ai_threads SET updated_at = datetime('now') WHERE id = ?`).run(activeThreadId);

  // 8. Persist lightweight long-term memory note when user states focus/preferences
  try {
    const rememberMatch = userMessage.match(/\b(?:remember that|my focus is|i am working on|i'm working on)\s+(.{4,120})/i);
    if (rememberMatch) {
      const existingMem = db.prepare('SELECT memory_data FROM member_memories WHERE member_id = ?').get(currentUser.id);
      let parsed = {};
      try { parsed = existingMem?.memory_data ? JSON.parse(existingMem.memory_data) : {}; } catch (_) {}
      parsed.focus_area = rememberMatch[1].trim();
      parsed.last_updated = new Date().toISOString();
      db.prepare(`
        INSERT INTO member_memories (member_id, memory_data, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(member_id) DO UPDATE SET memory_data = excluded.memory_data, updated_at = excluded.updated_at
      `).run(currentUser.id, JSON.stringify(parsed));
    }
  } catch (_) {}

  return {
    threadId: activeThreadId,
    reply: replyText,
    action: detectedAction
  };
}

/**
 * Native REST call to Google Gemini 1.5 Flash via standard fetch()
 */
async function callGeminiFlash(systemPrompt, history, userMessage) {
  const contents = [];

  // Map history to Gemini format
  for (const h of history) {
    contents.push({
      role: h.sender_role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    });
  }

  // Current user prompt
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Gemini API Error:', errorBody);
    throw new Error('Gemini API communication failed');
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response returned from Oracle.';
}

/**
 * Native REST call to Groq (Llama 3.3 70B) via OpenAI-compatible endpoint
 */
async function callGroqLlama(systemPrompt, history, userMessage) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  for (const h of history) {
    messages.push({
      role: h.sender_role === 'user' ? 'user' : 'assistant',
      content: h.content
    });
  }

  messages.push({ role: 'user', content: userMessage });
  const modelsToTry = GROQ_MODEL
    ? GROQ_MODEL.split(',').map(m => m.trim()).filter(Boolean)
    : [
        'qwen/qwen3.8-27b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant'
      ];

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 600
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'No response returned from Oracle.';
      } else {
        const errorBody = await response.text();
        lastError = errorBody;
        console.warn(`Groq model ${model} failed, trying next...:`, errorBody);
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`Groq request for ${model} threw error:`, err);
    }
  }

  throw new Error(`All Groq models failed. Last error: ${lastError}`);
}

/**
 * Intelligent local fallback when no external LLM API key is configured.
 * Answers common workspace questions directly from SQLite without breaking!
 * Also parses and emits action envelopes for conversational execution.
 */
function generateLocalFallback(workspaceContext, userMessage, currentUser) {
  const text = userMessage.toLowerCase();

  // 1. Action: Create Task (Host Only)
  if (/create task|add task|new task/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Task creation is restricted to the Team Host / Lead.';
    }

    // Try extracting title: "create task: Fix login bug" or "create task Fix login bug"
    const cleaned = userMessage.replace(/^(create task|add task|new task)[:\s]*/i, '').trim();
    const title = cleaned.split(/ assign | track | due | deadline /i)[0] || cleaned || 'New Sprint Task';

    // Check if assignee mentioned
    let assignedTo = currentUser.handle || currentUser.name;
    const members = db.prepare('SELECT name, handle FROM members WHERE is_allowed = 1').all();
    for (const m of members) {
      if (text.includes(m.name.toLowerCase()) || text.includes(m.handle.toLowerCase())) {
        assignedTo = m.handle || m.name;
        break;
      }
    }

    let track = 'backend';
    if (text.includes('frontend')) track = 'frontend';
    else if (text.includes('lead')) track = 'lead';

    const defaultDeadline = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const actionPayload = {
      action: 'CREATE_TASK',
      title,
      assigned_to: assignedTo,
      track,
      deadline: defaultDeadline,
      description: 'Created via Frontier Oracle chat'
    };

    return `I have prepared the task creation action for **${title}** assigned to **@${assignedTo}** (${track} track, due ${defaultDeadline}).

Please confirm to execute this change on the Kanban board:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
  }

  // 2. Action: Schedule Meeting (Host Only)
  if (/schedule meeting|new meeting|create meeting|schedule call/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Scheduling workspace syncs is restricted to the Team Host / Lead.';
    }

    const cleaned = userMessage.replace(/^(schedule meeting|new meeting|create meeting|schedule call)[:\s]*/i, '').trim();
    const title = cleaned.split(/ on | at | for /i)[0] || 'Sprint Alignment Sync';
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const actionPayload = {
      action: 'SCHEDULE_MEETING',
      title,
      event_date: tomorrow,
      time_label: '14:00 UTC',
      target_audience: text.includes('frontend') ? 'frontend' : text.includes('backend') ? 'backend' : 'all',
      event_type: text.includes('retro') ? 'RETRO' : text.includes('standup') ? 'STANDUP' : 'SYNC'
    };

    return `I have prepared a new calendar sync: **"${title}"** scheduled for **${tomorrow} at 14:00 UTC** (${actionPayload.target_audience}).

Please confirm below to publish this meeting to the team schedule:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
  }

  // 2b. Action: Broadcast Live Meeting Ping (Host Only)
  if (/go live|ping meeting|start live call/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Only the Team Host / Lead can broadcast live meeting pings.';
    }
    const actionPayload = { action: 'PING_MEETING' };
    return `Ready to broadcast a live meeting ping for the latest scheduled sync:\n\n\`\`\`action\n${JSON.stringify(actionPayload, null, 2)}\n\`\`\``;
  }

  // 2c. Action: Close Voting Session (Host Only)
  if (/close vot|end vot|close review|reveal tally/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Only the Team Host / Lead can close voting sessions.';
    }
    const actionPayload = { action: 'CLOSE_VOTING' };
    return `Ready to close the active voting session and publish the aggregate tallies:\n\n\`\`\`action\n${JSON.stringify(actionPayload, null, 2)}\n\`\`\``;
  }

  // 2d. Action: Raise 2-Man Access Ticket (All Members)
  if (/raise ticket|access ticket|request access/.test(text)) {
    const cleaned = userMessage.replace(/^(raise ticket|access ticket|request access)[:\s]*/i, '').trim();
    const actionPayload = {
      action: 'RAISE_TICKET',
      title: cleaned || 'Temporary Elevated Access Request',
      scope: 'production_d1_write',
      reason: cleaned || 'Requested via Frontier Oracle',
      duration_minutes: 30
    };
    return `I have prepared a 2-Man Rule access ticket for peer sign-off:\n\n\`\`\`action\n${JSON.stringify(actionPayload, null, 2)}\n\`\`\``;
  }

  // 2e. Action: Send Peer Feedback (All Members)
  if (/feedback|kudos/.test(text)) {
    const members = db.prepare('SELECT name, handle FROM members WHERE is_allowed = 1').all();
    let receiver = members.find(m => m.handle !== currentUser.handle && (text.includes(m.name.toLowerCase()) || text.includes(m.handle.toLowerCase())));
    if (!receiver) receiver = members.find(m => m.handle !== currentUser.handle) || currentUser;
    const isAnon = /anon|anonymous/.test(text);
    const actionPayload = {
      action: 'SEND_FEEDBACK',
      receiver: receiver.handle || receiver.name,
      title: isAnon ? 'Anonymous Peer Feedback' : 'Peer Kudos & Feedback',
      description: userMessage.trim(),
      category: 'KUDOS',
      is_anonymous: isAnon
    };
    return `I have prepared ${isAnon ? 'anonymous ' : ''}feedback for **@${actionPayload.receiver}**:\n\n\`\`\`action\n${JSON.stringify(actionPayload, null, 2)}\n\`\`\``;
  }

  // 3. Action: Update Task Status
  if (/update task|mark task|set task/.test(text)) {
    const idMatch = text.match(/task\s*#?(\d+)/);
    const taskId = idMatch ? parseInt(idMatch[1], 10) : null;

    if (!taskId) {
      return '⚠️ Please specify the task ID you would like to update (e.g. `update task #2 to completed`).';
    }

    const task = db.prepare('SELECT id, title, assignee_id, status FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return `❌ Task #${taskId} was not found in the workspace backlog.`;
    }

    if (!currentUser.is_host && task.assignee_id !== currentUser.id) {
      return `❌ **Permission Denied:** You can only update tasks assigned directly to you.`;
    }

    let newStatus = 'IN_PROGRESS';
    if (text.includes('completed') || text.includes('done')) newStatus = 'COMPLETED';
    else if (text.includes('review')) newStatus = 'REVIEW';
    else if (text.includes('todo')) newStatus = 'TODO';

    const actionPayload = {
      action: 'UPDATE_TASK_STATUS',
      task_id: taskId,
      status: newStatus
    };

    return `I have prepared the status transition for Task #${taskId} (**${task.title}**) to **${newStatus}**.

Please confirm below to update the task status:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
  }

  // 4. Action: Sign off or Deny Ticket (Host Only)
  if (/sign off ticket|approve ticket|deny ticket|reject ticket/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Governance ticket adjudication requires Team Host authorization.';
    }

    const idMatch = text.match(/ticket\s*#?(\d+)/);
    const ticketId = idMatch ? parseInt(idMatch[1], 10) : null;

    if (!ticketId) {
      return '⚠️ Please specify the ticket ID (e.g. `approve ticket #1` or `deny ticket #1`).';
    }

    const ticket = db.prepare('SELECT id, title, status FROM access_tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return `❌ Access ticket #${ticketId} was not found.`;
    }

    const isDeny = text.includes('deny') || text.includes('reject');
    const actionPayload = {
      action: isDeny ? 'DENY_TICKET' : 'SIGN_OFF_TICKET',
      ticket_id: ticketId
    };

    return `I have prepared the governance action to **${isDeny ? 'DENY' : 'APPROVE & SIGN OFF'}** Ticket #${ticketId} (**${ticket.title}**).

Please confirm to execute this governance decision:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
  }

  // 4b. Action: Host Voting Session (Host Only)
  if (/host voting|start voting|new voting|launch voting/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Initiating a peer voting round requires Team Host authorization.';
    }

    const cleaned = userMessage.replace(/^(host voting|start voting|new voting|launch voting)[:\s]*/i, '').trim();
    const title = cleaned || 'Sprint Peer Performance Review';
    const totalMembers = db.prepare('SELECT COUNT(*) as count FROM members WHERE is_allowed = 1').get()?.count || 8;

    const actionPayload = {
      action: 'START_VOTING',
      title,
      description: 'Peer evaluation session initiated via Frontier Oracle chat',
      total_eligible: totalMembers
    };

    return `I have prepared the action to launch a new anonymous voting round: **"${title}"** for all **${totalMembers} eligible members**.

Please confirm below to open the voting ballot box:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
  }

  // 4c. Action: Transfer Host Authority (Host Only)
  if (/transfer host|transfer lead|transfer admin/.test(text)) {
    if (!currentUser.is_host) {
      return '❌ **Permission Denied:** Only the active Team Host can transfer leadership authority.';
    }

    const members = db.prepare('SELECT id, name, handle FROM members WHERE is_allowed = 1 AND id != ?').all(currentUser.id);
    let target = null;
    for (const m of members) {
      if (text.includes(m.name.toLowerCase()) || text.includes(m.handle.toLowerCase())) {
        target = m;
        break;
      }
    }

    if (!target) {
      return `⚠️ Please specify an active team member to transfer authority to (e.g. \`transfer host to ${members[0]?.name || 'Charlie'}\`).`;
    }

    const actionPayload = {
      action: 'TRANSFER_HOST',
      target_member_id: target.id,
      target_name: target.name
    };

    return `⚠️ **CAUTION:** You are about to transfer Team Host authority to **${target.name} (@${target.handle})**.
Once executed, you will immediately surrender all administrative and moderation privileges.

Please confirm below if you wish to proceed:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
  }

  // 4d. Action: Send Peer Tasklet / Direct Workspace Ping
  if (/send tasklet|send ping|send message|tell |ping |remind |notify /.test(text)) {
    const members = db.prepare('SELECT id, name, handle FROM members WHERE is_allowed = 1 AND id != ?').all(currentUser.id);
    let target = null;
    for (const m of members) {
      if (text.includes(m.name.toLowerCase()) || text.includes(m.handle.toLowerCase())) {
        target = m;
        break;
      }
    }

    if (target) {
      const cleaned = userMessage.replace(new RegExp(`(send tasklet|send ping|send message|tell|ping|remind|notify)\\s+(to\\s+)?(@?${target.name}|@?${target.handle})[:\\s]*`, 'i'), '').trim();
      const title = cleaned.split(/[:\n.]/)[0] || 'Direct Workspace Ping';
      const description = cleaned || 'Direct message / tasklet delivered via Frontier Oracle';

      const actionPayload = {
        action: 'SEND_TASKLET',
        receiver_id: target.id,
        receiver_name: target.name,
        title,
        description
      };

      return `I have prepared a direct **Peer Tasklet & workspace notification** for **${target.name} (@${target.handle})**:

- **Subject:** ${title}
- **Message:** ${description}

Please confirm below to deliver this tasklet directly to their workspace inbox:

\`\`\`action
${JSON.stringify(actionPayload, null, 2)}
\`\`\``;
    }
  }

  // 5. Query: Daily Standup Summary
  if (/standup|daily sync|status update/.test(text)) {
    const completedTasks = db.prepare("SELECT title, deliverable_url FROM tasks WHERE status = 'COMPLETED'").all();
    const inProgressTasks = db.prepare("SELECT title, deadline FROM tasks WHERE status = 'IN_PROGRESS'").all();
    const upcomingEvents = db.prepare("SELECT title, event_date, time_label FROM calendar_events ORDER BY event_date ASC LIMIT 2").all();

    const completedText = completedTasks.length > 0
      ? completedTasks.map(t => `- ${t.title}${t.deliverable_url ? ` ([PR Link](${t.deliverable_url}))` : ''}`).join('\n')
      : '- No deliverables finalized yet.';

    const inProgressText = inProgressTasks.length > 0
      ? inProgressTasks.map(t => `- ${t.title}${t.deadline ? ` (due ${t.deadline})` : ''}`).join('\n')
      : '- All assigned sprint deliverables currently up to date.';

    const blockersText = upcomingEvents.length > 0
      ? `- Next sync: ${upcomingEvents[0].title} on ${upcomingEvents[0].event_date} at ${upcomingEvents[0].time_label}`
      : '- No immediate blockers or conflicting dependencies.';

    return `Here is the daily standup for ${currentUser.name}:

Completed recently:
${completedText}

In progress:
${inProgressText}

Upcoming syncs & blockers:
${blockersText}`;
  }

  // 6. Query: Tasks
  if (/task|todo|progress|deliverable/.test(text)) {
    const tasks = db.prepare('SELECT title, status, deadline FROM tasks').all();
    if (tasks.length === 0) return 'There are currently no tasks allocated in the workspace.';
    const list = tasks.map(t => `- [${t.status}] ${t.title}${t.deadline ? ` (due ${t.deadline})` : ''}`).join('\n');
    return `Current workspace tasks:\n\n${list}\n\nLet me know if you would like me to create or update any of these tasks.`;
  }

  // 7. Query: Meetings
  if (/meet|call|sync|google|bridge/.test(text)) {
    const events = db.prepare('SELECT title, event_date, time_label, target_audience FROM calendar_events').all();
    if (events.length === 0) return 'There are no active or scheduled meetings right now.';
    const list = events.map(e => `- ${e.title} on ${e.event_date} at ${e.time_label} (${e.target_audience})`).join('\n');
    return `Scheduled syncs:\n\n${list}\n\nTo join, click the join button on your dashboard to route through the masked companion bridge.`;
  }

  // 8. Query: Who are you / Help
  if (/who are you|oracle|help/.test(text)) {
    return `Hey ${currentUser.name}! I am Frontier Oracle, your engineering teammate and workspace assistant.

Here is what I can help you with:
- Project status: sprint progress, tasks in flight, and upcoming meetings
- Operational actions:
  ${currentUser.is_host ? '- Create or delete tasks (e.g. "create task: Review auth PR")\n  - Ping teammates with tasklets (e.g. "ping Dheeraj about backend deliverables")\n  - Schedule calendar syncs (e.g. "schedule meeting: Sprint Planning")\n  - Host peer voting sessions (e.g. "host voting: Sprint Review")' : '- Update your assigned task statuses (e.g. "mark task #2 as completed")\n  - Send tasklets to teammates\n  - Generate your personal standup update'}

Feel free to ask a question or tell me what to do!`;
  }

  // 9. Query: Voting & Consensus Analysis
  if (/voting|ballot|consensus|evaluation/.test(text)) {
    const session = db.prepare("SELECT * FROM voting_sessions ORDER BY id DESC LIMIT 1").get();
    if (!session) return 'No peer voting sessions have been conducted yet.';

    const ballotsCount = db.prepare('SELECT COUNT(*) as count, AVG(rating) as avg_rating FROM ballots WHERE session_id = ?').get(session.id);
    const totalEligible = session.total_eligible || 1;
    const turnoutPct = Math.round(((ballotsCount?.count || 0) / totalEligible) * 100);
    const avgScore = ballotsCount?.avg_rating ? Number(ballotsCount.avg_rating).toFixed(1) : 'N/A';

    return `Voting consensus overview for ${session.title}:

Status: ${session.status} ${session.status === 'ACTIVE' ? '(round currently open)' : '(closed and tallied)'}
- Turnout: ${ballotsCount?.count || 0} of ${totalEligible} ballots cast (${turnoutPct}% participation)
- Consensus score: ${avgScore}/5.0 average rating

Individual ballots remain strictly anonymous using blind signature tokens.`;
  }

  // 10. Default Project Overview (Natural, conversational tone)
  const taskStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status = 'TODO' THEN 1 ELSE 0 END) as todo
    FROM tasks
  `).get() || { total: 0, completed: 0, in_progress: 0, review: 0, todo: 0 };

  const velocityPct = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
  const events = db.prepare('SELECT title, event_date, time_label FROM calendar_events ORDER BY event_date ASC LIMIT 2').all();
  const upcomingBrief = events.length > 0
    ? events.map(e => `- ${e.title} on ${e.event_date} at ${e.time_label}`).join('\n')
    : '- No upcoming meetings scheduled right now.';

  return `Here is a quick overview of where things stand with the project:

Sprint progress: ${taskStats.completed} of ${taskStats.total} tasks completed (${velocityPct}%)
Work in flight: ${taskStats.in_progress} in progress, ${taskStats.review} in review, ${taskStats.todo} in backlog

Upcoming syncs:
${upcomingBrief}

Let me know if you would like me to set up a task, ping a teammate, or schedule a meeting.`;
}
