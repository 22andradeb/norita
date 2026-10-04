import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function Index() {
  const { session, hasCurrentConsent } = useAuth();

  if (!session) return <Redirect href="/sign-in" />;
  if (!hasCurrentConsent) return <Redirect href="/consent" />;
  return <Redirect href="/home" />;
}
