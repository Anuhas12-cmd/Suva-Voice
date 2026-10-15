import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useAuth } from '../api';
import { label, money, when } from '../format';
import { Badge, Empty, ErrorText, Modal } from '../components/ui';

const stages = ['order_confirmed', 'preparing', 'in_transit', 'delivered'];

export function Orders() {
  const { liveTick } = useAuth();
  const [tab, setTab] = useState('orders');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]);
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const path = tab === 'orders' ? `/api/care-orders?status=${status}` : tab === 'doctor' ? '/api/doctor-appointments' : '/api/transport';
    api(path).then((data) => setRows(Array.isArray(data) ? data : [])).catch((err) => setError(err.message));
    api('/api/service-providers').then(setProviders).catch(() => {});
  }, [tab, status, liveTick]);

  async function assign(order, providerId) {
    if (!providerId) return;
    await api(`/api/care-orders/${order.id}`, { method: 'PATCH', body: { providerId, status: 'accepted' } });
    setRows(await api(`/api/care-orders?status=${status}`));
  }
  async function advance(order) {
    const next = { requested: 'accepted', accepted: 'processing', processing: 'out_for_delivery', out_for_delivery: 'completed' }[order.status];
    if (!next) return;
    await api(`/api/care-orders/${order.id}`, { method: 'PATCH', body: { status: next } });
    setRows(await api(`/api/care-orders?status=${status}`));
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Care Orders</h1><p>Groceries, appointments, and transport for registered families.</p></div>
        <div className="toolbar">
          {[['orders', 'Orders'], ['doctor', 'Doctor appointments'], ['transport', 'Transport']].map(([key, name]) => (
            <button key={key} className={tab === key ? 'btn' : 'btn secondary'} type="button" onClick={() => setTab(key)}>{name}</button>
          ))}
        </div>
      </div>
      <ErrorText error={error} />
      {tab === 'orders' ? (
        <section className="panel">
          <label>Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All</option>
              {['requested', 'accepted', 'processing', 'out_for_delivery', 'completed', 'cancelled'].map((item) => <option key={item} value={item}>{label(item)}</option>)}
            </select>
          </label>
          <table>
            <thead><tr><th>Order</th><th>Person</th><th>Type</th><th>Amount</th><th>Status</th><th>Provider</th><th></th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><Link to={`/orders/${item.id}`}><strong>{item.orderNumber}</strong></Link><div className="tiny">{item.notes || label(item.type)}</div></td>
                  <td>{item.elderlyName}</td>
                  <td>{label(item.type)}</td>
                  <td>{money(item.totalAmount)}</td>
                  <td><Badge value={item.status} /></td>
                  <td>
                    <select defaultValue={item.providerId || ''} onChange={(event) => assign(item, event.target.value)}>
                      <option value="">Assign</option>
                      {providers.filter((provider) => provider.serviceType === item.type || provider.serviceType === 'general').map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </td>
                  <td><button className="btn secondary" type="button" onClick={() => advance(item)}>Advance</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {tab === 'doctor' ? (
        <section className="panel table-wrap">
          <table>
            <thead><tr><th>Person</th><th>When</th><th>Doctor / hospital</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}><td>{item.elderlyName}</td><td>{item.preferredDate} {String(item.preferredTime || '').slice(0, 5)}</td><td>{item.doctorOrHospital}</td><td><Badge value={item.status} /></td><td>{item.notes}</td></tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <Empty text="No doctor appointments." /> : null}
        </section>
      ) : null}
      {tab === 'transport' ? (
        <section className="panel table-wrap">
          <table>
            <thead><tr><th>Person</th><th>Pickup</th><th>Destination</th><th>When</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}><td>{item.elderlyName}</td><td>{item.pickupLocation}</td><td>{item.destination}</td><td>{item.travelDate} {String(item.travelTime || '').slice(0, 5)}</td><td><Badge value={item.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { liveTick } = useAuth();
  const [order, setOrder] = useState(null);
  useEffect(() => { api(`/api/care-orders/${id}`).then(setOrder).catch(() => {}); }, [id, liveTick]);
  if (!order) return <p>Loading order…</p>;
  const current = stages.indexOf(order.events?.at(-1)?.stage || order.currentStage || 'order_confirmed');
  return (
    <>
      <div className="page-head"><div><h1>{order.orderNumber}</h1><p>{label(order.type)} · {order.elderlyName}</p></div><Badge value={order.status} /></div>
      <section className="split">
        <article className="panel">
          <div className="map-card" aria-hidden="true"><div className="route" /></div>
          <h2>Tracking</h2>
          <div className="steps">
            {['Order Confirmed', 'Preparing', 'In Transit', 'Delivered'].map((name, index) => (
              <div key={name} className={index <= current ? 'step on' : 'step'}>{name}</div>
            ))}
          </div>
          <p>Estimated arrival {order.estimatedArrival ? when(order.estimatedArrival) : 'to be confirmed'}.</p>
          {(order.events || []).map((event) => <div className="list-row" key={event.id}><div><strong>{label(event.stage)}</strong><div className="tiny">{event.note} · {when(event.createdAt)}</div></div></div>)}
        </article>
        <article className="panel">
          <h2>Items</h2>
          {(order.items || []).map((item) => <div className="list-row" key={item.id}><span>{item.name} × {item.quantity}</span><strong>{money(item.lineTotal)}</strong></div>)}
          <div className="list-row"><span>Total</span><strong>{money(order.totalAmount)}</strong></div>
          <p className="muted">Provider: {order.providerName || 'Not assigned'}</p>
        </article>
      </section>
    </>
  );
}

export function Deliveries() {
  const { liveTick } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/deliveries').then(setRows).catch(() => {}); }, [liveTick]);
  return (
    <>
      <div className="page-head"><div><h1>Deliveries</h1><p>Simulated progress for grocery and essential-item orders.</p></div></div>
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Person</th><th>Stage</th><th>Provider</th><th>ETA</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}><td><Link to={`/orders/${item.id}`}>{item.orderNumber}</Link></td><td>{item.elderlyName}</td><td><Badge value={item.currentStage || item.status} /></td><td>{item.providerName || '—'}</td><td>{item.estimatedArrival ? when(item.estimatedArrival) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

const blankProvider = { name: '', contactName: '', phone: '', email: '', serviceType: 'grocery', availability: 'Weekdays 8:00–17:00', status: 'active' };

export function Providers() {
  const { liveTick } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankProvider);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/service-providers').then(setRows).catch(() => {}); }, [liveTick, open]);

  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (!body.email) delete body.email;
      if (!body.phone) delete body.phone;
      if (!body.contactName) delete body.contactName;
      await api('/api/service-providers', { method: 'POST', body });
      setOpen(false);
      setForm(blankProvider);
    } catch (err) {
      setError(err.message);
    }
  }
  async function toggle(item) {
    await api(`/api/service-providers/${item.id}`, { method: 'PATCH', body: { status: item.status === 'active' ? 'inactive' : 'active' } });
    setRows(await api('/api/service-providers'));
  }

  return (
    <>
      <div className="page-head"><div><h1>Service Providers</h1><p>Partners who fulfil groceries, meals, transport, and appointments.</p></div><button className="btn" type="button" onClick={() => setOpen(true)}>Add provider</button></div>
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Service</th><th>Availability</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td><td>{item.phone}<div className="tiny">{item.email}</div></td>
                <td>{label(item.serviceType)}</td><td>{item.availability}</td><td><Badge value={item.status} /></td>
                <td><button className="btn secondary" type="button" onClick={() => toggle(item)}>{item.status === 'active' ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {open ? (
        <Modal title="Add service provider" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={save}>
            <ErrorText error={error} />
            <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Contact name<input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
            <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Service
              <select value={form.serviceType} onChange={(event) => setForm({ ...form, serviceType: event.target.value })}>
                {['grocery', 'essential', 'doctor', 'transport', 'general'].map((item) => <option key={item} value={item}>{label(item)}</option>)}
              </select>
            </label>
            <label>Availability<input value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} /></label>
            <button className="btn" type="submit">Save provider</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
