import { query, withTransaction } from '../db.js';
import { httpError } from '../http.js';
import { logger } from '../logger.js';
import { colomboParts, nextRunAt } from '../util/time.js';
import { emitUpdate } from '../realtime.js';
import { connectVoice, createOutboundCall } from './calls.js';
import { processEscalations } from './alerts.js';
import { send } from './notify.js';
import { getSettings } from './settings.js';

let running = false;

const REMINDER_LABEL = {
  medication: 'Medication',
  meal: 'Meal',
  rest: 'Rest',
  other: 'Reminder'
};

async function startDueSchedules() {
  const { rows } = await query(
    `SELECT s.*, e.full_name, e.phone, e.customer_id, e.preferred_language
     FROM call_schedules s
     JOIN elderly_profiles e ON e.id = s.elderly_id
     WHERE s.enabled = true AND s.next_run_at <= now()
     ORDER BY s.next_run_at
     LIMIT 20`
  );
  let started = 0;
  for (const row of rows) {
    const next = nextRunAt(row.time_of_day, row.days_of_week);
    const claimed = await query(
      `UPDATE call_schedules
       SET last_run_at = now(), next_run_at = $2, updated_at = now()
       WHERE id = $1 AND enabled = true AND next_run_at <= now()
       RETURNING *`,
      [row.id, next]
    );
    if (!claimed.rows[0]) continue;
    try {
      await createOutboundCall({
        elderly: {
          id: row.elderly_id,
          full_name: row.full_name,
          phone: row.phone,
          customer_id: row.customer_id,
          preferred_language: row.preferred_language
        },
        schedule: claimed.rows[0],
        origin: 'schedule'
      });
      started += 1;
    } catch (error) {
      logger.warn(`Scheduled call for ${row.full_name} was not started: ${error.message}`);
    }
  }
  return started;
}

async function startDueRetries() {
  const due = await withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT * FROM call_records
       WHERE status = 'retry_pending' AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       LIMIT 20
       FOR UPDATE SKIP LOCKED`
    );
    const rows = [];
    for (const row of selected.rows) {
      const updated = await client.query(
        `UPDATE call_records
         SET status = 'dialing', started_at = now(), updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [row.id]
      );
      rows.push(updated.rows[0]);
    }
    return rows;
  });
  let started = 0;
  for (const call of due) {
    try {
      await connectVoice(call);
      started += 1;
    } catch (error) {
      logger.warn(`Retry call ${call.id} failed: ${error.message}`);
    }
  }
  return started;
}

async function processReminders() {
  const now = colomboParts();
  const { rows } = await query(
    `SELECT r.*, e.full_name, c.user_id, c.notify_reminders
     FROM reminders r
     JOIN elderly_profiles e ON e.id = r.elderly_id
     JOIN customers c ON c.id = r.customer_id
     WHERE r.enabled = true
       AND (r.last_notified_on IS NULL OR r.last_notified_on < current_date)`
  );
  let count = 0;
  for (const reminder of rows) {
    const days = reminder.days_of_week.map(Number);
    if (!days.includes(now.isoWeekday)) continue;
    const [hour, minute] = String(reminder.time_of_day).slice(0, 5).split(':').map(Number);
    if (hour * 60 + minute > now.minutes) continue;
    const claimed = await query(
      `UPDATE reminders
       SET last_notified_on = current_date, updated_at = now()
       WHERE id = $1 AND (last_notified_on IS NULL OR last_notified_on < current_date)
       RETURNING id`,
      [reminder.id]
    );
    if (!claimed.rows[0]) continue;
    if (reminder.notify_reminders) {
      await withTransaction(async (client) => {
        await send(client, {
          userId: reminder.user_id,
          audience: 'customer',
          channel: 'in_app',
          title: `${REMINDER_LABEL[reminder.type] || 'Reminder'} reminder`,
          body: `${reminder.title} for ${reminder.full_name}.`,
          type: 'reminder',
          relatedType: 'reminder',
          relatedId: reminder.id
        });
      });
      count += 1;
    }
  }
  return count;
}

export async function runSchedulerTick({ force = false } = {}) {
  if (running) return { skipped: true, reason: 'overlap' };
  running = true;
  try {
    const settings = await getSettings();
    if (!force && !settings.scheduler_enabled) return { skipped: true, reason: 'disabled' };
    const schedulesStarted = await startDueSchedules();
    const retriesStarted = await startDueRetries();
    const escalations = await withTransaction((client) => processEscalations(client, settings.escalation_delay_seconds));
    const reminders = await processReminders();
    const summary = { schedulesStarted, retriesStarted, escalations, reminders, skipped: false };
    if (schedulesStarted || retriesStarted || escalations || reminders) {
      emitUpdate({ topic: 'dashboard' });
      logger.info('Scheduler tick', JSON.stringify(summary));
    }
    return summary;
  } finally {
    running = false;
  }
}

export async function runScheduleById(id) {
  const { rows } = await query(
    `SELECT s.*, e.full_name, e.phone, e.customer_id, e.preferred_language
     FROM call_schedules s
     JOIN elderly_profiles e ON e.id = s.elderly_id
     WHERE s.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) throw httpError(404, 'Schedule not found');
  if (!row.enabled) throw httpError(400, 'This schedule is turned off');
  const next = nextRunAt(row.time_of_day, row.days_of_week);
  const claimed = await query(
    `UPDATE call_schedules
     SET last_run_at = now(), next_run_at = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, next]
  );
  return createOutboundCall({
    elderly: {
      id: row.elderly_id,
      full_name: row.full_name,
      phone: row.phone,
      customer_id: row.customer_id,
      preferred_language: row.preferred_language
    },
    schedule: claimed.rows[0],
    origin: 'schedule'
  });
}
