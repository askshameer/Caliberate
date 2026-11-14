import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from './client/node_modules/vite/dist/node/index.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'caliberate-login-'));
const port = 43117;
const base = `http://127.0.0.1:${port}/api`;
const startServer = () => {
  const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_PATH: path.join(temp, 'test.db'), UPLOAD_DIR: path.join(temp, 'uploads'), DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', BCRYPT_ROUNDS: '4' },
  stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  return server;
};
let output = '';
let child = startServer();
async function stopServer() {
  if (child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await exited;
}
let vite;
async function api(route, token, body, expected = 200) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${route}: ${JSON.stringify(data)}`);
  return data;
}
const login = (email, password) => api('/auth/login', null, { email, password });
async function waitForServer() {
  for (let attempt = 0; ; attempt++) {
    try { await api('/auth/config'); break; } catch (error) {
      if (attempt >= 100 || child.exitCode !== null) throw new Error(output, { cause: error });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
try {
  await waitForServer();
  let admin = await login('admin@caliberate.io', 'caliberate123');
  const originalToken = admin.token;
  await api('/settings/reset', admin.token, { confirm: 'RESET' });
  assert.equal((await api('/setup/status')).setupRequired, true);
  await stopServer();
  child = startServer();
  await waitForServer();
  assert.equal((await api('/setup/status')).setupRequired, true, 'Reset must survive restart with demo env vars');
  await api('/auth/me', originalToken, undefined, 401);
  await api('/setup', null, { mode: 'clean', adminEmail: 'admin@caliberate.io', adminPassword: 'AdminPassword@123' }, 201);
  admin = await login('admin@caliberate.io', 'AdminPassword@123');
  assert.equal((await api('/people', admin.token)).length, 0);
  await api('/users/import', admin.token, { csv: 'name,email,role\nPriya Nair,priya.nair@caliberate.io,Panel' }, 201);
  const priya = await login('priya.nair@caliberate.io', 'Password@123');
  assert.equal(priya.user.mustChangePassword, true);
  assert.equal((await api('/people', priya.token, undefined, 403)).code, 'PASSWORD_CHANGE_REQUIRED');

  // Render the actual entry component before effects/data loading can run.
  // This fails if the mandatory password form is hidden behind the loader.
  globalThis.localStorage = { getItem: () => JSON.stringify(priya.user) };
  vite = await createServer({ root: path.join(root, 'client'), server: { middlewareMode: true }, appType: 'custom' });
  const requireClient = createRequire(path.join(root, 'client/package.json'));
  const React = requireClient('react');
  const { renderToStaticMarkup } = requireClient('react-dom/server');
  const { AuthProvider } = await vite.ssrLoadModule('/src/contexts/AuthContext.jsx');
  const { default: App } = await vite.ssrLoadModule('/src/components/CaliberateApp.jsx');
  const html = renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(App)));
  assert.match(html, /Update Password/);
  assert.match(html, /name="currentPassword"/);
  assert.doesNotMatch(html, /Loading Caliberate/);
  const { BackupRestore, LoginHistory } = await vite.ssrLoadModule('/src/components/AdminTools.jsx');
  assert.match(renderToStaticMarkup(React.createElement(BackupRestore)), /Download backup/);
  assert.match(renderToStaticMarkup(React.createElement(LoginHistory)), /Search login history/);
  const changed = await api('/auth/change-password', priya.token, { currentPassword: 'Password@123', newPassword: 'NewPassword@123' });
  assert.equal(changed.user.mustChangePassword, false);
  const panelLogin = await login('priya.nair@caliberate.io', 'NewPassword@123');
  assert.equal((await api('/panels/me', panelLogin.token)).email, 'priya.nair@caliberate.io');
  await api('/settings/load-demo', panelLogin.token, { confirm: 'DEMO' }, 403);
  await api('/settings/load-demo', admin.token, {}, 400);
  await api('/settings/load-demo', admin.token, { confirm: 'DEMO' });
  assert.ok((await api('/people', admin.token)).length > 0);
  const demoPriya = await login('priya.nair@caliberate.io', 'caliberate123');
  assert.equal(demoPriya.user.mustChangePassword, false);
  const ownPanel = await api('/panels/me', demoPriya.token);
  const { editableSlots } = await import('./client/src/utils/availability.js');
  assert.deepEqual(editableSlots(ownPanel.timeSlots), ownPanel.timeSlots, 'Demo availability must fit the visible picker');
  const selectedSlots = ownPanel.timeSlots.slice(1);
  const savedSlots = await fetch(`${base}/panels/${ownPanel.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demoPriya.token}` },
    body: JSON.stringify({ timeSlots: selectedSlots }),
  });
  assert.equal(savedSlots.status, 200, 'Panel member can change their demo slots');
  assert.deepEqual((await savedSlots.json()).timeSlots, selectedSlots);
  assert.equal((await api('/panels/me', demoPriya.token)).email, 'priya.nair@caliberate.io');
  assert.equal((await login('admin@caliberate.io', 'AdminPassword@123')).user.id, admin.user.id);
  await api('/settings/load-demo', admin.token, { confirm: 'DEMO' });
  const users = await api('/users', admin.token);
  assert.equal(users.filter(user => user.email === 'priya.nair@caliberate.io').length, 1);
  await api('/users/login-history', demoPriya.token, undefined, 403);
  await api('/settings/backup', demoPriya.token, undefined, 403);
  await api('/auth/login', null, { email: 'priya.nair@caliberate.io', password: 'wrong-password' }, 401);
  const history = await api('/users/login-history?search=priya.nair&outcome=Invalid%20credentials', admin.token);
  assert.equal(history.total, 1);
  assert.equal(history.entries[0].email, 'priya.nair@caliberate.io');
  assert.ok(history.entries[0].ip);
  assert.equal((await api('/users/login-history?page=2', admin.token)).entries.length, 0);
  await writeFile(path.join(temp, 'uploads', 'test-resume.pdf'), 'test resume bytes');
  const backup = await api('/settings/backup', admin.token);
  assert.equal(backup.files.length, 1);
  const restore = async (value, token = admin.token, expected = 200, confirm = 'RESTORE') => {
    const form = new FormData();
    form.append('confirm', confirm);
    form.append('backup', new Blob([JSON.stringify(value)]), 'backup.json');
    const response = await fetch(base + '/settings/restore', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
  };
  await restore(backup, demoPriya.token, 403);
  await restore(backup, admin.token, 400, '');
  await restore({ ...backup, version: 99 }, admin.token, 400);
  await restore({ ...backup, files: [{ name: '../escape.pdf', data: '' }] }, admin.token, 400);
  await restore({ ...backup, tables: { ...backup.tables, users: [] } }, admin.token, 400);
  assert.equal((await api('/users', admin.token)).length, users.length);
  assert.equal(await readFile(path.join(temp, 'uploads', 'test-resume.pdf'), 'utf8'), 'test resume bytes');
  await api('/users/import', admin.token, { csv: 'name,email,role\nExtra User,extra@example.com,Sales' }, 201);
  await writeFile(path.join(temp, 'uploads', 'test-resume.pdf'), 'modified');
  await restore(backup);
  await api('/auth/me', admin.token, undefined, 401);
  const restoredAdmin = await login('admin@caliberate.io', 'AdminPassword@123');
  await api('/auth/logout', admin.token, {});
  await api('/auth/me', restoredAdmin.token);
  assert.equal((await api('/users', restoredAdmin.token)).length, users.length);
  assert.equal(await readFile(path.join(temp, 'uploads', 'test-resume.pdf'), 'utf8'), 'test resume bytes');
  assert.equal((await api('/users/login-history?search=priya.nair&outcome=Invalid%20credentials', restoredAdmin.token)).total, 1);
  await stopServer();
  child = startServer();
  await waitForServer();
  await api('/auth/me', restoredAdmin.token);
  assert.equal((await api('/users', restoredAdmin.token)).length, users.length);
  await api('/settings/reset', restoredAdmin.token, { confirm: 'RESET' });
  assert.equal((await api('/setup/status')).setupRequired, true);
  await api('/setup', null, { mode: 'demo' }, 201);
  await api('/auth/me', originalToken, undefined, 401);
  assert.equal((await login('admin@caliberate.io', 'caliberate123')).user.role, 'Admin');
  console.log('PASS: reset-to-setup, clean/demo setup, session revocation, login-history filters/access, backup/restore round trip with uploads, and invalid-backup rollback.');
  console.log('PASS: reset, import, first-login password form, password change, panel profile, admin-only demo restore, and repeat restore.');
} finally {
  delete globalThis.localStorage;
  await vite?.close();
  await stopServer();
  await rm(temp, { recursive: true, force: true });
}
