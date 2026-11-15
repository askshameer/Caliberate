import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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

// Demo/clean mode is chosen in the first-run setup wizard and stored in the
// database. DEMO_MODE / SEED_DEMO_DATA / ADMIN_* env vars still work for
// non-interactive deployments (they provision the first start automatically).
const envProvisioned = bool(process.env.DEMO_MODE)
  || bool(process.env.SEED_DEMO_DATA)
  || Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
const demoMode = bool(process.env.DEMO_MODE, false);
const dbPath = process.env.DB_PATH
  ? path.resolve(serverRoot, process.env.DB_PATH)
  : path.join(serverRoot, 'db', 'caliberate.db');

const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(serverRoot, process.env.UPLOAD_DIR)
  : path.join(serverRoot, 'uploads');

function resolveJwtSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured !== undefined && configured !== '') {
    if (isProduction && (configured.length < 32 || /replace-with|change-me|development-only/i.test(configured))) {
      throw new Error('JWT_SECRET must be set to at least 32 characters of high-entropy random data in production.');
    }
    return configured;
  }
  if (!isProduction) return 'caliberate-development-only-secret-change-me-2026';

  // For managed Node.js web apps (e.g. Hostinger) booted before env vars are
  // configured, generate a strong secret once and persist it beside the DB.
  const secretFile = path.join(path.dirname(dbPath), '.jwt_secret');
  if (fs.existsSync(secretFile)) {
    const stored = fs.readFileSync(secretFile, 'utf8').trim();
    if (stored.length >= 32) return stored;
  }
  const generated = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

const jwtSecret = resolveJwtSecret();

const rawPort = process.env.PORT?.trim();
const port = rawPort && !/^\d+$/.test(rawPort) ? rawPort : int(rawPort, 3001);

const corsOrigins = list(process.env.CORS_ORIGINS);
if (!isProduction && corsOrigins.length === 0) {
  corsOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}

const bootstrapAdmin = {
  email: process.env.ADMIN_EMAIL || '',
  password: process.env.ADMIN_PASSWORD || '',
  name: process.env.ADMIN_NAME || 'Platform Administrator',
};

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
  port,
  trustProxy: process.env.TRUST_PROXY || (isProduction ? '1' : ''),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  cookieName: process.env.SESSION_COOKIE_NAME || 'caliberate_session',
  cookieSecure: bool(process.env.COOKIE_SECURE, isProduction),
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict',
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
  envProvisioned,
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
  appVersion: process.env.APP_VERSION || '2.5.1',
};

export default config;
