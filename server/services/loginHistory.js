import { getDb, saveDb } from '../db/init.js';

export async function recordLogin(req, user, email, outcome) {
  const db = await getDb();
  db.run(`INSERT INTO login_history (user_id, email, name, role, outcome, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [user?.id || null, email, user?.name || null,
    user?.role || null, outcome, req.ip || null, (req.get('user-agent') || '').slice(0, 1000)]);
  saveDb();
}
