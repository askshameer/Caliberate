import { getDb, saveDb } from '../db/init.js';

function stringify(value) {
  if (value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 8000 ? `${serialized.slice(0, 8000)}…` : serialized;
  } catch {
    return null;
  }
}

export async function audit(req, action, entity, detail = '', before = undefined, after = undefined) {
  try {
    const db = await getDb();
    const actor = req.user ? `${req.user.name} (${req.user.role})` : 'System';
    db.run(
      `INSERT INTO audit_log (actor, action, entity, detail, before, after, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor,
        action,
        entity,
        typeof detail === 'string' ? detail : stringify(detail),
        stringify(before),
        stringify(after),
        req.ip || null,
        req.get('user-agent') || null
      ]
    );
    saveDb();
  } catch (error) {
    console.error('Audit logging failed:', error.message);
  }
}

export function actorLabel(user) {
  return user ? `${user.name} (${user.role})` : 'System';
}
