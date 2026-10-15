import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../api';
import { label, when } from '../format';

const links = [
  ['/', 'Dashboard'],
  ['/customers', 'Customers'],
  ['/elderly', 'Elderly Profiles'],
  ['/calls', 'Call History'],
  ['/schedules', 'Call Schedules'],
  ['/reminders', 'Reminders'],
  ['/alerts', 'Alerts'],
  ['/orders', 'Care Orders'],
  ['/deliveries', 'Deliveries'],
  ['/payments', 'Payments'],
  ['/contacts', 'Emergency Contacts'],
  ['/providers', 'Service Providers'],
  ['/subscriptions', 'Subscriptions'],
  ['/notifications', 'Notifications'],
  ['/reports', 'Reports'],
  ['/support', 'Support'],
  ['/settings', 'Settings']
];

const quietRoutes = new Set(['/support', '/settings']);

function EmergencyNotice({ liveTick, pathname }) {
  const [emergencies, setEmergencies] = useState([]);
  const [hidden, setHidden] = useState(() => new Set());

  useEffect(() => {
    if (quietRoutes.has(pathname)) return undefined;
    api('/api/alerts?type=emergency')
      .then((rows) => setEmergencies((Array.isArray(rows) ? rows : []).filter((item) => item.status !== 'resolved')))
      .catch(() => {});
    return undefined;
  }, [liveTick, pathname]);

  if (quietRoutes.has(pathname)) return null;
  const open = emergencies.filter((item) => !hidden.has(item.id));
  const lead = open[0];
  if (!lead) return null;
  return (
    <div className="emergency-pop" role="alert" aria-label="Emergency alert">
      <div className="emergency-card">
        <p className="emergency-kicker">Emergency alert</p>
        <h2>{lead.elderlyName}</h2>
        <p className="emergency-message">{lead.message}</p>
        <p className="tiny">{when(lead.createdAt)} · {label(lead.status)}{open.length > 1 ? ` · ${open.length} open` : ''}</p>
        <div className="actions">
          <Link className="btn danger" to="/alerts">Open alerts</Link>
          <button className="btn secondary" type="button" onClick={() => setHidden(new Set([...hidden, ...open.map((item) => item.id)]))}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" fill="white" />
        <path d="M16 8.5c.8-.9 2.2-.6 2.6.5" stroke="#d7fff8" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function Shell() {
  const { user, signOut, liveTick } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const today = new Date().toLocaleDateString('en-LK', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Mark /> Suva Voice</div>
        <nav className="nav" aria-label="Admin">
          {links.map(([to, name]) => (
            <NavLink key={to} to={to} end={to === '/'}>{name}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="menu-btn" type="button" onClick={signOut}>Log out</button>
        </div>
      </aside>
      <div className={location.pathname === '/' ? 'workspace dashboard-workspace' : 'workspace'}>
        <header className="topbar">
          <form className="search" onSubmit={(event) => { event.preventDefault(); navigate(`/search?q=${encodeURIComponent(query)}`); }}>
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search anything" placeholder="Search anything..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </form>
          <div className="tiny">{today}</div>
          <div className="who">
            <div>
              <strong>{user?.fullName}</strong>
              <div className="tiny">{user?.role === 'admin' ? 'Administrator' : 'Staff'}</div>
            </div>
            <div className="avatar" aria-hidden="true">{user?.fullName?.slice(0, 1)}</div>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
      <EmergencyNotice liveTick={liveTick} pathname={location.pathname} />
    </div>
  );
}
