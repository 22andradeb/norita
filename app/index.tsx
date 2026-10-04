import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function Index() {
  const { session, profile, hasCurrentConsent } = useAuth();

  if (!session) return <Redirect href="/sign-in" />;
  if (!hasCurrentConsent) return <Redirect href="/consent" />;
  return <Redirect href={profile?.role === 'family' ? '/family' : '/caregiver'} />;
}
