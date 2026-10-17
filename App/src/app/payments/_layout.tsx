import { Redirect, Stack } from 'expo-router';
import { useApp } from '../../session';
export default function PaymentsLayout() {
  const { user } = useApp();
  if (!user) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F5ED' } }} />;
}
