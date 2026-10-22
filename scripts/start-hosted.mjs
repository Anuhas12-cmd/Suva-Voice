import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.VOICE_WEBHOOK_SECRET) {
  console.error('Hosted startup requires DATABASE_URL, JWT_SECRET and VOICE_WEBHOOK_SECRET.');
  process.exit(1);
}
const apiPort = Number(process.env.PORT || process.env.API_PORT || 10000);
const voicePort = 4100;
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535 || apiPort === voicePort) {
  console.error('Choose a valid public PORT different from the private simulator port 4100.');
  process.exit(1);
}
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    process.exit(code);
  }, 8000);
  Promise.all(children.map((child) => child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve() : new Promise((resolve) => child.once('exit', resolve))))
    .then(() => { clearTimeout(deadline); process.exit(code); });
}
function launch(folder, env) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: join(root, folder), env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true
  });
  children.push(child);
  child.once('error', () => { console.error(`${folder} could not start`); stop(1); });
  child.once('exit', (code) => { if (!stopping) { console.error(`${folder} stopped (${code})`); stop(1); } });
}

// Only the API exposes a public port. The simulator runs privately alongside it.
launch('LocalServer', {
  PORT: String(voicePort), BACKEND_URL: `http://127.0.0.1:${apiPort}`,
  TTS_ENABLED: 'false', ASTERISK_ENABLED: 'false', DEMO_FALLBACK: 'true'
});
launch('Backend', {
  PORT: String(apiPort), LOCAL_SERVER_URL: `http://127.0.0.1:${voicePort}`,
  SCHEDULER_ENABLED: 'false', ASTERISK_ENABLED: 'false', DEMO_MODE: 'true',
  SMS_PROVIDER: 'demo', EMAIL_PROVIDER: 'demo', PAYMENT_PROVIDER: 'demo'
});
process.once('SIGTERM', () => stop(0));
process.once('SIGINT', () => stop(0));
