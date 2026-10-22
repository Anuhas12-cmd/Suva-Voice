import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { NodeFS } from '@electric-sql/pglite/nodefs';

const temporaryRoot = resolve(tmpdir());
const dataDir = await mkdtemp(join(temporaryRoot, 'suva-free-plan-'));
process.env.SUVA_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'free-plan-test-only-jwt-secret';
process.env.VOICE_WEBHOOK_SECRET = 'free-plan-test-only-voice-secret';
const { ensureDatabase, query, pool } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const { advanceStatus } = await import('../src/services/calls.js');
const { changePlan } = await import('../src/services/billing.js');
const { writeDataSql } = await import('../src/snapshot.js');
const essential = '50000000-0000-4000-8000-000000000001';
const family = '50000000-0000-4000-8000-000000000002';
const customer = { id: '10000000-0000-4000-8000-000000000002', customerId: '20000000-0000-4000-8000-000000000002', role: 'customer' };
let previousPayments;
let previousSubscriptions;

test('late concurrent voice events cannot move a check-in backwards', async () => {
  const { rows } = await query('SELECT id FROM call_records ORDER BY started_at LIMIT 1');
  const callId = rows[0].id;
  await query("UPDATE call_records SET status = 'failed' WHERE status IN ('dialing','ringing','connected','playing','waiting_dtmf')");
  await query("UPDATE call_records SET status = 'dialing', answered_at = NULL, ended_at = NULL WHERE id = $1", [callId]);
  await Promise.all(['waiting_dtmf', 'playing', 'connected', 'ringing'].map((status) => advanceStatus(callId, status)));
  const final = (await query('SELECT status, answered_at FROM call_records WHERE id = $1', [callId])).rows[0];
  assert.equal(final.status, 'waiting_dtmf');
  assert.ok(final.answered_at);
  await query("UPDATE call_records SET status = 'failed' WHERE id = $1", [callId]);
});

before(async () => {
  const legacy = new PGlite({ dataDir, fs: new NodeFS(dataDir) });
  try {
    await legacy.exec(await readFile(new URL('../../Database/schema.sql', import.meta.url), 'utf8'));
    await legacy.exec(await readFile(new URL('../../Database/suva_voice.sql', import.meta.url), 'utf8'));
    await legacy.query('DELETE FROM schema_migrations');
    await legacy.query('UPDATE subscription_plans SET price_lkr = 1500 WHERE id = $1', [essential]);
    previousPayments = (await legacy.query('SELECT id, amount::text, transaction_ref FROM payments ORDER BY id')).rows;
    previousSubscriptions = (await legacy.query('SELECT id, plan_id, status FROM subscriptions ORDER BY id')).rows;
  } finally { await legacy.close(); }
  await ensureDatabase();
});

after(async () => {
  await pool.end();
  const child = relative(temporaryRoot, resolve(dataDir));
  if (!child.startsWith('suva-free-plan-') || child.includes('..') || child.includes('\\') || child.includes('/')) throw new Error('Unsafe test cleanup path');
  await rm(dataDir, { recursive: true, force: true });
});

test('existing installations receive the free plan without rewriting payments, subscribers or paid tiers', async () => {
  const plans = (await query('SELECT code, price_lkr FROM subscription_plans ORDER BY price_lkr')).rows;
  assert.deepEqual(plans.map(p => [p.code, p.price_lkr]), [['essential', 0], ['family', 3500], ['complete', 6500]]);
  assert.deepEqual((await query('SELECT id, amount::text, transaction_ref FROM payments ORDER BY id')).rows, previousPayments);
  assert.deepEqual((await query('SELECT id, plan_id, status FROM subscriptions ORDER BY id')).rows, previousSubscriptions);
});

test('free subscriptions activate without a payment provider and do not add collected revenue', async () => {
  await query('UPDATE subscription_plans SET price_lkr = 0 WHERE id = $1', [essential]);
  config.paymentProvider = 'not-configured';
  const beforeTotal = (await query("SELECT sum(amount)::text AS total FROM payments WHERE status = 'successful'")).rows[0].total;
  const result = await changePlan(customer, essential);
  assert.equal(result.subscription.status, 'active');
  assert.equal(result.subscription.plan_id, essential);
  assert.equal(result.payment.amount, 0);
  assert.equal(result.payment.provider, 'free');
  assert.equal(result.payment.subscription_id, result.subscription.id);
  assert.equal((await query("SELECT sum(amount)::text AS total FROM payments WHERE status = 'successful'")).rows[0].total, beforeTotal);
  assert.equal((await query("SELECT id FROM subscriptions WHERE customer_id = $1 AND status = 'active'", [customer.customerId])).rowCount, 1);
});

test('paid plans still require their provider and a failed purchase preserves the active plan', async () => {
  config.paymentProvider = 'not-configured';
  const activeBefore = (await query("SELECT id FROM subscriptions WHERE customer_id = $1 AND status = 'active'", [customer.customerId])).rows;
  await assert.rejects(changePlan(customer, family), /not configured/);
  assert.deepEqual((await query("SELECT id FROM subscriptions WHERE customer_id = $1 AND status = 'active'", [customer.customerId])).rows, activeBefore);
  config.paymentProvider = 'demo';
  const result = await changePlan(customer, family);
  assert.equal(result.payment.amount, 3500);
  assert.equal(result.payment.provider, 'demo');
});

test('the one-time price migration does not overwrite later admin changes on restart', async () => {
  await query('UPDATE subscription_plans SET price_lkr = 250 WHERE id = $1', [essential]);
  await pool.end();
  await ensureDatabase();
  assert.equal((await query('SELECT price_lkr FROM subscription_plans WHERE id = $1', [essential])).rows[0].price_lkr, 250);
});

test('exporting and restoring a database retains its applied price migration', async () => {
  const snapshot = join(dataDir, 'verification-export.sql');
  await writeDataSql(query, snapshot);
  const restored = new PGlite();
  try {
    await restored.exec(await readFile(new URL('../../Database/schema.sql', import.meta.url), 'utf8'));
    await restored.exec(await readFile(snapshot, 'utf8'));
    await restored.exec(await readFile(new URL('../../Database/migrations/001-free-essential-plan.sql', import.meta.url), 'utf8'));
    assert.equal(Number((await restored.query('SELECT price_lkr FROM subscription_plans WHERE id = $1', [essential])).rows[0].price_lkr), 250);
  } finally { await restored.close(); }
});
