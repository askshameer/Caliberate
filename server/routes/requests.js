import { Router } from 'express';
import { getDb, saveDb, all, one, transaction } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';
import { requestCreateSchema, requestUpdateSchema } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

function parseRequest(r) {
  return {
    id: r.id,
    manager: r.manager,
    personId: r.person_id,
    personName: r.person_name,
    jobId: r.job_id,
    project: r.project,
    customer: r.customer,
    action: r.action,
    start: r.start_date,
    end: r.end_date,
    pct: r.pct,
    rate: r.rate,
    status: r.status,
    requestDate: r.request_date,
    reason: r.reason,
    rejectionReason: r.rejection_reason,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    updatedAt: r.updated_at
  };
}

// GET /api/requests
router.get('/', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  let query = 'SELECT * FROM staffing_requests';
  const params = [];
  if (role === 'Manager') {
    query += ' WHERE manager = ?';
    params.push(req.user.name);
  }
  query += ' ORDER BY id DESC';
  res.json(all(db, query, params).map(parseRequest));
});

// POST /api/requests — create staffing request (Manager/Operations/Admin)
router.post('/', authenticate, async (req, res) => {
  const { role } = req.user;
  if (!['Admin', 'Operations', 'Manager'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const parsed = requestCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid staffing request.' });
  }
  const r = parsed.data;

  const db = await getDb();
  const person = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [r.personId]);
  if (!person) return res.status(404).json({ error: 'Resource not found.' });
  if (role === 'Manager' && person.manager !== req.user.name) {
    return res.status(403).json({ error: 'Managers can only request changes for their direct reports.' });
  }
  if (r.action === 'Deploy') {
    if (!r.project || !r.customer) return res.status(400).json({ error: 'Project and customer are required for a deployment request.' });
    if (!r.start || !r.end) return res.status(400).json({ error: 'Start and end dates are required for a deployment request.' });
    if (r.end < r.start) return res.status(400).json({ error: 'End date must be on or after the start date.' });
  }

  const duplicate = one(
    db,
    "SELECT id FROM staffing_requests WHERE person_id = ? AND status = 'Pending Ops Review'",
    [r.personId]
  );
  if (duplicate) {
    return res.status(409).json({ error: 'A pending staffing request already exists for this resource.' });
  }

  const managerName = role === 'Manager' ? req.user.name : (r.manager || req.user.name);
  db.run(
    `INSERT INTO staffing_requests (manager, person_id, person_name, job_id, project, customer, action, start_date, end_date, pct, rate, status, request_date, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Ops Review', ?, ?, datetime('now'), datetime('now'))`,
    [
      managerName, r.personId, person.name, r.jobId || null, r.project || '', r.customer || '',
      r.action || 'Deploy', r.start || '', r.end || '', r.pct || 100, r.rate || 0,
      new Date().toISOString().slice(0, 10), r.reason
    ]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM staffing_requests ORDER BY id DESC LIMIT 1');
  await audit(req, 'Submitted Staffing Request', person.name, `${created.action} · ${created.project || 'Release to bench'}`);
  res.status(201).json(parseRequest(created));
});

// PUT /api/requests/:id — approve/reject (Admin/Operations). Approving applies the change to the employee.
router.put('/:id', authenticate, async (req, res) => {
  const { role } = req.user;
  if (role !== 'Admin' && role !== 'Operations') {
    return res.status(403).json({ error: 'Only Admin/Operations can approve or reject requests.' });
  }
  const parsed = requestUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request decision.' });
  }

  const db = await getDb();
  const reqId = Number(req.params.id);
  const existing = one(db, 'SELECT * FROM staffing_requests WHERE id = ?', [reqId]);
  if (!existing) return res.status(404).json({ error: 'Staffing request not found.' });
  if (!existing.status.includes('Pending')) {
    return res.status(409).json({ error: 'This request has already been reviewed.' });
  }

  const status = parsed.data.status;
  if (status === 'Approved') {
    const person = one(db, 'SELECT * FROM people WHERE id = ? AND active = 1', [existing.person_id]);
    if (!person) return res.status(404).json({ error: 'The requested resource no longer exists.' });
    if (existing.action === 'Deploy' && (!existing.project || !existing.customer || !existing.start_date || !existing.end_date)) {
      return res.status(400).json({ error: 'The deployment request is missing project, customer, or dates.' });
    }
  }

  transaction(db, () => {
    db.run(
      `UPDATE staffing_requests SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [status, status === 'Rejected' ? (parsed.data.rejectionReason || null) : null, `${req.user.name} (${req.user.role})`, reqId]
    );

    if (status === 'Approved') {
      const today = new Date().toISOString().slice(0, 10);
      if (existing.action === 'Release') {
        db.run(
          "UPDATE people SET status = 'Bench', bench_start = ?, days = 0, allocation_pct = 0, project = '', customer = '', start_date = '', end_date = '', updated_at = datetime('now') WHERE id = ?",
          [today, existing.person_id]
        );
      } else {
        const started = existing.start_date <= today;
        db.run(
          `UPDATE people SET status = ?, bench_start = NULL, days = 0, allocation_pct = ?, project = ?, customer = ?, start_date = ?, end_date = ?, rate = CASE WHEN ? > 0 THEN ? ELSE rate END, updated_at = datetime('now') WHERE id = ?`,
          [started ? 'Deployed' : 'Allocated', existing.pct || 100, existing.project || '', existing.customer || '', existing.start_date || '', existing.end_date || '', existing.rate || 0, existing.rate || 0, existing.person_id]
        );
      }
    }
  });
  saveDb();

  const updated = one(db, 'SELECT * FROM staffing_requests WHERE id = ?', [reqId]);
  await audit(req, status === 'Approved' ? 'Approved Staffing Request' : 'Rejected Staffing Request', existing.person_name, status, parseRequest(existing), parseRequest(updated));
  res.json({ message: 'Request updated.', request: parseRequest(updated) });
});

export default router;
