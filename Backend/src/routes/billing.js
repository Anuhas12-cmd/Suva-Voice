import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, httpError, validate } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { accessClause, present, presentAll } from '../util/present.js';
import { changePlan, payForOrder, recordPayment, savePlan } from '../services/billing.js';
import { paymentSchema, planPatchSchema, planSchema, subscribeSchema } from '../validators.js';

const router = Router();
router.use(requireAuth);

router.get('/payments', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'p.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`p.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT p.*, u.full_name AS customer_name
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC
     LIMIT 200`,
    params
  );
  const total = rows.filter((row) => row.status === 'successful').reduce((sum, row) => sum + Number(row.amount), 0);
  res.json({ data: presentAll(rows), meta: { successfulTotal: Math.round(total * 100) / 100 } });
}));

router.post('/payments', validate(paymentSchema), asyncHandler(async (req, res) => {
  if (req.body.orderId && !req.body.customerId) {
    const payment = await payForOrder(req.user, { orderId: req.body.orderId, simulate: req.body.status });
    return res.status(201).json({ data: present(payment) });
  }
  if (req.user.role === 'customer') throw httpError(403, 'Choose an order to pay');
  if (!req.body.customerId || !req.body.service || req.body.amount === undefined) {
    throw httpError(400, 'Customer, service, and amount are required');
  }
  const payment = await recordPayment(req.user, req.body);
  return res.status(201).json({ data: present(payment) });
}));

router.get('/subscriptions/plans', asyncHandler(async (req, res) => {
  const activeOnly = req.user.role === 'customer' || req.query.active === 'true';
  const { rows } = await query(
    `SELECT * FROM subscription_plans ${activeOnly ? 'WHERE active = true' : ''} ORDER BY price_lkr`
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/subscriptions/plans', requireRole('admin'), validate(planSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ data: present(await savePlan(req.body)) });
}));

router.patch('/subscriptions/plans/:id', requireRole('admin'), validate(planPatchSchema), asyncHandler(async (req, res) => {
  res.json({ data: present(await savePlan(req.body, req.params.id)) });
}));

router.get('/subscriptions/plans/:id/subscribers', requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, u.full_name, u.email, u.phone
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE s.plan_id = $1 AND s.status = 'active'
     ORDER BY u.full_name`,
    [req.params.id]
  );
  res.json({ data: presentAll(rows) });
}));

router.get('/subscriptions/current', asyncHandler(async (req, res) => {
  if (!req.user.customerId) throw httpError(403, 'A family account is required');
  const { rows } = await query(
    `SELECT s.*, p.name, p.code, p.description, p.price_lkr, p.billing_period, p.services, p.demo_pricing
     FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     WHERE s.customer_id = $1 AND s.status = 'active'`,
    [req.user.customerId]
  );
  res.json({ data: present(rows[0]) });
}));

router.get('/subscriptions', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 's.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`s.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT s.*, p.name AS plan_name, p.code AS plan_code, p.price_lkr, p.services, u.full_name AS customer_name
     FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     JOIN customers c ON c.id = s.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.created_at DESC`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/subscriptions', requireRole('customer'), validate(subscribeSchema), asyncHandler(async (req, res) => {
  const result = await changePlan(req.user, req.body.planId);
  res.status(201).json({
    data: {
      subscription: present(result.subscription),
      payment: present(result.payment),
      plan: present(result.plan)
    }
  });
}));

export default router;
