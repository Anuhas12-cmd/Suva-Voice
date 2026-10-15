import { withTransaction } from '../db.js';
import { httpError } from '../http.js';
import { audit } from '../util/audit.js';
import { emitUpdate } from '../realtime.js';
import { getElderlyForUser } from './profiles.js';
import { notifyAdmins, send } from './notify.js';

const STAGE = {
  requested: 'order_confirmed',
  accepted: 'order_confirmed',
  processing: 'preparing',
  out_for_delivery: 'in_transit',
  completed: 'delivered',
  cancelled: 'cancelled'
};

const DOCTOR = {
  requested: 'requested',
  accepted: 'scheduled',
  processing: 'scheduled',
  out_for_delivery: 'scheduled',
  completed: 'completed',
  cancelled: 'cancelled'
};

const TRANSPORT = {
  requested: 'requested',
  accepted: 'assigned',
  processing: 'assigned',
  out_for_delivery: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled'
};

async function customerUser(client, customerId) {
  const { rows } = await client.query(
    `SELECT c.user_id, c.notify_orders, u.full_name
     FROM customers c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [customerId]
  );
  return rows[0];
}

export async function createOrder(user, input) {
  const result = await withTransaction(async (client) => {
    const elderly = await getElderlyForUser(user, input.elderlyId, client);
    const items = input.items || [];
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    const total = itemsTotal > 0 ? roundMoney(itemsTotal) : roundMoney(input.amount || 0);
    const number = await client.query(`SELECT 'CO' || nextval('care_order_seq') AS order_number`);
    const inserted = await client.query(
      `INSERT INTO care_orders (
         customer_id, elderly_id, order_number, type, status, notes, total_amount, currency
       ) VALUES ($1,$2,$3,$4,'requested',$5,$6,'LKR')
       RETURNING *`,
      [elderly.customer_id, elderly.id, number.rows[0].order_number, input.type, input.notes || null, total]
    );
    const order = inserted.rows[0];
    for (const item of items) {
      const line = roundMoney(Number(item.quantity) * Number(item.unitPrice));
      await client.query(
        `INSERT INTO care_order_items (order_id, name, quantity, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.name, item.quantity, item.unitPrice, line]
      );
    }
    await client.query(
      `INSERT INTO delivery_events (order_id, stage, note) VALUES ($1, 'order_confirmed', 'Order placed')`,
      [order.id]
    );
    if (input.type === 'doctor') {
      await client.query(
        `INSERT INTO doctor_appointments (
           elderly_id, customer_id, care_order_id, preferred_date, preferred_time, doctor_or_hospital, notes, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'requested')`,
        [
          elderly.id,
          elderly.customer_id,
          order.id,
          input.doctor.preferredDate || null,
          input.doctor.preferredTime || null,
          input.doctor.doctorOrHospital,
          input.doctor.notes || input.notes || null
        ]
      );
    }
    if (input.type === 'transport') {
      await client.query(
        `INSERT INTO transport_requests (
           elderly_id, customer_id, care_order_id, pickup_location, destination, travel_date, travel_time, notes, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'requested')`,
        [
          elderly.id,
          elderly.customer_id,
          order.id,
          input.transport.pickupLocation,
          input.transport.destination,
          input.transport.travelDate || null,
          input.transport.travelTime || null,
          input.transport.notes || input.notes || null
        ]
      );
    }
    const owner = await customerUser(client, elderly.customer_id);
    await notifyAdmins(client, {
      title: 'New care order',
      body: `${order.order_number} for ${elderly.full_name} is waiting for review.`,
      type: 'order',
      relatedType: 'care_order',
      relatedId: order.id
    });
    await audit(client, {
      userId: user.id,
      action: 'order_created',
      entityType: 'care_order',
      entityId: order.id,
      details: { orderNumber: order.order_number, type: order.type }
    });
    return { order, userId: owner?.user_id };
  });
  emitUpdate({ topic: 'order', orderId: result.order.id, status: result.order.status }, [result.userId]);
  return result.order;
}

export async function updateOrder(user, orderId, patch) {
  const result = await withTransaction(async (client) => {
    const current = await client.query('SELECT * FROM care_orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = current.rows[0];
    if (!order) throw httpError(404, 'Order not found');
    if (user.role === 'customer' && order.customer_id !== user.customerId) {
      throw httpError(403, 'You do not have access to this order');
    }
    if (user.role === 'customer') {
      if (patch.status && patch.status !== 'cancelled') {
        throw httpError(403, 'The care team updates delivery progress');
      }
      if (patch.status === 'cancelled' && ['completed', 'cancelled', 'out_for_delivery'].includes(order.status)) {
        throw httpError(409, 'This order can no longer be cancelled');
      }
    }
    if (patch.providerId) {
      const provider = await client.query('SELECT status FROM service_providers WHERE id = $1', [patch.providerId]);
      if (!provider.rows[0] || provider.rows[0].status !== 'active') {
        throw httpError(400, 'Choose an active service provider');
      }
    }
    const status = patch.status || order.status;
    let estimated = patch.estimatedArrival === undefined ? order.estimated_arrival : patch.estimatedArrival;
    if (status === 'out_for_delivery' && !estimated) {
      estimated = new Date(Date.now() + 30 * 60 * 1000);
    }
    const updated = await client.query(
      `UPDATE care_orders SET
         status = $2,
         provider_id = COALESCE($3, provider_id),
         notes = COALESCE($4, notes),
         estimated_arrival = $5,
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [orderId, status, patch.providerId || null, patch.notes || null, estimated]
    );
    if (patch.status && patch.status !== order.status) {
      await client.query(
        `INSERT INTO delivery_events (order_id, stage, note) VALUES ($1,$2,$3)`,
        [orderId, STAGE[status], `Status changed to ${status.replaceAll('_', ' ')}`]
      );
      await client.query(
        `UPDATE doctor_appointments
         SET status = $2, provider_id = COALESCE($3, provider_id), updated_at = now()
         WHERE care_order_id = $1`,
        [orderId, DOCTOR[status], patch.providerId || null]
      );
      await client.query(
        `UPDATE transport_requests
         SET status = $2, provider_id = COALESCE($3, provider_id), updated_at = now()
         WHERE care_order_id = $1`,
        [orderId, TRANSPORT[status], patch.providerId || null]
      );
      const owner = await customerUser(client, order.customer_id);
      if (owner?.notify_orders) {
        await send(client, {
          userId: owner.user_id,
          audience: 'customer',
          channel: 'in_app',
          title: 'Care order update',
          body: `${order.order_number} is now ${status.replaceAll('_', ' ')}.`,
          type: 'order',
          relatedType: 'care_order',
          relatedId: order.id
        });
      }
    }
    await audit(client, {
      userId: user.id,
      action: 'order_updated',
      entityType: 'care_order',
      entityId: orderId,
      details: { status }
    });
    const owner = await customerUser(client, order.customer_id);
    return { order: updated.rows[0], userId: owner?.user_id };
  });
  emitUpdate({ topic: 'order', orderId: result.order.id, status: result.order.status }, [result.userId]);
  return result.order;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}
