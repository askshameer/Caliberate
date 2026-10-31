import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import { getDb, saveDb, all, one, transaction } from '../db/init.js';
import { config } from '../config.js';
import { authenticate, requirePrivileged } from '../middleware/auth.js';
import { personCreateSchema, personUpdateSchema, importSchema } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

fs.mkdirSync(config.uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadDir),
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(extension)) {
      return cb(new Error('Only PDF, DOC, and DOCX files are accepted.'));
    }
    cb(null, true);
  }
});

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function utcDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function benchDaysFor(person) {
  if (person.status !== 'Bench') return 0;
  if (!person.bench_start) return Number(person.days || 0);
  const start = utcDate(person.bench_start);
  if (!start) return Number(person.days || 0);
  return Math.max(0, Math.round((todayUtc().getTime() - start.getTime()) / 86400000));
}

function isPrivileged(role) {
  return role === 'Admin' || role === 'Operations';
}

function parsePerson(person, role, viewer = {}) {
  const days = benchDaysFor(person);
  const isSelf = Number(person.id) === Number(viewer.personId);
  const isSales = role === 'Sales';
  const displayName = isSales ? `Available Resource #${String(person.id).padStart(3, '0')}` : person.name;
  const parsed = {
    id: person.id,
    code: isSales ? `ANON-${String(person.id).padStart(3, '0')}` : person.code,
    name: displayName,
    title: person.title,
    practice: person.practice,
    location: person.location,
    joinDate: isSales ? undefined : person.join_date,
    type: person.type,
    status: person.status,
    benchStart: person.bench_start,
    days,
    allocationPct: person.allocation_pct,
    project: isSales ? undefined : person.project,
    customer: isSales ? undefined : person.customer,
    start: person.start_date,
    end: person.end_date,
    extensionLikelihood: isSales ? undefined : person.extension_likelihood,
    skills: safeJson(person.skills, []),
    certs: isSales ? [] : safeJson(person.certs, []),
    experience: isSales ? undefined : person.experience,
    resumeUrl: isSales ? undefined : person.resume_url,
    preferences: isSales ? undefined : safeJson(person.preferences, {}),
    notes: (isSales || role === 'Resource') ? [] : safeJson(person.notes, []),
    active: Boolean(person.active),
    updatedAt: person.updated_at
  };

  if (!isSales) {
    parsed.manager = person.manager;
    parsed.email = (isPrivileged(role) || role === 'Manager' || isSelf) ? person.email : undefined;
  }

  // Financial data is limited to Admin/Operations.
  if (isPrivileged(role)) {
    parsed.dailyCost = person.daily_cost;
    parsed.rate = person.rate;
  }

  return parsed;
}

function canReadPerson(role, viewer, person, managerView) {
  if (role === 'Admin' || role === 'Operations') return true;
  if (role === 'Sales') return ['Bench', 'Allocated'].includes(person.status);
  if (role === 'Resource') return Number(person.id) === Number(viewer.personId);
  if (role === 'Manager') return managerView === 'org' || person.manager === viewer.name;
  return false;
}

function managerScope(req) {
  return req.user.role === 'Manager' ? req.user.name : null;
}

// GET /api/people — list people (scoped by role)
router.get('/', authenticate, async (req, res) => {
  const db = await getDb();
  const { role, personId } = req.user;
  const { managerView } = req.query;

  let query = 'SELECT * FROM people WHERE active = 1';
  const params = [];

  if (role === 'Resource') {
    query += ' AND id = ?';
    params.push(personId);
  } else if (role === 'Manager') {
    if (managerView !== 'org') {
      query += ' AND manager = ?';
      params.push(req.user.name);
    }
  } else if (role === 'Sales') {
    query += " AND status IN ('Bench','Allocated')";
  }

  query += ' ORDER BY id ASC';
  const rows = all(db, query, params);
  res.json(rows.map((person) => parsePerson(person, role, req.user)));
});

// GET /api/people/:id
router.get('/:id', authenticate, async (req, res) => {
  const db = await getDb();
  const person = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [Number(req.params.id)]);
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  if (!canReadPerson(req.user.role, req.user, person, req.query.managerView)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json(parsePerson(person, req.user.role, req.user));
});

// POST /api/people — add employee (Admin/Operations only)
router.post('/', authenticate, requirePrivileged, async (req, res) => {
  const parsed = personCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid employee payload.' });
  }
  const db = await getDb();
  const p = parsed.data;
  const code = p.code || `EMP-${Date.now().toString().slice(-6)}`;
  if (one(db, 'SELECT id FROM people WHERE code = ?', [code])) {
    return res.status(409).json({ error: 'An employee with that code already exists.' });
  }
  if (p.email && one(db, 'SELECT id FROM people WHERE lower(email) = ?', [p.email.toLowerCase()])) {
    return res.status(409).json({ error: 'An employee with that email already exists.' });
  }

  db.run(
    `INSERT INTO people (code, name, email, title, practice, manager, location, join_date, type, cost_center, daily_cost, rate, status, bench_start, days, allocation_pct, project, customer, start_date, end_date, extension_likelihood, skills, certs, experience, resume_url, preferences, notes, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [
      code, p.name, p.email || null, p.title, p.practice, p.manager, p.location, p.joinDate,
      p.type || 'FTE', p.costCenter || null, p.dailyCost || 0, p.rate || 0, p.status || 'Bench',
      p.benchStart || (p.status === 'Bench' || !p.status ? p.joinDate : null), p.days || 0,
      p.allocationPct || 0, p.project || '', p.customer || '', p.start || '', p.end || '',
      p.extensionLikelihood || 'Unknown', JSON.stringify(p.skills || []), JSON.stringify(p.certs || []),
      p.experience || '', p.resumeUrl || '', JSON.stringify(p.preferences || {}), JSON.stringify(p.notes || [])
    ]
  );
  saveDb();

  const created = one(db, 'SELECT * FROM people WHERE code = ?', [code]);
  await audit(req, 'Created Resource Record', created.name, `Added to ${created.practice}`, null, parsePerson(created, req.user.role, req.user));
  res.status(201).json(parsePerson(created, req.user.role, req.user));
});

// PUT /api/people/:id — update employee with role-scoped field allowlists
router.put('/:id', authenticate, async (req, res) => {
  const { role, personId } = req.user;
  const targetId = Number(req.params.id);
  if (role === 'Sales') return res.status(403).json({ error: 'Access denied.' });
  if (role === 'Resource' && targetId !== Number(personId)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const parsed = personUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid employee payload.' });
  }

  const db = await getDb();
  const existing = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [targetId]);
  if (!existing) return res.status(404).json({ error: 'Person not found.' });

  if (role === 'Manager' && existing.manager !== req.user.name) {
    return res.status(403).json({ error: 'Managers can only update their direct reports.' });
  }

  const p = parsed.data;
  const json = (value, current) => (value === undefined ? current : JSON.stringify(value));

  if (role === 'Resource') {
    db.run(
      'UPDATE people SET skills = ?, certs = ?, experience = ?, resume_url = ?, preferences = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [
        json(p.skills, existing.skills),
        json(p.certs, existing.certs),
        p.experience ?? existing.experience,
        p.resumeUrl ?? existing.resume_url,
        json(p.preferences, existing.preferences),
        targetId
      ]
    );
  } else {
    // Managers can maintain people data but cannot alter deployment status, financials,
    // or allocation terms. Those require an Operations-reviewed request.
    const managerAllowed = {
      name: p.name, email: p.email, title: p.title, practice: p.practice,
      location: p.location, type: p.type, skills: p.skills,
      certs: p.certs, experience: p.experience, preferences: p.preferences, notes: p.notes
    };
    const data = role === 'Manager' ? managerAllowed : p;

    const nextStatus = data.status ?? existing.status;
    const nextBenchStart = data.benchStart !== undefined ? data.benchStart : existing.bench_start;
    const nextAllocationPct = data.allocationPct ?? existing.allocation_pct;
    const nextProject = data.project ?? existing.project;
    const nextCustomer = data.customer ?? existing.customer;
    const nextStart = data.start !== undefined ? data.start : existing.start_date;
    const nextEnd = data.end !== undefined ? data.end : existing.end_date;
    const nextRate = data.rate !== undefined ? data.rate : existing.rate;
    const nextDailyCost = data.dailyCost !== undefined ? data.dailyCost : existing.daily_cost;

    db.run(
      `UPDATE people SET name = ?, email = ?, title = ?, practice = ?, manager = ?, location = ?, type = ?, cost_center = ?, daily_cost = ?, rate = ?, status = ?, bench_start = ?, days = ?, allocation_pct = ?, project = ?, customer = ?, start_date = ?, end_date = ?, extension_likelihood = ?, skills = ?, certs = ?, experience = ?, resume_url = ?, preferences = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.name ?? existing.name,
        data.email !== undefined ? data.email || null : existing.email,
        data.title ?? existing.title,
        data.practice ?? existing.practice,
        data.manager ?? existing.manager,
        data.location ?? existing.location,
        data.type ?? existing.type,
        data.costCenter ?? existing.cost_center,
        nextDailyCost,
        nextRate,
        nextStatus,
        nextBenchStart,
        data.days ?? existing.days,
        nextAllocationPct,
        nextProject,
        nextCustomer,
        nextStart,
        nextEnd,
        data.extensionLikelihood ?? existing.extension_likelihood,
        json(data.skills, existing.skills),
        json(data.certs, existing.certs),
        data.experience ?? existing.experience,
        data.resumeUrl ?? existing.resume_url,
        json(data.preferences, existing.preferences),
        json(data.notes, existing.notes),
        targetId
      ]
    );
  }
  saveDb();

  const updated = one(db, 'SELECT * FROM people WHERE id = ?', [targetId]);
  await audit(req, 'Updated Resource Record', updated.name, 'Employee record updated', parsePerson(existing, req.user.role, req.user), parsePerson(updated, req.user.role, req.user));
  res.json(parsePerson(updated, req.user.role, req.user));
});

// DELETE /api/people/:id — soft delete (Admin/Operations)
router.delete('/:id', authenticate, requirePrivileged, async (req, res) => {
  const db = await getDb();
  const existing = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: 'Person not found.' });
  db.run("UPDATE people SET active = 0, updated_at = datetime('now') WHERE id = ?", [existing.id]);
  saveDb();
  await audit(req, 'Deactivated Resource', existing.name, 'Soft-deleted employee record', parsePerson(existing, req.user.role, req.user), null);
  res.json({ message: 'Employee deactivated.' });
});

// POST /api/people/import — validated CSV bulk import (Admin/Operations)
router.post('/import', authenticate, requirePrivileged, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'CSV content is required.' });

  let records;
  try {
    records = parseCsv(parsed.data.csv, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true
    });
  } catch (error) {
    return res.status(400).json({ error: `Could not parse CSV: ${error.message}` });
  }

  if (records.length === 0) return res.status(400).json({ error: 'CSV contained no rows.' });
  const first = records[0].map((value) => String(value || '').toLowerCase());
  if (first.includes('name')) records = records.slice(1);

  const db = await getDb();
  const created = [];
  const errors = [];

  transaction(db, () => {
    records.forEach((row, index) => {
      const line = index + 2;
      const [name, title, practice, manager, location, skillsRaw, email, type, costCenter, dailyCost, rate] = row;
      const skills = String(skillsRaw || '')
        .split(/[;,|]/)
        .map((skill) => skill.trim())
        .filter(Boolean)
        .map((skill) => ({ name: skill, level: 'Intermediate', years: 3, lastUsed: new Date().toISOString().slice(0, 7) }));

      const candidate = {
        code: `EMP-${Date.now().toString().slice(-6)}${index}`,
        name, title: title || 'Engineer', practice: practice || 'Digital', manager: manager || 'Rachel Shah',
        location: location || 'Remote', joinDate: new Date().toISOString().slice(0, 10),
        type: ['FTE', 'Contractor'].includes(type) ? type : 'FTE', costCenter: costCenter || 'CC-DIG-01',
        dailyCost: Number(dailyCost) || 0, rate: Number(rate) || 0, status: 'Bench',
        benchStart: new Date().toISOString().slice(0, 10), days: 0, allocationPct: 0,
        extensionLikelihood: 'Unknown', skills, certs: [], experience: '', preferences: {}, notes: [],
        email: email || ''
      };

      const validated = personCreateSchema.safeParse(candidate);
      if (!validated.success) {
        errors.push({ line, name: name || '(blank)', error: validated.error.issues[0]?.message || 'Invalid row.' });
        return;
      }
      if (one(db, 'SELECT id FROM people WHERE code = ?', [candidate.code])) {
        errors.push({ line, name: name || '(blank)', error: 'Generated employee code collided.' });
        return;
      }
      const p = validated.data;
      db.run(
        `INSERT INTO people (code, name, email, title, practice, manager, location, join_date, type, cost_center, daily_cost, rate, status, bench_start, days, allocation_pct, project, customer, start_date, end_date, extension_likelihood, skills, certs, experience, resume_url, preferences, notes, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?, ?, '', '', ?, ?, 1, datetime('now'), datetime('now'))`,
        [
          p.code, p.name, p.email || null, p.title, p.practice, p.manager, p.location, p.joinDate,
          p.type || 'FTE', p.costCenter, p.dailyCost || 0, p.rate || 0, p.status, p.benchStart,
          p.days || 0, p.allocationPct || 0, p.extensionLikelihood || 'Unknown',
          JSON.stringify(p.skills || []), JSON.stringify(p.certs || []),
          JSON.stringify(p.preferences || {}), JSON.stringify(p.notes || [])
        ]
      );
      created.push(candidate.name);
    });
  });

  saveDb();
  await audit(req, 'Bulk CSV Import', 'Directory', `Imported ${created.length} records with ${errors.length} validation errors`);
  res.status(created.length > 0 ? 201 : 400).json({ imported: created.length, created, errors });
});

// POST /api/people/:id/resume — upload a resume file
router.post('/:id/resume', authenticate, upload.single('resume'), async (req, res) => {
  const targetId = Number(req.params.id);
  const { role, personId } = req.user;
  if (role === 'Sales' || (role === 'Resource' && targetId !== Number(personId))) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Access denied.' });
  }
  if (!req.file) return res.status(400).json({ error: 'A resume file is required.' });

  const db = await getDb();
  const existing = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [targetId]);
  if (!existing) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Person not found.' });
  }
  if (role === 'Manager' && existing.manager !== req.user.name) {
    fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Managers can only update their direct reports.' });
  }

  const oldResumeFile = existing.resume_file;
  try {
    db.run("UPDATE people SET resume_url = ?, resume_file = ?, updated_at = datetime('now') WHERE id = ?", [req.file.originalname, req.file.filename, targetId]);
    saveDb();
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    throw error;
  }
  if (oldResumeFile && oldResumeFile !== req.file.filename) {
    fs.unlink(path.join(config.uploadDir, oldResumeFile), () => {});
  }
  const updated = one(db, 'SELECT * FROM people WHERE id = ?', [targetId]);
  await audit(req, 'Uploaded Resume', updated.name, req.file.originalname);
  res.json(parsePerson(updated, role, req.user));
});

// GET /api/people/:id/resume — download the stored resume
router.get('/:id/resume', authenticate, async (req, res) => {
  const db = await getDb();
  const person = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [Number(req.params.id)]);
  if (!person || !person.resume_file) return res.status(404).json({ error: 'Resume not found.' });
  const { role, personId, name } = req.user;
  const allowed = role === 'Admin' || role === 'Operations'
    || (role === 'Resource' && Number(person.id) === Number(personId))
    || (role === 'Manager' && (req.query.managerView === 'org' || person.manager === name));
  if (!allowed) return res.status(403).json({ error: 'Access denied.' });
  const filePath = path.join(config.uploadDir, person.resume_file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Resume file is missing.' });
  res.download(filePath, person.resume_url || 'resume.pdf');
});

export default router;
