// Explicit integration check against the linked Neon demo database. This creates
// one labeled support record and one simulated emergency call, then resolves both.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../Backend/package.json', import.meta.url));
const dotenv = require('dotenv');
dotenv.config({ path: join(root, '.runtime/hosting.env') });
dotenv.config({ path: join(root, existsSync(join(root, '.env')) ? '.env' : '.env.local') });
dotenv.config({ path: join(root, 'Backend/.env') });
assert.ok(process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).hostname.endsWith('.neon.tech'), 'A real Neon DATABASE_URL is required');
assert.ok(process.env.HOSTED_DEMO_PASSWORD, 'The private hosted demo password is required');

const apiPort = 14000;
const voicePort = 14100;
const base = `http://127.0.0.1:${apiPort}`;
const checks = [];
const runtime = join(root, '.runtime');
mkdirSync(runtime, { recursive: true });
const logs = createWriteStream(join(runtime, 'neon-e2e.log'), { flags: 'w' });
let apiProcess;
let voiceProcess;
let socket;
let database;

function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
function launch(folder, env) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: join(root, folder), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SCHEDULER_ENABLED: 'false', OPEN_CALL_ON_COMPUTER: 'false',
      DEMO_MODE: 'true', ASTERISK_ENABLED: 'false', SMS_PROVIDER: 'demo', EMAIL_PROVIDER: 'demo', PAYMENT_PROVIDER: 'demo', ...env }
  });
  child.stdout.pipe(logs, { end: false });
  child.stderr.pipe(logs, { end: false });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill('SIGTERM');
  await done;
}
async function request(path, { token, body, method = 'GET', expected = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${json.error?.message || response.status}`);
  return json.data;
}
async function until(fn, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}
async function startApi() {
  apiProcess = launch('Backend', { PORT: String(apiPort), LOCAL_SERVER_URL: `http://127.0.0.1:${voicePort}` });
  await until(async () => {
    if (apiProcess.exitCode !== null) throw new Error('API stopped; see .runtime/neon-e2e.log');
    try { return (await request('/api/health')).ok; } catch { return false; }
  }, 'API health did not become ready');
}
async function login(identifier) {
  return request('/api/auth/login', { method: 'POST', body: { identifier, password: process.env.HOSTED_DEMO_PASSWORD } });
}

try {
  await import('../Backend/src/config.js');
  database = await import('../Backend/src/db.js');
  assert.equal(database.usesHostedDatabase, true);
  await database.ensureDatabase();
  assert.equal((await database.query('SHOW TIME ZONE')).rows[0].TimeZone, 'Asia/Colombo');
  pass('Real Neon PostgreSQL adapter connects with the Sri Lanka time zone');
  const value = await database.withTransaction(async (client) => {
    await client.query('CREATE TEMP TABLE suva_neon_commit_probe (amount numeric) ON COMMIT DROP');
    await client.query('INSERT INTO suva_neon_commit_probe VALUES ($1)', [3.5]);
    return (await client.query('SELECT amount FROM suva_neon_commit_probe')).rows[0].amount;
  });
  assert.equal(value, 3.5);
  await assert.rejects(database.withTransaction(async (client) => {
    await client.query('CREATE TEMP TABLE suva_neon_rollback_probe (id int)');
    throw new Error('intentional rollback probe');
  }), /intentional rollback/);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'suva_neon_rollback_probe'")).rows[0].n, 0);
  pass('Real PostgreSQL commit, rollback and numeric conversion work');

  voiceProcess = launch('LocalServer', { PORT: String(voicePort), BACKEND_URL: base, TTS_ENABLED: 'false' });
  await until(async () => {
    try { return (await fetch(`http://127.0.0.1:${voicePort}/health`)).ok; } catch { return false; }
  }, 'Private simulator did not become ready');
  await startApi();
  pass('API and private call simulator start with Neon');
  const customer = await login('nimal.fernando@suvavoice.lk');
  const second = await login('dilani.fernando@suvavoice.lk');
  const admin = await login('admin@suvavoice.lk');
  assert.equal(customer.user.role, 'customer');
  assert.equal(admin.user.role, 'admin');
  pass('Customer and admin sign-in use accounts stored in Neon');
  const people = await request('/api/elderly', { token: customer.token });
  const otherPeople = await request('/api/elderly', { token: second.token });
  assert.ok(people.length > 0 && otherPeople.length > 0);
  await request(`/api/elderly/${otherPeople[0].id}`, { token: customer.token, expected: 403 });
  await request('/api/users', { token: customer.token, expected: 403 });
  pass('Saved profiles load and customer/admin access boundaries hold');
  const plans = await request('/api/subscriptions/plans', { token: customer.token });
  assert.equal(plans.find((plan) => plan.code === 'essential').priceLkr, 0);
  pass('Free-plan pricing loads from hosted PostgreSQL');

  const support = await request('/api/support', { token: customer.token, method: 'POST', expected: 201,
    body: { subject: `Neon hosting check ${new Date().toISOString()}`, message: 'Automated hosted database persistence verification. This is a demonstration record.' } });
  const closed = await request(`/api/support/${support.id}`, { token: admin.token, method: 'PATCH',
    body: { status: 'closed', staffResponse: 'Hosting verification completed.' } });
  assert.equal(closed.status, 'closed');
  pass('Customer write and admin update commit to Neon');

  const { io } = require('socket.io-client');
  const updates = [];
  socket = io(base, { auth: { token: customer.token }, transports: ['websocket'], reconnection: false });
  socket.on('suva:update', (event) => updates.push(event));
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => Promise.reject(error)),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Realtime connection timeout')), 15000); timer.unref(); })]);
  const call = await request('/api/calls/test', { token: customer.token, method: 'POST', expected: 201, body: { elderlyId: people[0].id } });
  await until(async () => (await request(`/api/calls/${call.id}`, { token: customer.token })).status === 'waiting_dtmf', 'Call did not reach keypad state');
  const audio = await fetch(`${base}/api/calls/${call.id}/prompts/welcome`, { headers: { Authorization: `Bearer ${customer.token}` } });
  assert.equal(audio.status, 200);
  assert.ok((await audio.arrayBuffer()).byteLength > 100);
  const outcome = await request(`/api/calls/${call.id}/dtmf`, { token: customer.token, method: 'POST', body: { digit: '3' } });
  assert.equal(outcome.call.resultCode, 'emergency');
  assert.equal(outcome.alert.type, 'emergency');
  const notifications = await request('/api/notifications', { token: customer.token });
  assert.ok(notifications.some((item) => item.relatedId === outcome.alert.id));
  await until(async () => updates.some((event) => event.callId === call.id), 'Realtime call update missing');
  await request(`/api/alerts/${outcome.alert.id}`, { token: admin.token, method: 'PATCH', body: { status: 'resolved' } });
  pass('Manual call, audio, emergency alert, notification and realtime update work');
  socket.disconnect();
  await stop(apiProcess);
  await startApi();
  const savedSupport = await request('/api/support', { token: customer.token });
  assert.ok(savedSupport.some((item) => item.id === support.id && item.status === 'closed'));
  const savedCall = await request(`/api/calls/${call.id}`, { token: customer.token });
  assert.equal(savedCall.resultCode, 'emergency');
  assert.equal(savedCall.alert.status, 'resolved');
  pass('Records and sign-in session survive an API process restart');
  writeFileSync(join(runtime, 'NEON-E2E-RESULT.json'), JSON.stringify({ passed: true, checks, supportId: support.id, callId: call.id, at: new Date().toISOString() }, null, 2));
  console.log(`Neon integration verified: ${checks.length} checks passed.`);
} catch (error) {
  console.error(`FAIL ${error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL hidden]')}`);
  writeFileSync(join(runtime, 'NEON-E2E-RESULT.json'), JSON.stringify({ passed: false, checks, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  socket?.disconnect();
  await stop(apiProcess);
  await stop(voiceProcess);
  await database?.pool.end();
  logs.end();
}
