import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Frontier AI Cloudflare Full-Stack Dev Environment...\n');

// 1. Start Cloudflare Worker + local D1 via Wrangler
const wranglerEntry = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const worker = spawn(process.execPath, [wranglerEntry, 'dev', '--port', '8787'], {
  stdio: ['inherit', 'pipe', 'pipe']
});

worker.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.log('\x1b[34m[worker]\x1b[0m %s', line));
});

worker.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.error('\x1b[31m[worker-err]\x1b[0m %s', line));
});

// 2. Start Vite dev server (proxies /api -> http://127.0.0.1:8787)
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

function cleanExit() {
  console.log('\n\x1b[36m%s\x1b[0m', '🛑 Shutting down Cloudflare dev servers...');
  try { worker.kill('SIGTERM'); } catch (_) {}
  try { client.kill('SIGTERM'); } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('exit', cleanExit);
