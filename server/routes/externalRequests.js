import { Router } from 'express';
import { getDb, saveDb, all, one } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';
import {
  externalRequestCreateSchema, externalReviewSchema, externalCandidateSchema
} from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function parseRequest(r) {
  return {
    id: r.id,
    manager: r.manager,
    jobTitle: r.job_title,
    project: r.project,
    customer: r.customer,
    practice: r.practice,
    skills: safeJson(r.skills, []),
    experienceYears: r.experience_years,
    location: r.location,
    budgetRate: r.budget_rate,
    reason: r.reason,
    requestDate: r.request_date,
    status: r.status,
    rejectionReason: r.rejection_reason,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    candidateName: r.candidate_name,
    candidateEmail: r.candidate_email,
    candidateSkills: safeJson(r.candidate_skills, []),
    candidateStatus: r.candidate_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// GET /api/external-requests — managers see their own; TA/Admin/Operations see all
router.get('/', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager', 'TA'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  let query = 'SELECT * FROM external_requests';
  const params = [];
  if (role === 'Manager') {
    query += ' WHERE manager = ?';
    params.push(req.user.name);
  }
  query += ' ORDER BY id DESC';
  res.json(all(db, query, params).map(parseRequest));
});

// GET /api/external-requests/:id
router.get('/:id', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager', 'TA'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  const request = one(db, 'SELECT * FROM external_requests WHERE id = ?', [Number(req.params.id)]);
  if (!request) return res.status(404).json({ error: 'External hire request not found.' });
  if (role === 'Manager' && request.manager !== req.user.name) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json(parseRequest(request));
});

// POST /api/external-requests — managers raise an external hire request
router.post('/', authenticate, async (req, res) => {
  if (req.user.role !== 'Manager') {
    return res.status(403).json({ error: 'Only managers can raise external hire requests.' });
  }
  const parsed = externalRequestCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid external hire request.' });
  }
  const data = parsed.data;
  if (data.skills.length === 0) {
    return res.status(400).json({ error: 'At least one required skill is needed.' });
  }

  const db = await getDb();
  db.run(
    `INSERT INTO external_requests (manager, job_title, project, customer, practice, skills, experience_years, location, budget_rate, reason, request_date, status, candidate_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Sourcing', datetime('now'), datetime('now'))`,
    [
      req.user.name, data.jobTitle, data.project, data.customer, data.practice,
      JSON.stringify(data.skills), data.experienceYears || 0, data.location || '', data.budgetRate || 0,
      data.reason, new Date().toISOString().slice(0, 10)
    ]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM external_requests ORDER BY id DESC LIMIT 1');
  await audit(req, 'Raised External Hire Request', created.job_title, `For ${created.customer} · ${created.practice}`);
  res.status(201).json(parseRequest(created));
});

// PUT /api/external-requests/:id/review — Admin/Operations approve or reject
router.put('/:id/review', authenticate, async (req, res) => {
  const { role } = req.user;
  if (role !== 'Admin' && role !== 'Operations') {
    return res.status(403).json({ error: 'Only Admin/Operations can approve external hire requests.' });
  }
  const parsed = externalReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review decision.' });
  }

  const db = await getDb();
  const targetId = Number(req.params.id);
  const existing = one(db, 'SELECT * FROM external_requests WHERE id = ?', [targetId]);
  if (!existing) return res.status(404).json({ error: 'External hire request not found.' });
  if (existing.status !== 'Pending') {
    return res.status(409).json({ error: 'This request has already been reviewed.' });
  }

  db.run(
    `UPDATE external_requests SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    [parsed.data.status, parsed.data.status === 'Rejected' ? (parsed.data.rejectionReason || null) : null, `${req.user.name} (${req.user.role})`, targetId]
  );
  saveDb();
  const updated = one(db, 'SELECT * FROM external_requests WHERE id = ?', [targetId]);
  await audit(req, parsed.data.status === 'Approved' ? 'Approved External Hire Request' : `External Hire ${parsed.data.status}`, updated.job_title, parsed.data.rejectionReason || undefined, parseRequest(existing), parseRequest(updated));
  res.json({ message: 'Request updated.', request: parseRequest(updated) });
});

// PUT /api/external-requests/:id/candidate — update candidate details after approval
router.put('/:id/candidate', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'TA', 'Manager'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const parsed = externalCandidateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid candidate details.' });
  }

  const db = await getDb();
  const targetId = Number(req.params.id);
  const existing = one(db, 'SELECT * FROM external_requests WHERE id = ?', [targetId]);
  if (!existing) return res.status(404).json({ error: 'External hire request not found.' });
  if (role === 'Manager' && existing.manager !== req.user.name) {
    return res.status(403).json({ error: 'Managers can only update their own requests.' });
  }
  if (existing.status !== 'Approved') {
    return res.status(409).json({ error: 'Candidate details can only be updated after the request is approved.' });
  }

  const data = parsed.data;
  db.run(
    `UPDATE external_requests SET candidate_name = ?, candidate_email = ?, candidate_skills = ?, candidate_status = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      data.candidateName,
      data.candidateEmail ?? existing.candidate_email,
      data.candidateSkills !== undefined ? JSON.stringify(data.candidateSkills) : existing.candidate_skills,
      data.candidateStatus ?? existing.candidate_status,
      targetId
    ]
  );
  saveDb();
  const updated = one(db, 'SELECT * FROM external_requests WHERE id = ?', [targetId]);
  await audit(req, 'Updated External Candidate', updated.job_title, `${data.candidateName} · ${data.candidateStatus ?? ''}`, parseRequest(existing), parseRequest(updated));
  res.json(parseRequest(updated));
});

export default router;
