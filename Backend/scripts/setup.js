import { pool, ensureDatabase, writeSnapshot } from '../src/db.js';
import { seed } from './seed.js';

try {
  await ensureDatabase();
  await seed();
  await writeSnapshot();
  console.log('Suva Voice demo data is ready. This replaced the saved family records with the original demo accounts.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
