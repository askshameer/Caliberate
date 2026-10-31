import jwt from 'jsonwebtoken';
import { getDb, one } from '../db/init.js';
import { config } from '../config.js';

export const ROLE_PERMISSIONS = {
  Admin: ['*'],
  Operations: [
    'people:read', 'people:write', 'jobs:read', 'jobs:write',
    'applications:read', 'applications:write', 'requests:read', 'requests:review',
    'settings:read', 'settings:write', 'audit:read', 'reports:read'
  ],
  Manager: [
    'people:read:team', 'jobs:read', 'jobs:write', 'applications:read:team',
    'requests:read:team', 'requests:create', 'reports:read:team'
  ],
  Resource: [
    'profile:read', 'profile:write', 'jobs:read', 'applications:read:self',
    'applications:write:self'
  ],
  Sales: ['capacity:read', 'jobs:read']
};

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      personId: user.person_id ?? user.personId ?? null,
      tv: user.token_version ?? user.tokenVersion ?? 0
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/'
  });
}

function readToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.[config.cookieName] || null;
}

// Verify JWT token middleware. Accepts either an Authorization bearer token
// (for API clients and automated tests) or the httpOnly session cookie.
export async function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const db = await getDb();
    const user = one(db, 'SELECT * FROM users WHERE id = ? LIMIT 1', [decoded.id]);

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
    }

    const currentVersion = Number(user.token_version || 0);
    const tokenVersion = Number(decoded.tv || 0);
    if (currentVersion !== tokenVersion) {
      return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      personId: user.person_id,
      roleTitle: user.role_title,
      department: user.department,
      mustChangePassword: Boolean(user.must_change_password),
      tokenVersion: currentVersion
    };
    req.token = token;

    const path = (req.originalUrl || req.path || '').split('?')[0];
    const passwordChangeAllowed = [
      '/api/auth/me',
      '/api/auth/logout',
      '/api/auth/change-password'
    ].includes(path);
    if (req.user.mustChangePassword && !passwordChangeAllowed) {
      return res.status(403).json({
        error: 'You must change your password before continuing.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// Role-based access control middleware
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}.` });
    }
    next();
  };
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

// Privileged check (Admin or Operations)
export function requirePrivileged(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'Admin' && req.user.role !== 'Operations') {
    return res.status(403).json({ error: 'This action requires Admin or Operations privileges.' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'This action requires administrator privileges.' });
  }
  next();
}
