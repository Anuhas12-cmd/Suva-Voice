import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.js') ? [path] : [];
  });
}
const files = ['Backend/src', 'LocalServer/src'].flatMap((folder) => sources(join(root, folder)));
for (const file of files) {
  const checked = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true });
  if (checked.error || checked.status !== 0) process.exit(checked.status || 1);
}
console.log(`Backend and simulator syntax checks passed (${files.length} JavaScript files).`);
const web = spawnSync(process.execPath, [join(root, 'Web/node_modules/vite/bin/vite.js'), 'build'], {
  cwd: join(root, 'Web'), stdio: 'inherit', windowsHide: true
});
if (web.error || web.status !== 0) process.exit(web.status || 1);
console.log('Suva Voice build passed: backend/simulator checked and admin website compiled.');
