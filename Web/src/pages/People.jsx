import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, useAuth } from '../api';
import { label, when } from '../format';
import { Badge, Empty, ErrorText, Modal } from '../components/ui';

function useLoad(path, tick) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    api(path).then(setData).catch((err) => setError(err.message));
  }, [path, tick, version]);
  return { data, error, reload: () => setVersion((value) => value + 1) };
}

export function Customers() {
  const { liveTick } = useAuth();
  const [q, setQ] = useState('');
  const { data, error } = useLoad(`/api/customers?q=${encodeURIComponent(q)}`, liveTick);
  const rows = Array.isArray(data) ? data : [];
  return (
    <>
      <div className="page-head"><div><h1>Customers</h1><p>Family accounts that look after elderly relatives.</p></div></div>
      <section className="panel">
        <label>Search<input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, email, or phone" /></label>
        <ErrorText error={error} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Plan</th><th>Status</th><th>Loved ones</th><th></th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.fullName}</strong><div className="tiny">{item.email}</div></td>
                  <td>{item.phone}</td>
                  <td>{item.planName || '—'}</td>
                  <td><Badge value={item.status} /></td>
                  <td>{item.elderlyCount}</td>
                  <td><Link to={`/customers/${item.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !rows.length ? <Empty text="No customers match that search." /> : null}
        </div>
      </section>
    </>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { liveTick } = useAuth();
  const { data, error } = useLoad(`/api/customers/${id}`, liveTick);
  if (!data?.fullName) return <p>{error || 'Loading customer…'}</p>;
  return (
    <>
      <div className="page-head"><div><h1>{data.fullName}</h1><p>{data.email} · {data.phone}</p></div><Badge value={data.status} /></div>
      <section className="grid-3">
        <article className="panel"><h3>Subscription</h3><strong>{data.planName || 'None'}</strong><p className="muted">{data.subscriptionStatus ? label(data.subscriptionStatus) : 'No active plan'}</p></article>
        <article className="panel"><h3>Loved ones</h3><strong>{data.elderly.length}</strong></article>
        <article className="panel"><h3>Service requests</h3><strong>{data.orders.length}</strong></article>
      </section>
      <section className="panel">
        <h2>Registered elderly people</h2>
        {data.elderly.map((person) => (
          <div className="list-row" key={person.id}>
            <div><strong>{person.fullName}</strong><div className="tiny">{person.phone}</div></div>
            <Badge value={person.status} />
            <Link to={`/elderly/${person.id}`}>Profile</Link>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Recent service requests</h2>
        {data.orders.map((order) => (
          <div className="list-row" key={order.id}><div><strong>{order.orderNumber}</strong><div className="tiny">{label(order.type)}</div></div><Badge value={order.status} /></div>
        ))}
      </section>
    </>
  );
}

const blankElder = { fullName: '', age: 70, phone: '', address: '', preferredLanguage: 'en', preferredCheckInTime: '08:30', healthNotes: '', customerId: '' };

export function Elderly() {
  const { liveTick } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankElder);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState('');
  const loaded = useLoad(`/api/elderly?q=${encodeURIComponent(q)}`, liveTick);
  const data = Array.isArray(loaded.data) ? loaded.data : [];
  const { reload } = loaded;

  useEffect(() => {
    api('/api/customers?limit=100').then((result) => setCustomers(Array.isArray(result) ? result : [])).catch(() => {});
  }, []);

  async function create(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/elderly', { method: 'POST', body: { ...form, age: Number(form.age) } });
      setOpen(false);
      setForm(blankElder);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Elderly Profiles</h1><p>People reached by the morning wellness call.</p></div>
        <button className="btn" type="button" onClick={() => setOpen(true)}>Add profile</button>
      </div>
      <section className="panel">
        <label>Search<input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, phone, or city" /></label>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Age</th><th>Phone</th><th>Family</th><th>Check-in</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.fullName}</strong><div className="tiny">{item.address || '—'}</div></td>
                  <td>{item.age}</td>
                  <td>{item.phone}</td>
                  <td>{item.customerName}</td>
                  <td>{String(item.preferredCheckinTime).slice(0, 5)}</td>
                  <td><Badge value={item.status} /></td>
                  <td><Link to={`/elderly/${item.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {open ? (
        <Modal title="Add elderly profile" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={create}>
            <ErrorText error={error} />
            <label>Family account
              <select required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
                <option value="">Select customer</option>
                {customers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
              </select>
            </label>
            <label>Full name<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
            <label>Age<input required type="number" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} /></label>
            <label>Phone<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="07XXXXXXXX" /></label>
            <label>Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
            <label>Preferred language
              <select value={form.preferredLanguage} onChange={(event) => setForm({ ...form, preferredLanguage: event.target.value })}>
                <option value="en">English</option><option value="si">Sinhala</option><option value="ta">Tamil</option>
              </select>
            </label>
            <label>Preferred check-in<input type="time" value={form.preferredCheckInTime} onChange={(event) => setForm({ ...form, preferredCheckInTime: event.target.value })} /></label>
            <label>Health notes<textarea value={form.healthNotes} onChange={(event) => setForm({ ...form, healthNotes: event.target.value })} /></label>
            <button className="btn" type="submit">Save profile</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

export function ElderlyDetail() {
  const { id } = useParams();
  const { liveTick } = useAuth();
  const { data, error, reload } = useLoad(`/api/elderly/${id}`, liveTick);
  const [form, setForm] = useState(null);
  const [contact, setContact] = useState({ fullName: '', relationship: 'Son', phone: '', priority: 1, notifyOnEmergency: true, notifyOnAssistance: true, notifyOnMissed: true });
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (data?.fullName) {
      setForm({
        fullName: data.fullName,
        age: data.age,
        phone: data.phone,
        address: data.address || '',
        preferredLanguage: data.preferredLanguage,
        preferredCheckInTime: String(data.preferredCheckinTime).slice(0, 5),
        healthNotes: data.healthNotes || ''
      });
    }
  }, [data]);

  if (!data?.fullName || !form) return <p>{error || 'Loading profile…'}</p>;
  const schedule = data.schedules?.[0];

  async function save(event) {
    event.preventDefault();
    setSaveError('');
    try {
      await api(`/api/elderly/${id}`, { method: 'PATCH', body: { ...form, age: Number(form.age), preferredCheckInTime: form.preferredCheckInTime } });
      setMessage('Profile saved.');
      reload();
    } catch (err) {
      setSaveError(err.message);
    }
  }

  async function addContact(event) {
    event.preventDefault();
    await api(`/api/elderly/${id}/emergency-contacts`, { method: 'POST', body: { ...contact, priority: Number(contact.priority) } });
    setContact({ ...contact, fullName: '', phone: '' });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div><h1>{data.fullName}</h1><p>Family: {data.customerName} · {data.phone}</p></div>
        <Badge value={data.status} />
      </div>
      {message ? <div className="ok">{message}</div> : null}
      <section className="split">
        <form className="panel stack" onSubmit={save}>
          <h2>Profile</h2>
          <ErrorText error={saveError} />
          <label>Name<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          <label>Age<input type="number" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} /></label>
          <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label>Language
            <select value={form.preferredLanguage} onChange={(event) => setForm({ ...form, preferredLanguage: event.target.value })}>
              <option value="en">English</option><option value="si">Sinhala</option><option value="ta">Tamil</option>
            </select>
          </label>
          <label>Check-in time<input type="time" value={form.preferredCheckInTime} onChange={(event) => setForm({ ...form, preferredCheckInTime: event.target.value })} /></label>
          <label>Health notes<textarea value={form.healthNotes} onChange={(event) => setForm({ ...form, healthNotes: event.target.value })} /></label>
          <button className="btn" type="submit">Save changes</button>
        </form>
        <div className="stack">
          <article className="panel">
            <h2>Call schedule</h2>
            {schedule ? (
              <p>{schedule.enabled ? 'Active' : 'Paused'} · {String(schedule.timeOfDay).slice(0, 5)} · next {when(schedule.nextRunAt)} · retries {schedule.retryAttempts}</p>
            ) : <Empty text="No schedule yet." />}
          </article>
          <article className="panel">
            <h2>Emergency contacts</h2>
            {data.contacts.map((item) => (
              <div className="list-row" key={item.id}><div><strong>{item.fullName}</strong><div className="tiny">{item.relationship} · {item.phone} · priority {item.priority}</div></div></div>
            ))}
            <form className="stack" onSubmit={addContact}>
              <label>Name<input required value={contact.fullName} onChange={(event) => setContact({ ...contact, fullName: event.target.value })} /></label>
              <label>Phone<input required value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></label>
              <label>Relationship<input value={contact.relationship} onChange={(event) => setContact({ ...contact, relationship: event.target.value })} /></label>
              <label>Priority<input type="number" min="1" value={contact.priority} onChange={(event) => setContact({ ...contact, priority: event.target.value })} /></label>
              <button className="btn secondary" type="submit">Add contact</button>
            </form>
          </article>
        </div>
      </section>
      <section className="panel">
        <h2>Recent calls</h2>
        {data.calls.map((call) => (
          <div className="list-row" key={call.id}><div><strong>{when(call.startedAt)}</strong><div className="tiny">{label(call.status)} · {label(call.resultCode)}</div></div><Badge value={call.resultCode || call.status} /></div>
        ))}
      </section>
    </>
  );
}

export function Contacts() {
  const { liveTick } = useAuth();
  const { data, error } = useLoad('/api/emergency-contacts', liveTick);
  return (
    <>
      <div className="page-head"><div><h1>Emergency Contacts</h1><p>People notified when a keypad response needs help.</p></div></div>
      <section className="panel">
        <ErrorText error={error} />
        <table>
          <thead><tr><th>Contact</th><th>Elderly person</th><th>Priority</th><th>Emergency</th><th>Assistance</th><th>Missed</th></tr></thead>
          <tbody>
            {(data || []).map((item) => (
              <tr key={item.id}>
                <td><strong>{item.fullName}</strong><div className="tiny">{item.phone}</div></td>
                <td>{item.elderlyName}</td>
                <td>{item.priority}</td>
                <td>{item.notifyOnEmergency ? 'Yes' : 'No'}</td>
                <td>{item.notifyOnAssistance ? 'Yes' : 'No'}</td>
                <td>{item.notifyOnMissed ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const { data, error } = useLoad(`/api/search?q=${encodeURIComponent(q)}`, q);
  const rows = Array.isArray(data) ? data : [];
  const href = { customer: '/customers/', elderly: '/elderly/', order: '/orders/' };
  return (
    <>
      <div className="page-head"><div><h1>Search</h1><p>Results for “{q}”.</p></div></div>
      <ErrorText error={error} />
      <section className="panel">
        {rows.map((item) => (
          <div className="list-row" key={`${item.kind}-${item.id}`}>
            <div><strong><Link to={`${href[item.kind]}${item.id}`}>{item.label}</Link></strong><div className="tiny">{label(item.kind)} · {item.detail}</div></div>
          </div>
        ))}
        {data && !rows.length ? <Empty text="Nothing matched that search." /> : null}
      </section>
    </>
  );
}
