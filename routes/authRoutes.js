import crypto from 'node:crypto';
import { db, logAudit } from '../db.js';
import { getSessionUser, createSession, destroySession } from '../middleware/session.js';
import { parseCookies, parseBody, sendJson } from '../middleware/httpHelpers.js';
import { BASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, HOST_EMAIL, isProduction } from '../config.js';

function createSignedState(secret) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret).update(`${nonce}.${ts}`).digest('hex');
  return `${nonce}.${ts}.${sig}`;
}

function verifySignedState(secret, stateToken) {
  if (!stateToken || typeof stateToken !== 'string') return false;
  const parts = stateToken.split('.');
  if (parts.length !== 3) return false;
  const [nonce, tsStr, sig] = parts;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  if (Date.now() - ts > 15 * 60 * 1000 || ts > Date.now() + 60 * 1000) return false;
  const expectedSig = crypto.createHmac('sha256', secret).update(`${nonce}.${tsStr}`).digest('hex');
  return sig === expectedSig;
}

export async function handleAuthRoutes(req, res, pathname, method, urlObj) {
  const cookies = parseCookies(req);

  if (pathname === '/api/auth/current' && method === 'GET') {
    const currentUser = getSessionUser(req);
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const token = bearerToken || cookies.frontier_session || null;
    return sendJson(res, 200, {
      authenticated: !!currentUser,
      user: currentUser,
      member: currentUser,
      token: currentUser ? token : null,
      oauthConfigured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
    });
  }

  // -------------------------------------------------------------
  // GOOGLE OAUTH 2.0 FLOW
  // -------------------------------------------------------------
  if (pathname === '/api/auth/google' && method === 'GET') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.writeHead(302, { Location: '/?error=oauth_not_configured' });
      return res.end();
    }

    const secret = GOOGLE_CLIENT_SECRET || 'frontier-oauth-secret-key-salt-32ch';
    const state = createSignedState(secret);
    const redirectUri = `${BASE_URL}/api/auth/google/callback`;
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline` +
      `&state=${state}`;

    res.writeHead(302, {
      'Location': googleAuthUrl,
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=900`
    });
    return res.end();
  }

  if (pathname === '/api/auth/google/callback' && method === 'GET') {
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    const oauthError = urlObj.searchParams.get('error');

    if (oauthError) {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(oauthError)}` });
      return res.end();
    }

    const secret = GOOGLE_CLIENT_SECRET || 'frontier-oauth-secret-key-salt-32ch';
    const isStateValid = verifySignedState(secret, state) || (cookies.oauth_state && state === cookies.oauth_state);

    if (!state || !isStateValid) {
      logAudit('anonymous', 'OAUTH_CSRF_FAILED', 'auth_oauth', 'Google OAuth state parameter mismatch or expired.', 'DENIED');
      res.writeHead(302, { Location: '/?error=csrf_state_mismatch' });
      return res.end();
    }

    try {
      // Exchange code for Google access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: `${BASE_URL}/api/auth/google/callback`,
          grant_type: 'authorization_code'
        }).toString()
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        logAudit('anonymous', 'OAUTH_TOKEN_FAILED', 'auth_oauth', `Google token exchange failed: ${tokenData.error_description || 'unknown'}`, 'DENIED');
        res.writeHead(302, { Location: '/?error=token_exchange_failed' });
        return res.end();
      }

      // Fetch Google user profile
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const googleUser = await userRes.json();
      const googleSub = googleUser.sub;   // Stable unique Google user ID
      const googleEmail = googleUser.email;

      // Check allowlist:
      let member = null;
      const hostEmailClean = (HOST_EMAIL || '').toLowerCase().trim();
      const isHostEmail = Boolean(googleEmail && hostEmailClean && googleEmail.toLowerCase() === hostEmailClean);

      // 1. Host Priority Check: Host is recognized by exact host email
      if (isHostEmail) {
        member = db.prepare('SELECT * FROM members WHERE is_host = 1 OR id = 1').get();
        if (member) {
          db.prepare('UPDATE members SET email = ?, google_sub = ?, is_host = 1, is_allowed = 1 WHERE id = ?').run(googleEmail, googleSub, member.id);
          member = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id);
        }
      }

      // 2. By google_sub (returning users)
      if (!member) {
        member = db.prepare('SELECT * FROM members WHERE google_sub = ?').get(googleSub);
      }

      // 3. By email (prioritize approved members)
      if (!member && googleEmail) {
        member = db.prepare('SELECT * FROM members WHERE LOWER(email) = LOWER(?) ORDER BY is_allowed DESC').get(googleEmail);
        // On first login: bind google_sub and email to the member record
        if (member) {
          db.prepare('UPDATE members SET google_sub = ?, email = COALESCE(email, ?) WHERE id = ?').run(googleSub, googleEmail, member.id);
          member = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id);
        }
      }

      // If user is completely new (not in members table), auto-register as Pending Access Request
      if (!member) {
        const cleanHandle = (googleEmail.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
        let handle = cleanHandle;
        const existingHandle = db.prepare('SELECT id FROM members WHERE LOWER(handle) = LOWER(?)').get(handle);
        if (existingHandle) {
          handle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
        }
        const displayName = googleUser.name || googleUser.given_name || cleanHandle;

        db.prepare(`
          INSERT INTO members (handle, name, role, team_track, email, google_sub, is_host, is_allowed)
          VALUES (?, ?, 'Pending Review', 'unassigned', ?, ?, 0, 0)
        `).run(handle, displayName, googleEmail, googleSub);

        logAudit(
          `google_${googleEmail}`,
          'ACCESS_REQUEST_SUBMITTED',
          'auth_allowlist',
          `New user ${displayName} (${googleEmail}) requested access to Frontier AI. Queued for Host approval.`,
          'SUCCESS'
        );

        res.writeHead(302, {
          Location: `/?auth=pending_approval&email=${encodeURIComponent(googleEmail)}`
        });
        return res.end();
      }

      // If user exists but is awaiting Host approval or disabled
      if (!member.is_allowed) {
        logAudit(
          member.handle,
          'LOGIN_AWAITING_APPROVAL',
          'auth_allowlist',
          `User ${member.name} (${googleEmail}) attempted login while access request is awaiting Host approval.`,
          'PENDING'
        );
        res.writeHead(302, {
          Location: `/?auth=pending_approval&email=${encodeURIComponent(googleEmail || member.email || '')}`
        });
        return res.end();
      }

      const sessionToken = createSession(member);
      logAudit(
        member.handle,
        'OAUTH_LOGIN_SUCCESS',
        'auth_session',
        `Authenticated via Google OAuth 2.0 as ${member.name} (${googleEmail}). Access level: ${member.is_host ? 'AUTHORATOR' : 'PARTICIPANT'}.`,
        'SUCCESS'
      );

      res.writeHead(302, {
        'Location': `/?auth=oauth_success&sid=${sessionToken}`,
        'Set-Cookie': [
          `frontier_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
          `oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
        ]
      });
      return res.end();

    } catch (err) {
      console.error('Google OAuth callback error:', err);
      res.writeHead(302, { Location: '/?error=oauth_internal_error' });
      return res.end();
    }
  }

  // Dev Simulation Endpoint (localhost only)
  if (pathname === '/api/auth/google/simulate' && method === 'GET') {
    if (isProduction) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    const email = urlObj.searchParams.get('email') || HOST_EMAIL;
    let member = db.prepare('SELECT * FROM members WHERE LOWER(email) = LOWER(?)').get(email);

    // If new simulated user, register as pending request
    if (!member) {
      const cleanHandle = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
      let handle = cleanHandle;
      const existingHandle = db.prepare('SELECT id FROM members WHERE LOWER(handle) = LOWER(?)').get(handle);
      if (existingHandle) {
        handle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
      }
      const displayName = cleanHandle;
      const googleSub = 'sim_' + Date.now();

      db.prepare(`
        INSERT INTO members (handle, name, role, team_track, email, google_sub, is_host, is_allowed)
        VALUES (?, ?, 'Pending Review', 'unassigned', ?, ?, 0, 0)
      `).run(handle, displayName, email, googleSub);

      logAudit(
        `sim_${email}`,
        'ACCESS_REQUEST_SUBMITTED',
        'auth_allowlist',
        `Simulated access request submitted for ${displayName} (${email}). Queued for Host approval.`,
        'SUCCESS'
      );
      res.writeHead(302, { Location: `/?auth=pending_approval&email=${encodeURIComponent(email)}` });
      return res.end();
    }

    if (!member.is_allowed) {
      logAudit(
        `google_${email}`,
        'OAUTH_SIM_PENDING',
        'auth_allowlist',
        `Simulated Google OAuth login checked for email: ${email}. Account is awaiting Host approval.`,
        'PENDING'
      );
      res.writeHead(302, { Location: `/?auth=pending_approval&email=${encodeURIComponent(email)}` });
      return res.end();
    }

    const sessionToken = createSession(member);
    logAudit(
      member.handle,
      'OAUTH_SIM_SUCCESS',
      'auth_session',
      `Simulated Google OAuth callback verified for ${member.name} (${email}).`,
      'SUCCESS'
    );
    res.writeHead(302, {
      'Location': `/?auth=oauth_success&sid=${sessionToken}`,
      'Set-Cookie': [
        `frontier_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
        `oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      ]
    });
    return res.end();
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const logoutToken = bearerToken || cookies.frontier_session;
    const logoutUser = getSessionUser(req);
    if (logoutUser) {
      logAudit(logoutUser.handle, 'LOGOUT', 'auth_session', 'User signed out.', 'SUCCESS');
    }
    if (logoutToken) destroySession(logoutToken);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'frontier_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    });
    return res.end(JSON.stringify({ message: 'Logged out successfully' }));
  }

  // Dev / Testing Simulation Endpoint
  if (pathname === '/api/auth/login-as' && method === 'POST') {
    if (isProduction) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    const body = await parseBody(req);
    const { github_numeric_id, email, member_id } = body;

    let member = null;
    if (github_numeric_id !== undefined && github_numeric_id !== null) {
      member = db.prepare('SELECT * FROM members WHERE github_numeric_id = ?').get(github_numeric_id);
    } else if (email) {
      member = db.prepare('SELECT * FROM members WHERE LOWER(email) = LOWER(?)').get(email);
    } else if (member_id) {
      member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
    }

    if (!member || !member.is_allowed) {
      logAudit(
        `auth_${github_numeric_id || email || member_id || 'unknown'}`,
        'LOGIN_ATTEMPT',
        'auth_allowlist',
        `Unauthorized login attempt from ${github_numeric_id || email || member_id}. Rejected by allowlist policy.`,
        'DENIED'
      );
      return sendJson(res, 403, {
        error: 'Access Denied: Account is not in the Frontier AI membership allowlist.',
        github_numeric_id
      });
    }

    const sessionToken = createSession(member);
    logAudit(
      member.handle,
      'LOGIN_SUCCESS',
      'auth_session',
      `Authenticated as ${member.name} (${member.role}). Access level: ${member.is_host ? 'AUTHORATOR' : 'PARTICIPANT'}.`,
      'SUCCESS'
    );
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `frontier_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
    });
    return res.end(JSON.stringify({ user: member, message: 'Logged in successfully' }));
  }

  return false;
}
