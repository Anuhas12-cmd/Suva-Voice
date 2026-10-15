import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000';

export async function api(path, { method = 'GET', body, token } = {}) {
  const auth = token ?? localStorage.getItem('sv_admin_token');
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error?.message || 'Request failed');
    error.details = json.error?.details;
    throw error;
  }
  return json.data;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('sv_admin_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('sv_admin_token'));
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('suva:update', () => setLiveTick((value) => value + 1));
    return () => socket.close();
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    api('/api/auth/me')
      .then((fresh) => {
        if (cancelled || !fresh?.fullName) return;
        localStorage.setItem('sv_admin_user', JSON.stringify(fresh));
        setUser(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  function signIn(nextToken, nextUser) {
    localStorage.setItem('sv_admin_token', nextToken);
    localStorage.setItem('sv_admin_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* the local session still ends */
    }
    localStorage.removeItem('sv_admin_token');
    localStorage.removeItem('sv_admin_user');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, liveTick, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
