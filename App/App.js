import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { io } from 'socket.io-client';
import { api, clearSession, getApiBase, loadSession, saveSession, seenOnboarding } from './src/api';
import { AlertDetail, Alerts, Calls, Home, LiveCall, Loved, LovedForm, LovedProfile } from './src/screens/home';
import { Forgot, Login, Onboarding, Otp, Register, Splash, Terms } from './src/screens/auth';
import { OrderDetail, OrderForm, Orders, Payments, Plans, ReminderForm, Reminders } from './src/screens/care';
import { Help, More, Notifications, Profile, Settings } from './src/screens/account';

export default function App() {
  const [fontsReady, fontError] = useFonts({
    Nunito: require('./assets/fonts/Nunito-SemiBold.ttf'),
    NunitoBold: require('./assets/fonts/Nunito-ExtraBold.ttf'),
    Fraunces: require('./assets/fonts/Fraunces-SemiBold.ttf')
  });
  const [route, setRoute] = useState('boot');
  const [params, setParams] = useState({});
  const [user, setUserState] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      const seen = await seenOnboarding();
      if (session?.user?.role === 'customer') {
        setUserState(session.user);
        setRoute('home');
      } else {
        setRoute(seen ? 'login' : 'splash');
      }
    })().catch(() => setRoute('login'));
  }, []);

  useEffect(() => {
    if (route !== 'splash') return undefined;
    const timer = setTimeout(async () => {
      const seen = await seenOnboarding();
      setRoute(seen ? 'login' : 'onboarding');
    }, 1200);
    return () => clearTimeout(timer);
  }, [route]);

  useEffect(() => {
    let socket;
    let closed = false;
    (async () => {
      const session = await loadSession();
      if (!session?.token || closed) return;
      socket = io(await getApiBase(), { auth: { token: session.token }, transports: ['websocket', 'polling'] });
      socket.on('suva:update', () => setTick((value) => value + 1));
    })().catch(() => {});
    return () => {
      closed = true;
      socket?.close();
    };
  }, [user?.id]);

  function go(next, nextParams = {}, replace = false) {
    if (next === 'home' && nextParams.user) setUserState(nextParams.user);
    setParams(replace ? nextParams : { ...nextParams });
    setRoute(next);
  }

  async function setUser(next) {
    const session = await loadSession();
    if (session?.token) await saveSession(session.token, { ...user, ...next });
    setUserState((current) => ({ ...current, ...next }));
  }

  async function onLogout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* session ends locally */ }
    await clearSession();
    setUserState(null);
    setRoute('login');
    setParams({});
  }

  const shared = { go, params, user, tick, setUser, onLogout };
  const screens = {
    boot: <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#129688" /></View>,
    splash: <Splash />,
    onboarding: <Onboarding go={go} />,
    login: <Login go={go} />,
    register: <Register go={go} />,
    otp: <Otp go={go} params={params} />,
    forgot: <Forgot go={go} />,
    home: <Home {...shared} />,
    loved: <Loved {...shared} />,
    'loved-form': <LovedForm {...shared} />,
    'loved-profile': <LovedProfile {...shared} />,
    calls: <Calls {...shared} />,
    live: <LiveCall {...shared} />,
    alerts: <Alerts {...shared} />,
    alert: <AlertDetail {...shared} />,
    orders: <Orders {...shared} />,
    'order-form': <OrderForm {...shared} />,
    order: <OrderDetail {...shared} />,
    reminders: <Reminders {...shared} />,
    'reminder-form': <ReminderForm {...shared} />,
    payments: <Payments {...shared} />,
    plans: <Plans {...shared} />,
    more: <More {...shared} />,
    notifications: <Notifications {...shared} />,
    profile: <Profile {...shared} />,
    settings: <Settings {...shared} />,
    help: <Help {...shared} />,
    terms: <Terms {...shared} />
  };

  if (!fontsReady && !fontError) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f8f6' }}><ActivityIndicator size="large" color="#129688" /></View>;
  }
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      {screens[route] || screens.home}
    </View>
  );
}
