import { Router } from 'express';
import { getDb, saveDb, all, one } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const RECIPIENT_ROLES = ['TA', 'Operations', 'Admin'];

function parseNotification(n) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type,
    read: Boolean(n.read),
    createdAt: n.created_at
  };
}

// GET /api/notifications — unread first (Admin/Operations/TA only)
router.get('/', authenticate, async (req, res) => {
  if (!RECIPIENT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  const rows = all(
    db,
    'SELECT * FROM notifications WHERE recipient_role = ? ORDER BY read ASC, id DESC LIMIT 100',
    [req.user.role]
  );
  res.json(rows.map(parseNotification));
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticate, async (req, res) => {
  if (!RECIPIENT_ROLES.includes(req.user.role)) return res.json({ count: 0 });
  const db = await getDb();
  const row = one(db, 'SELECT COUNT(*) AS count FROM notifications WHERE recipient_role = ? AND read = 0', [req.user.role]);
  res.json({ count: Number(row?.count || 0) });
});

// POST /api/notifications/:id/read — mark one notification as read
router.post('/:id/read', authenticate, async (req, res) => {
  if (!RECIPIENT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  db.run(
    "UPDATE notifications SET read = 1, updated_at = datetime('now') WHERE id = ? AND recipient_role = ?",
    [Number(req.params.id), req.user.role]
  );
  saveDb();
  res.json({ message: 'Notification marked as read.' });
});

// POST /api/notifications/read-all — mark all notifications as read
router.post('/read-all', authenticate, async (req, res) => {
  if (!RECIPIENT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const db = await getDb();
  db.run("UPDATE notifications SET read = 1, updated_at = datetime('now') WHERE recipient_role = ? AND read = 0", [req.user.role]);
  saveDb();
  res.json({ message: 'All notifications marked as read.' });
});

export default router;
