import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getDb, saveDb, one, all } from '../db/init.js';
import { config } from '../config.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { userCreateSchema, userUpdateSchema, passwordPolicy, ROLE_VALUES } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/login-history', async (req, res) => {
  const db = await getDb();
  const limit = 50;
  const requestedPage = Number(req.query.page);
  const page = Number.isFinite(requestedPage) ? Math.min(1000000, Math.max(1, Math.floor(requestedPage) || 1)) : 1;
  const search = String(req.query.search || '').slice(0, 254);
  const outcome = String(req.query.outcome || '');
  const where = `WHERE (email LIKE ? OR name LIKE ?) AND (? = '' OR outcome = ?)`;
  const args = [`%${search}%`, `%${search}%`, outcome, outcome];
  const total = one(db, `SELECT COUNT(*) AS count FROM login_history ${where}`, args).count;
  const entries = all(db, `SELECT * FROM login_history ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, limit, (page - 1) * limit]);
  res.json({ entries, total, page, limit });
});

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

function syncPanelProfile(db, userId, name, email, roleTitle, active) {
  const existing = one(db, 'SELECT id FROM panels WHERE user_id = ?', [userId]);
  if (existing) {
    db.run('UPDATE panels SET name = ?, email = ?, role_title = ?, active = ? WHERE id = ?', [name, email, roleTitle || '', active ? 1 : 0, existing.id]);
  } else {
    db.run(
      `INSERT INTO panels (user_id, name, email, role_title, practice, skills, domains, time_slots, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Digital', '[]', '[]', '[]', ?, datetime('now'), datetime('now'))`,
      [userId, name, email, roleTitle || '', active ? 1 : 0]
    );
  }
}

// ── CSV import / export ───────────────────────────────────────
const DEFAULT_IMPORT_PASSWORD = 'Password@123';
const CSV_COLUMNS = ['name', 'email', 'role', 'roleTitle', 'department', 'status'];
const MAX_IMPORT_ROWS = 1000;

// Neutralise spreadsheet formula injection and quote when needed.
function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/users/export — user list as CSV (never includes passwords)
router.get('/export', async (req, res) => {
  const db = await getDb();
  const users = all(db, 'SELECT * FROM users ORDER BY name ASC');
  const lines = [CSV_COLUMNS.join(',')];
  for (const u of users) {
    lines.push([u.name, u.email, u.role, u.role_title, u.department, u.active ? 'Active' : 'Inactive'].map(csvCell).join(','));
  }
  await audit(req, 'Exported Users CSV', 'users.csv', `Exported ${users.length} users`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="caliberate-users.csv"');
  res.send(lines.join('\r\n') + '\r\n');
});

// POST /api/users/import — body { csv }. Every imported user gets the default
// password and must change it at first sign-in.
router.post('/import', async (req, res) => {
  const csv = req.body?.csv;
  if (typeof csv !== 'string' || !csv.trim()) {
    return res.status(400).json({ error: 'CSV content is required.' });
  }
  const rows = parseCsv(csv);
  if (rows.length < 2) return res.status(400).json({ error: 'The CSV needs a header row and at least one user.' });
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Import is limited to ${MAX_IMPORT_ROWS} users at a time.` });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_]/g, ''));
  const col = (name) => header.indexOf(name);
  const idx = {
    name: col('name'), email: col('email'), role: col('role'),
    roleTitle: col('roletitle'), department: col('department'), status: col('status')
  };
  if (idx.name < 0 || idx.email < 0 || idx.role < 0) {
    return res.status(400).json({ error: 'The CSV header must include name, email and role columns.' });
  }

  const db = await getDb();
  const passwordHash = bcrypt.hashSync(DEFAULT_IMPORT_PASSWORD, config.bcryptRounds);
  const created = [];
  const skipped = [];
  const seen = new Set();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim().replace(/^'(?=[=+\-@])/, '') : '');
    const name = get('name');
    const email = get('email').toLowerCase();
    const roleRaw = get('role');
    const role = ROLE_VALUES.find((v) => v.toLowerCase() === roleRaw.toLowerCase());
    if (!name || name.length < 2) return skipped.push({ line, email, reason: 'Name is required.' });
    if (!EMAIL_RE.test(email)) return skipped.push({ line, email, reason: 'Invalid email address.' });
    if (!role) return skipped.push({ line, email, reason: `Unknown role "${roleRaw}". Use one of: ${ROLE_VALUES.join(', ')}.` });
    if (seen.has(email) || one(db, 'SELECT id FROM users WHERE lower(email) = ?', [email])) {
      return skipped.push({ line, email, reason: 'A user with this email already exists.' });
    }
    seen.add(email);

    const id = `usr-${randomUUID()}`;
    const active = !/^(inactive|disabled|false|no|0)$/i.test(get('status'));
    const defaultPage = role === 'Panel' ? 'Interview Profile' : role === 'TA' ? 'Interview Roster' : 'Dashboard';
    db.run(
      `INSERT INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, must_change_password, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, datetime('now'), datetime('now'))`,
      [id, name, email, passwordHash, role, get('roleTitle'), get('department'), initials(name),
        'bg-slate-100 text-slate-700 border-slate-200', '', defaultPage, active ? 1 : 0]
    );
    if (role === 'Panel') syncPanelProfile(db, id, name, email, get('roleTitle'), active);
    created.push({ line, email, role });
  });

  if (created.length > 0) saveDb();
  await audit(req, 'Imported Users CSV', 'users.csv', `${created.length} created, ${skipped.length} skipped`);
  res.status(created.length > 0 ? 201 : 200).json({
    created: created.length,
    skipped,
    defaultPassword: DEFAULT_IMPORT_PASSWORD,
    message: `${created.length} user${created.length === 1 ? '' : 's'} imported. They must change the default password at first sign-in.`
  });
});
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
  const defaultPage = data.defaultPage || (data.role === 'Panel' ? 'Interview Profile' : data.role === 'TA' ? 'Interview Roster' : 'Dashboard');
  db.run(
    `INSERT INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, must_change_password, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      id, data.name, email, bcrypt.hashSync(data.password, config.bcryptRounds), data.role,
      data.roleTitle || '', data.department || '', initials(data.name),
      'bg-slate-100 text-slate-700 border-slate-200', data.description || '',
      defaultPage, data.personId || null,
      data.mustChangePassword === false ? 0 : 1, data.active === false ? 0 : 1
    ]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM users WHERE id = ?', [id]);
  if (created.role === 'Panel') {
    syncPanelProfile(db, created.id, created.name, created.email, created.role_title, true);
    saveDb();
  }
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
  const defaultPage = data.defaultPage || (nextRole === 'Panel' ? 'Interview Profile' : nextRole === 'TA' ? 'Interview Roster' : existing.default_page);

  db.run(
    `UPDATE users SET name = ?, email = ?, role = ?, role_title = ?, department = ?, description = ?, default_page = ?, person_id = ?, must_change_password = ?, active = ?, password = ?, token_version = token_version + ?, updated_at = datetime('now') WHERE id = ?`,
    [
      data.name ?? existing.name,
      nextEmail,
      nextRole,
      data.roleTitle ?? existing.role_title,
      data.department ?? existing.department,
      data.description ?? existing.description,
      defaultPage,
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
  if (updated.role === 'Panel') {
    syncPanelProfile(db, updated.id, updated.name, updated.email, updated.role_title, Boolean(updated.active));
    saveDb();
  }
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
  if (existing.role === 'Panel') {
    db.run("UPDATE panels SET active = 0, updated_at = datetime('now') WHERE user_id = ?", [existing.id]);
  }
  saveDb();
  const updated = one(db, 'SELECT * FROM users WHERE id = ?', [existing.id]);
  await audit(req, 'Deactivated User', existing.email, existing.name, serialize(existing), serialize(updated));
  res.json({ message: 'User deactivated.', user: serialize(updated) });
});

export default router;
