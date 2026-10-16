import crypto from 'crypto';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { httpError } from '../http.js';
import { audit } from '../util/audit.js';
import { emitUpdate } from '../realtime.js';
import { send } from './notify.js';

const demoGateway = {
  name: 'demo',
  async charge({ simulate }) {
    const status = simulate || 'successful';
    if (!['successful', 'pending', 'failed'].includes(status)) {
      throw httpError(400, 'Payment status must be successful, pending, or failed');
    }
    return {
      status,
      transactionRef: `SV${Date.now()}${crypto.randomInt(100, 999)}`,
      provider: 'demo'
    };
  }
};

export function getPaymentGateway() {
  if (config.paymentProvider === 'demo') return demoGateway;
  return {
    name: config.paymentProvider,
    async charge() {
      throw httpError(501, 'This payment provider is not configured yet');
    }
  };
}

async function insertPayment(client, { customerId, orderId, subscriptionId, serviceLabel, amount, charge }) {
  const { rows } = await client.query(
    `INSERT INTO payments (
       customer_id, order_id, subscription_id, service_label, amount, currency,
       status, transaction_ref, provider, paid_at
     ) VALUES ($1,$2,$3,$4,$5,'LKR',$6,$7,$8,$9)
     RETURNING *`,
    [
      customerId,
      orderId || null,
      subscriptionId || null,
      serviceLabel,
      amount,
      charge.status,
      charge.transactionRef,
      charge.provider,
      charge.status === 'successful' ? new Date() : null
    ]
  );
  return rows[0];
}

export async function payForOrder(user, { orderId, simulate }) {
  const result = await withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM care_orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = found.rows[0];
    if (!order) throw httpError(404, 'Order not found');
    if (user.role === 'customer' && order.customer_id !== user.customerId) {
      throw httpError(403, 'You do not have access to this order');
    }
    if (Number(order.total_amount) <= 0) throw httpError(400, 'This order does not have an amount to pay');
    const paid = await client.query(
      `SELECT id FROM payments WHERE order_id = $1 AND status = 'successful'`,
      [orderId]
    );
    if (paid.rows[0]) throw httpError(409, 'This order is already paid');
    const gateway = getPaymentGateway();
    const charge = await gateway.charge({ amount: order.total_amount, simulate });
    const payment = await insertPayment(client, {
      customerId: order.customer_id,
      orderId: order.id,
      serviceLabel: `${order.order_number} ${order.type}`,
      amount: order.total_amount,
      charge
    });
    const owner = await client.query('SELECT user_id, notify_payments FROM customers WHERE id = $1', [order.customer_id]);
    if (owner.rows[0]?.notify_payments) {
      await send(client, {
        userId: owner.rows[0].user_id,
        audience: 'customer',
        channel: 'in_app',
        title: 'Payment update',
        body: `Payment ${payment.transaction_ref} for ${payment.service_label} is ${payment.status}.`,
        type: 'payment',
        relatedType: 'payment',
        relatedId: payment.id
      });
    }
    await audit(client, {
      userId: user.id,
      action: 'payment_recorded',
      entityType: 'payment',
      entityId: payment.id,
      details: { status: payment.status, transactionRef: payment.transaction_ref }
    });
    return { payment, userId: owner.rows[0]?.user_id };
  });
  emitUpdate({ topic: 'payment', paymentId: result.payment.id, status: result.payment.status }, [result.userId]);
  return result.payment;
}

export async function recordPayment(user, input) {
  const gateway = getPaymentGateway();
  const charge = input.transactionRef
    ? { status: input.status || 'successful', transactionRef: input.transactionRef, provider: 'demo' }
    : await gateway.charge({ amount: input.amount, simulate: input.status });
  const payment = await withTransaction(async (client) => {
    const customer = await client.query('SELECT user_id FROM customers WHERE id = $1', [input.customerId]);
    if (!customer.rows[0]) throw httpError(404, 'Customer not found');
    const saved = await insertPayment(client, {
      customerId: input.customerId,
      orderId: input.orderId,
      serviceLabel: input.service,
      amount: input.amount,
      charge
    });
    await audit(client, {
      userId: user.id,
      action: 'payment_recorded',
      entityType: 'payment',
      entityId: saved.id,
      details: { status: saved.status }
    });
    return saved;
  });
  return payment;
}

export async function changePlan(user, planId) {
  const result = await withTransaction(async (client) => {
    const customerId = user.customerId;
    if (!customerId) throw httpError(403, 'Only a family account can change a subscription');
    const plan = await client.query('SELECT * FROM subscription_plans WHERE id = $1 AND active = true', [planId]);
    if (!plan.rows[0]) throw httpError(404, 'That plan is not available');
    const free = Number(plan.rows[0].price_lkr) === 0;
    const charge = free
      ? { status: 'successful', transactionRef: `SVFREE${crypto.randomUUID()}`, provider: 'free' }
      : await getPaymentGateway().charge({ amount: plan.rows[0].price_lkr, simulate: 'successful' });
    if (charge.status !== 'successful') {
      const failed = await insertPayment(client, {
        customerId,
        serviceLabel: `${plan.rows[0].name} subscription`,
        amount: plan.rows[0].price_lkr,
        charge
      });
      return { payment: failed, subscription: null, userId: user.id };
    }
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', updated_at = now()
       WHERE customer_id = $1 AND status = 'active'`,
      [customerId]
    );
    const renews = new Date();
    renews.setMonth(renews.getMonth() + (plan.rows[0].billing_period === 'yearly' ? 12 : 1));
    const subscription = await client.query(
      `INSERT INTO subscriptions (customer_id, plan_id, status, started_at, renews_at)
       VALUES ($1,$2,'active',now(),$3)
       RETURNING *`,
      [customerId, planId, renews]
    );
    const payment = await insertPayment(client, {
      customerId,
      subscriptionId: subscription.rows[0].id,
      serviceLabel: `${plan.rows[0].name} subscription`,
      amount: plan.rows[0].price_lkr,
      charge
    });
    await send(client, {
      userId: user.id,
      audience: 'customer',
      channel: 'in_app',
      title: 'Subscription updated',
      body: `Your plan is now ${plan.rows[0].name}.`,
      type: 'subscription',
      relatedType: 'subscription',
      relatedId: subscription.rows[0].id
    });
    await audit(client, {
      userId: user.id,
      action: 'subscription_changed',
      entityType: 'subscription',
      entityId: subscription.rows[0].id,
      details: { plan: plan.rows[0].code }
    });
    return { payment, subscription: subscription.rows[0], plan: plan.rows[0], userId: user.id };
  });
  emitUpdate({ topic: 'subscription' }, [result.userId]);
  return result;
}

export async function savePlan(input, id) {
  if (id) {
    const { rows } = await query(
      `UPDATE subscription_plans SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         price_lkr = COALESCE($4, price_lkr),
         billing_period = COALESCE($5, billing_period),
         services = COALESCE($6::jsonb, services),
         active = COALESCE($7, active),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name || null,
        input.description || null,
        input.priceLkr ?? null,
        input.billingPeriod || null,
        input.services ? JSON.stringify(input.services) : null,
        input.active ?? null
      ]
    );
    if (!rows[0]) throw httpError(404, 'Plan not found');
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO subscription_plans (name, code, description, price_lkr, billing_period, services, active, demo_pricing)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,true)
     RETURNING *`,
    [
      input.name,
      input.code,
      input.description || null,
      input.priceLkr,
      input.billingPeriod || 'monthly',
      JSON.stringify(input.services || []),
      input.active ?? true
    ]
  );
  return rows[0];
}
