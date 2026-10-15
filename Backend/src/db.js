import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { NodeFS } from '@electric-sql/pglite/nodefs';
import { logger } from './logger.js';
import { writeDataSql } from './snapshot.js';

const databaseRoot = join(dirname(fileURLToPath(import.meta.url)), '../../Database');
const dataDir = process.env.SUVA_DATA_DIR || join(databaseRoot, 'data');
const schemaPath = join(databaseRoot, 'schema.sql');
const dataSqlPath = join(databaseRoot, 'suva_voice.sql');

const NUMERIC = new Set([700, 701, 1700]);

let db;
let opening;

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
  if (!db) await ensureDatabase();
}

export async function query(text, params) {
  await ready();
  return shape(await db.query(text, params));
}

export async function withTransaction(fn) {
  await ready();
  return db.transaction(async (tx) => fn(clientFor(tx)));
}

export async function writeSnapshot() {
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
    if (!db) return;
    await db.close();
    db = null;
    opening = null;
  }
};
