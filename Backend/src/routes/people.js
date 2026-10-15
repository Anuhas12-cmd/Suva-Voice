import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { asyncHandler, httpError, validate } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { accessClause, pageParams, present, presentAll, searchTerm } from '../util/present.js';
import {
  addContact,
  createElderly,
  deleteContact,
  getElderlyForUser,
  updateContact,
  updateElderly
} from '../services/profiles.js';
import {
  accountStatusSchema,
  contactPatchSchema,
  contactSchema,
  elderlyPatchSchema,
  elderlySchema,
  staffSchema
} from '../validators.js';

const router = Router();
const owned = [/^\/users(\/|$)/, /^\/customers(\/|$)/, /^\/elderly(\/|$)/, /^\/emergency-contacts(\/|$)/];
router.use((req, res, next) => {
  if (!owned.some((pattern) => pattern.test(req.path))) return next();
  return requireAuth(req, res, next);
});

router.get('/users', requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, full_name, email, phone, role, status, email_verified, last_login_at, created_at
     FROM users
     WHERE role IN ('admin', 'staff')
     ORDER BY full_name`
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/users', requireRole('admin'), validate(staffSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status, email_verified)
     VALUES ($1,$2,$3,$4,$5,'active',true)
     RETURNING id, full_name, email, phone, role, status, created_at`,
    [req.body.fullName, req.body.email, req.body.phone, await bcrypt.hash(req.body.password, 10), req.body.role]
  );
  res.status(201).json({ data: present(rows[0]) });
}));

router.get('/customers/me', requireRole('customer'), asyncHandler(async (req, res) => {
  const { rows } = await query(`${customerSql} WHERE c.id = $1`, [req.user.customerId]);
  res.json({ data: present(rows[0]) });
}));

router.get('/customers', requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const params = [];
  const where = ['TRUE'];
  const q = searchTerm(req.query.q);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`u.status = $${params.length}`);
  }
  const { limit, offset } = pageParams(req);
  const { rows } = await query(
    `${customerSql} WHERE ${where.join(' AND ')} ORDER BY u.full_name LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const total = await query(
    `SELECT count(*)::int AS total FROM customers c JOIN users u ON u.id = c.user_id WHERE ${where.join(' AND ')}`,
    params
  );
  res.json({ data: presentAll(rows), meta: { total: total.rows[0].total } });
}));

router.get('/customers/:id', requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const { rows } = await query(`${customerSql} WHERE c.id = $1`, [req.params.id]);
  if (!rows[0]) throw httpError(404, 'Customer not found');
  const [elderly, orders, payments] = await Promise.all([
    query(
      `SELECT id, full_name, age, phone, status, preferred_checkin_time
       FROM elderly_profiles WHERE customer_id = $1 ORDER BY full_name`,
      [req.params.id]
    ),
    query(
      `SELECT id, order_number, type, status, total_amount, created_at
       FROM care_orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [req.params.id]
    ),
    query(
      `SELECT id, service_label, amount, status, transaction_ref, created_at
       FROM payments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [req.params.id]
    )
  ]);
  res.json({
    data: {
      ...present(rows[0]),
      elderly: presentAll(elderly.rows),
      orders: presentAll(orders.rows),
      payments: presentAll(payments.rows)
    }
  });
}));

router.patch('/customers/:id/status', requireRole('admin'), validate(accountStatusSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE users u SET status = $2, updated_at = now()
     FROM customers c
     WHERE c.user_id = u.id AND c.id = $1 AND u.role = 'customer'
     RETURNING u.id, u.status`,
    [req.params.id, req.body.status]
  );
  if (!rows[0]) throw httpError(404, 'Customer not found');
  res.json({ data: present(rows[0]) });
}));

router.get('/elderly', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'e.customer_id')];
  const q = searchTerm(req.query.q);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(e.full_name ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`e.status = $${params.length}`);
  }
  if (req.query.customerId && (req.user.role === 'admin' || req.user.role === 'staff')) {
    params.push(req.query.customerId);
    where.push(`e.customer_id = $${params.length}`);
  }
  const { limit, offset } = pageParams(req);
  const { rows } = await query(
    `${elderlySql} WHERE ${where.join(' AND ')} ORDER BY e.full_name LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/elderly', validate(elderlySchema), asyncHandler(async (req, res) => {
  const created = await createElderly(req.user, req.body);
  res.status(201).json({ data: present(created) });
}));

router.get('/elderly/:id', asyncHandler(async (req, res) => {
  await getElderlyForUser(req.user, req.params.id);
  const { rows } = await query(`${elderlySql} WHERE e.id = $1`, [req.params.id]);
  const [contacts, schedule, calls, reminders, alerts, orders] = await Promise.all([
    query('SELECT * FROM emergency_contacts WHERE elderly_id = $1 ORDER BY priority, created_at', [req.params.id]),
    query('SELECT * FROM call_schedules WHERE elderly_id = $1 ORDER BY enabled DESC, time_of_day', [req.params.id]),
    query(
      `SELECT id, started_at, status, result_code, duration_seconds, attempt_number, callee_name
       FROM call_records WHERE elderly_id = $1 ORDER BY started_at DESC LIMIT 12`,
      [req.params.id]
    ),
    query('SELECT * FROM reminders WHERE elderly_id = $1 ORDER BY time_of_day', [req.params.id]),
    query('SELECT * FROM alerts WHERE elderly_id = $1 ORDER BY created_at DESC LIMIT 8', [req.params.id]),
    query(
      `SELECT id, order_number, type, status, total_amount, created_at
       FROM care_orders WHERE elderly_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [req.params.id]
    )
  ]);
  res.json({
    data: {
      ...present(rows[0]),
      contacts: presentAll(contacts.rows),
      schedules: presentAll(schedule.rows),
      calls: presentAll(calls.rows),
      reminders: presentAll(reminders.rows),
      alerts: presentAll(alerts.rows),
      orders: presentAll(orders.rows)
    }
  });
}));

router.patch('/elderly/:id', validate(elderlyPatchSchema), asyncHandler(async (req, res) => {
  const updated = await updateElderly(req.user, req.params.id, req.body);
  res.json({ data: present(updated) });
}));

router.get('/emergency-contacts', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'e.customer_id')];
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`ec.elderly_id = $${params.length}`);
  }
  const q = searchTerm(req.query.q);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(ec.full_name ILIKE $${params.length} OR ec.phone ILIKE $${params.length} OR e.full_name ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT ec.*, e.full_name AS elderly_name, e.customer_id
     FROM emergency_contacts ec
     JOIN elderly_profiles e ON e.id = ec.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.full_name, ec.priority`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/elderly/:id/emergency-contacts', validate(contactSchema), asyncHandler(async (req, res) => {
  const created = await addContact(req.user, req.params.id, req.body);
  res.status(201).json({ data: present(created) });
}));

router.patch('/emergency-contacts/:id', validate(contactPatchSchema), asyncHandler(async (req, res) => {
  const updated = await updateContact(req.user, req.params.id, req.body);
  res.json({ data: present(updated) });
}));

router.delete('/emergency-contacts/:id', asyncHandler(async (req, res) => {
  await deleteContact(req.user, req.params.id);
  res.json({ data: { deleted: true } });
}));

const customerSql = `
  SELECT c.*, u.full_name, u.email, u.phone, u.status, u.role, u.created_at AS registered_at,
         (SELECT count(*)::int FROM elderly_profiles e WHERE e.customer_id = c.id) AS elderly_count,
         p.name AS plan_name, s.status AS subscription_status
  FROM customers c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status = 'active'
  LEFT JOIN subscription_plans p ON p.id = s.plan_id
`;

const elderlySql = `
  SELECT e.*, cu.full_name AS customer_name, cu.phone AS customer_phone,
         (SELECT cr.result_code FROM call_records cr WHERE cr.elderly_id = e.id ORDER BY cr.started_at DESC LIMIT 1) AS last_result,
         (SELECT cr.status FROM call_records cr WHERE cr.elderly_id = e.id ORDER BY cr.started_at DESC LIMIT 1) AS last_call_status,
         (SELECT cr.started_at FROM call_records cr WHERE cr.elderly_id = e.id ORDER BY cr.started_at DESC LIMIT 1) AS last_call_at
  FROM elderly_profiles e
  JOIN customers c ON c.id = e.customer_id
  JOIN users cu ON cu.id = c.user_id
`;

export default router;
