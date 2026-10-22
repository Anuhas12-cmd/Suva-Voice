import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { NodeFS } from '@electric-sql/pglite/nodefs';
import pg from 'pg';
import { logger } from './logger.js';
import { writeDataSql } from './snapshot.js';
import { postgresTransaction } from './postgres.js';

const databaseRoot = join(dirname(fileURLToPath(import.meta.url)), '../../Database');
const dataDir = process.env.SUVA_DATA_DIR || join(databaseRoot, 'data');
const schemaPath = join(databaseRoot, 'schema.sql');
const dataSqlPath = join(databaseRoot, 'suva_voice.sql');
export const usesHostedDatabase = Boolean(process.env.DATABASE_URL);

const NUMERIC = new Set([700, 701, 1700]);

let db;
let opening;
let hostedPool;

function shape(result) {
  const rows = result?.rows || [];
  for (const row of rows) {
    for (const field of result?.fields || []) {
      const value = row[field.name];
      if (value == null || !NUMERIC.has(field.dataTypeID)) continue;
      const number = Number(value);
      if (!Number.isNaN(number)) row[field.name] = number;
    }
  }
  return {
    rows,
    rowCount: result?.rowCount ?? result?.affectedRows ?? rows.length,
    fields: result?.fields || []
  };
}

function clientFor(target) {
  return {
    query(text, params) {
      return target.query(text, params).then(shape);
    }
  };
}

async function open() {
  if (usesHostedDatabase) {
    hostedPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      options: '-c timezone=Asia/Colombo',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000
    });
    hostedPool.on('error', () => logger.error('Hosted PostgreSQL connection error'));
    try {
      const client = await hostedPool.connect();
      try {
        const found = await client.query("SELECT to_regclass('public.users') AS name");
        if (!found.rows[0]?.name) {
          throw new Error('Hosted database is empty. Run npm run hosted:init in Backend first.');
        }
        // The migration contains its own BEGIN/COMMIT; keep it on one connection.
        await client.query(fs.readFileSync(join(databaseRoot, 'migrations/001-free-essential-plan.sql'), 'utf8'));
        const check = await client.query('SELECT count(*)::int AS total FROM users');
        logger.info(`Hosted PostgreSQL ready (${check.rows[0].total} accounts)`);
      } finally { client.release(); }
    } catch (error) {
      await hostedPool.end();
      hostedPool = null;
      throw error;
    }
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  db = new PGlite({ dataDir, fs: new NodeFS(dataDir) });
  await db.waitReady;
  await db.exec("SET TIME ZONE 'Asia/Colombo'");
  const found = await db.query("SELECT to_regclass('public.users') AS name");
  if (!found.rows[0]?.name) {
    await db.exec(fs.readFileSync(schemaPath, 'utf8'));
    if (fs.existsSync(dataSqlPath) && fs.statSync(dataSqlPath).size > 0) {
      await db.exec(fs.readFileSync(dataSqlPath, 'utf8'));
      logger.info('Created the SQL database from Database/suva_voice.sql');
    } else {
      const { seed } = await import('../scripts/seed.js');
      await seed();
      await writeSnapshot();
      logger.info('Created the SQL database with the demo accounts');
    }
  }
  await db.exec(fs.readFileSync(join(databaseRoot, 'migrations/001-free-essential-plan.sql'), 'utf8'));
  const check = await db.query('SELECT count(*)::int AS total FROM users');
  logger.info(`SQL database ready at ${dataDir} (${check.rows[0].total} accounts)`);
}

export function ensureDatabase() {
  if (!opening) {
    opening = open().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

async function ready() {
  if (usesHostedDatabase || !db) await ensureDatabase();
}

export async function query(text, params) {
  await ready();
  return shape(await (usesHostedDatabase ? hostedPool : db).query(text, params));
}

export async function withTransaction(fn) {
  await ready();
  if (usesHostedDatabase) return postgresTransaction(hostedPool, fn, shape);
  return db.transaction(async (tx) => fn(clientFor(tx)));
}

export async function writeSnapshot() {
  // Hosted PostgreSQL persists its own records; never export them into ephemeral files.
  if (usesHostedDatabase) return null;
  await ready();
  const counts = await writeDataSql((text, params) => db.query(text, params), dataSqlPath);
  logger.info(`Saved SQL data to Database/suva_voice.sql (${counts.users} accounts)`);
  return counts;
}

export const pool = {
  query(text, params) {
    return query(text, params);
  },
  async end() {
    if (hostedPool) {
      await hostedPool.end();
      hostedPool = null;
      opening = null;
      return;
    }
    if (!db) return;
    await db.close();
    db = null;
    opening = null;
  }
};
