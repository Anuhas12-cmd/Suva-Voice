import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { postgresTransaction } from '../src/postgres.js';
import { initializeHostedDatabase } from '../src/hosted-init.js';

function connection(failCommit = false) {
  const calls = [];
  const client = {
    async query(text, params) {
      calls.push([text, params]);
      if (failCommit && text === 'COMMIT') throw new Error('commit failed');
      return { rows: [{ value: 42 }] };
    },
    release() { calls.push(['release']); }
  };
  return { calls, pool: { connect: async () => client } };
}

test('hosted transactions retain one connection and return the result after commit', async () => {
  const { pool, calls } = connection();
  const result = await postgresTransaction(pool, async (client) => (await client.query('SELECT $1', [42])).rows[0].value);
  assert.equal(result, 42);
  assert.deepEqual(calls.map(([text]) => text), ['BEGIN', 'SELECT $1', 'COMMIT', 'release']);
});

test('hosted transactions roll back and release on application and commit failures', async () => {
  for (const failCommit of [false, true]) {
    const { pool, calls } = connection(failCommit);
    await assert.rejects(postgresTransaction(pool, async () => {
      if (!failCommit) throw new Error('application failed');
    }), /failed/);
    assert.equal(calls.at(-2)[0], 'ROLLBACK');
    assert.equal(calls.at(-1)[0], 'release');
  }
});

test('hosted import refuses any existing public tables before schema or data SQL', async () => {
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); return { rows: sql.startsWith('SELECT tablename') ? [{ tablename: 'saved_records' }] : [] }; } };
  await assert.rejects(initializeHostedDatabase(client, { schema: 'SCHEMA', snapshot: 'SNAPSHOT', migration: 'MIGRATION' }), /already contains tables/);
  assert.ok(!calls.includes('SCHEMA'));
  assert.ok(!calls.includes('SNAPSHOT'));
  assert.equal(calls.at(-1), 'ROLLBACK');
});

test('hosted import rolls back if loading the snapshot fails', async () => {
  const calls = [];
  const client = { query: async (sql) => {
    calls.push(sql);
    if (sql === 'BROKEN SNAPSHOT') throw new Error('snapshot failed');
    return { rows: [] };
  } };
  await assert.rejects(initializeHostedDatabase(client, { schema: 'SCHEMA', snapshot: 'BROKEN SNAPSHOT', migration: 'MIGRATION' }), /snapshot failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(!calls.includes('COMMIT'));
});

test('real SQL import replaces public passwords and refuses a second import without changing records', async () => {
  const db = new PGlite();
  const options = {
    schema: await readFile(new URL('../../Database/schema.sql', import.meta.url), 'utf8'),
    snapshot: await readFile(new URL('../../Database/suva_voice.sql', import.meta.url), 'utf8'),
    migration: await readFile(new URL('../../Database/migrations/001-free-essential-plan.sql', import.meta.url), 'utf8'),
    passwordHash: 'isolated-test-hash'
  };
  // Exercise the SQL against an isolated PostgreSQL engine. Advisory locking is
  // skipped here: PGlite is single-process; a live Neon connection is a separate check.
  const client = { query: async (sql, params) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes(';') && !params) { await db.exec(sql); return { rows: [] }; }
    return db.query(sql, params);
  } };
  try {
    const total = await initializeHostedDatabase(client, options);
    assert.ok(total > 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users WHERE password_hash = $1', [options.passwordHash])).rows[0].n, total);
    assert.equal((await db.query('SELECT scheduler_enabled FROM system_settings')).rows[0].scheduler_enabled, false);
    await db.query("UPDATE users SET full_name = 'Keep this edit' WHERE role = 'admin'");
    await assert.rejects(initializeHostedDatabase(client, options), /already contains tables/);
    assert.equal((await db.query("SELECT full_name FROM users WHERE role = 'admin'")).rows[0].full_name, 'Keep this edit');
  } finally { await db.close(); }
});
