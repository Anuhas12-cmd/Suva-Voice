export type Payment = {
  id: string; status: 'successful' | 'pending' | 'failed'; amount: number | string;
  transactionRef: string; serviceLabel?: string; provider?: string; currency?: string;
  createdAt: string; paidAt?: string; orderId?: string; subscriptionId?: string;
};
export type Target = { kind: 'order' | 'plan'; id: string };
export type Attempt = { since: number; knownPaymentIds?: string[] };
export type Result = { state: 'recorded'; payment: Payment } | { state: 'unknown' };
export type Contact = { email: string; firstName: string; lastName: string; phone: string };
export type Delivery = { address: string; city: string; postalCode: string; apartment?: string };
export type DemoCard = { number: string; expiry: string; cvv: string; name: string };
export type FieldErrors = Record<string, string>;
export const money = (value: number | string) => `LKR ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dateLabel = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not available';
export const statusLabel = (status: string) => ({ successful: 'Paid', pending: 'Pending', failed: 'Failed' })[status] || 'Checking';
export const filterPayments = (payments: Payment[], filter: string) => filter === 'all' ? payments : payments.filter(p => p.status === filter);

export function validateContact(form: Contact): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (!form.firstName.trim()) errors.firstName = 'Enter your first name.';
  if (!/^\+?[\d\s()-]{9,20}$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number.';
  return errors;
}
export function validateDelivery(form: Delivery): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.address.trim()) errors.address = 'Enter a street address.';
  if (!form.city.trim()) errors.city = 'Enter a city.';
  if (!/^\d{5}$/.test(form.postalCode.trim())) errors.postalCode = 'Use a 5-digit postal code.';
  return errors;
}
export function validateDemoCard(form: DemoCard): FieldErrors {
  const errors: FieldErrors = {};
  if (form.number.replace(/\s/g, '') !== '4242424242424242') errors.number = 'Use the demo card 4242 4242 4242 4242.';
  if (form.expiry.replace(/\s/g, '') !== '12/30') errors.expiry = 'Use the demo expiry 12/30.';
  if (form.cvv !== '123') errors.cvv = 'Use the demo code 123.';
  if (!form.name.trim()) errors.name = 'Enter a name for this demo.';
  return errors;
}

type ControllerDependencies = {
  isActive?: () => boolean;
  // The existing JavaScript API has varied response shapes. Narrow each at its endpoint.
  request: (path: string, options?: { method?: string; body?: object }) => Promise<any>;
  readAttempt: (target: Target) => Promise<Attempt | null>;
  writeAttempt: (target: Target, value: Attempt) => Promise<void>;
  clearAttempt: (target: Target) => Promise<void>;
};
export function createPaymentController({ request, readAttempt, writeAttempt, clearAttempt, isActive = () => true }: ControllerDependencies) {
  let inFlight = false;
  function assertActive() { if (!isActive()) throw new Error('Your session changed. Open checkout again from your account.'); }
  async function lookup(target: Target, attempt?: Attempt): Promise<{ payment: Payment | null; knownPaymentIds: string[] }> {
    assertActive();
    if (target.kind === 'order') {
      const order = await request(`/api/care-orders/${target.id}`);
      assertActive();
      const payments: Payment[] = order.payments || [];
      const knownPaymentIds = payments.map(p => p.id);
      const existing = payments.find(p => p.status === 'successful') || payments.find(p => p.status === 'pending') || (attempt?.knownPaymentIds ? payments.find(p => !attempt.knownPaymentIds!.includes(p.id)) : null);
      if (existing) return { payment: { ...existing, orderId: target.id }, knownPaymentIds };
      if (['cancelled', 'completed'].includes(order.status) || !(Number(order.totalAmount) > 0)) throw new Error('This order is not available for payment.');
      return { payment: null, knownPaymentIds };
    }
    const current = await request('/api/subscriptions/current');
    assertActive();
    if (current?.planId !== target.id) return { payment: null, knownPaymentIds: [] };
    const payments: Payment[] = await request('/api/payments');
    assertActive();
    const found = payments.find(p => p.subscriptionId === current.id);
    if (!found) throw new Error('This plan is already active. Check your subscription and payment history.');
    return { payment: found, knownPaymentIds: payments.map(p => p.id) };
  }
  async function resolve(target: Target): Promise<Result> {
    const attempt = await readAttempt(target);
    const { payment } = await lookup(target, attempt || undefined);
    if (payment) { await clearAttempt(target); assertActive(); return { state: 'recorded', payment }; }
    return { state: 'unknown' };
  }
  async function submit(target: Target): Promise<Result> {
    if (inFlight) throw new Error('A payment is already being checked.');
    inFlight = true;
    try {
      assertActive();
      if (await readAttempt(target)) return resolve(target);
      const { payment: existing, knownPaymentIds } = await lookup(target);
      assertActive();
      if (existing) return { state: 'recorded', payment: existing };
      // Persist before sending so a lost response or a reload never silently resubmits.
      await writeAttempt(target, { since: Date.now(), knownPaymentIds });
      assertActive();
      let response;
      try {
        response = target.kind === 'order'
          ? await request('/api/payments', { method: 'POST', body: { orderId: target.id } })
          : (await request('/api/subscriptions', { method: 'POST', body: { planId: target.id } })).payment;
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500 && ![408, 409, 429].includes(status)) { await clearAttempt(target); throw error; }
        return { state: 'unknown' };
      }
      assertActive();
      if (!response?.id || !['successful', 'pending', 'failed'].includes(response.status)) return { state: 'unknown' };
      await clearAttempt(target);
      assertActive();
      return { state: 'recorded', payment: response };
    } finally { inFlight = false; }
  }
  return { submit, resolve };
}

export function receiptText(payment: Payment): string {
  if (payment.status !== 'successful') throw new Error('A receipt is available after payment is confirmed.');
  return ['SUVA VOICE', 'DEMO PAYMENT RECEIPT', '', payment.serviceLabel || 'Care payment', `Reference: ${payment.transactionRef}`, `Date: ${dateLabel(payment.paidAt || payment.createdAt)}`, `Method: ${payment.provider === 'demo' ? 'Demo payment' : payment.provider || 'Not recorded'}`, `Total paid: ${money(payment.amount)}`, '', 'No real card was charged by this demo.', 'Thank you for choosing Suva Voice.'].join('\n');
}
