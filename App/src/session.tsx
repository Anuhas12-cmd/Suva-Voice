import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { router } from 'expo-router';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, clearSession, getApiBase, loadSession, saveSession, seenOnboarding } from './api';
import { createPaymentController, type Attempt, type Payment, type Target } from './payments/domain';

type User = { id: string; role: string; fullName: string; email: string; phone: string; address?: string; city?: string };
type AppState = {
  user: User | null; onboarded: boolean; tick: number; authParams: Record<string, any>;
  go: (next: string, params?: Record<string, any>, replace?: boolean) => void;
  setUser: (next: Partial<User>) => Promise<void>; onLogout: () => Promise<void>;
  controller: ReturnType<typeof createPaymentController>;
  record: (payment: Payment) => void; payments: Record<string, Payment>;
};
const AppContext = createContext<AppState | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider is required');
  return value;
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [fontsReady, fontError] = useFonts({
    Nunito: require('../assets/fonts/Nunito-SemiBold.ttf'), NunitoBold: require('../assets/fonts/Nunito-ExtraBold.ttf'),
    Fraunces: require('../assets/fonts/Fraunces-SemiBold.ttf'),
    Inter: Inter_400Regular, InterMedium: Inter_500Medium, InterSemiBold: Inter_600SemiBold,
  });
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<User | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [tick, setTick] = useState(0);
  const [authParams, setAuthParams] = useState({});
  const [payments, setPayments] = useState<Record<string, Payment>>({});
  const sessionEpoch = useRef(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  useEffect(() => {
    Promise.all([loadSession(), seenOnboarding()]).then(([session, seen]) => {
      if (session?.user?.role === 'customer') setUserState(session.user);
      setOnboarded(seen);
    }).catch(() => {}).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    let socket: ReturnType<typeof io> | undefined;
    let closed = false;
    (async () => {
      const session = await loadSession();
      if (!session?.token || closed) return;
      const base = await getApiBase();
      if (closed) return;
      socket = io(base, { auth: { token: session.token }, transports: ['websocket', 'polling'] });
      socket.on('suva:update', () => setTick(value => value + 1));
    })().catch(() => {});
    return () => { closed = true; socket?.close(); };
  }, [user?.id]);
  const controller = useMemo(() => {
    const epoch = sessionVersion;
    const userId = user?.id;
    const isActive = () => Boolean(userId) && sessionEpoch.current === epoch;
    const key = (target: Target) => 'sv_payment_attempt:' + user?.id + ':' + target.kind + ':' + target.id;
    // The factory stores this predicate; it reads the ref only during async actions.
    // eslint-disable-next-line react-hooks/refs
    return createPaymentController({
      isActive,
      request: async (path, options) => {
        const session = await loadSession();
        if (!session || !isActive() || session.user?.id !== userId) throw new Error('Your session changed. Open checkout again from your account.');
        return api(path, { ...options, token: session.token });
      },
      readAttempt: async target => { const raw = await AsyncStorage.getItem(key(target)); return raw ? JSON.parse(raw) as Attempt : null; },
      writeAttempt: (target, attempt) => AsyncStorage.setItem(key(target), JSON.stringify(attempt)),
      clearAttempt: target => AsyncStorage.removeItem(key(target)),
    });
  }, [user?.id, sessionVersion]);
  function go(next: string, params: Record<string, any> = {}, replace = false) {
    if (params.user) { sessionEpoch.current += 1; setSessionVersion(sessionEpoch.current); setUserState(params.user); setOnboarded(true); }
    if (next === 'otp') setAuthParams(params);
    const path = next === 'payments' ? '/payments' : next === 'plans' ? '/payments/plans' : '/' + next;
    const publicParams = Object.fromEntries(Object.entries(params).filter(([key, value]) => !['user', 'demoOtp'].includes(key) && value !== undefined && typeof value !== 'object'));
    const location = { pathname: path, params: publicParams };
    if (replace) router.replace(location); else router.push(location);
  }
  async function setUser(next: Partial<User>) {
    const session = await loadSession();
    if (session?.token) await saveSession(session.token, { ...user, ...next });
    setUserState(current => current ? { ...current, ...next } : null);
  }
  async function onLogout() {
    sessionEpoch.current += 1;
    setSessionVersion(sessionEpoch.current);
    const session = await loadSession();
    await clearSession();
    setUserState(null); setPayments({}); setAuthParams({});
    router.replace('/login');
    if (session?.token) {
      try { await api('/api/auth/logout', { method: 'POST', token: session.token }); } catch { /* The local session is already ended. */ }
    }
  }
  if (!ready || (!fontsReady && !fontError)) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F5ED' }}><ActivityIndicator color="#365C36" /></View>;
  return <AppContext.Provider value={{ user, onboarded, tick, go, setUser, onLogout, authParams, controller, record: payment => setPayments(current => ({ ...current, [payment.id]: payment })), payments }}>{children}</AppContext.Provider>;
}
