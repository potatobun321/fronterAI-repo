import { db } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { sendJson } from '../middleware/httpHelpers.js';

export async function handleDashboardRoutes(req, res, pathname, method) {
  if (pathname === '/api/dashboard/personal' && method === 'GET') {
    const currentUser = getSessionUser(req);
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    const myTasks = db.prepare(`
      SELECT t.*, m.name as assignee_name
      FROM tasks t
      LEFT JOIN members m ON t.assignee_id = m.id
      WHERE t.assignee_id = ?
      ORDER BY t.id ASC
    `).all(currentUser.id);

    const rawEvents = db.prepare(`
      SELECT c.*, m.name as assignee_name, s.slot_name, s.slot_code
      FROM calendar_events c
      LEFT JOIN members m ON c.assignee_id = m.id
      LEFT JOIN meeting_slots s ON c.meeting_slot_id = s.id
      ORDER BY c.event_date ASC, c.id ASC
    `).all();

    // Audience filtering for personal dashboard
    const myEvents = rawEvents.filter(ev => {
      if (currentUser.is_host === 1) return true; // Team Lead sees all
      if (ev.target_audience === 'ALL') return true;
      if (ev.target_audience === 'BACKEND' && currentUser.team_track === 'backend') return true;
      if (ev.target_audience === 'FRONTEND' && currentUser.team_track === 'frontend') return true;
      if (ev.assignee_id && ev.assignee_id === currentUser.id) return true;
      if (ev.assignee_id === null && !ev.target_audience) return true;
      if (ev.target_audience && ev.target_audience.startsWith('[')) {
        try {
          const list = JSON.parse(ev.target_audience);
          if (Array.isArray(list) && list.map(Number).includes(currentUser.id)) return true;
        } catch {}
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
    const activeVote = db.prepare("SELECT * FROM voting_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1").get() ||
                       db.prepare('SELECT * FROM voting_sessions ORDER BY id DESC LIMIT 1').get() || null;
    const hasVoted = (activeVote && currentUser)
      ? db.prepare('SELECT * FROM voting_eligibility WHERE session_id = ? AND member_id = ?').get(activeVote.id, currentUser.id)
      : null;

    const completed = myTasks.filter(t => t.status === 'COMPLETED').length;
    const inProgress = myTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const todo = myTasks.filter(t => t.status === 'TODO').length;

    return sendJson(res, 200, {
      user: currentUser,
      tasks: myTasks,
      events: myEvents,
      liveMeeting,
      hasVoted: !!hasVoted,
      votingSession: activeVote,
      stats: {
        total: myTasks.length,
        completed,
        inProgress,
        todo,
        completionRate: myTasks.length > 0 ? Math.round((completed / myTasks.length) * 100) : 0
      }
    });
  }

  return false;
}
