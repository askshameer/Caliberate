import { Router } from 'express';
import { z } from 'zod';
import { isSetupRequired, setupApplication } from '../db/init.js';
import { config } from '../config.js';
import { passwordPolicy } from '../validation/schemas.js';

const router = Router();

const setupSchema = z.object({
  mode: z.enum(['demo', 'clean']),
  adminName: z.string().trim().max(120).optional(),
  adminEmail: z.string().trim().toLowerCase().email('A valid administrator email is required.').max(254).optional(),
  adminPassword: z.string().max(128).optional()
});

// GET /api/setup/status — public: does the app still need its first-run setup?
router.get('/status', async (req, res) => {
  res.json({ setupRequired: await isSetupRequired(), version: config.appVersion });
});

// POST /api/setup — public, but only works while the database has no users.
router.post('/', async (req, res) => {
  if (!(await isSetupRequired())) {
    return res.status(409).json({ error: 'The application has already been configured.' });
  }
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid setup request.' });
  }
  const { mode, adminName, adminEmail, adminPassword } = parsed.data;

  if (mode === 'clean') {
    if (!adminEmail) return res.status(400).json({ error: 'Administrator email is required.' });
    if (!adminPassword || !passwordPolicy(adminPassword)) {
      return res.status(400).json({ error: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.' });
    }
  }

  try {
    await setupApplication({
      mode,
      admin: mode === 'clean'
        ? { email: adminEmail, password: adminPassword, name: adminName || 'Platform Administrator' }
        : null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Setup failed.' });
  }
  res.status(201).json({
    message: mode === 'demo' ? 'Demo environment is ready.' : 'Administrator account created.',
    mode,
    ...(mode === 'demo' ? { demoAdminEmail: 'admin@caliberate.io' } : {})
  });
});

export default router;
