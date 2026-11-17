import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, DIST_DIR } from '../config.js';

export function handleStaticRoutes(req, res, pathname) {
  // Use compiled dist/ directory if it exists, otherwise fallback to public/
  const baseDir = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : PUBLIC_DIR;
  let targetPath = pathname === '/' ? 'index.html' : pathname;
  let filePath = path.join(baseDir, targetPath);

  // Security: Prevent path traversal attacks
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return true;
  }

  // SPA fallback for non-API client routes
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (!pathname.startsWith('/api') && fs.existsSync(path.join(baseDir, 'index.html'))) {
      filePath = path.join(baseDir, 'index.html');
    } else {
      return false;
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  return false;
}
