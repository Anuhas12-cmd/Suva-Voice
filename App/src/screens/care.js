import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { api } from '../api';
import { errorsFrom, label, money, when } from '../format';
import { Art, Back, Badge, Btn, Card, Chips, Empty, Field, Notice, Row, Screen, Text, Title } from '../ui';

export function Reminders({ go, params, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const query = params.elderlyId ? `?elderlyId=${params.elderlyId}` : '';
    api(`/api/reminders${query}`).then(setRows).catch(() => {});
  }, [params.elderlyId, tick]);
  async function toggle(item) {
    await api(`/api/reminders/${item.id}`, { method: 'PATCH', body: { enabled: !item.enabled } });
    const query = params.elderlyId ? `?elderlyId=${params.elderlyId}` : '';
    setRows(await api(`/api/reminders${query}`));
  }
  async function remove(id) {
    try {
      await api(`/api/reminders/${id}`, { method: 'DELETE' });
      setRows((current) => current.filter((item) => item.id !== id));
    } catch {
      /* the reminder stays if the request fails */
    }
  }
  return (
    <Screen>
      <Back onPress={() => (params.elderlyId ? go('loved-profile', { id: params.elderlyId }) : go('more'))} />
      <Title>Reminders</Title>
      <Btn onPress={() => go('reminder-form', { elderlyId: params.elderlyId })}>Create reminder</Btn>
      {rows.map((item) => (
        <Card key={item.id}>
          <Text style={{ fontWeight: '800' }}>{item.title}</Text>
          <Text>{item.elderlyName} · {String(item.timeOfDay).slice(0, 5)}</Text>
          <Badge value={item.type} />
          <Badge value={item.enabled ? 'active' : 'disabled'} />
          <Btn kind="secondary" onPress={() => toggle(item)}>{item.enabled ? 'Disable' : 'Enable'}</Btn>
          <Btn kind="secondary" onPress={() => go('reminder-form', { id: item.id, elderlyId: item.elderlyId })}>Edit</Btn>
<Btn kind="ghost" onPress={() => remove(item.id)}>Delete</Btn>
          </Card>
        ))}
      {!rows.length ? <Empty text="No reminders yet." /> : null}
    </Screen>
  );
}

export function ReminderForm({ go, params }) {
  const [elders, setElders] = useState([]);
  const [form, setForm] = useState({ elderlyId: params.elderlyId || '', type: 'medication', title: '', notes: '', timeOfDay: '08:00' });
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/elderly').then((rows) => {
      setElders(rows);
      setForm((current) => ({ ...current, elderlyId: current.elderlyId || rows[0]?.id || '' }));
    }).catch(() => {});
    if (params.id) {
      api('/api/reminders').then((rows) => {
        const found = rows.find((item) => item.id === params.id);
        if (found) setForm({ elderlyId: found.elderlyId, type: found.type, title: found.title, notes: found.notes || '', timeOfDay: String(found.timeOfDay).slice(0, 5) });
      }).catch(() => {});
    }
  }, [params.id, params.elderlyId]);
  async function save() {
    setError('');
    try {
      if (params.id) await api(`/api/reminders/${params.id}`, { method: 'PATCH', body: { type: form.type, title: form.title, notes: form.notes, timeOfDay: form.timeOfDay } });
      else await api('/api/reminders', { method: 'POST', body: form });
      go('reminders', { elderlyId: form.elderlyId });
    } catch (err) {
      const fields = errorsFrom(err);
      setError(fields.title || fields.timeOfDay || fields.notes || err.message);
    }
  }
  return (
    <Screen>
      <Back onPress={() => go('reminders', { elderlyId: form.elderlyId || params.elderlyId })} />
      <Title>{params.id ? 'Edit reminder' : 'Create reminder'}</Title>
      <Notice text={error} bad />
      <Text style={{ fontWeight: '800' }}>Loved one</Text>
      <Chips options={elders.map((item) => [item.id, item.fullName])} value={form.elderlyId} onChange={(elderlyId) => setForm({ ...form, elderlyId })} />
      <Text style={{ fontWeight: '800' }}>Type</Text>
      <Chips options={[['medication', 'Medication'], ['meal', 'Meal'], ['rest', 'Rest'], ['other', 'Other']]} value={form.type} onChange={(type) => setForm({ ...form, type })} />
      <Field labelText="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
      <Field labelText="Notes" value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} />
      <Field labelText="Time (HH:MM)" value={form.timeOfDay} onChangeText={(timeOfDay) => setForm({ ...form, timeOfDay })} />
      <Btn onPress={save}>Save reminder</Btn>
    </Screen>
  );
}

export function Orders({ go, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/care-orders').then(setRows).catch(() => {}); }, [tick]);
  return (
    <Screen tabs tab="orders" go={go}>
      <Title sub="Groceries, essentials, appointments, and transport">Care orders</Title>
      <Image source={require('../../assets/photos/basket.jpg')} style={{ width: '100%', height: 120, borderRadius: 22 }} resizeMode="cover" />
      <Btn onPress={() => go('order-form')}>Create order</Btn>
      {rows.map((item) => (
        <Row
          key={item.id}
          title={item.orderNumber}
          meta={`${item.elderlyName} · ${label(item.type)} · ${money(item.totalAmount)}`}
          value={item.status}
          onPress={() => go('order', { id: item.id })}
        />
      ))}
      {!rows.length ? <><Art compact source={require('../../assets/photos/basket.jpg')} /><Empty text="No care orders yet." /></> : null}
    </Screen>
  );
}

export function OrderForm({ go }) {
  const [elders, setElders] = useState([]);
  const [form, setForm] = useState({ elderlyId: '', type: 'grocery', notes: '', itemName: 'Rice 5kg', quantity: '1', unitPrice: '1250', doctorOrHospital: '', preferredDate: '', preferredTime: '10:30', pickupLocation: '', destination: '', travelDate: '', travelTime: '09:00' });
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/elderly').then((rows) => {
      setElders(rows);
      setForm((current) => ({ ...current, elderlyId: rows[0]?.id || '' }));
    }).catch(() => {});
  }, []);
  async function save() {
    setError('');
    const body = { elderlyId: form.elderlyId, type: form.type, notes: form.notes };
    if (form.type === 'grocery' || form.type === 'essential') {
      body.items = [{ name: form.itemName, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice) }];
    }
    if (form.type === 'doctor') {
      body.doctor = { doctorOrHospital: form.doctorOrHospital, preferredDate: form.preferredDate || undefined, preferredTime: form.preferredTime, notes: form.notes };
    }
    if (form.type === 'transport') {
      body.transport = { pickupLocation: form.pickupLocation, destination: form.destination, travelDate: form.travelDate || undefined, travelTime: form.travelTime, notes: form.notes };
    }
    try {
      const order = await api('/api/care-orders', { method: 'POST', body });
      go('order', { id: order.id });
    } catch (err) {
      const fields = errorsFrom(err);
      setError(Object.values(fields)[0] || err.message);
    }
  }
  return (
    <Screen>
      <Back onPress={() => go('orders')} />
      <Title>New care order</Title>
      <Notice text={error} bad />
      <Chips options={elders.map((item) => [item.id, item.fullName])} value={form.elderlyId} onChange={(elderlyId) => setForm({ ...form, elderlyId })} />
      <Chips options={[['grocery', 'Grocery'], ['essential', 'Essential'], ['doctor', 'Doctor'], ['transport', 'Transport']]} value={form.type} onChange={(type) => setForm({ ...form, type })} />
      <Field labelText="Notes" value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} />
      {(form.type === 'grocery' || form.type === 'essential') ? (
        <>
          <Field labelText="Item" value={form.itemName} onChangeText={(itemName) => setForm({ ...form, itemName })} />
          <Field labelText="Quantity" value={form.quantity} onChangeText={(quantity) => setForm({ ...form, quantity })} />
          <Field labelText="Unit price (LKR)" value={form.unitPrice} onChangeText={(unitPrice) => setForm({ ...form, unitPrice })} />
        </>
      ) : null}
      {form.type === 'doctor' ? (
        <>
          <Field labelText="Doctor or hospital" value={form.doctorOrHospital} onChangeText={(doctorOrHospital) => setForm({ ...form, doctorOrHospital })} />
          <Field labelText="Preferred date (YYYY-MM-DD)" value={form.preferredDate} onChangeText={(preferredDate) => setForm({ ...form, preferredDate })} />
          <Field labelText="Preferred time" value={form.preferredTime} onChangeText={(preferredTime) => setForm({ ...form, preferredTime })} />
        </>
      ) : null}
      {form.type === 'transport' ? (
        <>
          <Field labelText="Pickup" value={form.pickupLocation} onChangeText={(pickupLocation) => setForm({ ...form, pickupLocation })} />
          <Field labelText="Destination" value={form.destination} onChangeText={(destination) => setForm({ ...form, destination })} />
          <Field labelText="Date (YYYY-MM-DD)" value={form.travelDate} onChangeText={(travelDate) => setForm({ ...form, travelDate })} />
          <Field labelText="Time" value={form.travelTime} onChangeText={(travelTime) => setForm({ ...form, travelTime })} />
        </>
      ) : null}
      <Btn onPress={save}>Request order</Btn>
    </Screen>
  );
}

const stages = ['order_confirmed', 'preparing', 'in_transit', 'delivered'];

export function OrderDetail({ go, params, tick }) {
  const [order, setOrder] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api(`/api/care-orders/${params.id}`).then(setOrder).catch((err) => setError(err.message)); }, [params.id, tick]);
  if (!order) return <Screen><Text>{error || 'Loading order…'}</Text></Screen>;
  const current = stages.indexOf(order.events?.at(-1)?.stage || 'order_confirmed');
  return (
    <Screen>
      <Back onPress={() => go('orders')} />
      <Title sub={order.elderlyName}>{order.orderNumber}</Title>
      <Badge value={order.status} />
      <Notice text={notice} />
      <Notice text={error} bad />
      <Card>
        <Text style={{ fontWeight: '800' }}>Tracking</Text>
        {['Order Confirmed', 'Preparing', 'In Transit', 'Delivered'].map((name, index) => (
          <Text key={name} style={{ fontWeight: index <= current ? '800' : '500' }}>{index <= current ? '●' : '○'} {name}</Text>
        ))}
        <Text>Estimated arrival: {order.estimatedArrival ? when(order.estimatedArrival) : 'to be confirmed'}</Text>
        <Text>Provider: {order.providerName || 'Not assigned yet'}</Text>
      </Card>
      <Card>
        {(order.items || []).map((item) => <Text key={item.id}>{item.name} × {item.quantity} · {money(item.lineTotal)}</Text>)}
        <Text style={{ fontWeight: '800' }}>Total {money(order.totalAmount)}</Text>
        {order.doctor ? <Text>Appointment: {order.doctor.doctorOrHospital} · {order.doctor.preferredDate}</Text> : null}
        {order.transport ? <Text>Ride: {order.transport.pickupLocation} → {order.transport.destination}</Text> : null}
        {order.status !== 'cancelled' && order.status !== 'completed' ? (
          <>
            <Btn onPress={async () => {
              try {
                const payment = await api('/api/payments', { method: 'POST', body: { orderId: order.id } });
                setNotice(`Payment ${payment.transactionRef} is ${payment.status}.`);
              } catch (err) { setError(err.message); }
            }}>Pay {money(order.totalAmount)}</Btn>
            <Btn kind="secondary" onPress={async () => {
              try {
                await api(`/api/care-orders/${order.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
                setOrder(await api(`/api/care-orders/${order.id}`));
              } catch (err) { setError(err.message); }
            }}>Cancel order</Btn>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

export function Payments({ go, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/payments').then(setRows).catch(() => {}); }, [tick]);
  const total = rows.filter((item) => item.status === 'successful').reduce((sum, item) => sum + Number(item.amount), 0);
  return (
    <Screen>
      <Back onPress={() => go('more')} />
      <Title sub="Demo records in Sri Lankan rupees. No card is charged.">Payments</Title>
      <Card><Text>Total spending</Text><Text style={{ fontSize: 28, fontWeight: '800' }}>{money(total)}</Text></Card>
      {rows.map((item) => (
        <Card key={item.id}>
          <Text style={{ fontWeight: '800' }}>{item.serviceLabel}</Text>
          <Text>{money(item.amount)} · {item.transactionRef}</Text>
          <Text>{when(item.createdAt)}</Text>
          <Badge value={item.status} />
        </Card>
      ))}
    </Screen>
  );
}

export function Plans({ go, tick }) {
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/subscriptions/plans').then(setPlans).catch((err) => setError(err.message));
    api('/api/subscriptions/current').then(setCurrent).catch(() => setCurrent(null));
  }, [tick]);
  return (
    <Screen>
      <Back onPress={() => go('more')} />
      <Title sub="Illustrative demo prices, not a commercial price list.">Subscriptions</Title>
      <Notice text={notice} />
      <Notice text={error} bad />
      <Card><Text style={{ fontWeight: '800' }}>Current plan</Text><Text>{current?.name || 'None'}</Text>{current ? <Text>{money(current.priceLkr)} / {current.billingPeriod}</Text> : null}</Card>
      {plans.map((plan) => (
        <Card key={plan.id}>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>{plan.name}</Text>
          <Text>{money(plan.priceLkr)} / {plan.billingPeriod}</Text>
          <Text>{plan.description}</Text>
          {(plan.services || []).map((item) => <Text key={item}>• {item}</Text>)}
          <Btn kind={current?.planId === plan.id ? 'secondary' : 'primary'} onPress={async () => {
            setError('');
            try {
              const result = await api('/api/subscriptions', { method: 'POST', body: { planId: plan.id } });
              setCurrent({ ...result.plan, planId: plan.id, priceLkr: result.plan.priceLkr });
              setNotice(`Moved to ${result.plan.name}. Demo payment ${result.payment.transactionRef} is ${result.payment.status}.`);
            } catch (err) { setError(err.message); }
          }}>{current?.planId === plan.id || current?.id === plan.id ? 'Current plan' : 'Upgrade plan'}</Btn>
        </Card>
      ))}
    </Screen>
  );
}
