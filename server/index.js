import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { getDb, closeDb } from './db/init.js';

// Route imports
import authRoutes from './routes/auth.js';
import peopleRoutes from './routes/people.js';
import jobsRoutes from './routes/jobs.js';
import applicationsRoutes from './routes/applications.js';
import requestsRoutes from './routes/requests.js';
import settingsRoutes from './routes/settings.js';
import usersRoutes from './routes/users.js';
import externalRequestRoutes from './routes/externalRequests.js';
import panelRoutes from './routes/panels.js';
import rosterRoutes from './routes/roster.js';
import notificationRoutes from './routes/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

// Allow same-origin requests, explicitly configured origins, and (in
// development only) any loopback or private-network origin. This keeps Vite on
// localhost, a LAN IP, or an alternate port like 5174 working without weakening
// the production allowlist.
function isPrivateDevOrigin(origin) {
  if (config.isProduction) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname;
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || host === '[::1]'
      || host === '0.0.0.0'
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      || /^169\.254\./.test(host);
  } catch {
    return false;
  }
}

function isAllowedOrigin(req, origin) {
  if (!origin) return true;
  const hostOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin === hostOrigin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  return isPrivateDevOrigin(origin);
}

if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// Security headers. The CSP is explicit so the app can load Google Fonts while
// keeping scripts, frames, and objects locked down.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      ...(config.isProduction ? { upgradeInsecureRequests: [] } : {})
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  hsts: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false
}));

app.use(cors((req, callback) => {
  const origin = req.get('origin');
  const allowed = isAllowedOrigin(req, origin);
  callback(null, {
    origin: allowed ? (origin || false) : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
  });
}));

app.use(compression());
app.use(cookieParser());
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(morgan(config.logFormat, {
  skip: (req) => req.path === '/api/health' || req.path === '/api/ready'
}));

const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const url = (req.originalUrl || req.path || '').split('?')[0];
    return url === '/api/health' || url === '/api/ready';
  },
  message: { error: 'Too many requests. Please slow down and try again shortly.' }
});
app.use('/api', globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts. Please wait before trying again.' }
});
app.use('/api/auth/login', loginLimiter);

// Body parsing happens after rate limiting so abusive payloads are rejected early.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

// Health and readiness probes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'caliberate',
    version: config.appVersion,
    environment: config.env,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/ready', async (req, res) => {
  try {
    const db = await getDb();
    db.exec('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

// CSRF defense in depth for cookie-authenticated state changes. SameSite=Strict
// already blocks cross-site cookies; this also rejects unexpected browser origins.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  const requestOrigin = origin || (referer ? (() => { try { return new URL(referer).origin; } catch { return null; } })() : null);
  if (!requestOrigin) return next();
  if (!isAllowedOrigin(req, requestOrigin)) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/external-requests', externalRequestRoutes);
app.use('/api/panels', panelRoutes);
app.use('/api/interview-roster', rosterRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve the production client build
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath, {
  index: false,
  maxAge: config.isProduction ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// SPA fallback — serve index.html for all non-API GET routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// API 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.status(404).send('Not found');
});

// Global error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The uploaded file is too large.' : err.message });
  }
  if (err?.message?.includes('Only PDF')) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON request body.' });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: err.issues?.[0]?.message || 'Invalid request payload.' });
  }

  console.error(`Unhandled error [${req.id || 'no-request-id'}]:`, err);
  res.status(500).json({
    error: 'Internal server error.',
    requestId: req.id,
    ...(config.isProduction ? {} : { detail: err?.message })
  });
});

let server;

getDb().then(() => {
  server = app.listen(config.port, () => {
    console.log(`\n🚀 Caliberate API Server running at http://localhost:${config.port}`);
    console.log(`   API endpoints:  http://localhost:${config.port}/api/`);
    console.log(`   Client app:     http://localhost:${config.port}/`);
    console.log(`   Environment:    ${config.env}`);
    console.log(`   Demo mode:      ${config.demoMode ? 'enabled' : 'disabled'}`);
    console.log(`   Database:       ${config.dbPath}\n`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  const finish = () => {
    try { closeDb(); } catch (error) { console.error('Failed to close database:', error); }
    process.exit(0);
  };
  if (!server) return finish();
  server.close(() => finish());
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
