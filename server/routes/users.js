import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getDb, saveDb, one, all } from '../db/init.js';
import { config } from '../config.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { userCreateSchema, userUpdateSchema, passwordPolicy } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate, requireAdmin);

function serialize(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleTitle: user.role_title,
    department: user.department,
    description: user.description,
    defaultPage: user.default_page,
    personId: user.person_id,
    mustChangePassword: Boolean(user.must_change_password),
    active: Boolean(user.active),
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function initials(name) {
  return String(name || 'User').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function activeAdminCount(db, excludingId = null) {
  const row = excludingId
    ? one(db, "SELECT COUNT(*) AS count FROM users WHERE role = 'Admin' AND active = 1 AND id != ?", [excludingId])
    : one(db, "SELECT COUNT(*) AS count FROM users WHERE role = 'Admin' AND active = 1");
  return Number(row?.count || 0);
}

router.get('/', async (req, res) => {
  const db = await getDb();
  const users = all(db, 'SELECT * FROM users ORDER BY name ASC');
  res.json(users.map(serialize));
});

router.post('/', async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user payload.' });
  }
  const data = parsed.data;
  if (!passwordPolicy(data.password)) {
    return res.status(400).json({ error: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.' });
  }

  const db = await getDb();
  const email = data.email.toLowerCase().trim();
  if (one(db, 'SELECT id FROM users WHERE lower(email) = ?', [email])) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }
  if (data.personId && !one(db, 'SELECT id FROM people WHERE id = ?', [data.personId])) {
    return res.status(400).json({ error: 'The linked employee record does not exist.' });
  }

  const id = `usr-${randomUUID()}`;
  db.run(
    `INSERT INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, must_change_password, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      id, data.name, email, bcrypt.hashSync(data.password, config.bcryptRounds), data.role,
      data.roleTitle || '', data.department || '', initials(data.name),
      'bg-slate-100 text-slate-700 border-slate-200', data.description || '',
      data.defaultPage || 'Dashboard', data.personId || null,
      data.mustChangePassword === false ? 0 : 1, data.active === false ? 0 : 1
    ]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM users WHERE id = ?', [id]);
  await audit(req, 'Created User', created.email, `${created.name} · ${created.role}`, null, serialize(created));
  res.status(201).json(serialize(created));
});

router.put('/:id', async (req, res) => {
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user payload.' });
  }
  const data = parsed.data;
  const db = await getDb();
  const existing = one(db, 'SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const nextRole = data.role ?? existing.role;
  const nextActive = data.active === undefined ? Boolean(existing.active) : data.active;
  const isDemotingOrDeactivatingAdmin = existing.role === 'Admin' && (nextRole !== 'Admin' || !nextActive);
  if (isDemotingOrDeactivatingAdmin && activeAdminCount(db, existing.id) === 0) {
    return res.status(400).json({ error: 'At least one active administrator must remain.' });
  }
  if (existing.id === req.user.id && !nextActive) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }

  const nextEmail = (data.email ?? existing.email).toLowerCase().trim();
  if (one(db, 'SELECT id FROM users WHERE lower(email) = ? AND id != ?', [nextEmail, existing.id])) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }
  if (data.personId && !one(db, 'SELECT id FROM people WHERE id = ?', [data.personId])) {
    return res.status(400).json({ error: 'The linked employee record does not exist.' });
  }
  if (data.password && !passwordPolicy(data.password)) {
    return res.status(400).json({ error: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.' });
  }

  const passwordChanged = Boolean(data.password);
  const roleChanged = nextRole !== existing.role;
  const activeChanged = nextActive !== Boolean(existing.active);
  const revokeSessions = passwordChanged || roleChanged || activeChanged || data.mustChangePassword === true;

  db.run(
    `UPDATE users SET name = ?, email = ?, role = ?, role_title = ?, department = ?, description = ?, default_page = ?, person_id = ?, must_change_password = ?, active = ?, password = ?, token_version = token_version + ?, updated_at = datetime('now') WHERE id = ?`,
    [
      data.name ?? existing.name,
      nextEmail,
      nextRole,
      data.roleTitle ?? existing.role_title,
      data.department ?? existing.department,
      data.description ?? existing.description,
      data.defaultPage ?? existing.default_page,
      data.personId === undefined ? existing.person_id : data.personId,
      data.mustChangePassword === undefined ? existing.must_change_password : (data.mustChangePassword ? 1 : 0),
      nextActive ? 1 : 0,
      data.password ? bcrypt.hashSync(data.password, config.bcryptRounds) : existing.password,
      revokeSessions ? 1 : 0,
      existing.id
    ]
  );
  saveDb();
  const updated = one(db, 'SELECT * FROM users WHERE id = ?', [existing.id]);
  await audit(req, 'Updated User', updated.email, `${updated.name} · ${updated.role}`, serialize(existing), serialize(updated));
  res.json(serialize(updated));
});

router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const existing = one(db, 'SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  if (existing.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  if (existing.role === 'Admin' && activeAdminCount(db, existing.id) === 0) {
    return res.status(400).json({ error: 'At least one active administrator must remain.' });
  }
  db.run("UPDATE users SET active = 0, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?", [existing.id]);
  saveDb();
  const updated = one(db, 'SELECT * FROM users WHERE id = ?', [existing.id]);
  await audit(req, 'Deactivated User', existing.email, existing.name, serialize(existing), serialize(updated));
  res.json({ message: 'User deactivated.', user: serialize(updated) });
});

export default router;
