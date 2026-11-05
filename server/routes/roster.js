import { Router } from 'express';
import { getDb, saveDb, all, one } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';
import { rosterCreateSchema, rosterUpdateSchema } from '../validation/schemas.js';
import { audit } from '../services/audit.js';
import { notifyRoles } from '../services/notify.js';
import { effectiveSlots } from '../services/availability.js';

const router = Router();

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function parseRoster(r) {
  return {
    id: r.id,
    requestId: r.request_id,
    jobTitle: r.job_title,
    candidateName: r.candidate_name,
    panelId: r.panel_id,
    panelName: r.panel_name,
    roundNumber: r.round_number,
    level: r.level,
    interviewType: r.interview_type,
    scheduledAt: r.scheduled_at,
    durationMinutes: r.duration_minutes,
    status: r.status,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function parseDateTime(value) {
  return new Date(String(value).replace(' ', 'T'));
}

function overlaps(aStart, aMinutes, bStart, bMinutes) {
  const aEnd = aStart.getTime() + aMinutes * 60000;
  const bEnd = bStart.getTime() + bMinutes * 60000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

function skillIntersection(required, panelSkills) {
  const set = new Set((panelSkills || []).map((s) => String(s).toLowerCase()));
  return (required || []).filter((s) => set.has(String(s).toLowerCase()));
}

function toMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

// Fairness cap: one panel member can take at most this many interviews per
// calendar week (Mon-Sun), counting everything not cancelled.
const MAX_INTERVIEWS_PER_WEEK = 4;

function weekBounds(value) {
  const d = parseDateTime(value);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  return [monday, next];
}

function weeklyLoad(db, panelId, scheduledAt, excludeId = null) {
  const [from, to] = weekBounds(scheduledAt);
  return all(db, "SELECT id, scheduled_at FROM interview_roster WHERE panel_id = ? AND status != 'Cancelled'", [panelId])
    .filter((r) => r.id !== excludeId)
    .filter((r) => {
      const t = parseDateTime(r.scheduled_at);
      return t >= from && t < to;
    }).length;
}

// Each availability slot is a one-hour block defined by its start time.
function isWithinPanelSlot(scheduledAt, slots) {
  const date = String(scheduledAt).slice(0, 10);
  const startMinute = toMinutes(String(scheduledAt).slice(11, 16));
  return (slots || []).some((slot) => slot.date === date && startMinute >= toMinutes(slot.time) && startMinute < toMinutes(slot.time) + 60);
}

// GET /api/interview-roster — TA/Admin/Operations/Manager see all; Panel members see only their own
router.get('/', authenticate, async (req, res) => {
  const { role, id } = req.user;
  if (!['Admin', 'Operations', 'Manager', 'TA', 'Panel'].includes(role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  let query = 'SELECT * FROM interview_roster';
  const params = [];
  if (role === 'Panel') {
    const panel = one(db, 'SELECT id FROM panels WHERE user_id = ?', [id]);
    if (!panel) return res.json([]);
    query += ' WHERE panel_id = ?';
    params.push(panel.id);
  }
  query += ' ORDER BY scheduled_at DESC';
  res.json(all(db, query, params).map(parseRoster));
});

// POST /api/interview-roster — TA schedules an interview with a matching panel
router.post('/', authenticate, async (req, res) => {
  if (req.user.role !== 'TA') {
    return res.status(403).json({ error: 'Only the Talent Acquisition team can schedule interviews.' });
  }
  const parsed = rosterCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid interview schedule.' });
  }
  const data = parsed.data;

  const db = await getDb();
  const external = one(db, 'SELECT * FROM external_requests WHERE id = ?', [data.requestId]);
  if (!external) return res.status(404).json({ error: 'External hire request not found.' });
  if (external.status !== 'Approved') {
    return res.status(400).json({ error: 'Interviews can only be scheduled for approved external hire requests.' });
  }
  if (!external.candidate_name) {
    return res.status(400).json({ error: 'Add candidate details before scheduling interviews.' });
  }

  const panel = one(db, 'SELECT * FROM panels WHERE id = ? AND active = 1', [data.panelId]);
  if (!panel) return res.status(404).json({ error: 'Panel member not found or inactive.' });

  const requiredSkills = safeJson(external.skills, []);
  const panelSkills = safeJson(panel.skills, []);
  const matched = skillIntersection(requiredSkills, panelSkills);
  if (matched.length === 0) {
    return res.status(400).json({
      error: 'This panel member does not have any skills that match the job requirements.',
      requiredSkills,
      panelSkills
    });
  }

  const start = parseDateTime(data.scheduledAt);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid scheduled time.' });
  const duration = data.durationMinutes || 60;

  const panelSlots = effectiveSlots(safeJson(panel.time_slots, []), safeJson(panel.recurring_slots, []));
  if (!isWithinPanelSlot(data.scheduledAt, panelSlots)) {
    return res.status(400).json({ error: 'The interview time must fall within one of the panel member\'s one-hour availability slots.' });
  }

  const conflicts = all(
    db,
    "SELECT * FROM interview_roster WHERE panel_id = ? AND status != 'Cancelled'",
    [data.panelId]
  ).filter((row) => {
    const rowStart = parseDateTime(row.scheduled_at);
    return !Number.isNaN(rowStart.getTime()) && row.scheduled_at.slice(0, 10) === String(data.scheduledAt).slice(0, 10)
      && overlaps(start, duration, rowStart, row.duration_minutes || 60);
  });
  if (conflicts.length > 0) {
    return res.status(409).json({ error: 'This panel member is already scheduled during that time.' });
  }

  if (weeklyLoad(db, data.panelId, data.scheduledAt) >= MAX_INTERVIEWS_PER_WEEK) {
    return res.status(409).json({ error: `${panel.name} already has ${MAX_INTERVIEWS_PER_WEEK} interviews that week. Choose another panel member or week.` });
  }

  db.run(
    `INSERT INTO interview_roster (request_id, job_title, candidate_name, panel_id, panel_name, round_number, level, interview_type, scheduled_at, duration_minutes, status, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?, datetime('now'), datetime('now'))`,
    [
      data.requestId, external.job_title, external.candidate_name, panel.id, panel.name,
      data.roundNumber || 1, data.level || '', data.interviewType || 'Technical',
      data.scheduledAt, duration, data.notes || '', req.user.name
    ]
  );
  saveDb();
  const created = one(db, 'SELECT * FROM interview_roster ORDER BY id DESC LIMIT 1');
  await audit(req, 'Scheduled Interview', created.candidate_name, `Round ${created.round_number} with ${created.panel_name} · ${created.scheduled_at}`);
  res.status(201).json({ ...parseRoster(created), matchedSkills: matched });
});

// PUT /api/interview-roster/:id — TA updates interviews; a Panel member can cancel their own
router.put('/:id', authenticate, async (req, res) => {
  const parsed = rosterUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid interview update.' });
  }
  const data = parsed.data;

  const db = await getDb();
  const targetId = Number(req.params.id);
  const existing = one(db, 'SELECT * FROM interview_roster WHERE id = ?', [targetId]);
  if (!existing) return res.status(404).json({ error: 'Interview not found.' });

  // A panel member may only cancel their own interview (no other changes).
  const isPanelCancel = req.user.role === 'Panel'
    && data.status === 'Cancelled'
    && data.panelId === undefined
    && data.scheduledAt === undefined
    && data.durationMinutes === undefined
    && data.roundNumber === undefined;
  if (req.user.role !== 'TA' && !isPanelCancel) {
    return res.status(403).json({ error: 'Only the Talent Acquisition team can update interviews.' });
  }
  if (isPanelCancel) {
    const ownPanel = one(db, 'SELECT id FROM panels WHERE user_id = ?', [req.user.id]);
    if (!ownPanel || Number(ownPanel.id) !== Number(existing.panel_id)) {
      return res.status(403).json({ error: 'You can only cancel your own interviews.' });
    }
  }

  const nextPanelId = data.panelId ?? existing.panel_id;
  const nextScheduledAt = data.scheduledAt ?? existing.scheduled_at;
  const nextDuration = data.durationMinutes ?? existing.duration_minutes;
  const nextStatus = data.status ?? existing.status;

  if (nextStatus === 'Scheduled' || nextStatus === 'Rescheduled') {
    const panel = one(db, 'SELECT * FROM panels WHERE id = ? AND active = 1', [nextPanelId]);
    if (!panel) return res.status(404).json({ error: 'Panel member not found or inactive.' });

    const external = one(db, 'SELECT * FROM external_requests WHERE id = ?', [existing.request_id]);
    if (external) {
      const requiredSkills = safeJson(external.skills, []);
      const panelSkills = safeJson(panel.skills, []);
      if (skillIntersection(requiredSkills, panelSkills).length === 0) {
        return res.status(400).json({ error: 'The selected panel member does not match the job requirements.' });
      }
    }

    const start = parseDateTime(nextScheduledAt);
    if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid scheduled time.' });
    const panelSlots = effectiveSlots(safeJson(panel.time_slots, []), safeJson(panel.recurring_slots, []));
    if (!isWithinPanelSlot(nextScheduledAt, panelSlots)) {
      return res.status(400).json({ error: 'The interview time must fall within one of the panel member\'s one-hour availability slots.' });
    }
    const conflicts = all(
      db,
      "SELECT * FROM interview_roster WHERE panel_id = ? AND status != 'Cancelled' AND id != ?",
      [nextPanelId, targetId]
    ).filter((row) => {
      const rowStart = parseDateTime(row.scheduled_at);
      return !Number.isNaN(rowStart.getTime()) && row.scheduled_at.slice(0, 10) === String(nextScheduledAt).slice(0, 10)
        && overlaps(start, nextDuration, rowStart, row.duration_minutes || 60);
    });
    if (conflicts.length > 0) {
      return res.status(409).json({ error: 'The selected panel member is already scheduled during that time.' });
    }
    if (weeklyLoad(db, nextPanelId, nextScheduledAt, targetId) >= MAX_INTERVIEWS_PER_WEEK) {
      return res.status(409).json({ error: `${panel.name} already has ${MAX_INTERVIEWS_PER_WEEK} interviews that week. Choose another panel member or week.` });
    }
  }

  db.run(
    `UPDATE interview_roster SET panel_id = ?, panel_name = ?, round_number = ?, level = ?, interview_type = ?, scheduled_at = ?, duration_minutes = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      nextPanelId,
      nextPanelId === existing.panel_id ? existing.panel_name : (one(db, 'SELECT name FROM panels WHERE id = ?', [nextPanelId])?.name || existing.panel_name),
      data.roundNumber ?? existing.round_number,
      data.level ?? existing.level,
      data.interviewType ?? existing.interview_type,
      nextScheduledAt,
      nextDuration,
      nextStatus,
      data.notes ?? existing.notes,
      targetId
    ]
  );
  saveDb();
  const updated = one(db, 'SELECT * FROM interview_roster WHERE id = ?', [targetId]);
  await audit(req, 'Updated Interview', updated.candidate_name, `Status: ${updated.status}`);

  if (isPanelCancel) {
    await notifyRoles(
      ['TA', 'Operations', 'Admin'],
      'Interview Cancelled by Panel',
      `${updated.candidate_name} · ${updated.job_title} · ${updated.scheduled_at} was cancelled by ${updated.panel_name}.`
    );
  }

  res.json(parseRoster(updated));
});

export default router;
