import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, saveDb, all, one } from '../db/init.js';
import { config } from '../config.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { panelCreateSchema, panelUpdateSchema, passwordPolicy } from '../validation/schemas.js';
import { audit } from '../services/audit.js';
import { effectiveSlots } from '../services/availability.js';

const router = Router();

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function parsePanel(p) {
  return {
    id: p.id,
    userId: p.user_id,
    name: p.name,
    email: p.email,
    roleTitle: p.role_title,
    practice: p.practice,
    skills: safeJson(p.skills, []),
    domains: safeJson(p.domains, []),
    timeSlots: effectiveSlots(safeJson(p.time_slots, []), safeJson(p.recurring_slots, [])),
    recurringSlots: safeJson(p.recurring_slots, []),
    active: Boolean(p.active),
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

function skillIntersection(required, panelSkills) {
  const set = new Set((panelSkills || []).map((s) => String(s).toLowerCase()));
  return (required || []).filter((s) => set.has(String(s).toLowerCase()));
}

function initials(name) {
  return String(name || 'Panel').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function temporaryPassword() {
  return `Temp@${randomUUID().slice(0, 8)}A1!`;
}

// Availability slots are one-hour blocks expressed as a start time. They may
// only be set for the current calendar week or the next calendar week.
function validateSlots(slots) {
  if (!slots || slots.length === 0) return { ok: true };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  const dayOfWeek = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 14);

  const seen = new Set();
  for (const slot of slots) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(slot.date))) return { ok: false, error: 'Slot date must be in YYYY-MM-DD format.' };
    if (!/^\d{2}:\d{2}$/.test(String(slot.time))) return { ok: false, error: 'Slot start time must be in HH:MM format.' };
    const startMinute = Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3, 5));
    if (startMinute < 8 * 60 || startMinute > 17 * 60) {
      return { ok: false, error: 'Interview slots must start between 08:00 and 17:00 (ending by 18:00).' };
    }
    const slotDate = new Date(`${slot.date}T00:00:00`);
    if (Number.isNaN(slotDate.getTime()) || slotDate < weekStart || slotDate >= weekEnd) {
      return { ok: false, error: 'Slots can only be set for the current week and the next week.' };
    }
    const weekday = slotDate.getDay();
    if (weekday === 0 || weekday === 6) {
      return { ok: false, error: 'Availability can only be set Monday to Friday.' };
    }
    const key = `${slot.date}|${slot.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const slotStart = new Date(`${slot.date}T${slot.time}:00`);
    if (Number.isNaN(slotStart.getTime()) || slotStart <= now) {
      return { ok: false, error: 'Slots must be in the future.' };
    }
  }
  return { ok: true };
}

const ALLOWED_VIEWERS = ['Admin', 'Operations', 'Manager', 'TA'];

// GET /api/panels — available panels for Admin/Operations/Manager/TA
router.get('/', authenticate, async (req, res) => {
  if (!ALLOWED_VIEWERS.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  const rows = all(db, 'SELECT * FROM panels WHERE active = 1 ORDER BY name ASC');
  res.json(rows.map(parsePanel));
});

// GET /api/panels/available?skills=a,b,c — panels whose skills match the requirements
router.get('/available', authenticate, async (req, res) => {
  if (!ALLOWED_VIEWERS.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const required = String(req.query.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const db = await getDb();
  const rows = all(db, 'SELECT * FROM panels WHERE active = 1 ORDER BY name ASC');
  const result = rows
    .map(parsePanel)
    .map((panel) => ({
      ...panel,
      matchedSkills: skillIntersection(required, panel.skills),
      matchCount: skillIntersection(required, panel.skills).length
    }))
    .filter((panel) => required.length === 0 || panel.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);
  res.json(result);
});

// GET /api/panels/me — the logged-in panel member's own profile
router.get('/me', authenticate, async (req, res) => {
  const db = await getDb();
  const panel = one(db, 'SELECT * FROM panels WHERE user_id = ? AND active = 1', [req.user.id]);
  if (!panel) return res.status(404).json({ error: 'No interview panel profile is linked to your account.' });
  res.json(parsePanel(panel));
});

// GET /api/panels/:id
router.get('/:id', authenticate, async (req, res) => {
  if (!ALLOWED_VIEWERS.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  const panel = one(db, 'SELECT * FROM panels WHERE id = ?', [Number(req.params.id)]);
  if (!panel) return res.status(404).json({ error: 'Panel member not found.' });
  res.json(parsePanel(panel));
});

// POST /api/panels — Admin creates a panel member (creates the login account too)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const parsed = panelCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid panel payload.' });
  }
  const data = parsed.data;
  const slotCheck = validateSlots(data.timeSlots);
  if (!slotCheck.ok) return res.status(400).json({ error: slotCheck.error });
  const password = data.password || temporaryPassword();
  if (!passwordPolicy(password)) {
    return res.status(400).json({ error: 'Panel password must be at least 12 characters with uppercase, lowercase, a number, and a symbol.' });
  }

  const db = await getDb();
  const email = data.email?.toLowerCase().trim() || `${data.name.toLowerCase().replace(/\s+/g, '.')}@caliberate.io`;
  if (one(db, 'SELECT id FROM users WHERE lower(email) = ?', [email])) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }

  const userId = `usr-${randomUUID()}`;
  db.run(
    `INSERT INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, active, must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Panel', ?, 'Interview Panel', ?, 'bg-sky-100 text-sky-800 border-sky-200', 'Interview panel member.', 'Interview Profile', 1, 1, datetime('now'), datetime('now'))`,
    [userId, data.name, email, bcrypt.hashSync(password, config.bcryptRounds), data.roleTitle || '', initials(data.name)]
  );
  db.run(
    `INSERT INTO panels (user_id, name, email, role_title, practice, skills, domains, time_slots, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [userId, data.name, email, data.roleTitle || '', data.practice || 'Digital', JSON.stringify(data.skills || []), JSON.stringify(data.domains || []), JSON.stringify(data.timeSlots || [])]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM panels WHERE user_id = ?', [userId]);
  await audit(req, 'Created Panel Member', created.name, `Skills: ${(data.skills || []).join(', ') || 'none'}`);
  res.status(201).json({ panel: parsePanel(created), tempPassword: data.password ? undefined : password });
});

// PUT /api/panels/:id — Admin edits any panel; a panel member edits their own profile
router.put('/:id', authenticate, async (req, res) => {
  const db = await getDb();
  const targetId = Number(req.params.id);
  const existing = one(db, 'SELECT * FROM panels WHERE id = ?', [targetId]);
  if (!existing) return res.status(404).json({ error: 'Panel member not found.' });

  const isSelf = existing.user_id === req.user.id;
  const isAdmin = req.user.role === 'Admin';
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const parsed = panelUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid panel payload.' });
  }
  const data = parsed.data;
  const slotCheck = validateSlots(data.timeSlots);
  if (!slotCheck.ok) return res.status(400).json({ error: slotCheck.error });

  // Panel members can only maintain their interview profile, not identity or access.
  const nextName = isAdmin && data.name !== undefined ? data.name : existing.name;
  const nextEmail = isAdmin && data.email !== undefined ? (data.email || null) : existing.email;
  const nextActive = isAdmin && data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

  db.run(
    `UPDATE panels SET name = ?, email = ?, role_title = ?, practice = ?, skills = ?, domains = ?, time_slots = ?, recurring_slots = ?, active = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      nextName,
      nextEmail,
      data.roleTitle ?? existing.role_title,
      data.practice ?? existing.practice,
      data.skills !== undefined ? JSON.stringify(data.skills) : existing.skills,
      data.domains !== undefined ? JSON.stringify(data.domains) : existing.domains,
      data.timeSlots !== undefined ? JSON.stringify(data.timeSlots) : existing.time_slots,
      data.recurringSlots !== undefined ? JSON.stringify(data.recurringSlots) : (existing.recurring_slots || '[]'),
      nextActive,
      targetId
    ]
  );

  if (isAdmin && (data.name !== undefined || data.email !== undefined || nextActive !== existing.active)) {
    db.run(
      `UPDATE users SET name = ?, email = ?, active = ?, updated_at = datetime('now') WHERE id = ?`,
      [nextName, nextEmail, nextActive, existing.user_id]
    );
  }
  saveDb();

  const updated = one(db, 'SELECT * FROM panels WHERE id = ?', [targetId]);
  await audit(req, 'Updated Panel Member', updated.name, `${updated.practice || ''} · ${(safeJson(updated.skills, [])).length} skills`);
  res.json(parsePanel(updated));
});

// DELETE /api/panels/:id — Admin deactivates a panel member
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const db = await getDb();
  const existing = one(db, 'SELECT * FROM panels WHERE id = ?', [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: 'Panel member not found.' });
  db.run("UPDATE panels SET active = 0, updated_at = datetime('now') WHERE id = ?", [existing.id]);
  if (existing.user_id) {
    db.run("UPDATE users SET active = 0, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?", [existing.user_id]);
  }
  saveDb();
  await audit(req, 'Deactivated Panel Member', existing.name);
  res.json({ message: 'Panel member deactivated.' });
});

export default router;
