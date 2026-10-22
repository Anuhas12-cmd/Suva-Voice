import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeHostedDatabase } from '../src/hosted-init.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
// Deliberately separate from Backend/.env and the working USB database.
dotenv.config({ path: join(root, '.runtime/hosting.env') });
// neon deploy writes the root env file; never replace Backend/.env for this.
dotenv.config({ path: join(root, existsSync(join(root, '.env')) ? '.env' : '.env.local') });
let client;
try {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .runtime/hosting.env for a NEW empty hosted database.');
  const password = process.env.HOSTED_DEMO_PASSWORD || '';
  if (password.length < 12 || ['Admin@12345', 'Staff@12345', 'Customer@12345'].includes(password)) {
    throw new Error('Set a private HOSTED_DEMO_PASSWORD of at least 12 characters. It replaces all imported demo account passwords.');
  }
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await client.connect();
  const total = await initializeHostedDatabase(client, {
    schema: readFileSync(join(root, 'Database/schema.sql'), 'utf8'),
    snapshot: readFileSync(join(root, 'Database/suva_voice.sql'), 'utf8'),
    migration: readFileSync(join(root, 'Database/migrations/001-free-essential-plan.sql'), 'utf8'),
    passwordHash: await bcrypt.hash(password, 12)
  });
  console.log(`Hosted database initialized with ${total} accounts. Use the existing emails and your private hosted demo password.`);
  console.log('The local database was not opened or changed. Scheduled check-ins are paused.');
} catch (error) {
  // Do not print connection objects/URLs containing database credentials.
  console.error(`Hosted initialization failed: ${error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL hidden]')}`);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
