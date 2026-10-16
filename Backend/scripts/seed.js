import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, withTransaction } from '../src/db.js';
import { colomboParts, daysAgoAt, nextRunAt } from '../src/util/time.js';

const PROMPT = 'Good morning. This is Suva Voice. Please press 1 if you are okay. Press 2 if you need assistance. Press 3 for emergency.';

const id = {
  admin: '10000000-0000-4000-8000-000000000001',
  nimalUser: '10000000-0000-4000-8000-000000000002',
  dilaniUser: '10000000-0000-4000-8000-000000000003',
  staff: '10000000-0000-4000-8000-000000000004',
  nimal: '20000000-0000-4000-8000-000000000002',
  dilani: '20000000-0000-4000-8000-000000000003',
  sunil: '30000000-0000-4000-8000-000000000001',
  kamala: '30000000-0000-4000-8000-000000000002',
  robert: '30000000-0000-4000-8000-000000000003',
  basket: '40000000-0000-4000-8000-000000000001',
  pharmacy: '40000000-0000-4000-8000-000000000002',
  nursing: '40000000-0000-4000-8000-000000000003',
  transport: '40000000-0000-4000-8000-000000000004',
  kitchen: '40000000-0000-4000-8000-000000000005',
  essential: '50000000-0000-4000-8000-000000000001',
  family: '50000000-0000-4000-8000-000000000002',
  complete: '50000000-0000-4000-8000-000000000003',
  sunilSchedule: '60000000-0000-4000-8000-000000000001',
  kamalaSchedule: '60000000-0000-4000-8000-000000000002',
  robertSchedule: '60000000-0000-4000-8000-000000000003'
};

function at(days, time) {
  return daysAgoAt(days, time);
}

export async function seed() {
  const adminHash = await bcrypt.hash('Admin@12345', 10);
  const staffHash = await bcrypt.hash('Staff@12345', 10);
  const customerHash = await bcrypt.hash('Customer@12345', 10);
  const today = colomboParts().dateKey;

  await withTransaction(async (client) => {
    await client.query(`TRUNCATE TABLE
      alert_escalations, notifications, audit_logs, support_requests, payments,
      delivery_events, care_order_items, doctor_appointments, transport_requests, care_orders,
      subscriptions, subscription_plans, service_providers, reminders, call_responses, alerts,
      call_records, call_schedules, emergency_contacts, elderly_profiles, customers, users, system_settings
      RESTART IDENTITY CASCADE`);

    await client.query(
      `INSERT INTO system_settings (id, retry_attempts, retry_delay_seconds, escalation_delay_seconds, scheduler_enabled)
       VALUES (1, 2, 30, 45, true)`
    );

    await client.query(
      `INSERT INTO users (id, full_name, email, phone, password_hash, role, status, email_verified)
       VALUES
       ($1, 'Dulshan', 'admin@suvavoice.lk', '0112001122', $2, 'admin', 'active', true),
       ($3, 'Ruwan Silva', 'staff@suvavoice.lk', '0112001133', $4, 'staff', 'active', true),
       ($5, 'Nimal Fernando', 'nimal.fernando@suvavoice.lk', '0771234567', $6, 'customer', 'active', true),
       ($7, 'Dilani Fernando', 'dilani.fernando@suvavoice.lk', '0777654321', $6, 'customer', 'active', true)`,
      [id.admin, adminHash, id.staff, staffHash, id.nimalUser, customerHash, id.dilaniUser]
    );

    await client.query(
      `INSERT INTO customers (id, user_id, address, city, preferred_language)
       VALUES
       ($1, $2, '25 Flower Road', 'Colombo 07', 'en'),
       ($3, $4, '14 Temple Lane', 'Colombo 05', 'en')`,
      [id.nimal, id.nimalUser, id.dilani, id.dilaniUser]
    );

    await client.query(
      `INSERT INTO elderly_profiles (
         id, customer_id, full_name, age, phone, address, preferred_language, preferred_checkin_time, health_notes, status
       ) VALUES
       ($1, $2, 'Sunil Jayasekara', 72, '0712345678', '42 Temple Road, Colombo 06', 'si', '08:30', 'Takes blood pressure medicine each morning. Prefers calls in Sinhala.', 'all_good'),
       ($3, $2, 'Kamala Silva', 68, '0775550142', '18 Lake Road, Kandy', 'si', '09:15', 'Enjoys a short rest after lunch.', 'all_good'),
       ($4, $5, 'Robert Perera', 75, '0764402291', '9 Fort Street, Galle', 'en', '09:00', 'Uses a walking stick for longer trips.', 'missed_checkin')`,
      [id.sunil, id.nimal, id.kamala, id.robert, id.dilani]
    );

    await client.query(
      `INSERT INTO emergency_contacts (
         elderly_id, full_name, phone, relationship, priority, notify_on_assistance, notify_on_emergency, notify_on_missed
       ) VALUES
       ($1, 'Nimal Fernando', '0771234567', 'Son', 1, true, true, true),
       ($1, 'Kumari Jayasekara', '0719988776', 'Daughter', 2, true, true, false),
       ($2, 'Nimal Fernando', '0771234567', 'Son', 1, true, true, true),
       ($3, 'Dilani Fernando', '0777654321', 'Daughter', 1, true, true, true),
       ($3, 'Ravi Perera', '0751122334', 'Son', 2, true, true, false)`,
      [id.sunil, id.kamala, id.robert]
    );

    await client.query(
      `INSERT INTO call_schedules (id, elderly_id, time_of_day, days_of_week, retry_attempts, retry_delay_seconds, next_run_at)
       VALUES
       ($1, $2, '08:30', '{1,2,3,4,5,6,7}', 2, 30, $3),
       ($4, $5, '09:15', '{1,2,3,4,5,6,7}', 2, 30, $6),
       ($7, $8, '09:00', '{1,2,3,4,5,6,7}', 2, 30, $9)`,
      [
        id.sunilSchedule, id.sunil, nextRunAt('08:30', [1, 2, 3, 4, 5, 6, 7]),
        id.kamalaSchedule, id.kamala, nextRunAt('09:15', [1, 2, 3, 4, 5, 6, 7]),
        id.robertSchedule, id.robert, nextRunAt('09:00', [1, 2, 3, 4, 5, 6, 7])
      ]
    );

    const people = {
      sunil: { elderlyId: id.sunil, customerId: id.nimal, scheduleId: id.sunilSchedule, name: 'Sunil Jayasekara', phone: '0712345678', time: '08:30' },
      kamala: { elderlyId: id.kamala, customerId: id.nimal, scheduleId: id.kamalaSchedule, name: 'Kamala Silva', phone: '0775550142', time: '09:15' },
      robert: { elderlyId: id.robert, customerId: id.dilani, scheduleId: id.robertSchedule, name: 'Robert Perera', phone: '0764402291', time: '09:00' }
    };

    let robertMissedId = null;
    let sunilMissedId = null;
    let robertAssistId = null;
    for (let day = 0; day <= 6; day += 1) {
      await addCompleted(client, people.sunil, day, day === 3 ? null : 'okay');
      if (day === 3) sunilMissedId = await addMissed(client, people.sunil, day);
      await addCompleted(client, people.kamala, day, day === 5 ? null : 'okay');
      if (day === 5) await addMissed(client, people.kamala, day);
      if (day === 0 || day === 1) {
        const missedId = await addMissed(client, people.robert, day);
        if (day === 0) robertMissedId = missedId;
      } else if (day === 3) {
        robertAssistId = await addCompleted(client, people.robert, day, 'assistance');
      } else {
        await addCompleted(client, people.robert, day, 'okay');
      }
    }

    await client.query(
      `INSERT INTO alerts (elderly_id, customer_id, call_id, type, status, title, message, resolved_at, resolved_by, created_at)
       VALUES
       ($1, $2, $3, 'missed_checkin', 'resolved', 'Missed check-in', 'Sunil Jayasekara missed a wellness call. He confirmed he was okay on the next call.', $4, $5, $4),
       ($6, $7, $8, 'assistance', 'resolved', 'Assistance requested', 'Robert Perera requested assistance. The family confirmed he is safe.', $4, $5, $4),
       ($6, $7, $9, 'missed_checkin', 'new', 'Missed check-in', 'We could not reach Robert Perera for the scheduled wellness check-in. This is not an emergency.', NULL, NULL, now())`,
      [id.sunil, id.nimal, sunilMissedId, at(3, '12:00'), id.admin, id.robert, id.dilani, robertAssistId, robertMissedId]
    );

    const notified = (time) => {
      const [hour, minute] = time.split(':').map(Number);
      return hour * 60 + minute <= colomboParts().minutes ? today : null;
    };
    await client.query(
      `INSERT INTO reminders (elderly_id, customer_id, type, title, notes, time_of_day, days_of_week, enabled, last_notified_on)
       VALUES
       ($1, $2, 'medication', 'Blood pressure tablet', 'One tablet with water', '08:00', '{1,2,3,4,5,6,7}', true, $3),
       ($1, $2, 'meal', 'Lunch', 'Rice and vegetables', '12:30', '{1,2,3,4,5,6,7}', true, $4),
       ($5, $2, 'rest', 'Afternoon rest', 'Short rest after lunch', '14:00', '{1,2,3,4,5,6,7}', true, $6),
       ($7, $8, 'medication', 'Morning medicine', 'After breakfast', '09:00', '{1,2,3,4,5,6,7}', true, $9)`,
      [id.sunil, id.nimal, notified('08:00'), notified('12:30'), id.kamala, notified('14:00'), id.robert, id.dilani, notified('09:00')]
    );

    await client.query(
      `INSERT INTO service_providers (id, name, contact_name, phone, email, service_type, availability, status)
       VALUES
       ($1, 'Green Basket Grocers', 'Malik Fonseka', '0112550100', 'hello@greenbasket.example', 'grocery', 'Daily, 8:00 to 18:00', 'active'),
       ($2, 'Suwa Pharmacy', 'Dr. Nadeesha', '0112550101', 'care@suwapharmacy.example', 'essential', 'Daily, 8:00 to 20:00', 'active'),
       ($3, 'Lanka Home Nursing', 'Sister Anusha', '0112550102', 'desk@lankanursing.example', 'doctor', 'Weekdays, 9:00 to 17:00', 'active'),
       ($4, 'City Care Transport', 'Saman Peiris', '0112550103', 'rides@citycare.example', 'transport', 'Daily, 6:00 to 21:00', 'active'),
       ($5, 'Suwa Kitchen', 'Fathima Rizvi', '0112550104', 'meals@suwakitchen.example', 'general', 'Daily, 7:00 to 19:00', 'active')`,
      [id.basket, id.pharmacy, id.nursing, id.transport, id.kitchen]
    );

    const orders = {};
    orders.co1234 = await addOrder(client, {
      number: 'CO1234', customerId: id.nimal, elderlyId: id.sunil, providerId: id.basket,
      type: 'grocery', status: 'completed', total: 4350, notes: 'Weekly groceries', createdAt: at(2, '10:00'),
      items: [['Rice 5kg', 1, 1200], ['Milk', 2, 400], ['Vegetables', 1, 1500], ['Fruit', 1, 850]]
    });
    orders.co1235 = await addOrder(client, {
      number: 'CO1235', customerId: id.nimal, elderlyId: id.kamala, providerId: id.kitchen,
      type: 'grocery', status: 'out_for_delivery', total: 1890, notes: 'Prepared meals', createdAt: at(0, '09:40'),
      estimated: new Date(Date.now() + 30 * 60 * 1000),
      items: [['Lunch pack', 2, 650], ['Soup', 1, 590]]
    });
    orders.co1236 = await addOrder(client, {
      number: 'CO1236', customerId: id.nimal, elderlyId: id.sunil, providerId: id.pharmacy,
      type: 'essential', status: 'accepted', total: 2680, notes: 'Monthly medicine', createdAt: at(1, '11:00'),
      items: [['Blood pressure tablets', 1, 2680]]
    });
    orders.co1237 = await addOrder(client, {
      number: 'CO1237', customerId: id.nimal, elderlyId: id.kamala, providerId: id.basket,
      type: 'grocery', status: 'completed', total: 5600, notes: 'Home care supplies', createdAt: at(6, '15:00'),
      items: [['Care supplies', 1, 5600]]
    });
    orders.co1238 = await addOrder(client, {
      number: 'CO1238', customerId: id.nimal, elderlyId: id.sunil, providerId: id.basket,
      type: 'grocery', status: 'completed', total: 4130, notes: 'Household essentials', createdAt: at(4, '13:00'),
      items: [['Household pack', 1, 4130]]
    });
    orders.co1239 = await addOrder(client, {
      number: 'CO1239', customerId: id.dilani, elderlyId: id.robert, providerId: id.transport,
      type: 'transport', status: 'completed', total: 4200, notes: 'Clinic visit', createdAt: at(5, '08:00'),
      items: [['Return clinic ride', 1, 4200]]
    });
    orders.co1240 = await addOrder(client, {
      number: 'CO1240', customerId: id.dilani, elderlyId: id.robert, providerId: id.pharmacy,
      type: 'essential', status: 'completed', total: 2100, notes: 'Pharmacy refill', createdAt: at(3, '16:00'),
      items: [['Prescription refill', 1, 2100]]
    });
    orders.co1241 = await addOrder(client, {
      number: 'CO1241', customerId: id.nimal, elderlyId: id.sunil, providerId: null,
      type: 'doctor', status: 'requested', total: 0, notes: 'Blood pressure review', createdAt: at(0, '08:10'),
      items: []
    });
    orders.co1242 = await addOrder(client, {
      number: 'CO1242', customerId: id.nimal, elderlyId: id.kamala, providerId: null,
      type: 'transport', status: 'requested', total: 0, notes: 'Temple visit', createdAt: at(0, '08:20'),
      items: []
    });

    const tomorrow = colomboParts(new Date(Date.now() + 24 * 60 * 60 * 1000)).dateKey;
    await client.query(
      `INSERT INTO doctor_appointments (
         elderly_id, customer_id, care_order_id, preferred_date, preferred_time, doctor_or_hospital, notes, status
       ) VALUES ($1, $2, $3, $4, '10:30', 'Lanka Hospital, Colombo', 'Blood pressure review', 'requested')`,
      [id.sunil, id.nimal, orders.co1241, tomorrow]
    );
    await client.query(
      `INSERT INTO transport_requests (
         elderly_id, customer_id, care_order_id, pickup_location, destination, travel_date, travel_time, status, provider_id, notes
       ) VALUES
       ($1, $2, $3, '9 Fort Street, Galle', 'Karapitiya Teaching Hospital', $4, '09:30', 'completed', $5, 'Clinic visit completed'),
       ($6, $7, $8, '18 Lake Road, Kandy', 'Sri Dalada Maligawa', $9, '16:00', 'requested', NULL, 'Waiting for a driver')`,
      [id.robert, id.dilani, orders.co1239, colomboParts(at(5, '09:30')).dateKey, id.transport, id.kamala, id.nimal, orders.co1242, tomorrow]
    );

    await client.query(
      `INSERT INTO subscription_plans (id, name, code, description, price_lkr, billing_period, services, active, demo_pricing)
       VALUES
       ($1, 'Essential Check-in', 'essential', 'Daily wellness call and missed-call alerts.', 0, 'monthly', $2::jsonb, true, false),
       ($3, 'Family Care', 'family', 'Illustrative demo price. Check-ins, reminders, escalation, and care orders.', 3500, 'monthly', $4::jsonb, true, true),
       ($5, 'Complete Care', 'complete', 'Illustrative demo price. Family Care plus doctor and transport assistance.', 6500, 'monthly', $6::jsonb, true, true)`,
      [
        id.essential, JSON.stringify(['Daily wellness call', 'Missed check-in alerts']),
        id.family, JSON.stringify(['Daily wellness call', 'Reminders', 'Emergency escalation', 'Care orders']),
        id.complete, JSON.stringify(['Everything in Family Care', 'Doctor appointment assistance', 'Transport assistance'])
      ]
    );

    const nimalSub = crypto.randomUUID();
    const dilaniSub = crypto.randomUUID();
    await client.query(
      `INSERT INTO subscriptions (id, customer_id, plan_id, status, started_at, renews_at)
       VALUES
       ($1, $2, $3, 'active', $4, $5),
       ($6, $7, $8, 'active', $4, $5)`,
      [nimalSub, id.nimal, id.family, at(12, '09:00'), new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), dilaniSub, id.dilani, id.essential]
    );

    const paymentRows = [
      ['SV-DEMO-1001', id.nimal, orders.co1234, null, 'Grocery order CO1234', 4350, 'successful', at(2, '10:30')],
      ['SV-DEMO-1002', id.nimal, orders.co1236, null, 'Medicine order CO1236', 2680, 'successful', at(1, '11:20')],
      ['SV-DEMO-1003', id.nimal, null, nimalSub, 'Family Care subscription', 3500, 'successful', at(12, '09:05')],
      ['SV-DEMO-1004', id.nimal, orders.co1237, null, 'Home care supplies CO1237', 5600, 'successful', at(6, '15:20')],
      ['SV-DEMO-1005', id.nimal, orders.co1238, null, 'Household essentials CO1238', 4130, 'successful', at(4, '13:20')],
      ['SV-DEMO-1006', id.nimal, orders.co1235, null, 'Prepared meals CO1235', 1890, 'successful', at(0, '09:50')],
      ['SV-DEMO-1007', id.dilani, orders.co1239, null, 'Transport CO1239', 4200, 'successful', at(5, '08:40')],
      ['SV-DEMO-1008', id.dilani, orders.co1240, null, 'Pharmacy refill CO1240', 2100, 'successful', at(3, '16:20')],
      ['SV-DEMO-1009', id.nimal, null, null, 'Care visit', 980, 'pending', at(0, '12:00')],
      ['SV-DEMO-1010', id.dilani, null, null, 'Care visit', 1500, 'failed', at(1, '17:00')]
    ];
    for (const row of paymentRows) {
      await client.query(
        `INSERT INTO payments (
           customer_id, order_id, subscription_id, service_label, amount, currency, status, transaction_ref, provider, paid_at, created_at
         ) VALUES ($1,$2,$3,$4,$5,'LKR',$6,$7,'demo',$8,$8)`,
        [row[1], row[2], row[3], row[4], row[5], row[6], row[0], row[6] === 'successful' ? row[7] : row[7]]
      );
    }

    await client.query(
      `INSERT INTO notifications (
         user_id, audience, channel, recipient_address, title, body, type, related_type, status, provider, created_at
       ) VALUES
       ($1, 'customer', 'in_app', NULL, 'Check-in complete', 'Sunil Jayasekara is okay. Today''s wellness check-in is complete.', 'checkin', 'call', 'read', 'in_app', $2),
       ($1, 'customer', 'in_app', NULL, 'Care order update', 'CO1235 is out for delivery.', 'order', 'care_order', 'sent', 'in_app', now()),
       ($1, 'customer', 'in_app', NULL, 'Payment update', 'Payment SV-DEMO-1001 for groceries is successful.', 'payment', 'payment', 'sent', 'in_app', now()),
       ($3, 'customer', 'in_app', NULL, 'Missed check-in', 'We could not reach Robert Perera for the scheduled wellness check-in.', 'missed_checkin', 'alert', 'sent', 'in_app', now()),
       ($4, 'admin', 'in_app', NULL, 'Missed check-in', 'Robert Perera missed today''s wellness check-in. This is not an emergency.', 'missed_checkin', 'alert', 'sent', 'in_app', now()),
       (NULL, 'contact', 'sms', '0777654321', 'Suva Voice', 'Suva Voice: We could not reach Robert Perera for the scheduled wellness check-in.', 'missed_checkin', 'alert', 'sent', 'demo', now())`,
      [id.nimalUser, at(0, '08:32'), id.dilaniUser, id.admin]
    );
    await client.query(
      `UPDATE notifications SET read_at = now() WHERE title = 'Check-in complete'`
    );

    await client.query(
      `INSERT INTO support_requests (user_id, subject, message, status)
       VALUES ($1, 'How do wellness calls work?', 'Can my father answer on a normal mobile phone without installing an app?', 'open')`,
      [id.nimalUser]
    );
    await client.query(
      `INSERT INTO support_requests (user_id, subject, message, staff_response, status)
       VALUES ($1, 'Change a check-in time', 'Please move the call to 9:00.', 'The schedule can be changed from the loved one profile.', 'closed')`,
      [id.dilaniUser]
    );

    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES
       ($1, 'login', 'user', $1, '{}'::jsonb, $2),
       ($3, 'dtmf_received', 'call', $4, '{"code":"okay"}'::jsonb, $2),
       ($3, 'order_created', 'care_order', $5, '{"orderNumber":"CO1235"}'::jsonb, $6)`,
      [id.admin, at(0, '08:00'), id.nimalUser, id.sunil, orders.co1235, at(0, '09:40')]
    );

    await client.query(`SELECT setval('care_order_seq', 1400, false)`);
  });
}

async function addCompleted(client, person, day, result) {
  if (!result) return null;
  const groupId = crypto.randomUUID();
  return addCall(client, {
    ...person,
    groupId,
    started: at(day, person.time),
    status: 'completed',
    result,
    attempt: 1,
    duration: result === 'assistance' ? 68 : 42
  });
}

async function addMissed(client, person, day) {
  const groupId = crypto.randomUUID();
  const started = at(day, person.time);
  await addCall(client, {
    ...person,
    groupId,
    started,
    status: 'no_answer',
    result: null,
    attempt: 1,
    duration: 0
  });
  return addCall(client, {
    ...person,
    groupId,
    started: new Date(started.getTime() + 2 * 60 * 1000),
    status: 'missed',
    result: null,
    attempt: 2,
    duration: 0
  });
}

async function addCall(client, spec) {
  const callId = crypto.randomUUID();
  const answered = spec.status === 'completed' ? new Date(spec.started.getTime() + 6000) : null;
  const ended = new Date(spec.started.getTime() + Math.max(spec.duration, 15) * 1000);
  await client.query(
    `INSERT INTO call_records (
       id, group_id, elderly_id, customer_id, schedule_id, callee_name, phone, mode, origin,
       status, result_code, attempt_number, max_attempts, started_at, answered_at, ended_at,
       duration_seconds, prompt_text
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,'demo','schedule',$8,$9,$10,2,$11,$12,$13,$14,$15
     )`,
    [
      callId, spec.groupId, spec.elderlyId, spec.customerId, spec.scheduleId, spec.name, spec.phone,
      spec.status, spec.result, spec.attempt, spec.started, answered, ended,
      spec.status === 'completed' ? spec.duration : 0, PROMPT
    ]
  );
  if (spec.result) {
    const digit = { okay: '1', assistance: '2', emergency: '3' }[spec.result];
    await client.query(
      `INSERT INTO call_responses (call_id, dtmf_digit, response_code, raw_input, recorded_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [callId, digit, spec.result, digit, answered]
    );
  }
  return callId;
}

async function addOrder(client, spec) {
  const orderId = crypto.randomUUID();
  await client.query(
    `INSERT INTO care_orders (
       id, customer_id, elderly_id, provider_id, order_number, type, status, notes, total_amount, currency, estimated_arrival, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'LKR',$10,$11)`,
    [
      orderId, spec.customerId, spec.elderlyId, spec.providerId, spec.number, spec.type, spec.status,
      spec.notes, spec.total, spec.estimated || null, spec.createdAt
    ]
  );
  for (const [name, quantity, price] of spec.items) {
    await client.query(
      `INSERT INTO care_order_items (order_id, name, quantity, unit_price, line_total)
       VALUES ($1,$2,$3,$4,$5)`,
      [orderId, name, quantity, price, quantity * price]
    );
  }
  const stages = {
    requested: ['order_confirmed'],
    accepted: ['order_confirmed'],
    processing: ['order_confirmed', 'preparing'],
    out_for_delivery: ['order_confirmed', 'preparing', 'in_transit'],
    completed: ['order_confirmed', 'preparing', 'in_transit', 'delivered'],
    cancelled: ['order_confirmed', 'cancelled']
  };
  let stamp = new Date(spec.createdAt);
  for (const stage of stages[spec.status]) {
    await client.query(
      `INSERT INTO delivery_events (order_id, stage, note, created_at) VALUES ($1,$2,$3,$4)`,
      [orderId, stage, stage.replaceAll('_', ' '), stamp]
    );
    stamp = new Date(stamp.getTime() + 20 * 60 * 1000);
  }
  return orderId;
}

const isDirect = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isDirect) {
  seed()
    .then(async () => {
      await pool.end();
      console.log('Demo data ready');
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
