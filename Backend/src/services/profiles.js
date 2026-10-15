import { pool, withTransaction } from '../db.js';
import { httpError } from '../http.js';
import { audit } from '../util/audit.js';
import { nextRunAt } from '../util/time.js';
import { getSettings } from './settings.js';

export async function getElderlyForUser(user, id, client) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT e.*, c.user_id AS customer_user_id
     FROM elderly_profiles e
     JOIN customers c ON c.id = e.customer_id
     WHERE e.id = $1`,
    [id]
  );
  const elderly = rows[0];
  if (!elderly) throw httpError(404, 'We could not find that loved one');
  if (user && user.role !== 'admin' && user.role !== 'staff' && user.customerId !== elderly.customer_id) {
    throw httpError(403, 'You do not have access to this profile');
  }
  return elderly;
}

export async function createElderly(user, input) {
  return withTransaction(async (client) => {
    const customerId = user.role === 'customer' ? user.customerId : input.customerId;
    if (!customerId) throw httpError(400, 'Choose the family account for this profile');
    const customer = await client.query('SELECT id FROM customers WHERE id = $1', [customerId]);
    if (!customer.rows[0]) throw httpError(404, 'Customer not found');
    const settings = await getSettings(client);
    const days = input.daysOfWeek?.length ? input.daysOfWeek : [1, 2, 3, 4, 5, 6, 7];
    const inserted = await client.query(
      `INSERT INTO elderly_profiles (
         customer_id, full_name, age, phone, address, preferred_language, preferred_checkin_time, health_notes, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unknown')
       RETURNING *`,
      [
        customerId,
        input.fullName,
        input.age,
        input.phone,
        input.address || null,
        input.preferredLanguage,
        input.preferredCheckInTime,
        input.healthNotes || null
      ]
    );
    const elderly = inserted.rows[0];
    await client.query(
      `INSERT INTO call_schedules (
         elderly_id, time_of_day, days_of_week, enabled, retry_attempts, retry_delay_seconds, next_run_at
       ) VALUES ($1,$2,$3,true,$4,$5,$6)`,
      [
        elderly.id,
        input.preferredCheckInTime,
        days,
        input.retryAttempts || settings.retry_attempts,
        input.retryDelaySeconds ?? settings.retry_delay_seconds,
        nextRunAt(input.preferredCheckInTime, days)
      ]
    );
    await audit(client, {
      userId: user.id,
      action: 'elderly_created',
      entityType: 'elderly_profile',
      entityId: elderly.id,
      details: { fullName: elderly.full_name }
    });
    return elderly;
  });
}

export async function updateElderly(user, id, input) {
  return withTransaction(async (client) => {
    const existing = await getElderlyForUser(user, id, client);
    const time = input.preferredCheckInTime || String(existing.preferred_checkin_time).slice(0, 5);
    const updated = await client.query(
      `UPDATE elderly_profiles SET
         full_name = COALESCE($2, full_name),
         age = COALESCE($3, age),
         phone = COALESCE($4, phone),
         address = COALESCE($5, address),
         preferred_language = COALESCE($6, preferred_language),
         preferred_checkin_time = COALESCE($7, preferred_checkin_time),
         health_notes = COALESCE($8, health_notes),
         status = COALESCE($9, status),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.fullName || null,
        input.age || null,
        input.phone || null,
        input.address || null,
        input.preferredLanguage || null,
        input.preferredCheckInTime || null,
        input.healthNotes || null,
        user.role === 'customer' ? null : (input.status || null)
      ]
    );
    if (input.preferredCheckInTime || input.daysOfWeek) {
      const schedule = await client.query(
        `SELECT * FROM call_schedules WHERE elderly_id = $1 AND enabled = true ORDER BY created_at LIMIT 1`,
        [id]
      );
      const days = input.daysOfWeek || schedule.rows[0]?.days_of_week || [1, 2, 3, 4, 5, 6, 7];
      await client.query(
        `UPDATE call_schedules
         SET time_of_day = $2, days_of_week = $3, next_run_at = $4, updated_at = now()
         WHERE elderly_id = $1 AND enabled = true`,
        [id, time, days, nextRunAt(time, days)]
      );
    }
    await audit(client, {
      userId: user.id,
      action: 'elderly_updated',
      entityType: 'elderly_profile',
      entityId: id,
      details: {}
    });
    return updated.rows[0];
  });
}

export async function addContact(user, elderlyId, input) {
  return withTransaction(async (client) => {
    await getElderlyForUser(user, elderlyId, client);
    const { rows } = await client.query(
      `INSERT INTO emergency_contacts (
         elderly_id, full_name, phone, relationship, priority,
         notify_on_assistance, notify_on_emergency, notify_on_missed
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        elderlyId,
        input.fullName,
        input.phone,
        input.relationship || null,
        input.priority,
        input.notifyOnAssistance,
        input.notifyOnEmergency,
        input.notifyOnMissed
      ]
    );
    await audit(client, {
      userId: user.id,
      action: 'contact_added',
      entityType: 'emergency_contact',
      entityId: rows[0].id,
      details: { elderlyId }
    });
    return rows[0];
  });
}

export async function updateContact(user, id, input) {
  return withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM emergency_contacts WHERE id = $1', [id]);
    if (!found.rows[0]) throw httpError(404, 'Emergency contact not found');
    await getElderlyForUser(user, found.rows[0].elderly_id, client);
    const { rows } = await client.query(
      `UPDATE emergency_contacts SET
         full_name = COALESCE($2, full_name),
         phone = COALESCE($3, phone),
         relationship = COALESCE($4, relationship),
         priority = COALESCE($5, priority),
         notify_on_assistance = COALESCE($6, notify_on_assistance),
         notify_on_emergency = COALESCE($7, notify_on_emergency),
         notify_on_missed = COALESCE($8, notify_on_missed),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.fullName || null,
        input.phone || null,
        input.relationship || null,
        input.priority || null,
        input.notifyOnAssistance ?? null,
        input.notifyOnEmergency ?? null,
        input.notifyOnMissed ?? null
      ]
    );
    return rows[0];
  });
}

export async function deleteContact(user, id) {
  const found = await pool.query('SELECT * FROM emergency_contacts WHERE id = $1', [id]);
  if (!found.rows[0]) throw httpError(404, 'Emergency contact not found');
  await getElderlyForUser(user, found.rows[0].elderly_id);
  await pool.query('DELETE FROM emergency_contacts WHERE id = $1', [id]);
  await audit(pool, {
    userId: user.id,
    action: 'contact_deleted',
    entityType: 'emergency_contact',
    entityId: id,
    details: {}
  });
}
