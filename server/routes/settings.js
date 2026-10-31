import { Router } from 'express';
import { getDb, saveDb, reseedDatabase, all, one } from '../db/init.js';
import { config } from '../config.js';
import { authenticate, requirePrivileged, requireAdmin } from '../middleware/auth.js';
import { settingsUpdateSchema, auditCreateSchema, exportAuditSchema } from '../validation/schemas.js';
import { audit } from '../services/audit.js';

const router = Router();

const DEFAULT_SETTINGS = {
  global: { amber: 10, red: 15, critical: 30 },
  overrides: [],
  notifications: { emailManager: true, emailOps: true, slackStaffing: false, teamsStaffing: false }
};

// GET /api/settings — return threshold policy
router.get('/', authenticate, async (req, res) => {
  const db = await getDb();
  const row = one(db, "SELECT value FROM settings WHERE key = 'thresholds'");
  if (!row) return res.json(DEFAULT_SETTINGS);
  try {
    return res.json({ ...DEFAULT_SETTINGS, ...JSON.parse(row.value) });
  } catch {
    return res.json(DEFAULT_SETTINGS);
  }
});

// PUT /api/settings — update threshold policy (Admin/Operations)
router.put('/', authenticate, requirePrivileged, async (req, res) => {
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings payload.' });
  }
  const next = parsed.data;
  const db = await getDb();
  const existingRow = one(db, "SELECT value FROM settings WHERE key = 'thresholds'");
  let existing = DEFAULT_SETTINGS;
  try { existing = { ...DEFAULT_SETTINGS, ...JSON.parse(existingRow?.value || '{}') }; } catch { /* use defaults */ }

  const overrides = next.overrides ?? existing.overrides ?? [];
  const seen = new Set();
  for (const override of overrides) {
    const key = `${override.scope}:${override.scopeName.toLowerCase()}`;
    if (seen.has(key)) {
      return res.status(400).json({ error: `Duplicate ${override.scope.toLowerCase()} override for ${override.scopeName}.` });
    }
    seen.add(key);
  }

  const value = {
    global: next.global,
    overrides,
    notifications: next.notifications ?? existing.notifications
  };
  db.run(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('thresholds', ?, datetime('now'))",
    [JSON.stringify(value)]
  );
  saveDb();
  await audit(req, 'Threshold Policy Updated', 'Global Policy', `Amber ${value.global.amber}d, Red ${value.global.red}d, Critical ${value.global.critical}d`, existing, value);
  res.json({ message: 'Settings updated.', settings: value });
});

// GET /api/settings/audit-log
router.get('/audit-log', authenticate, requirePrivileged, async (req, res) => {
  const db = await getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const logs = all(db, 'SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
  res.json(logs.map((log) => ({
    id: log.id,
    actor: log.actor,
    action: log.action,
    entity: log.entity,
    detail: log.detail,
    before: log.before,
    after: log.after,
    ip: log.ip,
    userAgent: log.user_agent,
    time: log.time
  })));
});

// POST /api/settings/audit-log — add audit entry (Admin/Operations only)
router.post('/audit-log', authenticate, requirePrivileged, async (req, res) => {
  const parsed = auditCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid audit payload.' });
  }
  await audit(req, parsed.data.action, parsed.data.entity, parsed.data.detail);
  res.status(201).json({ message: 'Audit entry logged.' });
});

// POST /api/settings/export-audit — record a data export by any authenticated user
router.post('/export-audit', authenticate, async (req, res) => {
  const parsed = exportAuditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid export audit payload.' });
  }
  await audit(req, 'Exported CSV', parsed.data.filename, `Exported ${parsed.data.count} records`);
  res.status(201).json({ message: 'Export logged.' });
});

// POST /api/settings/reset — reset demo data. Disabled outside demo mode.
router.post('/reset', authenticate, requireAdmin, async (req, res) => {
  if (!config.demoMode) {
    return res.status(403).json({ error: 'Demo data reset is disabled in this environment.' });
  }
  if (req.body?.confirm !== 'RESET') {
    return res.status(400).json({ error: 'Send { "confirm": "RESET" } to confirm the destructive demo reset.' });
  }
  await reseedDatabase();
  res.json({ message: 'Demo data reset and re-seeded.' });
});

export default router;
