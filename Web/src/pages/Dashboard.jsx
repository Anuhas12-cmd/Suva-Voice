import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth } from '../api';
import { label, money, when } from '../format';
import { Badge } from '../components/ui';

export default function Dashboard() {
  const { user, liveTick } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/dashboard').then(setData).catch((err) => setError(err.message));
  }, [liveTick]);

  if (!data) return <p>{error || 'Loading the care desk…'}</p>;
  const totals = data.totals;
  const max = Math.max(1, ...data.chart.flatMap((row) => [Number(row.answered), Number(row.missed)]));
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const points = (data.spendingSeries || []).map((row, index, all) => {
    const x = all.length <= 1 ? 0 : (index / (all.length - 1)) * 300;
    const peak = Math.max(1, ...all.map((item) => Number(item.amount)));
    const y = 64 - (Number(row.amount) / peak) * 52;
    return `${x},${y}`;
  }).join(' ');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{hello}, {user.fullName.split(' ')[0]}. Here is your overview.</p>
        </div>
      </div>
      {totals.unreadAlerts > 0 ? (
        <div className="notice" role="status">
          {totals.unreadAlerts} new alert{totals.unreadAlerts === 1 ? '' : 's'}. Open Alerts to review assistance requests and emergencies.
        </div>
      ) : null}
      <section className="stats">
        <article className="stat"><div className="icon mint">☎</div><span>Today's Check-in</span><strong>{totals.todayCheckinsCompleted} / {totals.todayCheckinsExpected}</strong><span>Completed</span></article>
        <article className="stat"><div className="icon blue">◷</div><span>Next Call</span><strong>{totals.nextCall ? new Date(totals.nextCall.nextRunAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><span>{totals.nextCall?.fullName || 'No call queued'}</span></article>
        <article className="stat"><div className="icon violet">☺</div><span>Emergency Contacts</span><strong>{totals.emergencyContacts}</strong><span>Active</span></article>
        <article className="stat"><div className="icon amber">☰</div><span>Active Reminders</span><strong>{totals.activeReminders}</strong><span>Enabled</span></article>
        <article className="stat"><div className="icon rose">!</div><span>Unread Alerts</span><strong>{totals.unreadAlerts}</strong><Link to="/alerts">View</Link></article>
      </section>
      <section className="stats">
        <article className="stat"><span>Total Customers</span><strong>{totals.customers}</strong></article>
        <article className="stat"><span>Total Elderly Users</span><strong>{totals.elderly}</strong></article>
        <article className="stat"><span>Completed Calls</span><strong>{totals.completedCalls}</strong></article>
        <article className="stat"><span>Missed Calls</span><strong>{totals.missedCalls}</strong></article>
        <article className="stat"><span>Pending Care Orders</span><strong>{totals.pendingOrders}</strong></article>
      </section>
      <section className="grid-2">
        <article className="panel chart-panel">
          <div className="row-between">
            <h2>Call History Overview</h2>
            <div className="legend"><span><i className="dot" style={{ background: '#129688' }} />Answered</span><span><i className="dot" style={{ background: '#ef6b73' }} />Missed</span></div>
          </div>
          <div className="bars" aria-label="Answered and missed calls for seven days">
            {data.chart.map((row) => (
              <div className="bar-col" key={row.day}>
                <div className="bar-pair">
                  <div className="bar answered" style={{ height: `${(Number(row.answered) / max) * 100}%` }} title={`${row.answered} answered`} />
                  <div className="bar missed" style={{ height: `${(Number(row.missed) / max) * 100}%` }} title={`${row.missed} missed`} />
                </div>
                <span className="tiny">{new Date(row.day).toLocaleDateString('en-LK', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="row-between"><h2>Recent Activity</h2><Link to="/calls">View All Activity</Link></div>
          <div className="list">
            {data.recentActivity.map((item) => (
              <div className="list-row" key={`${item.createdAt}-${item.action}`}>
                <div><strong>{label(item.action)}</strong><div className="tiny">{item.actorName || 'System'} · {when(item.createdAt)}</div></div>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="grid-3">
        <article className="panel">
          <div className="row-between"><h2>Upcoming Reminders</h2><Link to="/reminders">View All</Link></div>
          <div className="list">
            {data.reminders.map((item) => (
              <div className="list-row" key={item.id}>
                <div><strong>{item.title}</strong><div className="tiny">{item.elderlyName} · {String(item.timeOfDay).slice(0, 5)}</div></div>
                <Badge value={item.type} />
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="row-between"><h2>Care Order Status</h2><Link to="/orders">View All</Link></div>
          <div className="list">
            {data.orderStatus.map((item) => (
              <div className="list-row" key={item.status}><span>{label(item.status)}</span><strong>{item.total}</strong></div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="row-between"><h2>Monthly Spending</h2><Link to="/payments">View Payments</Link></div>
          <strong style={{ fontSize: 28 }}>{money(totals.monthlySpending)}</strong>
          <svg className="spark" viewBox="0 0 300 70" role="img" aria-label="Successful payments this month">
            <polyline fill="none" stroke="#129688" strokeWidth="4" points={points || '0,60 300,60'} />
          </svg>
          <div className="quick">
            <Link to="/calls">Start a test call</Link>
            <Link to="/orders">Review care orders</Link>
            <Link to="/alerts">Open alerts</Link>
          </div>
        </article>
      </section>
    </>
  );
}
