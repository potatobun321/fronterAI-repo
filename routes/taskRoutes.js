import { db, logAudit } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { parseBody, sendJson } from '../middleware/httpHelpers.js';

export async function handleTaskRoutes(req, res, pathname, method) {
  if (pathname === '/api/tasks' && method === 'GET') {
    const tasks = db.prepare(`
      SELECT t.*, m.name as assignee_name, m.handle as assignee_handle
      FROM tasks t
      LEFT JOIN members m ON t.assignee_id = m.id
      ORDER BY t.id ASC
    `).all();
    return sendJson(res, 200, { tasks });
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    const currentUser = getSessionUser(req);
    // AUTHORIZATION CHECK: ONLY the Host can allot tasks!
    if (!currentUser || !currentUser.is_host) {
      logAudit(
        currentUser ? currentUser.handle : 'unauthenticated',
        'ALLOT_TASK_VIOLATION',
        'tasks',
        'Participant attempted to allot a task. Denied by role policy.',
        'DENIED'
      );
      return sendJson(res, 403, {
        error: 'Permission Denied: Only the designated Team Host / Lead has authorization to allot tasks.'
      });
    }

    const body = await parseBody(req);
    const { title, description, track, assignee_id, deadline, deliverable_url } = body;

    if (!title) return sendJson(res, 400, { error: 'Task title is required' });

    const insert = db.prepare(`
      INSERT INTO tasks (title, description, track, assignee_id, status, deadline, deliverable_url, version, updated_at)
      VALUES (?, ?, ?, ?, 'TODO', ?, ?, 1, ?)
    `);

    const now = new Date().toISOString();
    const defaultDeadline = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const result = insert.run(
      title,
      description || '',
      track || 'backend',
      assignee_id || currentUser.id,
      deadline || defaultDeadline,
      deliverable_url || '',
      now
    );

    logAudit(
      currentUser.handle,
      'ALLOT_TASK',
      `task_${result.lastInsertRowid}`,
      `Host allotted task "${title}" to member #${assignee_id}`,
      'SUCCESS'
    );

    return sendJson(res, 201, { id: result.lastInsertRowid, message: 'Task allotted successfully' });
  }

  if (pathname.startsWith('/api/tasks/') && method === 'PATCH') {
    const currentUser = getSessionUser(req);
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    const taskId = parseInt(pathname.split('/')[3], 10);
    const body = await parseBody(req);
    const { status, deliverable_url, deliverable_notes, version } = body;

    const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!current) return sendJson(res, 404, { error: 'Task not found' });

    // OCC: Optimistic Concurrency Control Check
    if (typeof version === 'number' && current.version !== version) {
      logAudit(
        currentUser.handle,
        'CONFLICT_DETECTED',
        `task_${taskId}`,
        `Write rejected! Provided v${version} does not match database v${current.version}. Concurrency collision prevented.`,
        'CONFLICT'
      );
      return sendJson(res, 409, {
        error: 'Concurrency Conflict: This task was modified by another peer while you were editing it.',
        currentVersion: current.version,
        yourVersion: version
      });
    }

    const nextVersion = current.version + 1;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE tasks
      SET status = COALESCE(?, status),
          deliverable_url = COALESCE(?, deliverable_url),
          deliverable_notes = COALESCE(?, deliverable_notes),
          version = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      status || current.status,
      deliverable_url ?? current.deliverable_url,
      deliverable_notes ?? current.deliverable_notes,
      nextVersion,
      now,
      taskId
    );

    const actionType = deliverable_url ? 'SUBMIT_DELIVERABLE' : 'UPDATE_TASK';
    logAudit(
      currentUser.handle,
      actionType,
      `task_${taskId}`,
      `Participant updated task to ${status || current.status}. Deliverable: ${deliverable_url || 'N/A'}. Advanced to v${nextVersion}.`,
      'SUCCESS'
    );

    return sendJson(res, 200, { message: 'Task progress / deliverable updated', nextVersion });
  }

  if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Only Team Host can delete tasks.' });
    }
    const taskId = parseInt(pathname.split('/')[3], 10);
    const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!current) return sendJson(res, 404, { error: 'Task not found' });

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    logAudit(
      currentUser.handle,
      'DELETE_TASK',
      `task_${taskId}`,
      `Host deleted task #${taskId} ("${current.title}")`,
      'SUCCESS'
    );
    return sendJson(res, 200, { message: 'Task deleted successfully' });
  }

  return false;
}
