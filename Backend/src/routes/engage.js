import { Router } from 'express';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { asyncHandler, httpError, validate } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { accessClause, present, presentAll } from '../util/present.js';
import { setAlertStatus } from '../services/alerts.js';
import { emitUpdate } from '../realtime.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { runSchedulerTick } from '../services/scheduler.js';
import { alertPatchSchema, settingsSchema, supportPatchSchema, supportSchema, systemSettingsSchema } from '../validators.js';

const router = Router();
router.use(requireAuth);

const FAQ = [
  { id: 'calls', question: 'How do wellness calls work?', answer: 'Suva Voice calls your loved one on their normal phone at the scheduled time. They do not need a smartphone app. They press 1 if they are okay, 2 if they need assistance, or 3 for an emergency.' },
  { id: 'missed', question: 'What happens if nobody answers?', answer: 'Suva Voice tries again based on the retry settings. After the final unanswered attempt it records a missed check-in and alerts you. A missed call is not treated as an emergency. If the person answers and still does not press a key after the message is repeated, Suva Voice records an emergency alert.' },
  { id: 'emergency', question: 'Who is contacted in an emergency?', answer: 'Pressing 3 creates an emergency alert, messages the first emergency contact, and notifies Suva Voice staff. Further contacts are messaged if the alert stays open. Suva Voice does not call public emergency services unless that has been configured.' },
  { id: 'orders', question: 'How do care orders work?', answer: 'You can request groceries, essential items, help with a doctor appointment, or transport. The care team reviews the order, assigns a provider, and updates delivery progress in the app.' },
  { id: 'payments', question: 'Are payments real charges?', answer: 'This installation uses a demo payment record. Amounts are shown in Sri Lankan rupees and no bank or card is charged.' }
];

router.get('/alerts', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'a.customer_id')];
  if (req.query.type) {
    params.push(req.query.type);
    where.push(`a.type = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`a.status = $${params.length}`);
  }
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`a.elderly_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT a.*, e.full_name AS elderly_name, e.phone AS elderly_phone
     FROM alerts a
     JOIN elderly_profiles e ON e.id = a.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.get('/alerts/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, e.full_name AS elderly_name, e.phone AS elderly_phone, e.customer_id
     FROM alerts a JOIN elderly_profiles e ON e.id = a.elderly_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw httpError(404, 'Alert not found');
  if (req.user.role === 'customer' && rows[0].customer_id !== req.user.customerId) {
    throw httpError(403, 'You do not have access to this alert');
  }
  const escalations = await query(
    `SELECT * FROM alert_escalations WHERE alert_id = $1 ORDER BY step, created_at`,
    [req.params.id]
  );
  res.json({ data: { ...present(rows[0]), escalations: presentAll(escalations.rows) } });
}));

router.patch('/alerts/:id', requireRole('admin', 'staff'), validate(alertPatchSchema), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM alerts WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!found.rows[0]) throw httpError(404, 'Alert not found');
    const updated = await setAlertStatus(client, found.rows[0], req.body.status, req.user.id);
    const owner = await client.query('SELECT user_id FROM customers WHERE id = $1', [updated.customer_id]);
    return { alert: updated, userId: owner.rows[0]?.user_id };
  });
  emitUpdate({ topic: 'alert', alertId: result.alert.id, status: result.alert.status }, [result.userId]);
  res.json({ data: present(result.alert) });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.user.role === 'customer') {
    params.push(req.user.id);
    where.push(`n.user_id = $${params.length}`);
  } else {
    where.push('TRUE');
  }
  if (req.query.channel) {
    params.push(req.query.channel);
    where.push(`n.channel = $${params.length}`);
  }
  if (req.query.type) {
    params.push(req.query.type);
    where.push(`n.type = $${params.length}`);
  }
  if (req.query.unread === '1') where.push(`n.read_at IS NULL AND n.channel = 'in_app'`);
  const { rows } = await query(
    `SELECT n.*, u.full_name AS user_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY n.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await query(
    `UPDATE notifications SET status = 'read', read_at = now(), updated_at = now()
     WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ data: { updated: true } });
}));

router.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  const params = [req.params.id];
  let scope = '';
  if (req.user.role === 'customer') {
    params.push(req.user.id);
    scope = `AND user_id = $2`;
  }
  const { rows } = await query(
    `UPDATE notifications SET status = 'read', read_at = now(), updated_at = now()
     WHERE id = $1 ${scope} RETURNING *`,
    params
  );
  if (!rows[0]) throw httpError(404, 'Notification not found');
  res.json({ data: present(rows[0]) });
}));

router.get('/support/faq', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const data = q ? FAQ.filter((item) => `${item.question} ${item.answer}`.toLowerCase().includes(q)) : FAQ;
  res.json({ data });
});

router.get('/support', asyncHandler(async (req, res) => {
  const params = [];
  const where = req.user.role === 'customer' ? (params.push(req.user.id), [`user_id = $1`]) : ['TRUE'];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT s.*, u.full_name, u.email
     FROM support_requests s JOIN users u ON u.id = s.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.created_at DESC`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/support', validate(supportSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO support_requests (user_id, subject, message) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, req.body.subject, req.body.message]
  );
  res.status(201).json({ data: present(rows[0]) });
}));

router.patch('/support/:id', requireRole('admin', 'staff'), validate(supportPatchSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE support_requests SET
       status = COALESCE($2, status),
       staff_response = COALESCE($3, staff_response),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [req.params.id, req.body.status || null, req.body.staffResponse || null]
  );
  if (!rows[0]) throw httpError(404, 'Support request not found');
  res.json({ data: present(rows[0]) });
}));

router.get('/settings/me', asyncHandler(async (req, res) => {
  if (!req.user.customerId) return res.json({ data: { role: req.user.role } });
  const { rows } = await query('SELECT * FROM customers WHERE id = $1', [req.user.customerId]);
  res.json({ data: present(rows[0]) });
}));

router.patch('/settings/me', validate(settingsSchema), asyncHandler(async (req, res) => {
  if (!req.user.customerId) throw httpError(403, 'Family settings are available on a customer account');
  const { rows } = await query(
    `UPDATE customers SET
       notify_missed = COALESCE($2, notify_missed),
       notify_checkins = COALESCE($3, notify_checkins),
       notify_orders = COALESCE($4, notify_orders),
       notify_payments = COALESCE($5, notify_payments),
       notify_reminders = COALESCE($6, notify_reminders),
       preferred_language = COALESCE($7, preferred_language),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.user.customerId,
      req.body.notifyMissed ?? null,
      req.body.notifyCheckins ?? null,
      req.body.notifyOrders ?? null,
      req.body.notifyPayments ?? null,
      req.body.notifyReminders ?? null,
      req.body.preferredLanguage || null
    ]
  );
  res.json({ data: present(rows[0]) });
}));

router.get('/settings/system', requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  res.json({ data: present(await getSettings()) });
}));

router.patch('/settings/system', requireRole('admin'), validate(systemSettingsSchema), asyncHandler(async (req, res) => {
  res.json({ data: present(await updateSettings(req.body)) });
}));

router.post('/system/scheduler/tick', requireRole('admin'), asyncHandler(async (req, res) => {
  if (!config.demoMode) throw httpError(403, 'Manual scheduler runs are available in demo mode');
  res.json({ data: await runSchedulerTick({ force: true }) });
}));

router.get('/system/voice-status', requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  try {
    const response = await fetch(`${config.localServerUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await response.json();
    res.json({ data: { online: response.ok, ...body.data, asteriskEnabled: config.asteriskEnabled } });
  } catch {
    res.json({ data: { online: false, asteriskEnabled: config.asteriskEnabled } });
  }
}));

export default router;
