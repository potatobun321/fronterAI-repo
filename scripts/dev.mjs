import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Frontier AI Full-Stack Development Engine...\n');

// 1. Start backend server with file watch
const server = spawn(process.execPath, ['--watch', 'server.js'], {
  stdio: ['inherit', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.log('\x1b[34m[server]\x1b[0m %s', line));
});

server.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.error('\x1b[31m[server-err]\x1b[0m %s', line));
});

// 2. Start Vite dev server directly via node (100% cross-platform & zero shell overhead)
const viteEntry = path.join('node_modules', 'vite', 'bin', 'vite.js');
const client = spawn(process.execPath, [viteEntry], {
  stdio: ['inherit', 'pipe', 'pipe']
});

client.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.log('\x1b[32m[client]\x1b[0m %s', line));
});

client.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.error('\x1b[33m[client-err]\x1b[0m %s', line));
});

// Clean shutdown handler
function cleanExit() {
  console.log('\n\x1b[36m%s\x1b[0m', '🛑 Shutting down development servers...');
  try { server.kill('SIGTERM'); } catch (_) {}
  try { client.kill('SIGTERM'); } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('exit', cleanExit);
