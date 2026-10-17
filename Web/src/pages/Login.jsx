import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuth } from '../api';
import { ErrorText } from '../components/ui';

export default function Login() {
  const { signIn, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: 'admin@suvavoice.lk', password: 'Admin@12345' });
  const [mode, setMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        const data = await api('/api/auth/forgot-password', { method: 'POST', body: { identifier: form.identifier }, token: null });
        if (data.demoResetToken) {
          const reset = await api('/api/auth/reset-password', {
            method: 'POST',
            token: null,
            body: { token: data.demoResetToken, password: form.password }
          });
          signIn(reset.token, reset.user);
          if (!['admin', 'staff'].includes(reset.user.role)) throw new Error('This account is not an administrator account.');
          navigate('/');
          return;
        }
        setNotice('If that account exists, a reset message was recorded.');
        return;
      }
      const data = await api('/api/auth/login', { method: 'POST', body: form, token: null });
      if (!['admin', 'staff'].includes(data.user.role)) {
        throw new Error('Use a Suva Voice administrator or staff account.');
      }
      signIn(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">♥</span>
          Suva Voice
        </div>
        <div className="story-copy">
          <h1>Care. Connect. Protect.</h1>
          <p>Caring for your loved ones, every day, everywhere. Monitor wellness calls, alerts, and care services from one desk.</p>
        </div>
        <div className="family-card" aria-hidden="true">
          <div className="portrait" />
          <div>
            <strong>Family check-ins</strong>
            <p className="muted">Automated morning calls reach an ordinary phone. Keypad answers return to this dashboard.</p>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card stack" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Welcome Back' : 'Reset password'}</h2>
          <p className="lede">{mode === 'login' ? 'Sign in to your Suva Voice account' : 'Set a new password for a staff account. Demo mode returns the reset token immediately.'}</p>
          <ErrorText error={error} />
          {sessionExpired ? <p className="notice" role="status">Your session has ended. Please sign in again to view your records.</p> : null}
          {notice ? <div className="ok">{notice}</div> : null}
          <label>Email Address
            <input value={form.identifier} onChange={(event) => set('identifier', event.target.value)} autoComplete="username" />
          </label>
          <label>{mode === 'login' ? 'Password' : 'New password'}
            <input type="password" value={form.password} onChange={(event) => set('password', event.target.value)} autoComplete="current-password" />
          </label>
          <div className="row-between">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" defaultChecked style={{ width: 18 }} /> Remember me
            </label>
            <button className="btn ghost" type="button" onClick={() => setMode(mode === 'login' ? 'forgot' : 'login')}>
              {mode === 'login' ? 'Forgot Password?' : 'Back to login'}
            </button>
          </div>
          <button className="btn" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Reset and sign in'}</button>
        </form>
      </section>
    </div>
  );
}
