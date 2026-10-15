import { io } from 'socket.io-client';
import { seed } from './seed.js';

const API = process.env.API_URL || 'http://127.0.0.1:4000';
const VOICE = process.env.VOICE_URL || 'http://127.0.0.1:4100';
const ROBERT = '30000000-0000-4000-8000-000000000003';
const COMPLETE = '50000000-0000-4000-8000-000000000003';
const BASKET = '40000000-0000-4000-8000-000000000001';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function raw(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

async function api(path, options) {
  const result = await raw(path, options);
  if (result.status >= 400) {
    const detail = result.json.error?.details ? ` ${JSON.stringify(result.json.error.details)}` : '';
    throw new Error(`${options?.method || 'GET'} ${path} -> ${result.status} ${result.json.error?.message || ''}${detail}`);
  }
  return result.json.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollCall(token, id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const call = await api(`/api/calls/${id}`, { token });
    if (['connected', 'playing', 'waiting_dtmf'].includes(call.status)) return call;
    if (['failed', 'completed', 'missed', 'no_answer'].includes(call.status)) {
      throw new Error(`Call ${id} ended early as ${call.status}: ${call.failureReason || ''}`);
    }
    await sleep(250);
  }
  throw new Error('Timed out waiting for the demo call');
}

async function callAnd(token, elderlyId, action) {
  const started = await api('/api/calls/test', { method: 'POST', token, body: { elderlyId } });
  await pollCall(token, started.id);
  return action(started.id);
}

function waitForAlert(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Admin dashboard did not receive a realtime alert')), 8000);
    const onEvent = (payload) => {
      if (payload.topic === 'alert' && payload.resultCode === 'emergency') {
        clearTimeout(timer);
        socket.off('suva:update', onEvent);
        resolve(payload);
      }
    };
    socket.on('suva:update', onEvent);
  });
}

async function main() {
  await seed();
  const health = await api('/api/health');
  assert(health.ok, 'API health should be ok');
  const voice = await fetch(`${VOICE}/health`);
  assert(voice.ok, 'Local voice server should be online');

  const badLogin = await raw('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@suvavoice.lk', password: 'wrong-password' }
  });
  assert(badLogin.status === 401, 'Wrong password should be rejected');

  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@suvavoice.lk', password: 'Admin@12345' }
  });
  const adminToken = adminLogin.token;
  globalThis.adminToken = adminToken;
  assert(adminLogin.user.role === 'admin', 'Admin role');
  assert(!JSON.stringify(adminLogin).includes('password'), 'Login must not return a password');

  const staffLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'staff@suvavoice.lk', password: 'Staff@12345' }
  });
  const customerLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'nimal.fernando@suvavoice.lk', password: 'Customer@12345' }
  });
  const token = customerLogin.token;
  assert(customerLogin.user.fullName === 'Nimal Fernando', 'Customer name');

  const forbidden = await raw('/api/customers', { token });
  assert(forbidden.status === 403, 'Customers cannot open the admin customer list');
  const robert = await raw(`/api/elderly/${ROBERT}`, { token });
  assert(robert.status === 403, 'A customer cannot open another family profile');
  const staffCreate = await raw('/api/users', {
    method: 'POST',
    token: staffLogin.token,
    body: {
      fullName: 'Should Fail',
      email: `nope-${Date.now()}@suvavoice.lk`,
      phone: '0770000099',
      password: 'Staff@12345',
      role: 'admin'
    }
  });
  assert(staffCreate.status === 403, 'Staff cannot create administrators');

  const email = `accept.${Date.now()}@suvavoice.lk`;
  const phone = `07${String(Date.now()).slice(-8)}`;
  const registered = await api('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Test Caregiver',
      email,
      phone,
      password: 'Care@12345',
      confirmPassword: 'Care@12345'
    }
  });
  assert(/^\d{6}$/.test(registered.demoOtp), 'Demo mode should return the OTP');
  const pending = await raw('/api/auth/login', {
    method: 'POST',
    body: { identifier: email, password: 'Care@12345' }
  });
  assert(pending.status === 403 && pending.json.error.code === 'ACCOUNT_PENDING', 'Pending accounts must verify OTP');
  const verified = await api('/api/auth/verify-otp', {
    method: 'POST',
    body: { email, otp: registered.demoOtp }
  });
  assert(verified.user.email === email, 'Verified user');
  await api('/api/auth/logout', { method: 'POST', token: verified.token });
  const loggedOut = await raw('/api/auth/me', { token: verified.token });
  assert(loggedOut.status === 401, 'Logged out sessions must end');

  const forgot = await api('/api/auth/forgot-password', { method: 'POST', body: { identifier: email } });
  assert(forgot.demoResetToken, 'Demo mode should return a reset token');
  await api('/api/auth/reset-password', {
    method: 'POST',
    body: { token: forgot.demoResetToken, password: 'Care@54321', confirmPassword: 'Care@54321' }
  });
  await api('/api/auth/login', {
    method: 'POST',
    body: { identifier: email, password: 'Care@54321' }
  });

  const home = await api('/api/dashboard', { token });
  assert(home.today.completed === 2 && home.today.expected === 2, 'Nimal should have 2 of 2 check-ins');
  assert(home.emergency.label === 'No Alerts', 'Nimal should have no open emergency');
  assert(home.lovedOnes.length === 2, 'Nimal should see two loved ones');

  await api('/api/settings/system', {
    method: 'PATCH',
    token: adminToken,
    body: { retryAttempts: 2, retryDelaySeconds: 0, escalationDelaySeconds: 45, schedulerEnabled: true }
  });

  const elderPhone = `07${String(Date.now() + 3).slice(-8)}`;
  const elder = await api('/api/elderly', {
    method: 'POST',
    token,
    body: {
      fullName: 'Acceptance Test Elder',
      age: 70,
      phone: elderPhone,
      address: '1 Test Lane, Colombo',
      preferredLanguage: 'en',
      preferredCheckInTime: '10:15',
      healthNotes: 'Created by the acceptance test'
    }
  });
  const edited = await api(`/api/elderly/${elder.id}`, {
    method: 'PATCH',
    token,
    body: { healthNotes: 'Updated health note', age: 71 }
  });
  assert(edited.age === 71, 'Elderly profile should save edits');

  const contact = await api(`/api/elderly/${elder.id}/emergency-contacts`, {
    method: 'POST',
    token,
    body: {
      fullName: 'Priority One Contact',
      phone: '0700000011',
      relationship: 'Son',
      priority: 1,
      notifyOnAssistance: true,
      notifyOnEmergency: true,
      notifyOnMissed: true
    }
  });
  await api(`/api/emergency-contacts/${contact.id}`, {
    method: 'PATCH',
    token,
    body: { relationship: 'Nephew' }
  });
  await api(`/api/elderly/${elder.id}/emergency-contacts`, {
    method: 'POST',
    token,
    body: {
      fullName: 'Priority Two Contact',
      phone: '0700000022',
      relationship: 'Daughter',
      priority: 2,
      notifyOnAssistance: false,
      notifyOnEmergency: true,
      notifyOnMissed: false
    }
  });

  const schedules = await api(`/api/call-schedules?elderlyId=${elder.id}`, { token });
  assert(schedules.length === 1, 'Creating a loved one should create a call schedule');
  await api(`/api/call-schedules/${schedules[0].id}`, {
    method: 'PATCH',
    token,
    body: { timeOfDay: '10:45', retryAttempts: 2, retryDelaySeconds: 0 }
  });

  const okay = await callAnd(token, elder.id, (id) => api(`/api/calls/${id}/dtmf`, {
    method: 'POST',
    token,
    body: { digit: '1' }
  }));
  assert(okay.call.resultCode === 'okay' && okay.call.status === 'completed', 'DTMF 1 should record okay');

  const invalid = await callAnd(token, elder.id, async (id) => {
    const wrong = await api(`/api/calls/${id}/dtmf`, { method: 'POST', token, body: { digit: '5' } });
    assert(wrong.invalid === true, 'Invalid keypad input should be stored and keep the call open');
    const still = await api(`/api/calls/${id}`, { token });
    assert(['playing', 'waiting_dtmf', 'connected'].includes(still.status), 'Invalid input should not end the call');
    return api(`/api/calls/${id}/dtmf`, { method: 'POST', token, body: { digit: '1' } });
  });
  assert(invalid.call.resultCode === 'okay', 'A later valid key should complete the call');

  const assistance = await callAnd(token, elder.id, (id) => api(`/api/calls/${id}/dtmf`, {
    method: 'POST',
    token,
    body: { digit: '2' }
  }));
  assert(assistance.alert.type === 'assistance', 'DTMF 2 should open an assistance alert');
  const sms = await api('/api/notifications?channel=sms', { token: adminToken });
  assert(sms.some((item) => item.body.includes('requested assistance')), 'Assistance should create a demo SMS');

  const socket = io(API, { auth: { token: adminToken }, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket did not connect')), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', reject);
  });
  const realtime = waitForAlert(socket);
  const emergency = await callAnd(token, elder.id, (id) => api(`/api/calls/${id}/dtmf`, {
    method: 'POST',
    token,
    body: { digit: '3' }
  }));
  const event = await realtime;
  assert(emergency.alert.type === 'emergency', 'DTMF 3 should open an emergency');
  assert(event.alertId === emergency.alert.id, 'Admin realtime event should match the emergency');
  const before = await api(`/api/alerts/${emergency.alert.id}`, { token: adminToken });
  assert(before.escalations.length === 1, 'Emergency should notify the first contact immediately');
  await api('/api/settings/system', {
    method: 'PATCH',
    token: adminToken,
    body: { escalationDelaySeconds: 0 }
  });
  await api('/api/system/scheduler/tick', { method: 'POST', token: adminToken });
  const after = await api(`/api/alerts/${emergency.alert.id}`, { token: adminToken });
  assert(after.escalations.length >= 2, 'Escalation should continue to the next contact');
  socket.close();

  const missed = await callAnd(token, elder.id, async (id) => {
    const first = await api(`/api/calls/${id}/simulate`, {
      method: 'POST',
      token,
      body: { outcome: 'no_answer' }
    });
    assert(first.call.status === 'no_answer', 'No answer should be recorded');
    assert(first.retry?.status === 'retry_pending', 'A retry should be scheduled');
    assert(!first.alert, 'The first unanswered attempt must not raise an alert');
    await api('/api/system/scheduler/tick', { method: 'POST', token: adminToken });
    await pollCall(token, first.retry.id);
    return api(`/api/calls/${first.retry.id}/simulate`, {
      method: 'POST',
      token,
      body: { outcome: 'no_answer' }
    });
  });
  assert(missed.call.status === 'missed', 'Final no-answer should be a missed check-in');
  assert(missed.alert.type === 'missed_checkin', 'Missed check-in alert should be created');
  const elderAlerts = await api(`/api/alerts?elderlyId=${elder.id}`, { token: adminToken });
  assert(
    elderAlerts.filter((item) => item.callId === missed.call.id).every((item) => item.type !== 'emergency'),
    'A missed call must not be classified as an emergency'
  );

  const failed = await callAnd(token, elder.id, (id) => api(`/api/calls/${id}/simulate`, {
    method: 'POST',
    token,
    body: { outcome: 'failed' }
  }));
  assert(failed.call.status === 'failed', 'Failed calls should be stored');

  const reminder = await api('/api/reminders', {
    method: 'POST',
    token,
    body: {
      elderlyId: elder.id,
      type: 'medication',
      title: 'Evening tablet',
      timeOfDay: '20:00',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      enabled: true
    }
  });
  const disabled = await api(`/api/reminders/${reminder.id}`, {
    method: 'PATCH',
    token,
    body: { enabled: false }
  });
  assert(disabled.enabled === false, 'Reminders can be turned off');
  await api(`/api/reminders/${reminder.id}`, { method: 'DELETE', token });

  const order = await api('/api/care-orders', {
    method: 'POST',
    token,
    body: {
      elderlyId: elder.id,
      type: 'grocery',
      notes: 'Acceptance groceries',
      items: [{ name: 'Rice', quantity: 1, unitPrice: 450 }]
    }
  });
  const updatedOrder = await api(`/api/care-orders/${order.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'processing', providerId: BASKET }
  });
  assert(updatedOrder.events.some((event) => event.stage === 'preparing'), 'Delivery tracking should record preparing');
  const seen = await api(`/api/care-orders/${order.id}`, { token });
  assert(seen.status === 'processing', 'Customer should see the updated order');

  const payment = await api('/api/payments', {
    method: 'POST',
    token,
    body: { orderId: order.id }
  });
  assert(payment.status === 'successful' && payment.transactionRef.startsWith('SV'), 'Demo payment should succeed');

  const upgraded = await api('/api/subscriptions', {
    method: 'POST',
    token,
    body: { planId: COMPLETE }
  });
  assert(upgraded.plan.code === 'complete', 'Customer can change plan');

  const plan = await api('/api/subscriptions/plans', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Pilot Plan',
      code: `pilot-${Date.now()}`,
      description: 'Illustrative demo price',
      priceLkr: 1000,
      services: ['Wellness call'],
      active: true
    }
  });
  const inactive = await api(`/api/subscriptions/plans/${plan.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { active: false }
  });
  assert(inactive.active === false, 'Admin can deactivate a plan');

  const calls = await api('/api/reports/calls', { token: adminToken });
  const emergencies = await api('/api/reports/emergencies', { token: adminToken });
  assert(calls.length > 0 && emergencies.length > 0, 'Reports should return rows');
  const support = await api('/api/support', {
    method: 'POST',
    token,
    body: { subject: 'Acceptance help', message: 'Please confirm the demo call flow.' }
  });
  const supportList = await api('/api/support', { token: adminToken });
  assert(supportList.some((item) => item.id === support.id), 'Admin should see the support request');

  const dashboard = await api('/api/dashboard', { token: adminToken });
  assert(dashboard.totals.customers >= 2, 'Admin dashboard should count customers');
  console.log('Acceptance checks passed');
  return adminToken;
}

try {
  await main();
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (globalThis.adminToken) {
    await raw('/api/settings/system', {
      method: 'PATCH',
      token: globalThis.adminToken,
      body: { retryAttempts: 2, retryDelaySeconds: 30, escalationDelaySeconds: 45, schedulerEnabled: true }
    });
  }
}
