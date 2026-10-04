import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Body, Button, Loading, Screen, Title } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useOutboxAutoFlush } from '@/lib/outbox';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, profile, loading, hasCurrentConsent, refreshProfile, signOut } = useAuth();
  useOutboxAutoFlush(session?.user.id);

  if (loading) return <Loading />;

  // Signed in but no profile row: the signup trigger failed or the network is down.
  if (session && !profile) {
    return (
      <Screen>
        <Title>We couldn't load your account</Title>
        <Body muted>Check your connection and try again.</Body>
        <Button title="Try again" onPress={refreshProfile} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  const ready = !!session && hasCurrentConsent;

  // When a guard flips (sign-in, consent given, sign-out), Expo Router sends the user back to
  // the first available screen — index — which redirects to wherever they now belong.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !hasCurrentConsent}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="join" options={{ headerShown: true, title: 'Join with a code' }} />
      </Stack.Protected>
      <Stack.Protected guard={ready && profile?.role === 'caregiver'}>
        <Stack.Screen name="caregiver" />
      </Stack.Protected>
      <Stack.Protected guard={ready && profile?.role === 'family'}>
        <Stack.Screen name="family" />
      </Stack.Protected>
    </Stack>
  );
}
