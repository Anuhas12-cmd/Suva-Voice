import { Redirect, useLocalSearchParams } from 'expo-router';
import { useApp } from '../session';
import { AlertDetail, Alerts, Calls, Home, LiveCall, Loved, LovedForm, LovedProfile } from '../screens/home';
import { Forgot, Login, Onboarding, Otp, Register, Terms } from '../screens/auth';
import { OrderDetail, OrderForm, Orders, ReminderForm, Reminders } from '../screens/care';
import { Help, More, Notifications, Profile, Settings } from '../screens/account';

const screens: Record<string, React.ComponentType<any>> = {
  onboarding: Onboarding, login: Login, register: Register, otp: Otp, forgot: Forgot,
  home: Home, loved: Loved, 'loved-form': LovedForm, 'loved-profile': LovedProfile,
  calls: Calls, live: LiveCall, alerts: Alerts, alert: AlertDetail, orders: Orders,
  'order-form': OrderForm, order: OrderDetail, reminders: Reminders, 'reminder-form': ReminderForm,
  more: More, notifications: Notifications, profile: Profile, settings: Settings, help: Help, terms: Terms,
};
export default function ExistingScreen() {
  const params = useLocalSearchParams<{ page: string }>();
  const app = useApp();
  if (!app.user && !['login', 'onboarding', 'register', 'otp', 'forgot', 'terms'].includes(params.page)) return <Redirect href="/login" />;
  const Component = screens[params.page];
  if (!Component) return <Redirect href="/" />;
  return <Component {...app} params={params.page === 'otp' ? { ...app.authParams, ...params } : params} />;
}
