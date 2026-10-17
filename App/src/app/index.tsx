import { Redirect } from 'expo-router';
import { useApp } from '../session';
export default function Index() {
  const { user, onboarded } = useApp();
  return <Redirect href={user ? '/home' : onboarded ? '/login' : '/onboarding'} />;
}
