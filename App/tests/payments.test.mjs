import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentController, validateContact, validateDelivery, validateDemoCard, receiptText, money, filterPayments } from '../src/payments/domain.ts';

const order = { id: 'order-1', totalAmount: '1500.50', status: 'pending', payments: [] };
const payment = { id: 'p1', orderId: 'order-1', status: 'successful', amount: '1500.50', serviceLabel: 'Care essentials', transactionRef: 'SV123', provider: 'demo', createdAt: '2026-10-16T09:00:00Z' };
function setup(handler) {
  let attempt = null;
  const calls = [];
  const controller = createPaymentController({
    request: async (path, options) => { calls.push({ path, options }); return handler(path, options); },
    readAttempt: async () => attempt,
    writeAttempt: async (_, value) => { attempt = value; },
    clearAttempt: async () => { attempt = null; },
  });
  return { controller, calls, attempt: () => attempt };
}
test('contact and delivery errors are field-specific; optional apartment is optional', () => {
  assert.ok(validateContact({ email: 'bad', firstName: '', lastName: '', phone: 'abc' }).email);
  assert.deepEqual(validateContact({ email: 'a@example.com', firstName: 'A', lastName: '', phone: '+94 77 123 4567' }), {});
  assert.ok(validateDelivery({ address: '', city: '', postalCode: 'x' }).address);
  assert.deepEqual(validateDelivery({ address: '12 Main St', city: 'Colombo', postalCode: '00100' }), {});
});
test('card form accepts only the demo card, never a real card', () => {
  assert.deepEqual(validateDemoCard({ number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123', name: 'Demo User' }), {});
  assert.ok(validateDemoCard({ number: '5555 5555 5555 4444', expiry: '12/30', cvv: '123', name: 'A' }).number);
  assert.ok(validateDemoCard({ number: '4242424242424242', expiry: '11/10', cvv: '', name: '' }).expiry);
});
test('order request contains only its id; server controls the amount', async () => {
  const h = setup((path, options) => options?.method === 'POST' ? payment : order);
  const result = await h.controller.submit({ kind: 'order', id: order.id });
  assert.equal(result.payment.id, 'p1');
  assert.deepEqual(h.calls.at(-1).options.body, { orderId: order.id });
  assert.equal(h.attempt(), null);
});
test('paid and pending orders never create another charge', async () => {
  for (const status of ['successful', 'pending']) {
    const h = setup(() => ({ ...order, payments: [{ ...payment, status }] }));
    assert.equal((await h.controller.submit({ kind: 'order', id: order.id })).payment.status, status);
    assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 0);
  }
});
test('cancelled and zero-amount orders are blocked before posting', async () => {
  for (const item of [{ ...order, status: 'cancelled' }, { ...order, totalAmount: 0 }]) {
    const h = setup(() => item);
    await assert.rejects(h.controller.submit({ kind: 'order', id: order.id }));
    assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 0);
  }
});
test('double-tap creates only one request', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const h = setup(async (_, options) => { if (options?.method === 'POST') { await wait; return payment; } return order; });
  const first = h.controller.submit({ kind: 'order', id: order.id });
  await assert.rejects(h.controller.submit({ kind: 'order', id: order.id }), /already/);
  release();
  await first;
  assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 1);
});
test('lost response persists an unknown attempt and cannot be submitted again', async () => {
  const h = setup((_, options) => { if (options?.method === 'POST') throw new Error('network lost'); return order; });
  assert.equal((await h.controller.submit({ kind: 'order', id: order.id })).state, 'unknown');
  assert.ok(h.attempt());
  assert.equal((await h.controller.submit({ kind: 'order', id: order.id })).state, 'unknown');
  assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 1);
});
test('uncertain order is reconciled using authoritative order payments', async () => {
  let posted = false;
  const h = setup((_, options) => { if (options?.method === 'POST') { posted = true; throw new Error('lost'); } return { ...order, payments: posted ? [payment] : [] }; });
  await h.controller.submit({ kind: 'order', id: order.id });
  assert.equal((await h.controller.resolve({ kind: 'order', id: order.id })).payment.id, 'p1');
  assert.equal(h.attempt(), null);
});
test('a confirmed client rejection allows correction and retry', async () => {
  const h = setup((_, options) => { if (options?.method === 'POST') throw Object.assign(new Error('not allowed'), { status: 400 }); return order; });
  await assert.rejects(h.controller.submit({ kind: 'order', id: order.id }), /not allowed/);
  assert.equal(h.attempt(), null);
});
test('a prior failed payment cannot resolve a newer uncertain attempt or unlock retry', async () => {
  const oldFailure = { ...payment, id: 'old-failure', status: 'failed', createdAt: new Date(Date.now() - 1000).toISOString() };
  const h = setup((_, options) => { if (options?.method === 'POST') throw new Error('lost response'); return { ...order, payments: [oldFailure] }; });
  const target = { kind: 'order', id: order.id };
  assert.equal((await h.controller.submit(target)).state, 'unknown');
  assert.equal((await h.controller.resolve(target)).state, 'unknown');
  assert.ok(h.attempt());
  assert.equal((await h.controller.submit(target)).state, 'unknown');
  assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 1);
});
test('current subscription is not purchased again', async () => {
  const h = setup(path => path.endsWith('/current') ? { id: 'sub1', planId: 'plan1' } : [{ ...payment, subscriptionId: 'sub1' }]);
  assert.equal((await h.controller.submit({ kind: 'plan', id: 'plan1' })).payment.id, 'p1');
  assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 0);
});
test('plan purchase posts only a plan id, including free plans', async () => {
  const h = setup((path, options) => options?.method === 'POST' ? { payment: { ...payment, amount: 0 } } : null);
  assert.equal((await h.controller.submit({ kind: 'plan', id: 'free-plan' })).payment.amount, 0);
  assert.deepEqual(h.calls.at(-1).options.body, { planId: 'free-plan' });
});
test('switching accounts during a preflight cannot submit a plan', async () => {
  let active = true;
  let posts = 0;
  const controller = createPaymentController({
    isActive: () => active,
    request: async (_, options) => { if (options?.method === 'POST') { posts++; return { payment }; } active = false; return null; },
    readAttempt: async () => null, writeAttempt: async () => {}, clearAttempt: async () => {},
  });
  await assert.rejects(controller.submit({ kind: 'plan', id: 'plan1' }), /session/i);
  assert.equal(posts, 0);
});
test('receipt uses server truth and cannot be issued for pending payment', () => {
  const text = receiptText(payment);
  assert.match(text, /SV123/);
  assert.match(text, /Demo payment/);
  assert.doesNotMatch(text, /Visa|4242|delivery/i);
  assert.throws(() => receiptText({ ...payment, status: 'pending' }));
  assert.equal(money('1500.5'), 'LKR 1,500.50');
  assert.equal(filterPayments([payment, { ...payment, status: 'failed' }], 'successful').length, 1);
});
