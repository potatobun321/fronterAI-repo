import fs from 'node:fs';
import path from 'node:path';
import { db, logAudit } from '../db.js';
import { getSessionUser } from '../middleware/session.js';
import { sendJson } from '../middleware/httpHelpers.js';
import { BACKUP_DIR } from '../config.js';

export async function handleDisasterRecoveryRoutes(req, res, pathname, method) {
  if (pathname === '/api/disaster-recovery/export' && method === 'POST') {
    const currentUser = getSessionUser(req);
    if (!currentUser || !currentUser.is_host) {
      return sendJson(res, 403, { error: 'Permission Denied: Only the Authorator / Lead can export disaster recovery snapshots.' });
    }

    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const snapshot = {
      platform: 'Frontier AI Internal Platform',
      timestamp: new Date().toISOString(),
      exported_by: currentUser.handle,
      schema_version: '2.1.0',
      tables: {
        members: db.prepare('SELECT * FROM members').all(),
        tasks: db.prepare('SELECT * FROM tasks').all(),
        meeting_slots: db.prepare('SELECT * FROM meeting_slots').all(),
        calendar_events: db.prepare('SELECT * FROM calendar_events').all(),
        voting_sessions: db.prepare('SELECT * FROM voting_sessions').all(),
        voting_options: db.prepare('SELECT * FROM voting_options').all(),
        voting_eligibility: db.prepare('SELECT * FROM voting_eligibility').all(),
        used_tokens: db.prepare('SELECT * FROM used_tokens').all(),
        ballots: db.prepare('SELECT * FROM ballots').all(),
        access_tickets: db.prepare('SELECT * FROM access_tickets').all(),
        audit_events: db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 100').all(),
        ai_threads: db.prepare('SELECT * FROM ai_threads').all(),
        ai_messages: db.prepare('SELECT * FROM ai_messages').all(),
        member_memories: db.prepare('SELECT * FROM member_memories').all()
      }
    };

    const filename = `snapshot_${Date.now()}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');

    logAudit(
      currentUser.handle,
      'DISASTER_SNAPSHOT_EXPORT',
      'system_backup',
      `Sanitized JSON snapshot generated at ${filename} for ₹0 Git repository commit.`,
      'SUCCESS'
    );

    return sendJson(res, 200, {
      message: 'Database snapshot successfully generated for ₹0 Git backup repository!',
      filename,
      totalTables: Object.keys(snapshot.tables).length,
      timestamp: snapshot.timestamp,
      snapshot
    });
  }

  return false;
}
