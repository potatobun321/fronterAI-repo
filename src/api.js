/**
 * Unified API Client for Frontier AI
 * Handles cookie + Bearer authentication automatically
 */

function getAuthHeader() {
  const token = localStorage.getItem('frontier_session');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  options.headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {})
  };
  options.credentials = 'include';

  const res = await fetch(url, options);

  // If Set-Cookie contains session token, save to localStorage as well
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/frontier_session=([^;]+)/);
    if (match) localStorage.setItem('frontier_session', match[1]);
  }

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg = (data && data.error) || (typeof data === 'string' ? data : `HTTP ${res.status}`);
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  getCurrentUser: () => request('/api/auth/current'),
  loginAs: (payload) => request('/api/auth/login-as', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // Tasks
  getTasks: () => request('/api/tasks'),
  createTask: (task) => request('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (taskId, update) => request(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(update) }),

  // Meetings & Calendar
  getMeetings: () => request('/api/meetings'),
  createMeeting: (event) => request('/api/calendar/events', { method: 'POST', body: JSON.stringify(event) }),

  // Voting & Peer Review
  getVotingCurrent: (sessionId = 0) => request(`/api/voting/current${sessionId ? `?session_id=${sessionId}` : ''}`),
  createVotingSession: (data) => request('/api/voting/create', { method: 'POST', body: JSON.stringify(data) }),
  claimBallotToken: (sessionId) => request('/api/voting/token', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  castBallot: (ballot) => request('/api/voting/cast', { method: 'POST', body: JSON.stringify(ballot) }),
  closeVotingSession: (sessionId) => request('/api/voting/close', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  reopenVotingSession: (sessionId) => request('/api/voting/reopen', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),

  // Members & Governance
  getMembers: () => request('/api/members'),
  getPendingMembers: () => request('/api/members/pending'),
  onboardMember: (member) => request('/api/members', { method: 'POST', body: JSON.stringify(member) }),
  approveMember: (memberId, role, team_track) => request(`/api/members/${memberId}/approve`, { method: 'POST', body: JSON.stringify({ role, team_track }) }),
  rejectMember: (memberId) => request(`/api/members/${memberId}/reject`, { method: 'POST' }),
  transferHost: (targetMemberId) => request('/api/members/transfer-host', { method: 'POST', body: JSON.stringify({ target_member_id: targetMemberId }) }),

  // Peer Tasklets
  getTasklets: () => request('/api/tasklets'),
  createTasklet: (tasklet) => request('/api/tasklets', { method: 'POST', body: JSON.stringify(tasklet) }),
  updateTasklet: (taskletId, status) => request(`/api/tasklets/${taskletId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Governance & Tickets
  getTickets: () => request('/api/governance/tickets'),
  createTicket: (ticket) => request('/api/governance/tickets', { method: 'POST', body: JSON.stringify(ticket) }),
  signOffTicket: (ticketId) => request(`/api/governance/tickets/${ticketId}/sign-off`, { method: 'POST' }),
  denyTicket: (ticketId) => request(`/api/governance/tickets/${ticketId}/deny`, { method: 'POST' }),

  // Audit Logs & Disaster Recovery
  getAuditEvents: () => request('/api/audit'),
  exportBackup: () => request('/api/dr/export'),

  // Frontier Oracle AI
  chatOracle: (message, threadId = null) => request('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message, threadId }) }),
  executeAction: (action, payload) => request('/api/ai/execute', { method: 'POST', body: JSON.stringify({ action, payload }) })
};
