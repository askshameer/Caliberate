import { Router } from 'express';
import { getDb, saveDb, all, one } from '../db/init.js';
import { authenticate, requirePrivileged } from '../middleware/auth.js';
import { jobCreateSchema, jobUpdateSchema } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function parseJob(job) {
  return {
    id: job.id,
    title: job.title,
    project: job.project,
    customer: job.customer,
    practice: job.practice,
    mustHave: safeJson(job.must_have, []),
    niceToHave: safeJson(job.nice_to_have, []),
    minExp: job.min_exp,
    location: job.location,
    start: job.start_date,
    end: job.end_date,
    durationMonths: job.duration_months,
    positions: job.positions,
    status: job.status,
    postedBy: job.posted_by,
    description: job.description,
    applicantCount: Number(job.applicant_count || 0),
    createdAt: job.created_at,
    updatedAt: job.updated_at
  };
}

// GET /api/jobs
router.get('/', authenticate, async (req, res) => {
  const db = await getDb();
  const jobs = all(
    db,
    `SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'Withdrawn') AS applicant_count
     FROM jobs j ORDER BY j.id ASC`
  );
  res.json(jobs.map(parseJob));
});

// GET /api/jobs/:id
router.get('/:id', authenticate, async (req, res) => {
  const db = await getDb();
  const job = one(
    db,
    `SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'Withdrawn') AS applicant_count
     FROM jobs j WHERE j.id = ?`,
    [Number(req.params.id)]
  );
  if (!job) return res.status(404).json({ error: 'Job opening not found.' });
  res.json(parseJob(job));
});

// POST /api/jobs — create job (Admin/Operations/Manager)
router.post('/', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const parsed = jobCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid job payload.' });
  }
  const j = parsed.data;
  if (j.start && j.end && j.end < j.start) {
    return res.status(400).json({ error: 'End date must be on or after the start date.' });
  }

  const db = await getDb();
  db.run(
    `INSERT INTO jobs (title, project, customer, practice, must_have, nice_to_have, min_exp, location, start_date, end_date, duration_months, positions, status, posted_by, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      j.title, j.project, j.customer, j.practice, JSON.stringify(j.mustHave || []),
      JSON.stringify(j.niceToHave || []), j.minExp || 0, j.location || '', j.start || '',
      j.end || '', j.durationMonths || 0, j.positions || 1, j.status || 'Open',
      req.user.name, j.description || ''
    ]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM jobs ORDER BY id DESC LIMIT 1');
  await audit(req, 'Posted Opening', created.title, `Project ${created.project} · ${created.customer}`, null, parseJob(created));
  res.status(201).json(parseJob(created));
});

// PUT /api/jobs/:id
router.put('/:id', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const parsed = jobUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid job payload.' });
  }
  const db = await getDb();
  const existing = one(db, 'SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: 'Job opening not found.' });
  if (role === 'Manager' && existing.posted_by !== req.user.name) {
    return res.status(403).json({ error: 'Managers can only edit openings they posted.' });
  }
  const j = parsed.data;
  const nextStart = j.start !== undefined ? j.start : existing.start_date;
  const nextEnd = j.end !== undefined ? j.end : existing.end_date;
  if (nextStart && nextEnd && nextEnd < nextStart) {
    return res.status(400).json({ error: 'End date must be on or after the start date.' });
  }

  db.run(
    `UPDATE jobs SET title = ?, project = ?, customer = ?, practice = ?, must_have = ?, nice_to_have = ?, min_exp = ?, location = ?, start_date = ?, end_date = ?, duration_months = ?, positions = ?, status = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      j.title ?? existing.title,
      j.project ?? existing.project,
      j.customer ?? existing.customer,
      j.practice ?? existing.practice,
      j.mustHave !== undefined ? JSON.stringify(j.mustHave) : existing.must_have,
      j.niceToHave !== undefined ? JSON.stringify(j.niceToHave) : existing.nice_to_have,
      j.minExp ?? existing.min_exp,
      j.location ?? existing.location,
      nextStart,
      nextEnd,
      j.durationMonths ?? existing.duration_months,
      j.positions ?? existing.positions,
      j.status ?? existing.status,
      j.description ?? existing.description,
      existing.id
    ]
  );
  saveDb();
  const updated = one(db, 'SELECT * FROM jobs WHERE id = ?', [existing.id]);
  await audit(req, 'Updated Opening', updated.title, `Status: ${updated.status}`, parseJob(existing), parseJob(updated));
  res.json(parseJob(updated));
});

// DELETE /api/jobs/:id — close an opening (Admin/Operations, or its Manager owner)
router.delete('/:id', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  const existing = one(db, 'SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: 'Job opening not found.' });
  if (role === 'Manager' && existing.posted_by !== req.user.name) {
    return res.status(403).json({ error: 'Managers can only close openings they posted.' });
  }
  db.run("UPDATE jobs SET status = 'Closed', updated_at = datetime('now') WHERE id = ?", [existing.id]);
  saveDb();
  const updated = one(db, 'SELECT * FROM jobs WHERE id = ?', [existing.id]);
  await audit(req, 'Closed Opening', updated.title, 'Opening closed to new applications');
  res.json(parseJob(updated));
});

export default router;
