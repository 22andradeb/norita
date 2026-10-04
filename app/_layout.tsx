import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Body, Button, Loading, Screen, Title } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useOutboxAutoFlush } from '@/lib/outbox';
import { usePushNotifications } from '@/lib/notifications';
import { PersonProvider, usePerson } from '@/lib/person';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, profile, loading, hasCurrentConsent, refreshProfile, signOut } = useAuth();
  const t = useTheme();
  useOutboxAutoFlush(session?.user.id);

  if (loading) return <Loading />;

  // Signed in but no profile row: the signup trigger failed or the network is down.
  if (session && !profile) {
    return (
      <Screen>
        <Title>No se ha podido cargar tu cuenta</Title>
        <Body muted>Revisa tu conexión y vuelve a intentarlo.</Body>
        <Button title="Reintentar" onPress={refreshProfile} />
        <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  const ready = !!session && hasCurrentConsent;
  const caregiver = ready && profile?.role === 'caregiver';
  const modal = {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: t.bg },
    headerTintColor: t.primary,
    headerTitleStyle: { color: t.text, fontSize: 18, fontWeight: '700' as const },
    headerShadowVisible: false,
  };

  // When a guard flips (sign-in, consent given, sign-out), Expo Router sends the user back to
  // the first available screen — index — which redirects to wherever they now belong.
  return (
    <PersonProvider key={session?.user.id ?? 'signed-out'}>
      <PushBridge userId={ready ? session?.user.id : undefined} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !hasCurrentConsent}>
          <Stack.Screen name="consent" />
        </Stack.Protected>
        <Stack.Protected guard={ready}>
          <Stack.Screen name="home" />
          <Stack.Screen name="people" options={{ ...modal, title: 'Personas' }} />
          <Stack.Screen name="join" options={{ ...modal, title: 'Unirse con un código' }} />
          <Stack.Screen name="appointment" options={{ ...modal, title: 'Cita' }} />
          <Stack.Screen name="assessment/[instrument]" options={{ ...modal, title: '' }} />
          <Stack.Screen name="alerts" options={{ ...modal, presentation: 'card', title: 'Avisos' }} />
          <Stack.Screen name="exam-new" options={{ ...modal, title: 'Subir examen' }} />
          <Stack.Screen name="exam/[id]" options={{ ...modal, presentation: 'card', title: '' }} />
          <Stack.Screen name="metric/[key]" options={{ ...modal, presentation: 'card', title: '' }} />
        </Stack.Protected>
        <Stack.Protected guard={caregiver}>
          <Stack.Screen name="add-person" options={{ ...modal, title: 'Añadir persona' }} />
          <Stack.Screen name="log/index" options={{ ...modal, title: 'Registrar' }} />
          <Stack.Screen name="log/[kind]" options={{ ...modal, title: '' }} />
        </Stack.Protected>
      </Stack>
    </PersonProvider>
  );
}

/** Registers for push once signed in, and opens the alerts of the right person when a notification is tapped. */
function PushBridge({ userId }: { userId: string | undefined }) {
  const { select } = usePerson();
  usePushNotifications(userId, (olderAdultId) => {
    if (olderAdultId) select(olderAdultId);
    router.push('/alerts');
  });
  return null;
}
