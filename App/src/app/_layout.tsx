import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../session';
export default function Layout() {
  return <AppProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F5ED' }, animation: 'slide_from_right' }} /></AppProvider>;
}
