import http from 'node:http';
import { PORT } from './config.js';
import { initDatabase } from './db.js';
import { cleanupExpiredSessions } from './middleware/session.js';
import { dispatchRoutes } from './routes/index.js';

// Initialize SQLite database, WAL mode, pragmas & schema
initDatabase();

// Clean up expired sessions on startup
cleanupExpiredSessions();

// Create HTTP server with modular route dispatching
const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    await dispatchRoutes(req, res, urlObj.pathname, req.method, urlObj);
  } catch (error) {
    console.error('Unhandled server error:', error);
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', details: error.message }));
    }
  }
});

if (process.env.FRONTIER_NO_AUTO_LISTEN !== '1') {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontier AI Platform (Modular Edition) running at http://localhost:${PORT}`);
  });
}

export default server;
