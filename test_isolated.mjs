// Run destructive feature checks only against disposable demo data.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'caliberate-features-'));
let output = '';
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', PORT: '0', ENV_FILE: path.join(temp, '.env'),
    DB_PATH: path.join(temp, 'test.db'), UPLOAD_DIR: path.join(temp, 'uploads'),
    DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', BCRYPT_ROUNDS: '4',
    COOKIE_SECURE: 'false', RATE_LIMIT_MAX: '5000', AUTH_RATE_LIMIT_MAX: '100' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
try {
  let base;
  for (let attempt = 0; attempt < 200; attempt++) {
    const port = output.match(/localhost:(\d+)/)?.[1];
    if (port && port !== '0') {
      base = `http://127.0.0.1:${port}`;
      if ((await fetch(`${base}/api/ready`)).ok) break;
    }
    if (server.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!base) throw new Error(`Test server did not become ready.\n${output}`);
  const test = spawn(process.execPath, ['test_all_features.mjs'], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, TEST_BASE_URL: base, TEST_FRONTEND_URL: base },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    test.once('error', reject);
    test.once('exit', code => resolve(code ?? 1));
  });
  if (process.exitCode) console.error(output);
} finally {
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  // mkdtemp created this directory directly under the system temporary directory.
  if (path.dirname(temp) !== path.resolve(tmpdir()) || !path.basename(temp).startsWith('caliberate-features-')) {
    throw new Error('Refusing to remove an unexpected test directory.');
  }
  await rm(temp, { recursive: true, force: true });
}
