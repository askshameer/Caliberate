import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const depsOnly = process.argv.includes('--deps-only');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command) {
  execSync(command, { cwd: rootDir, stdio: 'inherit', shell: true });
}

if (!fs.existsSync(path.join(rootDir, 'server', 'node_modules'))) {
  console.log('Installing server dependencies...');
  run(`${npmCmd} --prefix server install --omit=dev --no-audit --no-fund`);
}

if (!fs.existsSync(path.join(rootDir, 'client', 'node_modules'))) {
  console.log('Installing client dependencies (including build tools)...');
  run(`${npmCmd} --prefix client install --include=dev --no-audit --no-fund`);
}

if (!depsOnly) {
  console.log('Building React client...');
  run(`${npmCmd} --prefix client run build`);
}

