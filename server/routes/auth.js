import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, saveDb, one } from '../db/init.js';
import { config } from '../config.js';
import {
  authenticate, signToken, setSessionCookie, clearSessionCookie
} from '../middleware/auth.js';
import { loginSchema, changePasswordSchema, passwordPolicy } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('caliberate-dummy-password', 10);

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleTitle: user.role_title,
    department: user.department,
    avatar: user.avatar,
    badgeColor: user.badge_color,
    description: user.description,
    defaultPage: user.default_page,
    personId: user.person_id,
    mustChangePassword: Boolean(user.must_change_password),
    lastLoginAt: user.last_login_at
  };
}

// GET /api/auth/config — public runtime configuration for the login screen
router.get('/config', (req, res) => {
  res.json({
    appName: 'Caliberate',
    version: config.appVersion,
    demoMode: config.demoMode,
    environment: config.env
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid email address and password are required.' });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;
  const db = await getDb();
  const user = one(db, 'SELECT * FROM users WHERE lower(email) = ? LIMIT 1', [email]);

  if (!user) {
    bcrypt.compareSync(password, DUMMY_HASH);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!user.active) {
    return res.status(401).json({ error: 'This account has been deactivated. Contact your administrator.' });
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return res.status(423).json({ error: 'Account temporarily locked after repeated failed sign-in attempts. Try again later.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    const failedAttempts = Number(user.failed_attempts || 0) + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null;
    db.run('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = datetime(\'now\') WHERE id = ?', [failedAttempts, lockedUntil, user.id]);
    saveDb();
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [user.id]);
  saveDb();

  const token = signToken(user);
  setSessionCookie(res, token);

  req.user = { name: user.name, role: user.role };
  await audit(req, 'Signed In', 'Authentication', `Successful sign-in from ${req.ip || 'unknown IP'}`);

  res.json({ token, user: serializeUser({ ...user, failed_attempts: 0, locked_until: null }) });
});

// POST /api/auth/logout — revokes the current session and all other tokens for the user
router.post('/logout', async (req, res) => {
  clearSessionCookie(res);
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.[config.cookieName];
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const db = await getDb();
      const user = one(db, 'SELECT id, name, role, token_version FROM users WHERE id = ?', [decoded.id]);
      if (user) {
        db.run('UPDATE users SET token_version = token_version + 1, updated_at = datetime(\'now\') WHERE id = ?', [user.id]);
        saveDb();
        req.user = { name: user.name, role: user.role };
        await audit(req, 'Signed Out', 'Authentication', 'Session revoked');
      }
    } catch {
      // An invalid or expired token still gets its cookie cleared.
    }
  }
  res.json({ message: 'Signed out.' });
});

// GET /api/auth/me — validate token and return user profile
router.get('/me', authenticate, async (req, res) => {
  const db = await getDb();
  const user = one(db, 'SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(serializeUser(user));
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password payload.' });
  }
  if (!passwordPolicy(parsed.data.newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.'
    });
  }

  const db = await getDb();
  const user = one(db, 'SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const valid = bcrypt.compareSync(parsed.data.currentPassword, user.password);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });
  if (bcrypt.compareSync(parsed.data.newPassword, user.password)) {
    return res.status(400).json({ error: 'New password must be different from the current password.' });
  }

  const passwordHash = bcrypt.hashSync(parsed.data.newPassword, config.bcryptRounds);
  db.run(
    'UPDATE users SET password = ?, must_change_password = 0, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL, updated_at = datetime(\'now\') WHERE id = ?',
    [passwordHash, user.id]
  );
  saveDb();

  const updated = one(db, 'SELECT * FROM users WHERE id = ?', [user.id]);
  const token = signToken(updated);
  setSessionCookie(res, token);

  await audit(req, 'Changed Password', 'Authentication', 'Password updated by account owner');
  res.json({ token, user: serializeUser(updated), message: 'Password updated.' });
});

// GET /api/auth/demo-users — list demo personas (no passwords). Disabled outside demo mode.
router.get('/demo-users', async (req, res) => {
  if (!config.demoMode) {
    return res.status(404).json({ error: 'Demo mode is disabled.' });
  }
  const db = await getDb();
  const users = db.exec("SELECT id, name, email, role, role_title, department, avatar, badge_color, description, default_page, person_id FROM users WHERE active = 1 ORDER BY CASE role WHEN 'Admin' THEN 1 WHEN 'Operations' THEN 2 WHEN 'Manager' THEN 3 WHEN 'Resource' THEN 4 WHEN 'Sales' THEN 5 END");
  if (users.length === 0) return res.json([]);
  const columns = users[0].columns;
  res.json(users[0].values.map((row) => {
    const user = Object.fromEntries(columns.map((col, i) => [col, row[i]]));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleTitle: user.role_title,
      department: user.department,
      avatar: user.avatar,
      badgeColor: user.badge_color,
      description: user.description,
      defaultPage: user.default_page,
      personId: user.person_id
    };
  }));
});

export default router;
