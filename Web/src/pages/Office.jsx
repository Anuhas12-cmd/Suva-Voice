import { useEffect, useState } from 'react';
import { api, useAuth } from '../api';
import { label, money, when } from '../format';
import { Badge, ErrorText, Modal } from '../components/ui';

const blankPlan = { name: '', code: '', priceLkr: 2000, description: '', services: 'Daily wellness call\nEmergency alerts', active: true };

export function Subscriptions() {
  const { liveTick, user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [people, setPeople] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankPlan);
  const [error, setError] = useState('');
  async function load() {
    setPlans(await api('/api/subscriptions/plans'));
    setPeople(await api('/api/subscriptions'));
  }
  useEffect(() => { load().catch(() => {}); }, [liveTick]);

  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/subscriptions/plans', { method: 'POST', body: { ...form, priceLkr: Number(form.priceLkr), services: form.services.split('\n').filter(Boolean) } });
      setOpen(false);
      setForm(blankPlan);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }
  async function toggle(plan) {
    await api(`/api/subscriptions/plans/${plan.id}`, { method: 'PATCH', body: { active: !plan.active } });
    await load();
  }

  return (
    <>
      <div className="page-head"><div><h1>Subscriptions</h1><p>Illustrative demo prices in LKR. They are not a commercial price list.</p></div>{user.role === 'admin' ? <button className="btn" type="button" onClick={() => setOpen(true)}>Create plan</button> : null}</div>
      <section className="grid-3">
        {plans.map((plan) => (
          <article className="panel" key={plan.id}>
            <div className="row-between"><h2>{plan.name}</h2><Badge value={plan.active ? 'active' : 'disabled'} /></div>
            <strong>{money(plan.priceLkr)} / {plan.billingPeriod}</strong>
            <p>{plan.description}</p>
            <ul>{(plan.services || []).map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="tiny">{people.filter((item) => item.planId === plan.id && item.status === 'active').length} subscribed</p>
            {user.role === 'admin' ? <button className="btn secondary" type="button" onClick={() => toggle(plan)}>{plan.active ? 'Deactivate' : 'Activate'}</button> : null}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Subscribed customers</h2>
        <table>
          <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Since</th></tr></thead>
          <tbody>{people.map((item) => <tr key={item.id}><td>{item.customerName}</td><td>{item.planName}</td><td><Badge value={item.status} /></td><td>{when(item.startedAt)}</td></tr>)}</tbody>
        </table>
      </section>
      {open ? (
        <Modal title="Create plan" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={save}>
            <ErrorText error={error} />
            <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Code<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="family-plus" /></label>
            <label>Price (LKR)<input type="number" value={form.priceLkr} onChange={(event) => setForm({ ...form, priceLkr: event.target.value })} /></label>
            <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label>Services, one per line<textarea value={form.services} onChange={(event) => setForm({ ...form, services: event.target.value })} /></label>
            <button className="btn" type="submit">Save plan</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

export function Notifications() {
  const { liveTick } = useAuth();
  const [channel, setChannel] = useState('');
  const [rows, setRows] = useState([]);
  useEffect(() => { api(`/api/notifications?channel=${channel}`).then((data) => setRows(Array.isArray(data) ? data : [])).catch(() => {}); }, [channel, liveTick]);
  async function read(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' });
    setRows(await api(`/api/notifications?channel=${channel}`));
  }
  return (
    <>
      <div className="page-head"><div><h1>Notifications</h1><p>In-app messages and the demo SMS/email log. Nothing is sent to a real gateway.</p></div></div>
      <section className="panel">
        <label>Channel
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">All</option>
            <option value="in_app">In app</option>
            <option value="sms">SMS log</option>
            <option value="email">Email log</option>
          </select>
        </label>
        {rows.map((item) => (
          <div className="list-row" key={item.id}>
            <div><strong>{item.title}</strong><div className="tiny">{item.channel} · {item.userName || item.recipientAddress || 'contact'} · {when(item.createdAt)}</div><div>{item.body}</div></div>
            {item.status === 'sent' && item.channel === 'in_app' ? <button className="btn secondary" type="button" onClick={() => read(item.id)}>Mark read</button> : <Badge value={item.status} />}
          </div>
        ))}
      </section>
    </>
  );
}

export function Reports() {
  const [type, setType] = useState('calls');
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  async function load(event) {
    event?.preventDefault();
    setError('');
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      setRows(await api(`/api/reports/${type}?${params}`));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [type]);
  const columns = rows[0] ? Object.keys(rows[0]).filter((key) => !key.endsWith('Id') && key !== 'id') : [];
  return (
    <>
      <div className="page-head"><div><h1>Reports</h1><p>Wellness calls, missed calls, alerts, services, payments, and subscriptions.</p></div></div>
      <form className="panel filters" onSubmit={load}>
        <label>Report
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {['calls', 'missed-calls', 'alerts', 'emergencies', 'orders', 'service-requests', 'payments', 'subscriptions'].map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label>Status<input value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} placeholder="optional" /></label>
        <button className="btn" type="submit">Apply</button>
      </form>
      <ErrorText error={error} />
      <section className="panel table-wrap">
        <table>
          <thead><tr>{columns.map((key) => <th key={key}>{label(key)}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index}>{columns.map((key) => <td key={key}>{String(row[key] ?? '—')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function Support() {
  const { liveTick } = useAuth();
  const [rows, setRows] = useState([]);
  const [faq, setFaq] = useState([]);
  const [reply, setReply] = useState('');
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    api('/api/support').then(setRows).catch(() => {});
    api('/api/support/faq').then(setFaq).catch(() => {});
  }, [liveTick]);
  async function send(status) {
    await api(`/api/support/${current.id}`, { method: 'PATCH', body: { status, staffResponse: reply } });
    setReply('');
    setRows(await api('/api/support'));
    setCurrent(await api(`/api/support/${current.id}`));
  }
  return (
    <>
      <div className="page-head"><div><h1>Support</h1><p>Family questions and the public help answers.</p></div></div>
      <section className="split">
        <article className="panel">
          {rows.map((item) => (
            <button className="list-row" key={item.id} type="button" onClick={() => setCurrent(item)} style={{ width: '100%', background: 'transparent', border: 0 }}>
              <div><strong>{item.subject}</strong><div className="tiny">{item.fullName} · {label(item.status)}</div></div>
            </button>
          ))}
          {current ? (
            <form className="stack" onSubmit={(event) => { event.preventDefault(); send('closed'); }}>
              <h3>{current.subject}</h3>
              <p>{current.message}</p>
              <label>Response<textarea value={reply} onChange={(event) => setReply(event.target.value)} /></label>
              <div className="actions">
                <button className="btn secondary" type="button" onClick={() => send('in_progress')}>Mark in progress</button>
                <button className="btn" type="submit">Close</button>
              </div>
            </form>
          ) : null}
        </article>
        <article className="panel">
          <h2>FAQ</h2>
          {faq.map((item) => <div key={item.question} className="list-row"><div><strong>{item.question}</strong><div>{item.answer}</div></div></div>)}
        </article>
      </section>
    </>
  );
}

export function Settings() {
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState(null);
  const [voice, setVoice] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api('/api/settings/system').then(setSettings).catch(() => {});
    api('/api/system/voice-status').then(setVoice).catch(() => {});
  }, []);
  async function save(event) {
    event.preventDefault();
    const next = await api('/api/settings/system', { method: 'PATCH', body: settings });
    setSettings(next);
    setMessage('Call retry settings saved.');
  }
  async function tick() {
    const result = await api('/api/system/scheduler/tick', { method: 'POST' });
    setMessage(`Scheduler pass finished. Calls started: ${result.schedulesStarted || 0}. Retries: ${result.retriesStarted || 0}.`);
  }
  if (!settings) return <p>Loading settings…</p>;
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><p>Signed in as {user.fullName}.</p></div><button className="btn secondary" type="button" onClick={signOut}>Log out</button></div>
      {message ? <div className="ok">{message}</div> : null}
      <section className="split">
        <form className="panel stack" onSubmit={save}>
          <h2>Call settings</h2>
          <label>Retry delay seconds<input type="number" value={settings.retryDelaySeconds} onChange={(event) => setSettings({ ...settings, retryDelaySeconds: Number(event.target.value) })} /></label>
          <label>Maximum attempts<input type="number" value={settings.retryAttempts} onChange={(event) => setSettings({ ...settings, retryAttempts: Number(event.target.value) })} /></label>
          <label>Escalation delay seconds<input type="number" value={settings.escalationDelaySeconds} onChange={(event) => setSettings({ ...settings, escalationDelaySeconds: Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={settings.schedulerEnabled} onChange={(event) => setSettings({ ...settings, schedulerEnabled: event.target.checked })} /> Scheduler enabled</label>
          <button className="btn" type="submit">Save</button>
        </form>
        <article className="panel">
          <h2>Voice server</h2>
          <p>Mode: {voice?.online ? voice.mode : 'offline'}</p>
          <p>Asterisk: {voice?.asteriskEnabled ? 'enabled' : 'not enabled on this machine'}</p>
          <p>Active demo calls: {voice?.sessions ?? 0}</p>
          <button className="btn secondary" type="button" onClick={tick}>Run scheduler now</button>
        </article>
      </section>
    </>
  );
}
