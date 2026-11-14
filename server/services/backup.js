import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import initSqlJs from 'sql.js';
import { getDb, all, one, transaction, saveDb, setMeta } from '../db/init.js';
import { config } from '../config.js';

const TABLES = ['users', 'people', 'jobs', 'applications', 'staffing_requests', 'settings',
  'audit_log', 'external_requests', 'panels', 'interview_roster', 'notifications', 'login_history', 'app_meta'];
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

export async function createBackup() {
  const db = await getDb();
  const files = fs.existsSync(config.uploadDir) ? fs.readdirSync(config.uploadDir, { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => ({ name: entry.name, data: fs.readFileSync(path.join(config.uploadDir, entry.name)).toString('base64') })) : [];
  const result = { format: 'caliberate-backup', version: 1, createdAt: new Date().toISOString(),
    tables: Object.fromEntries(TABLES.map(table => [table, all(db, `SELECT * FROM ${table}`)])), files };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 100 MB limit.');
  return result;
}

function replaceRows(db, tables) {
  db.run('PRAGMA defer_foreign_keys = ON');
  for (const table of [...TABLES].reverse()) db.run(`DELETE FROM ${table}`);
  for (const table of TABLES) {
    const columns = all(db, `PRAGMA table_info(${table})`).map(column => column.name);
    const rows = tables[table];
    if (!Array.isArray(rows)) throw new Error(`Missing backup table: ${table}`);
    const statement = db.prepare(`INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    try {
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Object.keys(row).length !== columns.length ||
          !columns.every(column => Object.hasOwn(row, column) && (row[column] === null || ['string', 'number'].includes(typeof row[column])))) {
          throw new Error(`Invalid backup row in ${table}`);
        }
        statement.run(columns.map(column => row[column]));
      }
    } finally { statement.free(); }
  }
  if (all(db, 'PRAGMA foreign_key_check').length) throw new Error('Backup contains broken record references.');
}

export async function restoreBackup(backup) {
  if (backup?.format !== 'caliberate-backup' || backup.version !== 1 || !backup.tables || !Array.isArray(backup.files)) {
    throw new Error('Choose a supported Caliberate backup (version 1).');
  }
  const names = new Set();
  const files = backup.files.map(file => {
    if (!file || typeof file.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(pdf|doc|docx)$/i.test(file.name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(file.name) || names.has(file.name.toLowerCase()) ||
      typeof file.data !== 'string') {
      throw new Error('Backup contains an invalid uploaded file.');
    }
    const data = Buffer.from(file.data, 'base64');
    if (data.toString('base64') !== file.data) throw new Error('Backup contains invalid file contents.');
    names.add(file.name.toLowerCase());
    return { name: file.name, data };
  });
  const db = await getDb();
  const SQL = await initSqlJs();
  const candidate = new SQL.Database(db.export());
  try {
    candidate.run('PRAGMA foreign_keys = ON');
    transaction(candidate, () => replaceRows(candidate, backup.tables));
    if (!one(candidate, "SELECT id FROM users WHERE role = 'Admin' AND active = 1")) throw new Error('Backup must contain an active administrator.');
    if (!['demo', 'clean'].includes(one(candidate, "SELECT value FROM app_meta WHERE key = 'app_mode'")?.value)) throw new Error('Backup has an invalid application mode.');
    for (const person of all(candidate, "SELECT resume_file FROM people WHERE resume_file IS NOT NULL AND resume_file != ''")) {
      if (!names.has(person.resume_file.toLowerCase())) throw new Error('Backup is missing an uploaded resume.');
    }
  } finally { candidate.close(); }

  // Stage uploads before touching current data. Keep the previous directory and
  // rows until the new database has been persisted, so failures can roll back.
  const uploadDir = path.resolve(config.uploadDir);
  const parent = path.dirname(uploadDir);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, '.caliberate-restore-'));
  const previous = `${stage}-previous`;
  const before = Object.fromEntries(TABLES.map(table => [table, all(db, `SELECT * FROM ${table}`)]));
  let moved = false;
  let installed = false;
  let replaced = false;
  let complete = false;
  const epoch = randomUUID();
  try {
    for (const file of files) fs.writeFileSync(path.join(stage, file.name), file.data);
    if (fs.existsSync(uploadDir)) { fs.renameSync(uploadDir, previous); moved = true; }
    fs.renameSync(stage, uploadDir);
    installed = true;
    transaction(db, () => {
      replaceRows(db, backup.tables);
      setMeta(db, 'session_epoch', epoch);
    });
    replaced = true;
    saveDb();
    config.sessionEpoch = epoch;
    config.demoMode = backup.tables.app_meta.find(row => row.key === 'app_mode').value === 'demo';
    config.seedDemoData = config.demoMode;
    complete = true;
  } catch (error) {
    if (installed) fs.rmSync(uploadDir, { recursive: true, force: true });
    if (moved) fs.renameSync(previous, uploadDir);
    if (replaced) { transaction(db, () => replaceRows(db, before)); saveDb(); }
    throw error;
  } finally {
    // Both cleanup paths are generated siblings under the configured parent.
    for (const target of complete ? [stage, previous] : [stage]) {
      if (path.dirname(target) === parent && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    }
  }
}
