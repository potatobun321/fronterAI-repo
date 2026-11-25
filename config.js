import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Zero-dependency .env loader
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

export const PORT = process.env.PORT || 3030;
export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const HOST_EMAIL = process.env.HOST_EMAIL || 'kart123.san@gmail.com';
export const HOST_GITHUB_ID = process.env.HOST_GITHUB_ID ? parseInt(process.env.HOST_GITHUB_ID, 10) : 194890859;
export const HOST_HANDLE = process.env.HOST_HANDLE || 'kart123.san';
export const HOST_NAME = process.env.HOST_NAME || 'Kartikay';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const VOTING_SECRET = process.env.VOTING_SECRET || '';
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const GROQ_MODEL = process.env.GROQ_MODEL || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const AI_PROVIDER = process.env.AI_PROVIDER || 'groq';
export const isProduction = process.env.NODE_ENV === 'production';
export const ROOT_DIR = __dirname;
export const DIST_DIR = path.join(__dirname, 'dist');
export const PUBLIC_DIR = path.join(__dirname, 'public');
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'frontier.db');
