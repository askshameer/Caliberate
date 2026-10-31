import { Router } from 'express';
import { getDb, saveDb, all, one } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';
import { applicationCreateSchema, applicationUpdateSchema } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

function parseApp(app) {
  return {
    id: app.id,
    jobId: app.job_id,
    personId: app.person_id,
    status: app.status,
    date: app.date,
    notes: app.notes,
    updatedAt: app.updated_at
  };
}

// GET /api/applications
router.get('/', authenticate, async (req, res) => {
  const db = await getDb();
  const { role, personId, name } = req.user;

  if (role === 'Sales') return res.status(403).json({ error: 'Access denied.' });

  let query = 'SELECT * FROM applications';
  const params = [];
  if (role === 'Resource') {
    query += ' WHERE person_id = ?';
    params.push(personId);
  } else if (role === 'Manager') {
    query += ' WHERE person_id IN (SELECT id FROM people WHERE manager = ?)';
    params.push(name);
  }
  query += ' ORDER BY id ASC';
  res.json(all(db, query, params).map(parseApp));
});

// POST /api/applications - apply to a job (or propose a candidate)
router.post('/', authenticate, async (req, res) => {
  const { role, personId, name } = req.user;
  if (role === 'Sales') return res.status(403).json({ error: 'Access denied.' });

  const parsed = applicationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid application payload.' });
  }
  const a = { ...parsed.data };

  if (role === 'Resource') {
    a.personId = personId;
    a.status = 'Applied';
  }
  if (!a.personId) return res.status(400).json({ error: 'A candidate is required.' });

  const db = await getDb();
  const job = one(db, 'SELECT * FROM jobs WHERE id = ?', [a.jobId]);
  if (!job) return res.status(404).json({ error: 'Job opening not found.' });
  if (job.status !== 'Open') return res.status(400).json({ error: 'This opening is no longer accepting applications.' });

  const person = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [a.personId]);
  if (!person) return res.status(404).json({ error: 'Candidate not found.' });
  if (role === 'Manager' && person.manager !== name) {
    return res.status(403).json({ error: 'Managers can only propose their direct reports.' });
  }

  const duplicate = one(
    db,
    "SELECT id FROM applications WHERE job_id = ? AND person_id = ? AND status != 'Withdrawn'",
    [a.jobId, a.personId]
  );
  if (duplicate) {
    return res.status(409).json({ error: 'An active application already exists for this opening.' });
  }

  const status = role === 'Resource'
    ? 'Applied'
    : (role === 'Manager' ? (a.status === 'Shortlisted' ? 'Shortlisted' : 'Applied') : (a.status || 'Applied'));
  db.run(
    `INSERT INTO applications (job_id, person_id, status, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [a.jobId, a.personId, status, a.date || new Date().toISOString().slice(0, 10), a.notes || '']
  );
  saveDb();
  const created = one(db, 'SELECT * FROM applications ORDER BY id DESC LIMIT 1');
  await audit(req, status === 'Applied' ? 'Applied to Opening' : 'Proposed Candidate', person.name, job.title);
  res.status(201).json(parseApp(created));
});

// PUT /api/applications/:id - update status (Admin/Operations, or a Resource withdrawing their own)
router.put('/:id', authenticate, async (req, res) => {
  const { role, personId } = req.user;
  const parsed = applicationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid application update.' });
  }
  const db = await getDb();
  const targetId = Number(req.params.id);
  const existing = one(db, 'SELECT * FROM applications WHERE id = ?', [targetId]);
  if (!existing) return res.status(404).json({ error: 'Application not found.' });

  const isOps = role === 'Admin' || role === 'Operations';
  const isOwnWithdraw = role === 'Resource' && parsed.data.status === 'Withdrawn' && Number(existing.person_id) === Number(personId);
  if (!isOps && !isOwnWithdraw) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  db.run(
    "UPDATE applications SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
    [parsed.data.status, parsed.data.notes !== undefined ? parsed.data.notes : existing.notes, targetId]
  );
  saveDb();
  const updated = one(db, 'SELECT * FROM applications WHERE id = ?', [targetId]);
  await audit(req, 'Updated Application', String(targetId), `Status: ${updated.status}`, parseApp(existing), parseApp(updated));
  res.json(parseApp(updated));
});

export default router;
