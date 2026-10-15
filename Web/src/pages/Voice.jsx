import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, api, useAuth } from '../api';
import { label, when } from '../format';
import { Badge, Empty, ErrorText } from '../components/ui';

export function Calls() {
  const { liveTick } = useAuth();
  const [filters, setFilters] = useState({ status: '', response: '' });
  const [rows, setRows] = useState([]);
  const [elders, setElders] = useState([]);
  const [elderlyId, setElderlyId] = useState('');
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.response) params.set('result', filters.response);
    api(`/api/calls?${params}`).then((data) => setRows(Array.isArray(data) ? data : [])).catch((err) => setError(err.message));
  }, [filters, liveTick]);

  useEffect(() => {
    api('/api/elderly?limit=100').then((data) => {
      const rows = Array.isArray(data) ? data : [];
      setElders(rows);
      setElderlyId((current) => current || rows[0]?.id || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!live?.id) return undefined;
    const terminal = ['completed', 'missed', 'failed', 'no_answer'].includes(live.status);
    if (terminal) return undefined;
    const timer = setInterval(() => {
      api(`/api/calls/${live.id}`).then(setLive).catch(() => {});
    }, 700);
    return () => clearInterval(timer);
  }, [live?.id, live?.status]);

  async function start() {
    setError('');
    try {
      const call = await api('/api/calls/test', { method: 'POST', body: { elderlyId } });
      setLive(call);
    } catch (err) {
      setError(err.message);
    }
  }

  async function press(digit) {
    const result = await api(`/api/calls/${live.id}/dtmf`, { method: 'POST', body: { digit } });
    setLive(result.call);
  }

  async function simulate(outcome) {
    const result = await api(`/api/calls/${live.id}/simulate`, { method: 'POST', body: { outcome } });
    setLive(result.call);
  }

  const open = live && !['completed', 'missed', 'failed', 'no_answer'].includes(live.status);

  return (
    <>
      <div className="page-head"><div><h1>Call History</h1><p>Scheduled, completed, missed, failed, and emergency responses.</p></div></div>
      <section className="split">
        <article className="panel stack">
          <h2>Start test call</h2>
          <p className="muted">Demo telephony uses the same result path as a telephone call. No carrier is required.</p>
          <label>Elderly person
            <select value={elderlyId} onChange={(event) => setElderlyId(event.target.value)}>
              {elders.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.phone}</option>)}
            </select>
          </label>
          <button className="btn" type="button" onClick={start}>Start test call</button>
          <ErrorText error={error} />
        </article>
        {live ? (
          <article className="live" aria-live="polite">
            <strong>{label(live.status)}</strong>
            <p>{live.calleeName} · {live.phone}</p>
            <p>{live.promptText}</p>
            {open && live.status === 'waiting_dtmf' ? (
              <div className="dtmf">
                <button type="button" onClick={() => press('1')}>Press 1 — Okay</button>
                <button type="button" onClick={() => press('2')}>Press 2 — Assistance</button>
                <button type="button" onClick={() => press('3')}>Press 3 — Emergency</button>
                <button type="button" onClick={() => simulate('no_answer')}>Simulate no answer</button>
                <button type="button" onClick={() => simulate('failed')}>Simulate failed call</button>
                <button type="button" onClick={() => simulate('no_response')}>Simulate no response</button>
              </div>
            ) : <p>Result: {label(live.resultCode || live.status)}</p>}
          </article>
        ) : <article className="panel"><Empty text="A live demo call will appear here." /></article>}
      </section>
      <section className="panel">
        <div className="filters">
          <label>Status
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">All</option>
              {['completed', 'missed', 'failed', 'no_answer', 'dialing', 'waiting_dtmf', 'retry_pending'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>Response
            <select value={filters.response} onChange={(event) => setFilters({ ...filters, response: event.target.value })}>
              <option value="">All</option>
              {['okay', 'assistance', 'emergency', 'no_response'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <table>
          <thead><tr><th>When</th><th>Person</th><th>Attempt</th><th>Status</th><th>Response</th><th>Duration</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{when(item.startedAt)}</td>
                <td><Link to={`/elderly/${item.elderlyId}`}>{item.calleeName}</Link><div className="tiny">{item.phone}</div></td>
                <td>{item.attemptNumber}</td>
                <td><Badge value={item.status} /></td>
                <td>{item.resultCode ? <Badge value={item.resultCode} /> : '—'}</td>
                <td>{item.durationSeconds ? `${item.durationSeconds}s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function Schedules() {
  const { liveTick } = useAuth();
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api('/api/call-schedules').then(setRows).catch(() => {});
  }, [liveTick, message]);

  async function run(id) {
    const call = await api(`/api/call-schedules/${id}/run-now`, { method: 'POST' });
    setMessage(`Call started for ${call.calleeName}. Open Call History to enter the keypad response.`);
  }

  async function toggle(item) {
    await api(`/api/call-schedules/${item.id}`, { method: 'PATCH', body: { enabled: !item.enabled } });
    setMessage(item.enabled ? 'Schedule paused.' : 'Schedule enabled.');
  }

  return (
    <>
      <div className="page-head"><div><h1>Call Schedules</h1><p>The scheduler places one call when the next run time arrives.</p></div></div>
      {message ? <div className="ok">{message}</div> : null}
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Person</th><th>Time</th><th>Days</th><th>Next run</th><th>Retries</th><th>State</th><th></th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.elderlyName}</td>
                <td>{String(item.timeOfDay).slice(0, 5)}</td>
                <td>{Array.isArray(item.daysOfWeek) ? item.daysOfWeek.join(', ') : item.daysOfWeek}</td>
                <td>{when(item.nextRunAt)}</td>
                <td>{item.retryDelaySeconds}s × {item.retryAttempts}</td>
                <td><Badge value={item.enabled ? 'active' : 'disabled'} /></td>
                <td className="actions">
                  <button className="btn secondary" type="button" onClick={() => toggle(item)}>{item.enabled ? 'Pause' : 'Enable'}</button>
                  <button className="btn" type="button" onClick={() => run(item.id)}>Run now</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

let reminderAudio = null;

function playReminder(id) {
  if (reminderAudio) {
    reminderAudio.pause();
    reminderAudio = null;
  }
  const token = localStorage.getItem('sv_admin_token');
  fetch(`${API}/api/reminders/${id}/prompt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  }).then(async (response) => {
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    reminderAudio = new Audio(url);
    reminderAudio.onended = () => URL.revokeObjectURL(url);
    reminderAudio.play().catch(() => {});
  }).catch(() => {});
}

export function Reminders() {
  const { liveTick } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/reminders').then(setRows).catch(() => {}); }, [liveTick]);
  useEffect(() => () => {
    if (reminderAudio) reminderAudio.pause();
  }, []);
  async function toggle(item) {
    await api(`/api/reminders/${item.id}`, { method: 'PATCH', body: { enabled: !item.enabled } });
    setRows(await api('/api/reminders'));
  }
  return (
    <>
      <div className="page-head"><div><h1>Reminders</h1><p>Medication, meal, rest, and other reminders sent to the family account.</p></div></div>
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Person</th><th>Type</th><th>Time</th><th>State</th><th></th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td><td>{item.elderlyName}</td><td><Badge value={item.type} /></td>
                <td>{String(item.timeOfDay).slice(0, 5)}</td><td><Badge value={item.enabled ? 'active' : 'disabled'} /></td>
                <td className="actions">
                  <button className="btn secondary" type="button" onClick={() => playReminder(item.id)}>Listen</button>
                  <button className="btn secondary" type="button" onClick={() => toggle(item)}>{item.enabled ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function Alerts() {
  const { liveTick } = useAuth();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/alerts').then((data) => setRows(Array.isArray(data) ? data : [])).catch(() => {}); }, [liveTick]);

  async function open(id) {
    setError('');
    setSelected(await api(`/api/alerts/${id}`));
  }
  async function move(status) {
    setError('');
    try {
      await api(`/api/alerts/${selected.id}`, { method: 'PATCH', body: { status } });
      setSelected(await api(`/api/alerts/${selected.id}`));
      setRows(await api('/api/alerts'));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head"><div><h1>Alerts</h1><p>Missed check-in, assistance, and emergency. A missed call is not an emergency.</p></div></div>
      <section className="split">
        <article className="panel table-wrap">
          <table>
            <thead><tr><th>When</th><th>Type</th><th>Person</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{when(item.createdAt)}</td>
                  <td><Badge value={item.type} /></td>
                  <td><button className="btn ghost" type="button" onClick={() => open(item.id)}>{item.elderlyName}</button></td>
                  <td><Badge value={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          {selected ? (
            <div className="stack">
              <h2>{selected.elderlyName}</h2>
              <div className="actions"><Badge value={selected.type} /><Badge value={selected.status} /></div>
              <p>{selected.message}</p>
              <p className="muted">Workflow: New → Reviewing → Contacted → Resolved</p>
              <ErrorText error={error} />
              <div className="actions">
                {['reviewing', 'contacted', 'resolved'].map((status) => (
                  <button key={status} className="btn secondary" type="button" disabled={selected.status === status} onClick={() => move(status)}>{label(status)}</button>
                ))}
              </div>
              <h3>Escalation</h3>
              {(selected.escalations || []).map((item) => (
                <div className="list-row" key={item.id}><div><strong>{item.recipientName}</strong><div className="tiny">{item.channel} · {item.status}</div></div></div>
              ))}
            </div>
          ) : <Empty text="Select an alert to review its escalation trail." />}
        </article>
      </section>
    </>
  );
}
