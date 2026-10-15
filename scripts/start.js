import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function launch(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd: join(root, cwd),
    shell: true,
    stdio: 'inherit'
  });
  child.on('exit', (code) => {
    if (code) console.error(`${name} stopped with code ${code}`);
  });
  children.push(child);
}

console.log('Starting Suva Voice. The SQL database is created from Database/suva_voice.sql if this is the first launch.');
console.log('API http://127.0.0.1:4000  Voice http://127.0.0.1:4100  Admin http://127.0.0.1:5173  App http://127.0.0.1:8081');

launch('API', 'node', ['src/index.js'], 'Backend');
launch('Voice', 'node', ['src/index.js'], 'LocalServer');
launch('Admin', 'npm', ['run', 'dev'], 'Web');
launch('App', 'npx', ['expo', 'start', '--web', '--port', '8081'], 'App');

function stop() {
  for (const child of children) {
    if (!child.pid) continue;
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { shell: true, stdio: 'ignore' });
  }
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
