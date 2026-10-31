import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = __dirname;

dotenv.config({ path: process.env.ENV_FILE || path.join(serverRoot, '..', '.env') });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const isTest = env === 'test';

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const demoMode = bool(process.env.DEMO_MODE, !isProduction);
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'caliberate-development-only-secret-change-me-2026');

if (isProduction && (!jwtSecret || jwtSecret.length < 32 || /replace-with|change-me|development-only/i.test(jwtSecret))) {
  throw new Error('JWT_SECRET must be set to at least 32 characters of high-entropy random data in production.');
}

const dbPath = process.env.DB_PATH
  ? path.resolve(serverRoot, process.env.DB_PATH)
  : path.join(serverRoot, 'db', 'caliberate.db');

const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(serverRoot, process.env.UPLOAD_DIR)
  : path.join(serverRoot, 'uploads');

const corsOrigins = list(process.env.CORS_ORIGINS);
if (!isProduction && corsOrigins.length === 0) {
  corsOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}

const bootstrapAdmin = {
  email: process.env.ADMIN_EMAIL || '',
  password: process.env.ADMIN_PASSWORD || '',
  name: process.env.ADMIN_NAME || 'Platform Administrator',
};

if (!demoMode && !isTest && (!bootstrapAdmin.email || !bootstrapAdmin.password)) {
  if (!fs.existsSync(dbPath)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to bootstrap the first production administrator.');
  }
}

if (!demoMode && !isTest && !fs.existsSync(dbPath) && bootstrapAdmin.password) {
  const strong = bootstrapAdmin.password.length >= 12
    && /[A-Z]/.test(bootstrapAdmin.password)
    && /[a-z]/.test(bootstrapAdmin.password)
    && /[0-9]/.test(bootstrapAdmin.password)
    && /[^A-Za-z0-9]/.test(bootstrapAdmin.password)
    && !/replace-with|change-me/i.test(bootstrapAdmin.password);
  if (!strong) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters with uppercase, lowercase, a number, a symbol, and must not be a placeholder.');
  }
}

export const config = {
  env,
  isProduction,
  isTest,
  port: int(process.env.PORT, 3001),
  trustProxy: process.env.TRUST_PROXY || (isProduction ? '1' : ''),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  cookieName: process.env.SESSION_COOKIE_NAME || 'caliberate_session',
  cookieSecure: bool(process.env.COOKIE_SECURE, isProduction),
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict',
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
  demoMode,
  seedDemoData: bool(process.env.SEED_DEMO_DATA, demoMode),
  dbPath,
  uploadDir,
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),
  corsOrigins,
  bootstrapAdmin,
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 600),
    authMax: int(process.env.AUTH_RATE_LIMIT_MAX, 20),
  },
  logFormat: process.env.LOG_FORMAT || (isProduction ? 'combined' : 'dev'),
  appVersion: process.env.APP_VERSION || '1.0.0',
};

export default config;
