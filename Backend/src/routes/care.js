import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, httpError, validate } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { accessClause, pageParams, present, presentAll, searchTerm } from '../util/present.js';
import { getElderlyForUser } from '../services/profiles.js';
import { reminderPromptId, resolveAudio } from '../services/audioLibrary.js';
import { createOrder, updateOrder } from '../services/orders.js';
import { audit } from '../util/audit.js';
import {
  appointmentPatchSchema,
  orderPatchSchema,
  orderSchema,
  providerPatchSchema,
  providerSchema,
  reminderPatchSchema,
  reminderSchema,
  transportPatchSchema
} from '../validators.js';

const router = Router();
router.use(requireAuth);

router.get('/reminders', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'r.customer_id')];
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`r.elderly_id = $${params.length}`);
  }
  if (req.query.type) {
    params.push(req.query.type);
    where.push(`r.type = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT r.*, e.full_name AS elderly_name
     FROM reminders r
     JOIN elderly_profiles e ON e.id = r.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY r.time_of_day`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.get('/reminders/:id/prompt', asyncHandler(async (req, res) => {
  const found = await query(
    `SELECT r.type, r.elderly_id, e.preferred_language
     FROM reminders r
     JOIN elderly_profiles e ON e.id = r.elderly_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (!found.rows[0]) throw httpError(404, 'Reminder not found');
  await getElderlyForUser(req.user, found.rows[0].elderly_id);
  const language = ['en', 'si', 'ta'].includes(found.rows[0].preferred_language) ? found.rows[0].preferred_language : null;
  const promptId = reminderPromptId(found.rows[0].type);
  if (!language || !promptId) {
    return res.status(404).json({ error: { message: 'This reminder has no recognised language, so no audio was played' } });
  }
  const audio = resolveAudio(promptId, language);
  res.setHeader('Content-Type', audio.contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(audio.file);
}));

router.post('/reminders', validate(reminderSchema), asyncHandler(async (req, res) => {
  const elderly = await getElderlyForUser(req.user, req.body.elderlyId);
  const { rows } = await query(
    `INSERT INTO reminders (elderly_id, customer_id, type, title, notes, time_of_day, days_of_week, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      elderly.id,
      elderly.customer_id,
      req.body.type,
      req.body.title,
      req.body.notes || null,
      req.body.timeOfDay,
      req.body.daysOfWeek,
      req.body.enabled
    ]
  );
  res.status(201).json({ data: present(rows[0]) });
}));

router.patch('/reminders/:id', validate(reminderPatchSchema), asyncHandler(async (req, res) => {
  const found = await query('SELECT * FROM reminders WHERE id = $1', [req.params.id]);
  if (!found.rows[0]) throw httpError(404, 'Reminder not found');
  await getElderlyForUser(req.user, found.rows[0].elderly_id);
  const { rows } = await query(
    `UPDATE reminders SET
       type = COALESCE($2, type),
       title = COALESCE($3, title),
       notes = COALESCE($4, notes),
       time_of_day = COALESCE($5, time_of_day),
       days_of_week = COALESCE($6, days_of_week),
       enabled = COALESCE($7, enabled),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      req.body.type || null,
      req.body.title || null,
      req.body.notes || null,
      req.body.timeOfDay || null,
      req.body.daysOfWeek || null,
      req.body.enabled ?? null
    ]
  );
  res.json({ data: present(rows[0]) });
}));

router.delete('/reminders/:id', asyncHandler(async (req, res) => {
  const found = await query('SELECT * FROM reminders WHERE id = $1', [req.params.id]);
  if (!found.rows[0]) throw httpError(404, 'Reminder not found');
  await getElderlyForUser(req.user, found.rows[0].elderly_id);
  await query('DELETE FROM reminders WHERE id = $1', [req.params.id]);
  res.json({ data: { deleted: true } });
}));

router.get('/care-orders', asyncHandler(async (req, res) => {
  res.json(await listOrders(req));
}));

router.get('/deliveries', asyncHandler(async (req, res) => {
  req.query.delivery = '1';
  res.json(await listOrders(req));
}));

router.post('/care-orders', validate(orderSchema), asyncHandler(async (req, res) => {
  const order = await createOrder(req.user, req.body);
  res.status(201).json({ data: await orderDetail(order.id, req.user) });
}));

router.get('/care-orders/:id', asyncHandler(async (req, res) => {
  res.json({ data: await orderDetail(req.params.id, req.user) });
}));

router.patch('/care-orders/:id', validate(orderPatchSchema), asyncHandler(async (req, res) => {
  await updateOrder(req.user, req.params.id, {
    ...req.body,
    estimatedArrival: req.body.estimatedArrival ? new Date(req.body.estimatedArrival) : req.body.estimatedArrival
  });
  res.json({ data: await orderDetail(req.params.id, req.user) });
}));

router.get('/doctor-appointments', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'd.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`d.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT d.*, e.full_name AS elderly_name, p.name AS provider_name, o.order_number
     FROM doctor_appointments d
     JOIN elderly_profiles e ON e.id = d.elderly_id
     LEFT JOIN service_providers p ON p.id = d.provider_id
     LEFT JOIN care_orders o ON o.id = d.care_order_id
     WHERE ${where.join(' AND ')}
     ORDER BY d.preferred_date NULLS LAST, d.created_at DESC`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.patch('/doctor-appointments/:id', requireRole('admin', 'staff'), validate(appointmentPatchSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE doctor_appointments SET
       preferred_date = COALESCE($2, preferred_date),
       preferred_time = COALESCE($3, preferred_time),
       doctor_or_hospital = COALESCE($4, doctor_or_hospital),
       notes = COALESCE($5, notes),
       status = COALESCE($6, status),
       provider_id = COALESCE($7, provider_id),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      req.body.preferredDate || null,
      req.body.preferredTime || null,
      req.body.doctorOrHospital || null,
      req.body.notes || null,
      req.body.status || null,
      req.body.providerId || null
    ]
  );
  if (!rows[0]) throw httpError(404, 'Appointment not found');
  if (rows[0].care_order_id && req.body.status) {
    const orderStatus = req.body.status === 'scheduled' ? 'accepted' : req.body.status === 'cancelled' ? 'cancelled' : req.body.status === 'completed' ? 'completed' : null;
    if (orderStatus) await updateOrder(req.user, rows[0].care_order_id, { status: orderStatus, providerId: req.body.providerId });
  }
  await audit({ query }, { userId: req.user.id, action: 'appointment_updated', entityType: 'doctor_appointment', entityId: req.params.id, details: { status: rows[0].status } });
  res.json({ data: present(rows[0]) });
}));

router.get('/transport', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 't.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`t.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT t.*, e.full_name AS elderly_name, p.name AS provider_name, o.order_number
     FROM transport_requests t
     JOIN elderly_profiles e ON e.id = t.elderly_id
     LEFT JOIN service_providers p ON p.id = t.provider_id
     LEFT JOIN care_orders o ON o.id = t.care_order_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.travel_date NULLS LAST, t.created_at DESC`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.patch('/transport/:id', requireRole('admin', 'staff'), validate(transportPatchSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE transport_requests SET
       pickup_location = COALESCE($2, pickup_location),
       destination = COALESCE($3, destination),
       travel_date = COALESCE($4, travel_date),
       travel_time = COALESCE($5, travel_time),
       notes = COALESCE($6, notes),
       status = COALESCE($7, status),
       provider_id = COALESCE($8, provider_id),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      req.body.pickupLocation || null,
      req.body.destination || null,
      req.body.travelDate || null,
      req.body.travelTime || null,
      req.body.notes || null,
      req.body.status || null,
      req.body.providerId || null
    ]
  );
  if (!rows[0]) throw httpError(404, 'Transport request not found');
  res.json({ data: present(rows[0]) });
}));

router.get('/service-providers', asyncHandler(async (req, res) => {
  const params = [];
  const where = ['TRUE'];
  if (req.query.serviceType) {
    params.push(req.query.serviceType);
    where.push(`service_type = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`status = $${params.length}`);
  }
  const q = searchTerm(req.query.q);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT * FROM service_providers WHERE ${where.join(' AND ')} ORDER BY name`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/service-providers', requireRole('admin', 'staff'), validate(providerSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO service_providers (name, contact_name, phone, email, service_type, availability, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.body.name, req.body.contactName || null, req.body.phone || null, req.body.email || null, req.body.serviceType, req.body.availability || null, req.body.status]
  );
  res.status(201).json({ data: present(rows[0]) });
}));

router.patch('/service-providers/:id', requireRole('admin', 'staff'), validate(providerPatchSchema), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE service_providers SET
       name = COALESCE($2, name),
       contact_name = COALESCE($3, contact_name),
       phone = COALESCE($4, phone),
       email = COALESCE($5, email),
       service_type = COALESCE($6, service_type),
       availability = COALESCE($7, availability),
       status = COALESCE($8, status),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      req.body.name || null,
      req.body.contactName || null,
      req.body.phone || null,
      req.body.email || null,
      req.body.serviceType || null,
      req.body.availability || null,
      req.body.status || null
    ]
  );
  if (!rows[0]) throw httpError(404, 'Provider not found');
  res.json({ data: present(rows[0]) });
}));

async function listOrders(req) {
  const params = [];
  const where = [accessClause(req.user, params, 'o.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`o.status = $${params.length}`);
  }
  if (req.query.type) {
    params.push(req.query.type);
    where.push(`o.type = $${params.length}`);
  }
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`o.elderly_id = $${params.length}`);
  }
  if (req.query.delivery === '1') {
    where.push(`o.status IN ('accepted', 'processing', 'out_for_delivery', 'completed')`);
  }
  const q = searchTerm(req.query.q);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(o.order_number ILIKE $${params.length} OR e.full_name ILIKE $${params.length})`);
  }
  const { limit, offset } = pageParams(req);
  const { rows } = await query(
    `SELECT o.*, e.full_name AS elderly_name, p.name AS provider_name,
            (SELECT stage FROM delivery_events de WHERE de.order_id = o.id ORDER BY de.created_at DESC LIMIT 1) AS current_stage
     FROM care_orders o
     JOIN elderly_profiles e ON e.id = o.elderly_id
     LEFT JOIN service_providers p ON p.id = o.provider_id
     WHERE ${where.join(' AND ')}
     ORDER BY o.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { data: presentAll(rows) };
}

async function orderDetail(id, user) {
  const { rows } = await query(
    `SELECT o.*, e.full_name AS elderly_name, e.phone AS elderly_phone, p.name AS provider_name, p.phone AS provider_phone
     FROM care_orders o
     JOIN elderly_profiles e ON e.id = o.elderly_id
     LEFT JOIN service_providers p ON p.id = o.provider_id
     WHERE o.id = $1`,
    [id]
  );
  if (!rows[0]) throw httpError(404, 'Order not found');
  if (user.role === 'customer' && rows[0].customer_id !== user.customerId) {
    throw httpError(403, 'You do not have access to this order');
  }
  const [items, events, doctor, transport, payments] = await Promise.all([
    query('SELECT * FROM care_order_items WHERE order_id = $1 ORDER BY name', [id]),
    query('SELECT * FROM delivery_events WHERE order_id = $1 ORDER BY created_at', [id]),
    query('SELECT * FROM doctor_appointments WHERE care_order_id = $1', [id]),
    query('SELECT * FROM transport_requests WHERE care_order_id = $1', [id]),
    query('SELECT id, amount, status, transaction_ref, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC', [id])
  ]);
  return {
    ...present(rows[0]),
    items: presentAll(items.rows),
    events: presentAll(events.rows),
    doctor: present(doctor.rows[0]),
    transport: present(transport.rows[0]),
    payments: presentAll(payments.rows)
  };
}

export default router;
