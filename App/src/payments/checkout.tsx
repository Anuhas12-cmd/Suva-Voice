import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../api';
import { useApp } from '../session';
import { money, validateContact, validateDelivery, validateDemoCard, type FieldErrors, type Target, type Result } from './domain';
import { Button, Card, Check, Copy, Divider, Field, Icon, IconTile, Info, Line, Loading, Notice, Page, Pill, TextLink, palette } from './ui';

type Plan = { id: string; name: string; priceLkr: string; billingPeriod: string; description: string; services: string[] };
type Order = { id: string; orderNumber: string; type: string; elderlyName: string; totalAmount: string; status: string; items: { id: string; name: string; quantity: number; lineTotal: string }[]; payments: any[]; doctor?: { doctorOrHospital: string }; transport?: { pickupLocation: string; destination: string } };
const period = (value?: string) => value === 'yearly' ? 'year' : 'month';
export function PlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    return Promise.all([api('/api/subscriptions/plans'), api('/api/subscriptions/current')]).then(([rows, active]) => {
      setPlans(rows); setCurrent(active?.planId); setError('');
    }).catch(error => setError(error.message)).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <Page title={'Care for the\nwhole family.'} subtitle="Find the right support for the people who matter." footer={<TextLink onPress={() => router.push('/payments')}>Payment history</TextLink>}>
    {loading || error ? <Loading error={error} retry={refresh} /> : plans.length ? plans.map(plan => <Card key={plan.id} tone={current === plan.id ? 'soft' : 'sage'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pill tone="screen">{current === plan.id ? 'CURRENT PLAN' : plan.billingPeriod.toUpperCase() + ' PLAN'}</Pill><Icon name="leaf" /></View>
      <IconTile name="heart" size={72} tone="screen" /><Copy kind="title">{plan.name}</Copy>
      <Copy color={palette.muted}>{plan.description}</Copy><Copy kind="title">{money(plan.priceLkr)}<Copy color={palette.muted}>{' / ' + period(plan.billingPeriod)}</Copy></Copy>
      {(plan.services || []).map(service => <Copy kind="label" key={service}>{'✓ ' + service}</Copy>)}
      <Button disabled={current === plan.id} onPress={() => router.push({ pathname: '/payments/checkout', params: { kind: 'plan', id: plan.id } })}>{current === plan.id ? 'Your current plan' : 'Review this plan'}</Button>
    </Card>) : <Notice text="No plans are available at the moment. Please check again later." />}
    <Copy kind="caption" center color={palette.muted}>Demo subscriptions · No real card is charged</Copy>
  </Page>;
}

export function CheckoutScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; step?: string }>();
  const { user, controller, record } = useApp();
  const target: Target = { kind: params.kind === 'plan' ? 'plan' : 'order', id: params.id };
  const isPlan = target.kind === 'plan';
  const rawStep = Number(params.step || 1);
  const step = isPlan ? (rawStep === 4 ? 4 : 1) : ([1, 2, 3, 4].includes(rawStep) ? rawStep : 1);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [contact, setContact] = useState({ email: user?.email || '', firstName: user?.fullName?.split(' ')[0] || '', lastName: user?.fullName?.split(' ').slice(1).join(' ') || '', phone: user?.phone || '' });
  const [delivery, setDelivery] = useState({ address: user?.address || '', apartment: '', city: user?.city || '', postalCode: '' });
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' });
  const [sameBilling, setSameBilling] = useState(true);
  const [billing, setBilling] = useState({ address: '', city: '', postalCode: '' });
  const [promo, setPromo] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  const pressLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const hasDelivery = ['grocery', 'essential'].includes(order?.type || '');
  const amount = isPlan ? plan?.priceLkr : order?.totalAmount;
  const existing = order?.payments?.find(p => p.status === 'successful') || order?.payments?.find(p => p.status === 'pending');
  const blocked = !isPlan && (['cancelled', 'completed'].includes(order?.status || '') || !(Number(amount) > 0));

  function load() {
    const request = !params.id ? Promise.reject(new Error('Choose an order or a plan first.')) : api(isPlan ? '/api/subscriptions/plans' : '/api/care-orders/' + params.id);
    return request.then(data => {
      if (isPlan) {
        const found = (data as Plan[]).find(p => p.id === params.id);
        if (!found) throw new Error('This plan is no longer available.');
        setPlan(found);
      } else setOrder(data);
      setError('');
    }).catch(error => setError(error.message)).finally(() => setLoading(false));
  }
  useEffect(() => { void load(); }, [params.id, isPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  function changeStep(next: number) { Keyboard.dismiss(); setError(''); setErrors({}); router.setParams({ step: String(next) }); }
  function back() {
    if (step === 1) router.replace(isPlan ? '/payments/plans' : { pathname: '/order', params: { id: params.id } });
    else changeStep(isPlan ? 1 : step - 1);
  }
  function showResult(result: Result) {
    if (!mounted.current) return;
    if (result.state === 'recorded') record(result.payment);
    router.replace({ pathname: '/payments/result', params: { kind: target.kind, targetId: target.id, ...(result.state === 'recorded' ? { id: result.payment.id } : {}) } });
  }
  function next() {
    const issues = step === 2 ? validateContact(contact) : step === 3 && hasDelivery ? validateDelivery(delivery) : {};
    setErrors(issues);
    if (Object.keys(issues).length) return;
    changeStep(isPlan ? 4 : step + 1);
  }
  async function pay() {
    if (pressLock.current) return;
    if (!isPlan) {
      const contactIssues = validateContact(contact);
      if (Object.keys(contactIssues).length) { changeStep(2); setErrors(contactIssues); return; }
      const deliveryIssues = hasDelivery ? validateDelivery(delivery) : {};
      if (Object.keys(deliveryIssues).length) { changeStep(3); setErrors(deliveryIssues); return; }
    }
    const issues = { ...(Number(amount) > 0 ? validateDemoCard(card) : {}), ...(!sameBilling ? Object.fromEntries(Object.entries(validateDelivery(billing)).map(([key, value]) => ['billing_' + key, value])) : {}) };
    setErrors(issues);
    if (Object.keys(issues).length) return;
    pressLock.current = true; setBusy(true); setError(''); Keyboard.dismiss();
    try { showResult(await controller.submit(target)); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); pressLock.current = false; setCard({ number: '', expiry: '', cvv: '', name: '' }); }
  }
  const title = isPlan ? (step === 1 ? 'Care for the\nwhole family.' : 'One step\nto more care.') : ['A little care,\non its way.', 'Let’s stay\nin touch.', hasDelivery ? 'Where should\nwe deliver?' : 'Your care,\nall arranged.', 'A little closer\nto peace of mind.'][step - 1];
  const subtitle = isPlan ? (step === 1 ? 'Review your plan before continuing.' : 'Choose how to pay for ' + (plan?.name || 'your plan') + '.') : ['Review your order before you continue.', 'Review your contact details for this checkout.', hasDelivery ? 'Choose where your care essentials arrive.' : 'Confirm the service requested for your loved one.', 'Choose how you’d like to pay.'][step - 1];
  const footer = !loading && amount !== undefined ? <>
    <Copy kind="caption" center color={palette.muted}>Demo checkout · No real money is charged</Copy>
    {existing ? <Button onPress={() => showResult({ state: 'recorded', payment: { ...existing, orderId: order?.id } })}>View payment status</Button> : <Button disabled={blocked} busy={busy} onPress={step === 4 ? pay : next}>{blocked ? 'Payment unavailable' : step === 4 ? (Number(amount) === 0 ? 'Activate free plan' : 'Pay ' + money(amount)) : isPlan ? 'Continue to payment' : ['Continue to contact', hasDelivery ? 'Continue to delivery' : 'Review service', 'Continue to payment'][step - 1]}</Button>}
  </> : null;

  return <Page title={title} subtitle={subtitle} step={isPlan ? undefined : step} back={back} footer={footer} resetKey={String(step)}>
    {loading ? <Loading /> : (!plan && !order) ? <Loading error={error} retry={load} /> : <>
      <Notice text={error} error />
      {step === 1 && isPlan && plan ? <>
        <Card tone="sage">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pill tone="screen">{plan.billingPeriod.toUpperCase() + ' PLAN'}</Pill><Icon name="leaf" /></View>
          <IconTile name="heart" size={86} tone="screen" /><Copy kind="title">{plan.name}</Copy>
          <Copy color={palette.muted}>{plan.description}</Copy><Copy kind="display">{money(plan.priceLkr)}</Copy><Copy color={palette.muted}>{'per ' + period(plan.billingPeriod)}</Copy>
          <Divider /><Line label="Billing period" value={'One ' + period(plan.billingPeriod)} /><Line label="Total today" value={money(plan.priceLkr)} strong />
        </Card>
        <Info name="shield" title={'One simple ' + plan.billingPeriod + ' payment'} detail="Review your subscription in the app." />
        <Info name="receipt" title="Easy-to-find receipts" detail="Every payment stays in your history." />
      </> : null}
      {step === 1 && !isPlan && order ? <>
        <Card tone="sage">
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Pill tone="screen">YOUR ORDER</Pill><Icon name="leaf" /></View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><IconTile name="package" size={64} tone="screen" /><View style={{ flex: 1, gap: 4 }}><Copy kind="heading">{hasDelivery ? 'Care essentials' : 'Care service'}</Copy><Copy kind="caption" color={palette.muted}>{order.orderNumber + ' · ' + order.elderlyName}</Copy></View></View>
          <Divider />
          {(order.items || []).map(item => <Line key={item.id} label={item.name + ' × ' + item.quantity} value={money(item.lineTotal)} />)}
          <Line label="Order total" value={money(order.totalAmount)} />
        </Card>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}><Field label="Have a discount code?" placeholder="Enter code" value={promo} onChangeText={setPromo} /><Button secondary onPress={() => setPromoMessage('Promo codes are not available for demo payments.')}>Apply</Button></View>
        <Notice text={promoMessage} />
        <Card tone="soft"><Line label="Total to pay" value={money(order.totalAmount)} strong /><Copy kind="caption" color={palette.muted}>The total saved with your order. No extra delivery fee.</Copy></Card>
        <Copy kind="caption" center color={palette.muted}>EXPRESS CHECKOUT</Copy><Button secondary disabled onPress={() => {}}>Google Pay · Not connected</Button>
        {existing ? <Notice text={'This order already has a ' + existing.status + ' payment.'} /> : blocked ? <Notice text="This order cannot be paid. Return to your orders to review its status." /> : null}
      </> : null}
      {step === 2 ? <>
        <Field label="Email address" value={contact.email} onChangeText={email => setContact({ ...contact, email })} error={errors.email} keyboardType="email-address" autoComplete="email" />
        <View style={{ flexDirection: 'row', gap: 12 }}><Field label="First name" value={contact.firstName} onChangeText={firstName => setContact({ ...contact, firstName })} error={errors.firstName} autoCapitalize="words" /><Field label="Last name (optional)" value={contact.lastName} onChangeText={lastName => setContact({ ...contact, lastName })} autoCapitalize="words" /></View>
        <Field label="Phone number" value={contact.phone} onChangeText={phone => setContact({ ...contact, phone })} error={errors.phone} keyboardType="phone-pad" />
        <Card tone="soft"><Copy kind="label">Your checkout preview</Copy><Copy kind="caption" color={palette.muted}>These details are kept only while this checkout is open. Your saved account details stay the same.</Copy></Card>
        <Info name="receipt" title="Your receipt, always close" detail="Find your confirmed payment in Payment history." />
      </> : null}
      {step === 3 ? hasDelivery ? <>
        <Field label="Country / region" value="Sri Lanka" editable={false} />
        <Field label="Street address" placeholder="House number and street" value={delivery.address} onChangeText={address => setDelivery({ ...delivery, address })} error={errors.address} autoCapitalize="sentences" />
        <Field label="Apartment, suite, etc. (optional)" placeholder="Apartment or building" value={delivery.apartment} onChangeText={apartment => setDelivery({ ...delivery, apartment })} />
        <View style={{ flexDirection: 'row', gap: 12 }}><Field label="City" value={delivery.city} onChangeText={city => setDelivery({ ...delivery, city })} error={errors.city} /><Field label="Postal code" placeholder="00100" value={delivery.postalCode} onChangeText={postalCode => setDelivery({ ...delivery, postalCode })} error={errors.postalCode} keyboardType="number-pad" maxLength={5} /></View>
        <Card tone="sage"><Info name="truck" title="Delivery details preview" detail="This demo does not update your order’s delivery address. Confirm delivery arrangements with your care team." /></Card>
      </> : <Card tone="sage"><IconTile name="heart" size={64} tone="screen" /><Copy kind="heading">{order?.elderlyName}</Copy><Copy>{order?.doctor?.doctorOrHospital || (order?.transport ? order.transport.pickupLocation + ' → ' + order.transport.destination : 'Your requested care service')}</Copy><Copy kind="caption" color={palette.muted}>No delivery address is needed for this service.</Copy></Card> : null}
      {step === 4 ? <>
        <Card tone="sage"><Pill tone="screen">{isPlan ? plan?.name.toUpperCase() + ' · ' + plan?.billingPeriod.toUpperCase() : order?.orderNumber}</Pill><Line label="Total today" value={money(amount || 0)} strong /></Card>
        {isPlan ? <Field label="Account email" value={user?.email} editable={false} /> : null}
        {Number(amount) > 0 ? <Card>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name="card" /><Copy kind="heading">Credit / debit card</Copy></View>
          <Notice text="Demo card only. Use the sample below; do not enter real card details." />
          <TextLink onPress={() => { setCard({ number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123', name: 'Demo User' }); setErrors({}); }}>Use demo card</TextLink>
          <Field label="Card number" value={card.number} placeholder="4242 4242 4242 4242" onChangeText={number => setCard({ ...card, number })} error={errors.number} keyboardType="number-pad" maxLength={19} autoComplete="off" importantForAutofill="no" />
          <View style={{ flexDirection: 'row', gap: 12 }}><Field label="Expiry date" placeholder="12/30" value={card.expiry} onChangeText={expiry => setCard({ ...card, expiry })} error={errors.expiry} maxLength={5} /><Field label="Security code" placeholder="123" value={card.cvv} onChangeText={cvv => setCard({ ...card, cvv })} error={errors.cvv} keyboardType="number-pad" secureTextEntry maxLength={3} autoComplete="off" importantForAutofill="no" /></View>
          <Field label="Name on card" placeholder="Demo User" value={card.name} onChangeText={name => setCard({ ...card, name })} error={errors.name} autoCapitalize="words" autoComplete="off" />
          <Check label={isPlan ? 'Use my saved billing address' : 'Use this as my billing address'} checked={sameBilling} onChange={() => setSameBilling(!sameBilling)} />
          {!sameBilling ? <><Field label="Billing street address" value={billing.address} onChangeText={address => setBilling({ ...billing, address })} error={errors.billing_address} /><Field label="Billing city" value={billing.city} onChangeText={city => setBilling({ ...billing, city })} error={errors.billing_city} /><Field label="Billing postal code" value={billing.postalCode} onChangeText={postalCode => setBilling({ ...billing, postalCode })} error={errors.billing_postalCode} keyboardType="number-pad" maxLength={5} /><Copy kind="caption" color={palette.muted}>Billing address preview only; it is not saved.</Copy></> : null}
        </Card> : <Info name="heart" title="Ready for more care" detail="This plan is free. No card details are needed." />}
        {!isPlan ? <Card>{['Onepay · Credit / debit card', 'Koko · Buy now, pay later', 'Mintpay · Shop now, pay later'].map((name, index) => <View key={name} style={{ gap: 16 }}>{index ? <Divider /> : null}<Pressable accessibilityRole="radio" accessibilityState={{ disabled: true, checked: false }} disabled style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 18, height: 18, borderRadius: 9, borderColor: palette.line, borderWidth: 1 }} /><View style={{ flex: 1 }}><Copy kind="label" color={palette.muted}>{name}</Copy><Copy kind="caption" color={palette.muted}>Not connected</Copy></View></Pressable></View>)}</Card> : null}
      </> : null}
    </>}
  </Page>;
}
