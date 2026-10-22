import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config.js';
import { ensureDatabase, pool, writeSnapshot, usesHostedDatabase } from './db.js';
import { logger } from './logger.js';
import { attachSocket } from './realtime.js';
import { releaseStaleLiveCalls } from './services/calls.js';
import { runSchedulerTick } from './services/scheduler.js';

await ensureDatabase();
const closed = await releaseStaleLiveCalls();
if (closed.length) logger.info(`Closed ${closed.length} unfinished check-in calls`);
const server = createServer(app);
attachSocket(server);

server.listen(config.port, '0.0.0.0', () => {
  logger.info(`Suva Voice API listening on port ${config.port}`);
});

server.on('error', (error) => {
  logger.error(error.message);
  process.exit(1);
});

if (config.schedulerEnabled) {
  setInterval(() => {
    runSchedulerTick().catch((error) => logger.error(`Scheduler: ${error.message}`));
  }, config.schedulerTickMs);
  logger.info(`Scheduler checking every ${config.schedulerTickMs}ms`);
}

if (!usesHostedDatabase) {
  setInterval(() => {
    writeSnapshot().catch((error) => logger.error(`Could not save the SQL file: ${error.message}`));
  }, 60_000);
  writeSnapshot().catch((error) => logger.error(`Could not save the SQL file: ${error.message}`));
}

async function shutdown() {
  server.close();
  try {
    await writeSnapshot();
  } catch (error) {
    logger.error(`Could not save the SQL file: ${error.message}`);
  }
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
