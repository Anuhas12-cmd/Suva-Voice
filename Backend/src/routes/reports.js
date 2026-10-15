import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { accessClause, addDateRange, present, presentAll, searchTerm } from '../util/present.js';
import { greeting } from '../util/time.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', asyncHandler(async (req, res) => {
  if (req.user.role === 'customer') {
    return res.json({ data: await customerDashboard(req.user) });
  }
  return res.json({ data: await adminDashboard(req.query.customerId || null) });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const q = searchTerm(req.query.q);
  if (!q) return res.json({ data: [] });
  const like = `%${q}%`;
  const params = [like];
  const customerScope = req.user.role === 'customer' ? req.user.customerId : null;
  params.push(customerScope);
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'customer' AS kind, c.id, u.full_name AS label, u.phone AS detail, c.id AS customer_id
       FROM customers c JOIN users u ON u.id = c.user_id
       WHERE (u.full_name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)
         AND ($2::uuid IS NULL OR c.id = $2)
       UNION ALL
       SELECT 'elderly', e.id, e.full_name, e.phone, e.customer_id
       FROM elderly_profiles e
       WHERE (e.full_name ILIKE $1 OR e.phone ILIKE $1)
         AND ($2::uuid IS NULL OR e.customer_id = $2)
       UNION ALL
       SELECT 'order', o.id, o.order_number, o.status, o.customer_id
       FROM care_orders o
       WHERE o.order_number ILIKE $1
         AND ($2::uuid IS NULL OR o.customer_id = $2)
     ) results
     LIMIT 20`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.get('/reports/:type', asyncHandler(async (req, res) => {
  const type = req.params.type;
  const handlers = {
    calls: reportCalls,
    'missed-calls': (req2) => reportCalls(req2, ['missed', 'no_answer']),
    alerts: reportAlerts,
    emergencies: (req2) => reportAlerts(req2, 'emergency'),
    orders: reportOrders,
    'service-requests': reportOrders,
    payments: reportPayments,
    subscriptions: reportSubscriptions
  };
  const handler = handlers[type];
  if (!handler) throw httpError(404, 'Report not found');
  res.json({ data: await handler(req) });
}));

async function customerDashboard(user) {
  const [profile, loved, reminders, alerts, orders, unread, today] = await Promise.all([
    query('SELECT full_name FROM users WHERE id = $1', [user.id]),
    query(
      `SELECT e.*,
         (SELECT cr.result_code FROM call_records cr WHERE cr.elderly_id = e.id ORDER BY cr.started_at DESC LIMIT 1) AS last_result,
         (SELECT cr.started_at FROM call_records cr WHERE cr.elderly_id = e.id ORDER BY cr.started_at DESC LIMIT 1) AS last_call_at
       FROM elderly_profiles e WHERE e.customer_id = $1 ORDER BY e.full_name`,
      [user.customerId]
    ),
    query(
      `SELECT r.*, e.full_name AS elderly_name
       FROM reminders r JOIN elderly_profiles e ON e.id = r.elderly_id
       WHERE r.customer_id = $1 AND r.enabled = true
       ORDER BY r.time_of_day LIMIT 5`,
      [user.customerId]
    ),
    query(
      `SELECT a.*, e.full_name AS elderly_name
       FROM alerts a JOIN elderly_profiles e ON e.id = a.elderly_id
       WHERE a.customer_id = $1 ORDER BY a.created_at DESC LIMIT 5`,
      [user.customerId]
    ),
    query(
      `SELECT o.*, e.full_name AS elderly_name
       FROM care_orders o JOIN elderly_profiles e ON e.id = o.elderly_id
       WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 4`,
      [user.customerId]
    ),
    query(
      `SELECT count(*)::int AS total FROM notifications
       WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`,
      [user.id]
    ),
    query(
      `SELECT e.id,
         EXISTS (SELECT 1 FROM call_schedules s WHERE s.elderly_id = e.id AND s.enabled) AS scheduled,
         EXISTS (
           SELECT 1 FROM call_records cr
           WHERE cr.elderly_id = e.id AND cr.started_at::date = current_date AND cr.status = 'completed'
         ) AS completed_today
       FROM elderly_profiles e WHERE e.customer_id = $1`,
      [user.customerId]
    )
  ]);
  const openEmergency = await query(
    `SELECT count(*)::int AS total FROM alerts
     WHERE customer_id = $1 AND type = 'emergency' AND status <> 'resolved'`,
    [user.customerId]
  );
  const expected = today.rows.filter((row) => row.scheduled).length;
  const completed = today.rows.filter((row) => row.scheduled && row.completed_today).length;
  return {
    greeting: greeting(),
    customerName: profile.rows[0]?.full_name,
    today: {
      completed,
      expected,
      label: expected > 0 && completed >= expected ? 'Completed' : completed > 0 ? 'In progress' : 'Scheduled'
    },
    emergency: {
      openCount: openEmergency.rows[0].total,
      label: openEmergency.rows[0].total ? `${openEmergency.rows[0].total} open` : 'No Alerts'
    },
    lovedOnes: presentAll(loved.rows),
    reminders: presentAll(reminders.rows),
    recentAlerts: presentAll(alerts.rows),
    recentOrders: presentAll(orders.rows),
    unreadNotifications: unread.rows[0].total
  };
}

async function adminDashboard(customerId) {
  const scope = customerId || null;
  const [
    customers, elderly, contacts, reminders, unreadAlerts, pendingOrders,
    completedToday, missedToday, nextCall, chart, orderStatus, spending, monthTotal, activity, upcoming
  ] = await Promise.all([
    scalar(`SELECT count(*)::int AS n FROM customers WHERE ($1::uuid IS NULL OR id = $1)`, [scope]),
    scalar(`SELECT count(*)::int AS n FROM elderly_profiles WHERE ($1::uuid IS NULL OR customer_id = $1)`, [scope]),
    scalar(
      `SELECT count(*)::int AS n FROM emergency_contacts ec
       JOIN elderly_profiles e ON e.id = ec.elderly_id
       WHERE ($1::uuid IS NULL OR e.customer_id = $1)`,
      [scope]
    ),
    scalar(
      `SELECT count(*)::int AS n FROM reminders WHERE enabled = true AND ($1::uuid IS NULL OR customer_id = $1)`,
      [scope]
    ),
    scalar(
      `SELECT count(*)::int AS n FROM alerts WHERE status = 'new' AND ($1::uuid IS NULL OR customer_id = $1)`,
      [scope]
    ),
    scalar(
      `SELECT count(*)::int AS n FROM care_orders
       WHERE status IN ('requested','accepted','processing','out_for_delivery')
         AND ($1::uuid IS NULL OR customer_id = $1)`,
      [scope]
    ),
    scalar(
      `SELECT count(*)::int AS n FROM call_records
       WHERE status = 'completed' AND started_at::date = current_date AND ($1::uuid IS NULL OR customer_id = $1)`,
      [scope]
    ),
    scalar(
      `SELECT count(*)::int AS n FROM call_records
       WHERE status = 'missed' AND started_at::date = current_date AND ($1::uuid IS NULL OR customer_id = $1)`,
      [scope]
    ),
    query(
      `SELECT s.next_run_at, e.full_name, e.phone
       FROM call_schedules s JOIN elderly_profiles e ON e.id = s.elderly_id
       WHERE s.enabled = true AND ($1::uuid IS NULL OR e.customer_id = $1)
       ORDER BY s.next_run_at LIMIT 1`,
      [scope]
    ),
    query(
      `SELECT d::date AS day,
         count(DISTINCT cr.group_id) FILTER (WHERE cr.status = 'completed')::int AS answered,
         count(DISTINCT cr.group_id) FILTER (WHERE cr.status = 'missed')::int AS missed
       FROM generate_series(current_date - 6, current_date, interval '1 day') AS d
       LEFT JOIN call_records cr ON cr.started_at::date = d::date AND ($1::uuid IS NULL OR cr.customer_id = $1)
       GROUP BY d ORDER BY d`,
      [scope]
    ),
    query(
      `SELECT status, count(*)::int AS total FROM care_orders
       WHERE ($1::uuid IS NULL OR customer_id = $1) GROUP BY status`,
      [scope]
    ),
    query(
      `SELECT COALESCE(paid_at, created_at)::date AS day, sum(amount)::float8 AS amount
       FROM payments
       WHERE status = 'successful'
         AND COALESCE(paid_at, created_at) >= date_trunc('month', current_date)
         AND ($1::uuid IS NULL OR customer_id = $1)
       GROUP BY 1 ORDER BY 1`,
      [scope]
    ),
    scalar(
      `SELECT COALESCE(sum(amount), 0)::float8 AS n FROM payments
       WHERE status = 'successful'
         AND COALESCE(paid_at, created_at) >= date_trunc('month', current_date)
         AND ($1::uuid IS NULL OR customer_id = $1)`,
      [scope]
    ),
    query(
      `SELECT a.created_at, a.action, a.entity_type, a.details, u.full_name AS actor_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC LIMIT 8`
    ),
    query(
      `SELECT r.*, e.full_name AS elderly_name
       FROM reminders r JOIN elderly_profiles e ON e.id = r.elderly_id
       WHERE r.enabled = true AND ($1::uuid IS NULL OR r.customer_id = $1)
       ORDER BY r.time_of_day LIMIT 5`,
      [scope]
    )
  ]);
  const scheduled = await scalar(
    `SELECT count(*)::int AS n FROM call_schedules s
     JOIN elderly_profiles e ON e.id = s.elderly_id
     WHERE s.enabled = true AND ($1::uuid IS NULL OR e.customer_id = $1)`,
    [scope]
  );
  return {
    totals: {
      customers: customers.n,
      elderly: elderly.n,
      todayCheckinsCompleted: completedToday.n,
      todayCheckinsExpected: scheduled.n,
      nextCall: present(nextCall.rows[0]),
      emergencyContacts: contacts.n,
      activeReminders: reminders.n,
      unreadAlerts: unreadAlerts.n,
      completedCalls: completedToday.n,
      missedCalls: missedToday.n,
      pendingOrders: pendingOrders.n,
      monthlySpending: monthTotal.n
    },
    chart: presentAll(chart.rows),
    orderStatus: presentAll(orderStatus.rows),
    spendingSeries: presentAll(spending.rows),
    recentActivity: presentAll(activity.rows),
    reminders: presentAll(upcoming.rows)
  };
}

async function scalar(sql, params) {
  const { rows } = await query(sql, params);
  return rows[0];
}

async function reportCalls(req, statuses) {
  const params = [];
  const where = [accessClause(req.user, params, 'cr.customer_id')];
  if (req.query.customerId && req.user.role !== 'customer') {
    params.push(req.query.customerId);
    where.push(`cr.customer_id = $${params.length}`);
  }
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`cr.elderly_id = $${params.length}`);
  }
  if (statuses) {
    params.push(statuses);
    where.push(`cr.status = ANY($${params.length}::text[])`);
  } else if (req.query.status) {
    params.push(req.query.status);
    where.push(`cr.status = $${params.length}`);
  }
  addDateRange(where, params, 'cr.started_at', req.query.from, req.query.to);
  const { rows } = await query(
    `SELECT cr.started_at, cr.callee_name, cr.phone, cr.status, cr.result_code, cr.duration_seconds, cr.attempt_number, e.full_name AS elderly_name
     FROM call_records cr JOIN elderly_profiles e ON e.id = cr.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY cr.started_at DESC LIMIT 500`,
    params
  );
  return presentAll(rows);
}

async function reportAlerts(req, forcedType) {
  const params = [];
  const where = [accessClause(req.user, params, 'a.customer_id')];
  if (forcedType) {
    params.push(forcedType);
    where.push(`a.type = $${params.length}`);
  } else if (req.query.type) {
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
  addDateRange(where, params, 'a.created_at', req.query.from, req.query.to);
  const { rows } = await query(
    `SELECT a.created_at, a.type, a.status, a.title, a.message, e.full_name AS elderly_name
     FROM alerts a JOIN elderly_profiles e ON e.id = a.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT 500`,
    params
  );
  return presentAll(rows);
}

async function reportOrders(req) {
  const params = [];
  const where = [accessClause(req.user, params, 'o.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`o.status = $${params.length}`);
  }
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`o.elderly_id = $${params.length}`);
  }
  addDateRange(where, params, 'o.created_at', req.query.from, req.query.to);
  const { rows } = await query(
    `SELECT o.created_at, o.order_number, o.type, o.status, o.total_amount, o.currency, e.full_name AS elderly_name
     FROM care_orders o JOIN elderly_profiles e ON e.id = o.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY o.created_at DESC LIMIT 500`,
    params
  );
  return presentAll(rows);
}

async function reportPayments(req) {
  if (req.user.role === 'customer') {
    /* scoped below */
  } else if (req.user.role !== 'admin' && req.user.role !== 'staff') {
    throw httpError(403, 'You do not have permission to do that');
  }
  const params = [];
  const where = [accessClause(req.user, params, 'p.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`p.status = $${params.length}`);
  }
  addDateRange(where, params, 'p.created_at', req.query.from, req.query.to);
  const { rows } = await query(
    `SELECT p.created_at, p.service_label, p.amount, p.currency, p.status, p.transaction_ref, u.full_name AS customer_name
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT 500`,
    params
  );
  return presentAll(rows);
}

async function reportSubscriptions(req) {
  requireStaffOrSelf(req);
  const params = [];
  const where = [accessClause(req.user, params, 's.customer_id')];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`s.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT s.started_at, s.renews_at, s.status, p.name AS plan_name, p.price_lkr, u.full_name AS customer_name
     FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     JOIN customers c ON c.id = s.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.started_at DESC`,
    params
  );
  return presentAll(rows);
}

function requireStaffOrSelf(req) {
  if (!['admin', 'staff', 'customer'].includes(req.user.role)) {
    throw httpError(403, 'You do not have permission to do that');
  }
}

export { router as default };
