import { getDb, saveDb } from '../db/init.js';

export async function notifyRoles(roles, title, body) {
  try {
    const db = await getDb();
    for (const role of roles) {
      db.run(
        `INSERT INTO notifications (recipient_role, title, body, type, read, created_at, updated_at)
         VALUES (?, ?, ?, 'info', 0, datetime('now'), datetime('now'))`,
        [role, title, body]
      );
    }
    saveDb();
  } catch (error) {
    console.error('Notification dispatch failed:', error.message);
  }
}
