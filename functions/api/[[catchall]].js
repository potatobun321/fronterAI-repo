// ==============================================================================
// FRONTIER AI — CLOUDFLARE WORKER & PAGES FUNCTIONS EDGE ROUTER
// Google OAuth 2.0 + Groq (Llama 3.3 70B) + Cloudflare D1 Serverless SQLite
// ==============================================================================

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return cookies;
}

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'default-secret-32-chars-minimum-key!'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(message) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        member_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `).run();
  } catch (e) { }

  try {
    await env.DB.prepare('ALTER TABLE members ADD COLUMN google_sub TEXT').run();
  } catch (e) { }

  try {
    await env.DB.prepare('ALTER TABLE members ADD COLUMN email TEXT').run();
  } catch (e) { }

  try {
    await env.DB.prepare('ALTER TABLE ballots ADD COLUMN rating INTEGER DEFAULT 5').run();
  } catch (e) { }

  try {
    await env.DB.prepare('ALTER TABLE ballots ADD COLUMN candidate_member_id INTEGER').run();
  } catch (e) { }

  try {
    await env.DB.prepare("ALTER TABLE tasklets ADD COLUMN type TEXT DEFAULT 'TASKLET'").run();
  } catch (e) { }

  try {
    await env.DB.prepare("ALTER TABLE tasklets ADD COLUMN category TEXT DEFAULT 'GENERAL'").run();
  } catch (e) { }

  try {
    await env.DB.prepare('ALTER TABLE tasklets ADD COLUMN is_anonymous INTEGER DEFAULT 0').run();
  } catch (e) { }

  try {
    await env.DB.prepare('ALTER TABLE voting_sessions ADD COLUMN target_member_id INTEGER').run();
  } catch (e) { }

function isHostMember(member) {
  if (!member) return false;
  const email = (member.email || '').toLowerCase().trim();
  const isLeadEmail = email === 'kart123.san@gmail.com' || email.includes('kart123.san');
  return !!(isLeadEmail || (Number(member.id) === 1 && (!email || isLeadEmail)));
}

  // Guarantee Host (id = 1, kart123.san@gmail.com) always exists with full permissions, and ensure non-leads are is_host = 0
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO members (id, github_numeric_id, handle, name, role, team_track, email, is_host, is_allowed)
      VALUES (1, 194890859, 'kart123.san', 'Kartikay', 'Team Host & Lead', 'lead', 'kart123.san@gmail.com', 1, 1)
    `).run();
    await env.DB.prepare("UPDATE members SET is_host = 1, is_allowed = 1, email = 'kart123.san@gmail.com' WHERE id = 1 OR LOWER(email) = 'kart123.san@gmail.com'").run();
    await env.DB.prepare("UPDATE members SET is_host = 0 WHERE id != 1 AND LOWER(COALESCE(email, '')) != 'kart123.san@gmail.com'").run();
  } catch (e) { }
}

async function createSignedState(secret) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const ts = Date.now().toString();
  const sig = await hmacSha256(secret, `${nonce}.${ts}`);
  return `${nonce}.${ts}.${sig}`;
}

async function verifySignedState(secret, stateToken) {
  if (!stateToken || typeof stateToken !== 'string') return false;
  const parts = stateToken.split('.');
  if (parts.length !== 3) return false;
  const [nonce, tsStr, sig] = parts;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  // 15-minute validity window
  if (Date.now() - ts > 15 * 60 * 1000 || ts > Date.now() + 60 * 1000) return false;
  const expectedSig = await hmacSha256(secret, `${nonce}.${tsStr}`);
  return sig === expectedSig;
}

async function getAuthMember(request, env) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookies = parseCookies(request);
  const token = bearerToken || cookies.frontier_session;
  if (!token || !env.DB) return null;
  try {
    const nowIso = new Date().toISOString();
    const session = await env.DB.prepare(
      "SELECT member_id FROM sessions WHERE token = ? AND (expires_at > datetime('now') OR expires_at > ?)"
    ).bind(token, nowIso).first();
    if (!session || !session.member_id) return null;

    let member = await env.DB.prepare(
      'SELECT * FROM members WHERE id = ? AND is_allowed = 1'
    ).bind(session.member_id).first();
    if (!member && session.member_id === 1) {
      try {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO members (id, github_numeric_id, handle, name, role, team_track, email, is_host, is_allowed)
          VALUES (1, 194890859, 'kart123.san', 'Kartikay', 'Team Host & Lead', 'lead', 'kart123.san@gmail.com', 1, 1)
        `).run();
        await env.DB.prepare("UPDATE members SET is_host = 1, is_allowed = 1, email = 'kart123.san@gmail.com' WHERE id = 1").run();
        member = await env.DB.prepare('SELECT * FROM members WHERE id = 1 AND is_allowed = 1').first();
      } catch (e) { }
    }
    if (member) {
      member.is_host = isHostMember(member) ? 1 : 0;
    }
    return member || null;
  } catch (err) {
    console.error('Session auth error:', err);
    return null;
  }
}

async function logAudit(env, actorHandle, action, target, details, status = 'SUCCESS') {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO audit_events (timestamp, actor_handle, action, target, details, status) VALUES (datetime('now'), ?, ?, ?, ?, ?)"
    ).bind(actorHandle, action, target, details, status).run();
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;
  const cookies = parseCookies(request);

  // CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'Cloudflare D1 binding [DB] is missing. Please add it in Cloudflare Worker Settings > Bindings.'
    }, 500);
  }

  // Ensure sessions and auth columns exist
  await ensureSchema(env);

  try {
    // --------------------------------------------------------------------------
    // 1. AUTH — SESSION CHECK & ROSTER
    // --------------------------------------------------------------------------
    if ((pathname === '/api/auth/current' || pathname === '/api/auth/session') && method === 'GET') {
      const member = await getAuthMember(request, env);
      const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const token = bearerToken || cookies.frontier_session || null;
      return jsonResponse({
        authenticated: !!member,
        member: member || null,
        user: member || null,
        token: member ? token : null,
        oauthConfigured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
      });
    }

    // --------------------------------------------------------------------------
    // 2. GOOGLE OAUTH 2.0 FLOW
    // --------------------------------------------------------------------------
    if (pathname === '/api/auth/google' && method === 'GET') {
      const clientId = env.GOOGLE_CLIENT_ID || '33531224866-tci0079quk7mfgh7plhtgnpj6lfa96ou.apps.googleusercontent.com';
      if (!clientId) return jsonResponse({ error: 'GOOGLE_CLIENT_ID not configured on Cloudflare' }, 500);

      const secret = env.JWT_SECRET || env.GOOGLE_CLIENT_SECRET || 'frontier-oauth-secret-key-salt-32ch';
      const state = await createSignedState(secret);
      const redirectUri = `${url.origin}/api/auth/google/callback`;
      const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('openid email profile')}` +
        `&access_type=offline` +
        `&state=${state}`;

      const headers = new Headers();
      headers.set('Location', googleUrl);
      headers.append('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`);

      return new Response(null, {
        status: 302,
        headers
      });
    }

    if (pathname === '/api/auth/google/callback' && method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const oauthError = url.searchParams.get('error');

      if (oauthError) return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/?error=${encodeURIComponent(oauthError)}` } });

      const secret = env.JWT_SECRET || env.GOOGLE_CLIENT_SECRET || 'frontier-oauth-secret-key-salt-32ch';
      const isStateValid = (await verifySignedState(secret, state)) || (cookies.oauth_state && state === cookies.oauth_state);

      if (!state || !isStateValid) {
        await logAudit(env, 'anonymous', 'OAUTH_CSRF_FAILED', 'auth', 'Google OAuth state mismatch or expired', 'DENIED');
        return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/?error=csrf_state_mismatch` } });
      }

      const clientId = env.GOOGLE_CLIENT_ID || '33531224866-tci0079quk7mfgh7plhtgnpj6lfa96ou.apps.googleusercontent.com';

      // Exchange code for token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${url.origin}/api/auth/google/callback`,
          grant_type: 'authorization_code'
        }).toString()
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/?error=token_exchange_failed` } });
      }

      // Fetch Google user profile
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const googleUser = await userRes.json();
      const googleSub = googleUser.sub;
      const googleEmail = googleUser.email;

      // Allowlist check:
      let member = null;
      const isHostEmail = googleEmail && (
        googleEmail.toLowerCase() === 'kart123.san@gmail.com' ||
        googleEmail.toLowerCase().includes('kart123.san')
      );

      // 1. Host Priority Check: Host is always recognized and guaranteed active access
      if (isHostEmail) {
        try {
          member = await env.DB.prepare('SELECT * FROM members WHERE id = 1').first();
          if (member) {
            try {
              await env.DB.prepare('UPDATE members SET email = ?, google_sub = ?, is_host = 1, is_allowed = 1 WHERE id = 1').bind(googleEmail, googleSub).run();
              member = await env.DB.prepare('SELECT * FROM members WHERE id = 1').first();
            } catch (err) { }
          }
        } catch (e) { }
      }

      // 2. By google_sub (returning user)
      if (!member) {
        try {
          member = await env.DB.prepare('SELECT * FROM members WHERE google_sub = ?').bind(googleSub).first();
        } catch (e) { }
      }

      // 3. By email (active approved members prioritized first)
      if (!member && googleEmail) {
        try {
          member = await env.DB.prepare('SELECT * FROM members WHERE LOWER(email) = LOWER(?) ORDER BY is_allowed DESC').bind(googleEmail).first();
        } catch (e) { }
      } else if (member && googleSub) {
        // Update google_sub and email if needed
        try {
          await env.DB.prepare('UPDATE members SET google_sub = COALESCE(google_sub, ?), email = COALESCE(email, ?) WHERE id = ?').bind(googleSub, googleEmail || null, member.id).run();
        } catch (e) { }
      }

      // 4. If completely new user, record as Pending Access Request
      if (!member) {
        const cleanHandle = (googleEmail.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
        const displayName = googleUser.name || googleUser.given_name || cleanHandle;
        const numericId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100000);
        try {
          await env.DB.prepare(`
            INSERT INTO members (github_numeric_id, handle, name, role, team_track, email, google_sub, is_host, is_allowed)
            VALUES (?, ?, ?, 'Pending Review', 'unassigned', ?, ?, 0, 0)
          `).bind(numericId, cleanHandle, displayName, googleEmail, googleSub).run();
        } catch (e) {
          try {
            await env.DB.prepare(`
              INSERT INTO members (handle, name, role, team_track, email, google_sub, is_host, is_allowed)
              VALUES (?, ?, 'Pending Review', 'unassigned', ?, ?, 0, 0)
            `).bind(cleanHandle, displayName, googleEmail, googleSub).run();
          } catch (e2) { }
        }

        await logAudit(env, `google_${googleEmail}`, 'ACCESS_REQUEST_SUBMITTED', 'auth',
          `New user ${displayName} (${googleEmail}) requested access to workspace. Queued for Host approval.`, 'SUCCESS');

        return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/?auth=pending_approval&email=${encodeURIComponent(googleEmail || '')}` } });
      }

      if (!member.is_allowed) {
        await logAudit(env, member.handle, 'LOGIN_AWAITING_APPROVAL', 'auth',
          `User ${member.name} (${googleEmail}) attempted login while access request is awaiting Host approval.`, 'PENDING');
        return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/?auth=pending_approval&email=${encodeURIComponent(googleEmail || '')}` } });
      }

      // Issue session (30-day persistence)
      const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 86400000 * 30).toISOString();
      await env.DB.prepare("INSERT INTO sessions (token, member_id, created_at, expires_at) VALUES (?, ?, datetime('now'), ?)").bind(sessionToken, member.id, expiresAt).run();
      await logAudit(env, member.handle, 'OAUTH_LOGIN_SUCCESS', 'auth',
        `Google OAuth login: ${member.name} (${googleEmail}). Role: ${member.is_host ? 'AUTHORATOR' : 'PARTICIPANT'}.`, 'SUCCESS');

      const headers = new Headers();
      headers.set('Location', `${url.origin}/?auth=oauth_success&sid=${sessionToken}`);
      headers.append('Set-Cookie', `frontier_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
      headers.append('Set-Cookie', `oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

      return new Response(null, {
        status: 302,
        headers
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const token = bearerToken || cookies.frontier_session;
      if (token) {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      }
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.append('Set-Cookie', 'frontier_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers
      });
    }

    // --------------------------------------------------------------------------
    // 3. DASHBOARD (PERSONAL & STATS)
    // --------------------------------------------------------------------------
    if (pathname === '/api/dashboard/personal' && method === 'GET') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Authentication required' }, 401);

      const tasksRes = await env.DB.prepare(`
        SELECT t.*, m.name as assignee_name
        FROM tasks t
        LEFT JOIN members m ON t.assignee_id = m.id
        WHERE t.assignee_id = ?
        ORDER BY t.id ASC
      `).bind(member.id).all();
      const myTasks = tasksRes.results || [];

      const rawEventsRes = await env.DB.prepare(`
        SELECT c.*, m.name as assignee_name, s.slot_name, s.slot_code
        FROM calendar_events c
        LEFT JOIN members m ON c.assignee_id = m.id
        LEFT JOIN meeting_slots s ON c.meeting_slot_id = s.id
        ORDER BY c.event_date ASC, c.id ASC
      `).all();
      const rawEvents = rawEventsRes.results || [];

      const myEvents = rawEvents.filter(ev => {
        if (member.is_host === 1) return true;
        if (ev.target_audience === 'ALL') return true;
        if (ev.target_audience === 'BACKEND' && member.team_track === 'backend') return true;
        if (ev.target_audience === 'FRONTEND' && member.team_track === 'frontend') return true;
        if (ev.assignee_id && ev.assignee_id === member.id) return true;
        if (ev.assignee_id === null && !ev.target_audience) return true;
        if (ev.target_audience && ev.target_audience.startsWith('[')) {
          try {
            const list = JSON.parse(ev.target_audience);
            if (Array.isArray(list) && list.map(Number).includes(member.id)) return true;
          } catch { }
        }
        return false;
      }).map(ev => {
        const hasMeet = !!(ev.meeting_link);
        return {
          ...ev,
          meeting_link: hasMeet ? `/api/meetings/join/${ev.id}` : null,
          join_url: hasMeet ? `/api/meetings/join/${ev.id}` : null
        };
      });

      const liveMeeting = myEvents.find(ev => ev.is_live === 1 && (ev.event_type === 'MEETING' || ev.event_type === 'RETRO')) || null;
      const activeVote = await env.DB.prepare("SELECT * FROM voting_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1").first();
      const hasVoted = activeVote ? await env.DB.prepare('SELECT * FROM voting_eligibility WHERE session_id = ? AND member_id = ?').bind(activeVote.id, member.id).first() : null;

      const completed = myTasks.filter(t => t.status === 'COMPLETED').length;
      const inProgress = myTasks.filter(t => t.status === 'IN_PROGRESS').length;
      const todo = myTasks.filter(t => t.status === 'TODO').length;

      return jsonResponse({
        user: member,
        tasks: myTasks,
        events: myEvents,
        liveMeeting,
        hasVoted: !!hasVoted,
        votingSession: activeVote || null,
        stats: {
          total: myTasks.length,
          completed,
          inProgress,
          todo,
          completionRate: myTasks.length > 0 ? Math.round((completed / myTasks.length) * 100) : 0
        }
      });
    }

    if (pathname === '/api/dashboard/stats' && method === 'GET') {
      const member = await getAuthMember(request, env);
      const memberId = member ? member.id : 1;
      const tasksCount = await env.DB.prepare('SELECT status, count(*) as count FROM tasks WHERE assignee_id = ? GROUP BY status').bind(memberId).all();
      const taskletsCount = await env.DB.prepare('SELECT status, count(*) as count FROM tasklets WHERE receiver_id = ? GROUP BY status').bind(memberId).all();
      const events = await env.DB.prepare(`
        SELECT c.*, m.handle as creator_handle, s.slot_name
        FROM calendar_events c
        LEFT JOIN members m ON c.created_by = m.id
        LEFT JOIN meeting_slots s ON c.meeting_slot_id = s.id
        ORDER BY c.event_date ASC
      `).all();
      return jsonResponse({ tasksStats: tasksCount.results || [], taskletsStats: taskletsCount.results || [], events: events.results || [] });
    }

    // --------------------------------------------------------------------------
    // 4. MEMBERS ROSTER
    // --------------------------------------------------------------------------
    if (pathname === '/api/members' && method === 'GET') {
      const authUser = await getAuthMember(request, env);
      let query = 'SELECT id, handle, name, role, team_track, is_host, is_allowed, email FROM members WHERE is_allowed = 1';
      if (authUser && authUser.is_host) {
        query = 'SELECT id, handle, name, role, team_track, is_host, is_allowed, email FROM members';
      }
      const res = await env.DB.prepare(query).all();
      return jsonResponse({ members: res.results || [] });
    }

    if (pathname === '/api/members/pending' && method === 'GET') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Only Team Lead can view pending access requests' }, 403);
      const res = await env.DB.prepare('SELECT id, handle, name, role, team_track, is_host, is_allowed, email FROM members WHERE is_allowed = 0 ORDER BY id DESC').all();
      return jsonResponse({ pending: res.results || [] });
    }

    if (pathname.match(/^\/api\/members\/\d+\/approve$/) && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Only Team Lead can approve members' }, 403);
      const targetId = pathname.split('/')[3];
      const body = await request.json().catch(() => ({}));
      const role = (body && body.role && body.role.trim()) || 'Engineer';
      const teamTrack = (body && body.team_track) || 'backend';
      await env.DB.prepare('UPDATE members SET is_allowed = 1, role = ?, team_track = ? WHERE id = ?').bind(role, teamTrack, targetId).run();
      await logAudit(env, member.handle, 'MEMBER_APPROVED', 'members', `Approved member #${targetId} as ${role} [${teamTrack}]`);
      return jsonResponse({ success: true, message: 'Member approved successfully' });
    }

    if (pathname.match(/^\/api\/members\/\d+\/reject$/) && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Only Team Lead can reject members' }, 403);
      const targetId = parseInt(pathname.split('/')[3], 10);
      if (targetId === 1 || targetId === member.id) {
        return jsonResponse({ error: 'Host account cannot be removed or declined.' }, 400);
      }
      try {
        await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(targetId).run();
      } catch (e) { }
      await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(targetId).run();
      await logAudit(env, member.handle, 'MEMBER_REJECTED', 'members', `Rejected access request for member #${targetId}`);
      return jsonResponse({ success: true, message: 'Access request rejected' });
    }

    if (pathname === '/api/members' && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Only Team Lead can register members' }, 403);
      const { handle, name, role, team_track, email } = await request.json();
      const res = await env.DB.prepare(
        'INSERT INTO members (handle, name, role, team_track, email, is_host, is_allowed) VALUES (?, ?, ?, ?, ?, 0, 1)'
      ).bind(handle, name, role || 'Engineer', team_track || 'backend', email || null).run();
      await logAudit(env, member.handle, 'MEMBER_ADD', 'members', `Added ${name} (@${handle})`);
      return jsonResponse({ success: true, id: res.meta?.last_row_id }, 201);
    }

    if (pathname.startsWith('/api/members/') && method === 'DELETE') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Only Team Lead can remove members' }, 403);
      const targetId = pathname.split('/')[3];
      await env.DB.prepare('UPDATE members SET is_allowed = 0 WHERE id = ?').bind(targetId).run();
      await logAudit(env, member.handle, 'MEMBER_REMOVE', 'members', `Revoked access for member #${targetId}`);
      return jsonResponse({ success: true });
    }

    // --------------------------------------------------------------------------
    // 5. TASKS BOARD & DELIVERABLES
    // --------------------------------------------------------------------------
    if (pathname === '/api/tasks' && method === 'GET') {
      const res = await env.DB.prepare(`
        SELECT t.*, m.name as assignee_name, m.handle as assignee_handle
        FROM tasks t LEFT JOIN members m ON t.assignee_id = m.id
        ORDER BY t.id DESC
      `).all();
      return jsonResponse({ tasks: res.results || [] });
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Only Team Host can create sprint tasks' }, 403);
      const body = await request.json();
      const { title, description, track, assignee_id, deadline } = body;
      const res = await env.DB.prepare(
        "INSERT INTO tasks (title, description, track, assignee_id, status, deadline, version, updated_at) VALUES (?, ?, ?, ?, 'TODO', ?, 1, datetime('now'))"
      ).bind(title, description || '', track || 'general', assignee_id || null, deadline || null).run();
      await logAudit(env, member.handle, 'TASK_CREATE', 'tasks', `Task #${res.meta?.last_row_id} created`);
      return jsonResponse({ success: true, taskId: res.meta?.last_row_id }, 201);
    }

    if (pathname.startsWith('/api/tasks/') && method === 'PATCH') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      const taskId = pathname.split('/')[3];
      const body = await request.json();
      const { status, deliverable_url, deliverable_notes, version } = body;
      const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);
      if (version !== undefined && existing.version !== version) {
        return jsonResponse({ error: 'OCC Conflict: Task was modified by another teammate. Refresh.', code: 'CONCURRENCY_CONFLICT' }, 409);
      }
      await env.DB.prepare(`
        UPDATE tasks SET status = COALESCE(?, status), deliverable_url = COALESCE(?, deliverable_url),
        deliverable_notes = COALESCE(?, deliverable_notes), version = version + 1, updated_at = datetime('now') WHERE id = ?
      `).bind(status || null, deliverable_url || null, deliverable_notes || null, taskId).run();
      await logAudit(env, member.handle, 'TASK_UPDATE', 'tasks', `Task #${taskId} updated`);
      return jsonResponse({ success: true });
    }

    if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Unauthorized' }, 403);
      const taskId = pathname.split('/')[3];
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
      await logAudit(env, member.handle, 'TASK_DELETE', 'tasks', `Task #${taskId} deleted`);
      return jsonResponse({ success: true });
    }

    // --------------------------------------------------------------------------
    // 6. MEETINGS & BRIDGES
    // --------------------------------------------------------------------------
    if (pathname === '/api/meetings/slots' && method === 'GET') {
      const res = await env.DB.prepare('SELECT id, slot_code, slot_name, raw_url, last_used_at FROM meeting_slots').all();
      return jsonResponse({ slots: res.results || [] });
    }

    if (pathname.startsWith('/api/meetings/join/') && method === 'GET') {
      const member = await getAuthMember(request, env);
      if (!member) return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/?error=unauthorized` } });
      const targetId = pathname.split('/')[4];
      // Check if target is a calendar event id or a direct slot id
      let rawUrl = null;
      let slotName = 'Meeting Bridge';
      const ev = await env.DB.prepare('SELECT * FROM calendar_events WHERE id = ?').bind(targetId).first();
      if (ev && ev.meeting_link) {
        rawUrl = ev.meeting_link;
        slotName = ev.title;
      } else {
        const slot = await env.DB.prepare('SELECT * FROM meeting_slots WHERE id = ? OR slot_code = ?').bind(targetId, targetId).first();
        if (slot) {
          rawUrl = slot.raw_url;
          slotName = slot.slot_name;
        }
      }

      if (!rawUrl) return jsonResponse({ error: 'Meeting link not found' }, 404);
      await logAudit(env, member.handle, 'MEETING_JOIN', 'meetings', `Joined ${slotName}`);
      return new Response(null, { status: 302, headers: { 'Location': rawUrl } });
    }

    // --------------------------------------------------------------------------
    // 7. CALENDAR
    // --------------------------------------------------------------------------
    if ((pathname === '/api/calendar' || pathname === '/api/calendar/events') && method === 'GET') {
      const memberId = url.searchParams.get('member_id');
      const res = await env.DB.prepare(`
        SELECT c.*, m.name as assignee_name, m.handle as creator_handle, s.slot_name, s.slot_code
        FROM calendar_events c
        LEFT JOIN members m ON c.assignee_id = m.id
        LEFT JOIN meeting_slots s ON c.meeting_slot_id = s.id
        ORDER BY c.event_date ASC, c.id ASC
      `).all();

      let events = (res.results || []).map(ev => {
        const hasMeet = !!(ev.meeting_link);
        return {
          ...ev,
          meeting_link: hasMeet ? `/api/meetings/join/${ev.id}` : null,
          join_url: hasMeet ? `/api/meetings/join/${ev.id}` : null
        };
      });

      if (memberId) {
        const mId = parseInt(memberId, 10);
        const targetMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(mId).first();
        if (targetMember) {
          events = events.filter(ev => {
            if (targetMember.is_host === 1) return true;
            if (ev.target_audience === 'ALL') return true;
            if (ev.target_audience === 'BACKEND' && targetMember.team_track === 'backend') return true;
            if (ev.target_audience === 'FRONTEND' && targetMember.team_track === 'frontend') return true;
            if (ev.assignee_id && ev.assignee_id === targetMember.id) return true;
            return false;
          });
        }
      }

      return jsonResponse({ events });
    }

    if (pathname === '/api/calendar' && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Permission Denied: Only Team Lead can schedule events.' }, 403);
      const body = await request.json();
      const { title, description, event_type, event_date, time_label, target_audience, assignee_id, meeting_slot_id } = body;
      let meeting_link = null;
      if (meeting_slot_id) {
        const slot = await env.DB.prepare('SELECT raw_url FROM meeting_slots WHERE id = ?').bind(meeting_slot_id).first();
        if (slot) meeting_link = slot.raw_url;
      }
      const res = await env.DB.prepare(`
        INSERT INTO calendar_events (title, description, event_type, event_date, time_label, target_audience, assignee_id, meeting_slot_id, meeting_link, is_live, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).bind(title, description || '', event_type || 'MEETING', event_date, time_label || '', target_audience || 'ALL', assignee_id || null, meeting_slot_id || null, meeting_link, member.id).run();
      await logAudit(env, member.handle, 'SCHEDULE_EVENT', 'calendar', `Scheduled ${event_type}: ${title} on ${event_date}`);
      return jsonResponse({ success: true, eventId: res.meta?.last_row_id }, 201);
    }

    if (pathname.startsWith('/api/calendar/') && pathname.endsWith('/ping') && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Unauthorized' }, 403);
      const evId = pathname.split('/')[3];
      await env.DB.prepare('UPDATE calendar_events SET is_live = 1 WHERE id = ?').bind(evId).run();
      await logAudit(env, member.handle, 'MEETING_PING', 'calendar', `Started live meeting #${evId}`);
      return jsonResponse({ success: true });
    }

    if (pathname.startsWith('/api/calendar/') && pathname.endsWith('/end') && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Unauthorized' }, 403);
      const evId = pathname.split('/')[3];
      await env.DB.prepare('UPDATE calendar_events SET is_live = 0 WHERE id = ?').bind(evId).run();
      await logAudit(env, member.handle, 'MEETING_END', 'calendar', `Ended live meeting #${evId}`);
      return jsonResponse({ success: true });
    }

    if (pathname.startsWith('/api/calendar/') && method === 'DELETE') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Unauthorized' }, 403);
      const evId = pathname.split('/')[3];
      await env.DB.prepare('DELETE FROM calendar_events WHERE id = ?').bind(evId).run();
      await logAudit(env, member.handle, 'CALENDAR_DELETE', 'calendar', `Deleted event #${evId}`);
      return jsonResponse({ success: true });
    }

    // --------------------------------------------------------------------------
    // 8. CRYPTOGRAPHIC BLIND PEER REVIEW (1-5 RATING SCALE)
    // --------------------------------------------------------------------------
    if ((pathname === '/api/voting/current' || pathname === '/api/voting/sessions') && method === 'GET') {
      const member = await getAuthMember(request, env);

      const requestedSessionId = url.searchParams.get('session_id');
      let session = null;
      if (requestedSessionId) {
        session = await env.DB.prepare('SELECT * FROM voting_sessions WHERE id = ?').bind(requestedSessionId).first();
      }
      if (!session) {
        // Priority 1: Check for active session
        session = await env.DB.prepare("SELECT * FROM voting_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1").first();
      }

      // If no active session, check for latest closed session so final standings can be reviewed
      let closedSession = null;
      if (!session) {
        closedSession = await env.DB.prepare("SELECT * FROM voting_sessions WHERE status = 'CLOSED' ORDER BY id DESC LIMIT 1").first();
      }

      const activeTarget = session || closedSession;

      // Allowlisted members
      const membersRes = await env.DB.prepare('SELECT id, name, role, team_track, email, handle FROM members WHERE is_allowed = 1 ORDER BY id ASC').all();
      const allMembers = membersRes?.results || [];

      if (!activeTarget) {
        return jsonResponse({
          active: false,
          hasActiveSession: false,
          hasClosedSession: false,
          session: null,
          candidates: allMembers,
          options: allMembers,
          totalBallots: 0,
          totalEligible: allMembers.length,
          isRevealed: false,
          isHost: !!(member && member.is_host),
          tally: null
        });
      }

      let targetMember = null;
      if (activeTarget.target_member_id) {
        targetMember = allMembers.find(m => m.id === activeTarget.target_member_id) ||
          await env.DB.prepare('SELECT id, name, role, team_track, email, handle FROM members WHERE id = ?').bind(activeTarget.target_member_id).first();
      }

      const isProjectReview = activeTarget.session_type === 'PROJECT_QUALITY' || activeTarget.session_type === 'PROJECT_EXPERIENCE';

      let candidates = [];
      if (isProjectReview) {
        const optRes = await env.DB.prepare('SELECT id, session_id, candidate_member_id, label FROM voting_options WHERE session_id = ? ORDER BY id ASC').bind(activeTarget.id).all();
        let options = optRes?.results || [];
        if (options.length === 0) {
          options = [
            { id: 1, label: 'Team Dynamic & Working Collaboration' },
            { id: 2, label: 'Sprint Milestone Architecture & Execution' },
            { id: 3, label: 'Code Quality & Deliverable Reliability' },
            { id: 4, label: 'Overall Project Satisfaction' }
          ];
        }
        candidates = options.map(opt => ({
          id: opt.id,
          candidate_id: opt.id,
          name: opt.label,
          label: opt.label,
          role: 'Project Review Dimension',
          team_track: 'milestone'
        }));
      } else if (targetMember) {
        candidates = [targetMember];
      } else {
        candidates = allMembers;
      }

      const eligibility = member
        ? await env.DB.prepare('SELECT * FROM voting_eligibility WHERE session_id = ? AND member_id = ?').bind(activeTarget.id, member.id).first()
        : null;

      const ballotsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM ballots WHERE session_id = ?').bind(activeTarget.id).first();
      const totalBallots = ballotsCount?.count || 0;
      const totalEligible = activeTarget.total_eligible || allMembers.length || 8;
      const isClosed = activeTarget.status === 'CLOSED';
      const isRevealed = isClosed || totalBallots >= totalEligible;

      let tally = null;
      if (isRevealed) {
        if (isProjectReview) {
          const overallStats = await env.DB.prepare('SELECT COUNT(*) as count, AVG(rating) as avg_rating FROM ballots WHERE session_id = ?').bind(activeTarget.id).first();
          tally = [];
          for (const cand of candidates) {
            const stats = await env.DB.prepare(`
              SELECT 
                COUNT(*) as count,
                AVG(rating) as avg_rating,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as stars_5,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as stars_4,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as stars_3,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as stars_2,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as stars_1
              FROM ballots 
              WHERE session_id = ? AND (option_id = ? OR candidate_member_id = ?)
            `).bind(activeTarget.id, cand.id, cand.id).first();

            const cnt = stats?.count || (candidates.length === 1 ? overallStats?.count || 0 : 0);
            const avg = stats?.count ? (Math.round((stats.avg_rating || 0) * 10) / 10) : (overallStats?.count ? (Math.round((overallStats.avg_rating || 0) * 10) / 10) : 0);

            tally.push({
              candidate_id: cand.id,
              candidate_name: cand.name || cand.label,
              candidate_role: 'Project Review Dimension',
              team_track: 'milestone',
              total_ratings: cnt,
              avg_rating: avg,
              breakdown: {
                5: stats?.stars_5 || 0,
                4: stats?.stars_4 || 0,
                3: stats?.stars_3 || 0,
                2: stats?.stars_2 || 0,
                1: stats?.stars_1 || 0
              }
            });
          }
        } else if (targetMember) {
          const stats = await env.DB.prepare(`
            SELECT 
              COUNT(*) as count,
              AVG(rating) as avg_rating,
              SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as stars_5,
              SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as stars_4,
              SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as stars_3,
              SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as stars_2,
              SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as stars_1
            FROM ballots WHERE session_id = ?
          `).bind(activeTarget.id).first();

          const avgScore = stats?.count ? (Math.round((stats.avg_rating || 0) * 10) / 10) : 0;
          tally = [{
            candidate_id: targetMember.id,
            candidate_name: targetMember.name,
            candidate_role: targetMember.role,
            team_track: targetMember.team_track,
            total_ratings: stats?.count || 0,
            avg_rating: avgScore,
            breakdown: {
              5: stats?.stars_5 || 0,
              4: stats?.stars_4 || 0,
              3: stats?.stars_3 || 0,
              2: stats?.stars_2 || 0,
              1: stats?.stars_1 || 0
            }
          }];
        } else {
          tally = [];
          for (const cand of candidates) {
            const stats = await env.DB.prepare(`
              SELECT 
                COUNT(*) as count,
                AVG(rating) as avg_rating,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as stars_5,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as stars_4,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as stars_3,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as stars_2,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as stars_1
              FROM ballots 
              WHERE session_id = ? AND (candidate_member_id = ? OR option_id = ?)
            `).bind(activeTarget.id, cand.id, cand.id).first();

            tally.push({
              candidate_id: cand.id,
              candidate_name: cand.name || cand.label,
              candidate_role: cand.role || 'Sprint Deliverable',
              team_track: cand.team_track || 'milestone',
              total_ratings: stats?.count || 0,
              avg_rating: stats?.count ? (Math.round((stats.avg_rating || 0) * 10) / 10) : 0,
              breakdown: {
                5: stats?.stars_5 || 0,
                4: stats?.stars_4 || 0,
                3: stats?.stars_3 || 0,
                2: stats?.stars_2 || 0,
                1: stats?.stars_1 || 0
              }
            });
          }
        }
      }

      return jsonResponse({
        active: activeTarget.status === 'ACTIVE',
        hasActiveSession: activeTarget.status === 'ACTIVE',
        hasClosedSession: isClosed,
        session: activeTarget,
        targetMember,
        candidates,
        options: candidates,
        userHasClaimedToken: !!eligibility,
        totalBallots,
        totalEligible,
        isRevealed,
        isHost: isHostMember(member),
        tally
      });
    }

    if (pathname === '/api/voting/create' && method === 'POST') {
      const member = await getAuthMember(request, env);
      const isHost = isHostMember(member);
      if (!isHost) return jsonResponse({ error: 'Unauthorized: Only Team Lead (Admin) can launch a review session' }, 403);
      const { title, description, session_type, metric, options, target_member_id } = await request.json();

      const type = (session_type === 'PROJECT_QUALITY' || session_type === 'PROJECT_EXPERIENCE') ? 'PROJECT_QUALITY' : 'PEER_PERFORMANCE';
      const cleanTitle = (title || (type === 'PROJECT_QUALITY' ? 'Sprint 1 Project Review & Team Experience' : 'Sprint Peer Performance Review')).trim();
      const cleanDesc = (description || metric || (type === 'PROJECT_QUALITY' ? 'Team dynamic, working collaboration, and milestone delivery.' : 'Anonymous sprint contribution ratings (1–5 Stars). Cryptographically decoupled via HMAC blind tokens with zero identity linkage.')).trim();
      const targetMemberId = (type === 'PEER_PERFORMANCE' && target_member_id) ? parseInt(target_member_id, 10) : null;

      const membersCount = await env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE is_allowed = 1').first();
      const totalEligible = membersCount?.count || 8;

      // Close any active sessions before opening the new one
      await env.DB.prepare("UPDATE voting_sessions SET status = 'CLOSED', closed_at = datetime('now') WHERE status = 'ACTIVE'").run();

      const insertRes = await env.DB.prepare(`
        INSERT INTO voting_sessions (title, description, session_type, status, total_eligible, created_by, created_at, target_member_id)
        VALUES (?, ?, ?, 'ACTIVE', ?, ?, datetime('now'), ?)
      `).bind(cleanTitle, cleanDesc, type, totalEligible, member.id, targetMemberId).run();

      const newSessionId = insertRes.meta.last_row_id;

      if (type === 'PEER_PERFORMANCE' && targetMemberId) {
        const targetM = await env.DB.prepare('SELECT id, name FROM members WHERE id = ?').bind(targetMemberId).first();
        if (targetM) {
          await env.DB.prepare('INSERT INTO voting_options (session_id, candidate_member_id, label) VALUES (?, ?, ?)').bind(newSessionId, targetM.id, targetM.name).run();
        }
      } else if (type === 'PEER_PERFORMANCE') {
        const allM = await env.DB.prepare('SELECT id, name FROM members WHERE is_allowed = 1').all();
        for (const m of (allM?.results || [])) {
          await env.DB.prepare('INSERT INTO voting_options (session_id, candidate_member_id, label) VALUES (?, ?, ?)').bind(newSessionId, m.id, m.name).run();
        }
      } else if (type === 'PROJECT_QUALITY') {
        const pillars = (Array.isArray(options) && options.length > 0) ? options : [
          'Team Dynamic & Working Collaboration',
          'Sprint Milestone Architecture & Execution',
          'Code Quality & Deliverable Reliability',
          'Overall Project Satisfaction'
        ];
        for (const pillar of pillars) {
          if (typeof pillar === 'string' && pillar.trim()) {
            await env.DB.prepare('INSERT INTO voting_options (session_id, label) VALUES (?, ?)').bind(newSessionId, pillar.trim()).run();
          }
        }
      }

      await logAudit(env, member.handle, 'CREATE_VOTING', 'voting', `Launched ${type} review session #${newSessionId}: "${cleanTitle}"`);
      return jsonResponse({ success: true, message: `Review session "${cleanTitle}" successfully launched!`, session_id: newSessionId }, 201);
    }

    if ((pathname === '/api/voting/token' || pathname === '/api/voting/collect-token') && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Authentication required' }, 401);
      const body = await request.json().catch(() => ({}));
      let session = null;
      if (body.session_id) {
        session = await env.DB.prepare("SELECT * FROM voting_sessions WHERE id = ? AND status = 'ACTIVE'").bind(body.session_id).first();
      }
      if (!session) {
        session = await env.DB.prepare("SELECT * FROM voting_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1").first();
      }
      if (!session) return jsonResponse({ error: 'No active review session is currently open for submissions' }, 400);

      const sessionId = session.id;
      const alreadyClaimed = await env.DB.prepare('SELECT * FROM voting_eligibility WHERE session_id = ? AND member_id = ?').bind(sessionId, member.id).first();
      if (alreadyClaimed) {
        // If 0 ballots are recorded in this session (e.g. voter recovered from prior failure), re-issue valid token
        const ballotsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM ballots WHERE session_id = ?').bind(sessionId).first();
        if (ballotsCount?.count === 0) {
          const nonce = crypto.randomUUID();
          const message = `${sessionId}:${nonce}`;
          const signature = await hmacSha256(env.VOTING_SECRET || 'secret-salt-key-minimum-32-chars', message);
          return jsonResponse({ token: `${message}:${signature}` });
        }
        return jsonResponse({ error: 'You have already claimed a ballot token for this session.' }, 400);
      }

      await env.DB.prepare("INSERT INTO voting_eligibility (session_id, member_id, token_issued_at) VALUES (?, ?, datetime('now'))").bind(sessionId, member.id).run();
      const nonce = crypto.randomUUID();
      const message = `${sessionId}:${nonce}`;
      const signature = await hmacSha256(env.VOTING_SECRET || 'secret-salt-key-minimum-32-chars', message);
      await logAudit(env, member.handle, 'VOTE_CLAIM_TOKEN', 'voting', `Blind token claimed for Session #${sessionId}`);
      return jsonResponse({ token: `${message}:${signature}` });
    }

    if (pathname === '/api/voting/cast' && method === 'POST') {
      const { token, session_id, option_id, candidate_id, rating } = await request.json();
      const targetCandidateId = candidate_id || option_id || 1;
      const numRating = Math.max(1, Math.min(5, parseInt(rating || 5, 10)));
      if (!token || !session_id || !targetCandidateId) return jsonResponse({ error: 'Missing token or ballot payload' }, 400);

      const session = await env.DB.prepare("SELECT * FROM voting_sessions WHERE id = ? AND status = 'ACTIVE'").bind(session_id).first();
      if (!session) return jsonResponse({ error: 'Review session is closed or inactive' }, 400);

      const parts = token.split(':');
      if (parts.length !== 3) return jsonResponse({ error: 'Malformed ballot token' }, 400);
      const [tokenSessionId, nonce, providedSig] = parts;
      if (parseInt(tokenSessionId, 10) !== parseInt(session_id, 10)) return jsonResponse({ error: 'Token for wrong session' }, 400);
      const expectedSig = await hmacSha256(env.VOTING_SECRET || 'secret-salt-key-minimum-32-chars', `${tokenSessionId}:${nonce}`);
      if (expectedSig !== providedSig) return jsonResponse({ error: 'Cryptographic signature invalid' }, 403);
      const tokenHash = await sha256(token);

      // Check double-spending & recover from orphaned tokens if ballots insert failed previously
      const used = await env.DB.prepare('SELECT * FROM used_tokens WHERE token_hash = ?').bind(tokenHash).first();
      if (used) {
        const ballotsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM ballots WHERE session_id = ?').bind(session_id).first();
        if (ballotsCount?.count === 0) {
          // Token was orphaned by prior FOREIGN KEY error; delete and let voter cast successfully
          await env.DB.prepare('DELETE FROM used_tokens WHERE token_hash = ?').bind(tokenHash).run();
        } else {
          return jsonResponse({ error: 'Double-spending rejected: Token already cast' }, 409);
        }
      }

      // Guarantee valid option_id satisfying FOREIGN KEY (option_id) REFERENCES voting_options(id)
      let optRow = await env.DB.prepare(
        'SELECT id FROM voting_options WHERE session_id = ? AND (id = ? OR candidate_member_id = ?)'
      ).bind(session_id, targetCandidateId, targetCandidateId).first();

      if (!optRow) {
        optRow = await env.DB.prepare(
          'SELECT id FROM voting_options WHERE session_id = ? LIMIT 1'
        ).bind(session_id).first();
      }

      if (!optRow) {
        const candMember = await env.DB.prepare('SELECT name FROM members WHERE id = ?').bind(targetCandidateId).first();
        const optLabel = candMember?.name || `Option ${targetCandidateId}`;
        const insertOpt = await env.DB.prepare(
          'INSERT INTO voting_options (session_id, candidate_member_id, label) VALUES (?, ?, ?)'
        ).bind(session_id, targetCandidateId, optLabel).run();
        optRow = { id: insertOpt.meta.last_row_id };
      }

      const validOptionId = optRow.id;

      // Atomic execution: insert ballot and burn token together
      await env.DB.batch([
        env.DB.prepare("INSERT INTO used_tokens (token_hash, used_at) VALUES (?, datetime('now'))").bind(tokenHash),
        env.DB.prepare("INSERT INTO ballots (session_id, option_id, candidate_member_id, rating) VALUES (?, ?, ?, ?)").bind(session_id, validOptionId, targetCandidateId, numRating)
      ]);

      await logAudit(env, 'ANONYMOUS_VOTER', 'VOTE_CAST', 'voting', `Anonymous rating of ${numRating}/5 cast in Session #${session_id}`);
      return jsonResponse({ success: true });
    }

    if (pathname === '/api/voting/close' && method === 'POST') {
      const member = await getAuthMember(request, env);
      const isHost = isHostMember(member);
      if (!isHost) return jsonResponse({ error: 'Unauthorized: Only Team Lead (Admin) can close a review round' }, 403);
      const body = await request.json().catch(() => ({}));
      let targetId = body.session_id;
      if (!targetId) {
        const active = await env.DB.prepare("SELECT id FROM voting_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1").first();
        targetId = active?.id;
      }
      if (!targetId) return jsonResponse({ error: 'No active review session found to close' }, 400);

      await env.DB.prepare("UPDATE voting_sessions SET status = 'CLOSED', closed_at = datetime('now') WHERE id = ?").bind(targetId).run();
      await logAudit(env, member.handle, 'CLOSE_VOTING', 'voting', `Closed review session #${targetId}`);
      return jsonResponse({ success: true, session_id: targetId });
    }

    if (pathname === '/api/voting/reopen' && method === 'POST') {
      const member = await getAuthMember(request, env);
      const isHost = isHostMember(member);
      if (!isHost) return jsonResponse({ error: 'Unauthorized: Only Team Lead (Admin) can reopen a review round' }, 403);
      const body = await request.json().catch(() => ({}));
      let targetId = body.session_id;
      if (!targetId) {
        const closed = await env.DB.prepare("SELECT id FROM voting_sessions WHERE status = 'CLOSED' ORDER BY id DESC LIMIT 1").first();
        targetId = closed?.id;
      }
      if (!targetId) return jsonResponse({ error: 'No closed review session found to reopen' }, 400);

      await env.DB.prepare("UPDATE voting_sessions SET status = 'ARCHIVED' WHERE status = 'ACTIVE' AND id != ?").bind(targetId).run();
      await env.DB.prepare("UPDATE voting_sessions SET status = 'ACTIVE', closed_at = NULL WHERE id = ?").bind(targetId).run();
      await logAudit(env, member.handle, 'REOPEN_VOTING', 'voting', `Reopened review session #${targetId}`);
      return jsonResponse({ success: true, session_id: targetId });
    }

    // --------------------------------------------------------------------------
    // 9. MULTIPURPOSE PEERS: MICRO-TASKS & PEER FEEDBACK
    // --------------------------------------------------------------------------
    if (pathname === '/api/tasklets' && method === 'GET') {
      const member = await getAuthMember(request, env);
      const memberId = member ? member.id : 1;
      const filterType = url.searchParams.get('type'); // 'TASKLET' or 'FEEDBACK' or null

      let query = `
        SELECT t.*, 
          s.handle as sender_handle, s.name as sender_name, 
          r.handle as receiver_handle, r.name as receiver_name
        FROM tasklets t 
        LEFT JOIN members s ON t.sender_id = s.id 
        LEFT JOIN members r ON t.receiver_id = r.id
        WHERE (t.sender_id = ? OR t.receiver_id = ?)
      `;
      const params = [memberId, memberId];
      if (filterType) {
        query += ' AND (t.type = ? OR (t.type IS NULL AND ? = "TASKLET"))';
        params.push(filterType, filterType);
      }
      query += ' ORDER BY t.id DESC';

      const res = await env.DB.prepare(query).bind(...params).all();

      // Mask sender for anonymous feedback where recipient is reviewing
      const items = (res.results || []).map(item => {
        if (item.is_anonymous && item.receiver_id === memberId && item.sender_id !== memberId) {
          return {
            ...item,
            sender_name: 'Anonymous Teammate',
            sender_handle: 'anonymous'
          };
        }
        return item;
      });

      return jsonResponse({ tasklets: items });
    }

    if (pathname === '/api/tasklets' && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      const { receiver_id, title, description, type, category, is_anonymous } = await request.json();
      const itemType = type || 'TASKLET';
      const itemCategory = category || (itemType === 'FEEDBACK' ? 'KUDOS' : 'GENERAL');
      const isAnon = is_anonymous ? 1 : 0;

      const res = await env.DB.prepare(
        "INSERT INTO tasklets (sender_id, receiver_id, title, description, status, type, category, is_anonymous, created_at, updated_at) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, datetime('now'), datetime('now'))"
      ).bind(member.id, receiver_id, title, description || '', itemType, itemCategory, isAnon).run();

      await logAudit(env, isAnon ? 'ANONYMOUS' : member.handle, itemType === 'FEEDBACK' ? 'FEEDBACK_SHARE' : 'TASKLET_CREATE', 'tasklets', `Sent ${itemType.toLowerCase()} to member #${receiver_id}`);
      return jsonResponse({ success: true, id: res.meta?.last_row_id }, 201);
    }

    if (pathname.startsWith('/api/tasklets/') && method === 'PATCH') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      const id = pathname.split('/')[3];
      const { status } = await request.json();
      await env.DB.prepare("UPDATE tasklets SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
      return jsonResponse({ success: true });
    }

    // --------------------------------------------------------------------------
    // 10. GOVERNANCE ACCESS TICKETS (2-MAN RULE)
    // --------------------------------------------------------------------------
    if ((pathname === '/api/tickets' || pathname === '/api/governance/tickets') && method === 'GET') {
      const res = await env.DB.prepare(`
        SELECT a.*, r.name as requester_name, r.handle as requester_handle,
               ap.name as approver_name, ap.handle as approver_handle
        FROM access_tickets a
        LEFT JOIN members r ON a.requester_id = r.id
        LEFT JOIN members ap ON a.approver_id = ap.id
        ORDER BY a.id DESC
      `).all();
      return jsonResponse({ tickets: res.results || [] });
    }

    if ((pathname === '/api/tickets' || pathname === '/api/governance/tickets') && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Authentication required' }, 401);
      const body = await request.json();
      const { title, reason, scope, duration_minutes } = body;
      const res = await env.DB.prepare(`
        INSERT INTO access_tickets (requester_id, title, reason, scope, duration_minutes, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING_APPROVAL', datetime('now'))
      `).bind(member.id, title, reason, scope, duration_minutes || 30).run();
      await logAudit(env, member.handle, 'RAISE_TICKET', 'governance', `Created ticket "${title}"`);
      return jsonResponse({ success: true, id: res.meta?.last_row_id }, 201);
    }

    if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/approve') && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Authentication required' }, 401);
      const ticketId = parseInt(pathname.split('/')[3], 10);
      const ticket = await env.DB.prepare('SELECT * FROM access_tickets WHERE id = ?').bind(ticketId).first();
      if (!ticket) return jsonResponse({ error: 'Ticket not found' }, 404);
      if (ticket.status !== 'PENDING_APPROVAL') return jsonResponse({ error: `Ticket already ${ticket.status}` }, 400);
      if (ticket.requester_id === member.id) {
        await logAudit(env, member.handle, 'TICKET_APPROVE_VIOLATION', 'governance', `2-Man rule violation: tried to self-approve ticket #${ticketId}`, 'DENIED');
        return jsonResponse({ error: '2-Man Rule Violation: You cannot approve your own access ticket.' }, 403);
      }
      await env.DB.prepare("UPDATE access_tickets SET status = 'APPROVED', approver_id = ?, resolved_at = datetime('now') WHERE id = ?").bind(member.id, ticketId).run();
      await logAudit(env, member.handle, 'APPROVE_TICKET', 'governance', `Approved ticket #${ticketId}`);
      return jsonResponse({ success: true, ticketId });
    }

    // --------------------------------------------------------------------------
    // 11. AUDIT LOGS
    // --------------------------------------------------------------------------
    if ((pathname === '/api/audit' || pathname === '/api/audit/logs') && method === 'GET') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Restricted to Team Lead' }, 403);
      const res = await env.DB.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 100').all();
      return jsonResponse({ events: res.results || [], logs: res.results || [] });
    }

    // --------------------------------------------------------------------------
    // 12. DISASTER RECOVERY EXPORT
    // --------------------------------------------------------------------------
    if (pathname === '/api/disaster-recovery/export' && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member || !member.is_host) return jsonResponse({ error: 'Restricted to Team Lead' }, 403);
      const members = await env.DB.prepare('SELECT * FROM members').all();
      const tasks = await env.DB.prepare('SELECT * FROM tasks').all();
      const slots = await env.DB.prepare('SELECT * FROM meeting_slots').all();
      const events = await env.DB.prepare('SELECT * FROM calendar_events').all();
      const audit = await env.DB.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 100').all();
      return jsonResponse({
        success: true,
        filename: `snapshot_${Date.now()}.json`,
        snapshot: {
          platform: 'Frontier AI Cloudflare Edition',
          timestamp: new Date().toISOString(),
          exported_by: member.handle,
          tables: {
            members: members.results || [],
            tasks: tasks.results || [],
            meeting_slots: slots.results || [],
            calendar_events: events.results || [],
            audit_events: audit.results || []
          }
        }
      });
    }

    // --------------------------------------------------------------------------
    // 13. FRONTIER ORACLE AI — GROQ (Llama 3.3 70B)
    // --------------------------------------------------------------------------
    if (pathname === '/api/ai/chat' && method === 'POST') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized: Please sign in to use Frontier Oracle.' }, 401);
      const memberId = member.id;
      const { message, threadId } = await request.json();
      if (!message || !message.trim()) return jsonResponse({ error: 'Message cannot be empty' }, 400);

      // Ensure thread exists
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const title = message.slice(0, 40) + '...';
        const threadRes = await env.DB.prepare("INSERT INTO ai_threads (member_id, title, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))").bind(memberId, title).run();
        activeThreadId = threadRes.meta?.last_row_id;
      }

      // Record user message
      await env.DB.prepare("INSERT INTO ai_messages (thread_id, sender_role, content, created_at) VALUES (?, 'user', ?, datetime('now'))").bind(activeThreadId, message).run();

      // Fetch conversation history for this thread (sliding window: last 6 turns)
      const prevMsgs = await env.DB.prepare('SELECT sender_role, content FROM ai_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 6').bind(activeThreadId).all();
      const dialogueTurns = (prevMsgs.results || []).reverse();

      // Build Tier 1 dynamic context from D1
      const lower = message.toLowerCase();

      // 1. Live Team Roster from D1
      let teamRosterContext = '';
      try {
        const membersRes = await env.DB.prepare(
          'SELECT name, handle, role, team_track, email, is_host FROM members WHERE is_allowed = 1 ORDER BY is_host DESC, id ASC'
        ).all();
        const activeMembers = membersRes.results || [];
        if (activeMembers.length > 0) {
          teamRosterContext = '\nActive Team Roster:\n' + activeMembers.map(m =>
            `- ${m.name} (@${m.handle || (m.email ? m.email.split('@')[0] : 'user')}): ${m.role} [Track: ${m.team_track || 'General'}]${m.is_host ? ' (Team Host & Lead)' : ''}`
          ).join('\n');
        }
      } catch (err) {
        console.error('Failed to load team roster for AI Oracle:', err);
      }

      // 2. Active Sprint Tasks
      let tasksContext = '';
      if (/task|todo|progress|deliverable|deadline|work|sprint|status|who|assign/.test(lower) || lower.length < 20) {
        try {
          const tasks = await env.DB.prepare(`
            SELECT t.title, t.track, t.status, t.deadline, m.name as assignee_name
            FROM tasks t
            LEFT JOIN members m ON t.assignee_id = m.id
            ORDER BY t.id ASC LIMIT 15
          `).all();
          tasksContext = '\nActive Sprint Tasks:\n' + (tasks.results || []).map(t =>
            `- [${t.status}] ${t.title} (${t.track})${t.assignee_name ? ' [Assigned to: ' + t.assignee_name + ']' : ''}${t.deadline ? ' due ' + t.deadline : ''}`
          ).join('\n');
        } catch (e) {
          const tasks = await env.DB.prepare('SELECT title, track, status, deadline FROM tasks ORDER BY id ASC LIMIT 15').all();
          tasksContext = '\nActive Sprint Tasks:\n' + (tasks.results || []).map(t => `- [${t.status}] ${t.title} (${t.track})${t.deadline ? ' due ' + t.deadline : ''}`).join('\n');
        }
      }

      // 3. Meeting Bridges
      let calContext = '';
      if (/meet|call|sync|calendar|slot|bridge|schedule|google|today|event/.test(lower) || lower.length < 20) {
        const slots = await env.DB.prepare('SELECT slot_name, slot_code FROM meeting_slots LIMIT 6').all();
        calContext = '\nMeeting Bridges:\n' + (slots.results || []).map(s => `- ${s.slot_name} (${s.slot_code})`).join('\n');
      }

      let memory = null;
      try {
        memory = await env.DB.prepare('SELECT memory_data FROM member_memories WHERE member_id = ?').bind(memberId).first();
      } catch (e) { }

      const systemPrompt = `You are Frontier Oracle, the AI project assistant for the Frontier AI engineering workspace.
Current User: ${member.name} (@${member.handle || member.email}) — ${member.role}${memory?.memory_data ? '\nUser Profile: ' + memory.memory_data : ''}
${teamRosterContext}
${tasksContext}
${calContext}

GUIDELINES:
1. Provide concise, direct, authoritative answers grounded strictly in the workspace data and Active Team Roster above.
2. If asked who is on the team or what someone's track/role is, always consult and report from the Active Team Roster.
3. Use clean markdown formatting (bullet points, bold highlights).`;

      let modelReply = '';
      let groqDiagnostic = null;

      const groqKey = env.GROQ_API_KEY ? env.GROQ_API_KEY.trim() : null;

      if (!groqKey) {
        groqDiagnostic = 'GROQ_API_KEY is not defined in Cloudflare Worker environment variables.';
      } else {
        // Construct messages array with system prompt + sliding window of prior turns + current message
        const llmMessages = [
          { role: 'system', content: systemPrompt }
        ];

        for (const turn of dialogueTurns) {
          // Map database sender_role ('user'|'model') to Groq ('user'|'assistant')
          llmMessages.push({
            role: turn.sender_role === 'model' ? 'assistant' : 'user',
            content: turn.content
          });
        }

        const modelsToTry = [
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b'
        ];
        for (const modelName of modelsToTry) {
          try {
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: modelName,
                messages: llmMessages,
                max_tokens: 1024,
                temperature: 0.3
              })
            });

            const groqData = await groqRes.json();
            if (groqRes.ok && groqData.choices?.[0]?.message?.content) {
              modelReply = groqData.choices[0].message.content;
              break;
            } else if (groqData.error) {
              groqDiagnostic = `Groq (${modelName}) Error ${groqRes.status}: ${groqData.error.message || JSON.stringify(groqData.error)}`;
              console.error('Groq error:', groqData.error);
            } else {
              groqDiagnostic = `Groq HTTP ${groqRes.status}`;
            }
          } catch (e) {
            groqDiagnostic = `Groq fetch error: ${e.message}`;
            console.error('Groq fetch error:', e);
          }
        }
      }

      // Intelligent offline fallback
      if (!modelReply) {
        if (lower.includes('member') || lower.includes('team') || lower.includes('who') || lower.includes('roster') || lower.includes('track')) {
          const membersRes = await env.DB.prepare('SELECT name, role, team_track, is_host FROM members WHERE is_allowed = 1').all();
          modelReply = `Active Team Roster:\n` +
            (membersRes.results || []).map(m => `• **${m.name}** — ${m.role} [Track: ${m.team_track || 'General'}]${m.is_host ? ' (Team Host & Lead)' : ''}`).join('\n') +
            (groqDiagnostic ? `\n\n[Notice: ${groqDiagnostic}]` : '');
        } else if (lower.includes('task') || lower.includes('todo') || lower.includes('sprint')) {
          const tasks = await env.DB.prepare('SELECT title, track, status, deadline FROM tasks LIMIT 15').all();
          modelReply = `Active workspace tasks:\n` +
            (tasks.results || []).map(t => `• ${t.title} — ${t.status} (${t.track})`).join('\n') +
            (groqDiagnostic ? `\n\n[Notice: ${groqDiagnostic}]` : '');
        } else if (lower.includes('meet') || lower.includes('call') || lower.includes('bridge')) {
          const slots = await env.DB.prepare('SELECT slot_name, slot_code FROM meeting_slots LIMIT 6').all();
          modelReply = `Frontier AI has ${(slots.results || []).length} Google Meet bridges:\n` +
            (slots.results || []).map(s => `• ${s.slot_name} (${s.slot_code})`).join('\n') +
            (groqDiagnostic ? `\n\n[Notice: ${groqDiagnostic}]` : '');
        } else {
          modelReply = `I am Frontier Oracle running on Cloudflare Edge.\n\n[Notice: ${groqDiagnostic || 'Unable to connect to Groq AI service.'}]\n\nHow can I help you with current tasks or meetings?`;
        }
      }

      // Record model reply
      await env.DB.prepare("INSERT INTO ai_messages (thread_id, sender_role, content, created_at) VALUES (?, 'model', ?, datetime('now'))").bind(activeThreadId, modelReply).run();
      await env.DB.prepare("UPDATE ai_threads SET updated_at = datetime('now') WHERE id = ?").bind(activeThreadId).run();
      return jsonResponse({ reply: modelReply, threadId: activeThreadId });
    }

    if (pathname === '/api/ai/threads' && method === 'GET') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      const res = await env.DB.prepare('SELECT * FROM ai_threads WHERE member_id = ? ORDER BY id DESC').bind(member.id).all();
      return jsonResponse({ threads: res.results || [] });
    }

    // DELETE /api/ai/threads (Clear all threads for current user)
    if (pathname === '/api/ai/threads' && method === 'DELETE') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      await env.DB.prepare('DELETE FROM ai_messages WHERE thread_id IN (SELECT id FROM ai_threads WHERE member_id = ?)').bind(member.id).run();
      await env.DB.prepare('DELETE FROM ai_threads WHERE member_id = ?').bind(member.id).run();
      return jsonResponse({ success: true, message: 'All conversations cleared permanently.' });
    }

    // DELETE /api/ai/threads/:id (Delete single thread)
    if (pathname.match(/^\/api\/ai\/threads\/\d+$/) && method === 'DELETE') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      const threadId = parseInt(pathname.split('/')[4], 10);
      const thread = await env.DB.prepare('SELECT * FROM ai_threads WHERE id = ?').bind(threadId).first();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404);
      if (thread.member_id !== member.id && !member.is_host) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      await env.DB.prepare('DELETE FROM ai_messages WHERE thread_id = ?').bind(threadId).run();
      await env.DB.prepare('DELETE FROM ai_threads WHERE id = ?').bind(threadId).run();
      return jsonResponse({ success: true, deletedThreadId: threadId });
    }

    if (pathname.match(/^\/api\/ai\/threads\/\d+\/messages$/) && method === 'GET') {
      const member = await getAuthMember(request, env);
      if (!member) return jsonResponse({ error: 'Unauthorized' }, 401);
      const threadId = parseInt(pathname.split('/')[4], 10);
      const thread = await env.DB.prepare('SELECT * FROM ai_threads WHERE id = ?').bind(threadId).first();
      if (!thread) return jsonResponse({ error: 'Thread not found' }, 404);
      if (thread.member_id !== member.id && !member.is_host) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      const msgs = await env.DB.prepare('SELECT id, sender_role, content, created_at FROM ai_messages WHERE thread_id = ? ORDER BY id ASC').bind(threadId).all();
      return jsonResponse({ thread, messages: msgs.results || [] });
    }

    return jsonResponse({ error: 'Not Found', path: pathname }, 404);

  } catch (err) {
    console.error('Edge Function unhandled error:', err);
    return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
  }
}
