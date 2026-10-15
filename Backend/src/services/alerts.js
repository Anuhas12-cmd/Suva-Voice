import { send, notifyAdmins } from './notify.js';
import { audit } from '../util/audit.js';

async function loadContext(client, elderlyId) {
  const { rows } = await client.query(
    `SELECT e.id, e.full_name, e.customer_id, c.user_id, c.notify_missed, u.email
     FROM elderly_profiles e
     JOIN customers c ON c.id = e.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE e.id = $1`,
    [elderlyId]
  );
  return rows[0];
}

export async function refreshElderlyStatus(client, elderlyId) {
  const { rows } = await client.query(
    `SELECT type FROM alerts WHERE elderly_id = $1 AND status <> 'resolved'`,
    [elderlyId]
  );
  const types = new Set(rows.map((row) => row.type));
  let status = 'all_good';
  if (types.has('emergency')) status = 'emergency';
  else if (types.has('assistance')) status = 'assistance_required';
  else if (types.has('missed_checkin')) status = 'missed_checkin';
  await client.query(
    `UPDATE elderly_profiles SET status = $2, updated_at = now() WHERE id = $1`,
    [elderlyId, status]
  );
  return status;
}

async function recordEscalation(client, { alertId, contact, step, notificationId }) {
  await client.query(
    `INSERT INTO alert_escalations (
       alert_id, contact_id, step, channel, recipient_name, recipient_address, notification_id
     ) VALUES ($1,$2,$3,'sms',$4,$5,$6)`,
    [alertId, contact?.id || null, step, contact?.full_name || null, contact?.phone || null, notificationId || null]
  );
}

async function messageCustomer(client, ctx, alert, title) {
  await send(client, {
    userId: ctx.user_id,
    audience: 'customer',
    channel: 'in_app',
    title,
    body: alert.message,
    type: alert.type,
    relatedType: 'alert',
    relatedId: alert.id
  });
  await send(client, {
    userId: ctx.user_id,
    audience: 'customer',
    channel: 'email',
    recipientAddress: ctx.email,
    title: `Suva Voice: ${title}`,
    body: alert.message,
    type: alert.type,
    relatedType: 'alert',
    relatedId: alert.id
  });
}

export async function raiseAlert(client, { elderlyId, customerId, callId, type, title, message }) {
  const existing = await client.query(
    `SELECT * FROM alerts WHERE call_id = $1 AND type = $2`,
    [callId, type]
  );
  if (existing.rows[0]) {
    const ctx = await loadContext(client, elderlyId);
    return { alert: existing.rows[0], created: false, customerUserId: ctx?.user_id };
  }
  const inserted = await client.query(
    `INSERT INTO alerts (elderly_id, customer_id, call_id, type, title, message, escalation_step)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [elderlyId, customerId, callId, type, title, message, type === 'emergency' ? 1 : 0]
  );
  const alert = inserted.rows[0];
  const ctx = await loadContext(client, elderlyId);
  const { rows: contacts } = await client.query(
    `SELECT * FROM emergency_contacts WHERE elderly_id = $1 ORDER BY priority ASC, created_at ASC`,
    [elderlyId]
  );

  if (type === 'emergency') {
    await messageCustomer(client, ctx, alert, 'Emergency alert');
    const first = contacts.find((contact) => contact.notify_on_emergency) || contacts[0];
    if (first) {
      const note = await send(client, {
        audience: 'contact',
        channel: 'sms',
        recipientAddress: first.phone,
        title: 'Suva Voice Alert',
        body: `Suva Voice Alert: Emergency response received from ${ctx.full_name}. Please contact them immediately.`,
        type: 'emergency',
        relatedType: 'alert',
        relatedId: alert.id
      });
      await recordEscalation(client, { alertId: alert.id, contact: first, step: 1, notificationId: note.id });
    }
    await notifyAdmins(client, {
      title: 'Emergency alert',
      body: alert.message,
      type: 'emergency',
      relatedType: 'alert',
      relatedId: alert.id
    });
  } else if (type === 'assistance') {
    await messageCustomer(client, ctx, alert, 'Assistance requested');
    let step = 0;
    for (const contact of contacts.filter((item) => item.notify_on_assistance)) {
      step += 1;
      const note = await send(client, {
        audience: 'contact',
        channel: 'sms',
        recipientAddress: contact.phone,
        title: 'Suva Voice Alert',
        body: `Suva Voice Alert: ${ctx.full_name} has requested assistance. Please check on them as soon as you can.`,
        type: 'assistance',
        relatedType: 'alert',
        relatedId: alert.id
      });
      await recordEscalation(client, { alertId: alert.id, contact, step, notificationId: note.id });
    }
    await notifyAdmins(client, {
      title: 'Assistance requested',
      body: alert.message,
      type: 'assistance',
      relatedType: 'alert',
      relatedId: alert.id
    });
  } else {
    if (ctx.notify_missed) {
      await messageCustomer(client, ctx, alert, 'Missed check-in');
    }
    let step = 0;
    for (const contact of contacts.filter((item) => item.notify_on_missed)) {
      step += 1;
      const note = await send(client, {
        audience: 'contact',
        channel: 'sms',
        recipientAddress: contact.phone,
        title: 'Suva Voice',
        body: `Suva Voice: We could not reach ${ctx.full_name} for the scheduled wellness check-in.`,
        type: 'missed_checkin',
        relatedType: 'alert',
        relatedId: alert.id
      });
      await recordEscalation(client, { alertId: alert.id, contact, step, notificationId: note.id });
    }
    await notifyAdmins(client, {
      title: 'Missed check-in',
      body: alert.message,
      type: 'missed_checkin',
      relatedType: 'alert',
      relatedId: alert.id
    });
  }

  await refreshElderlyStatus(client, elderlyId);
  await audit(client, {
    userId: null,
    action: 'alert_opened',
    entityType: 'alert',
    entityId: alert.id,
    details: { type, elderlyId, callId }
  });
  return { alert, created: true, customerUserId: ctx.user_id };
}

export async function processEscalations(client, delaySeconds) {
  const { rows } = await client.query(
    `SELECT a.*, e.full_name
     FROM alerts a
     JOIN elderly_profiles e ON e.id = a.elderly_id
     WHERE a.type = 'emergency' AND a.status IN ('new', 'reviewing')`
  );
  let count = 0;
  for (const alert of rows) {
    const next = await client.query(
      `SELECT ec.*
       FROM emergency_contacts ec
       WHERE ec.elderly_id = $1
         AND ec.notify_on_emergency = true
         AND NOT EXISTS (
           SELECT 1 FROM alert_escalations ae
           WHERE ae.alert_id = $2 AND ae.contact_id = ec.id
         )
       ORDER BY ec.priority ASC, ec.created_at ASC
       LIMIT 1`,
      [alert.elderly_id, alert.id]
    );
    const contact = next.rows[0];
    if (!contact) continue;
    const last = await client.query(
      `SELECT max(created_at) AS last_at, count(*)::int AS steps
       FROM alert_escalations WHERE alert_id = $1`,
      [alert.id]
    );
    if (last.rows[0].last_at) {
      const due = new Date(last.rows[0].last_at).getTime() + Number(delaySeconds) * 1000;
      if (Date.now() < due) continue;
    }
    const note = await send(client, {
      audience: 'contact',
      channel: 'sms',
      recipientAddress: contact.phone,
      title: 'Suva Voice Alert',
      body: `Suva Voice Alert: Emergency response received from ${alert.full_name}. Please contact them immediately.`,
      type: 'emergency',
      relatedType: 'alert',
      relatedId: alert.id
    });
    const step = Number(last.rows[0].steps) + 1;
    await recordEscalation(client, { alertId: alert.id, contact, step, notificationId: note.id });
    await client.query(
      `UPDATE alerts SET escalation_step = $2, updated_at = now() WHERE id = $1`,
      [alert.id, step]
    );
    count += 1;
  }
  return count;
}

export async function setAlertStatus(client, alert, status, userId) {
  const resolved = status === 'resolved';
  const { rows } = await client.query(
    `UPDATE alerts SET
       status = $2,
       resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
       resolved_by = CASE WHEN $2 = 'resolved' THEN $3::uuid ELSE NULL END,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [alert.id, status, resolved ? userId : null]
  );
  await refreshElderlyStatus(client, alert.elderly_id);
  await audit(client, {
    userId,
    action: 'alert_status',
    entityType: 'alert',
    entityId: alert.id,
    details: { status }
  });
  return rows[0];
}
