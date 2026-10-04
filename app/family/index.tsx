import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { Body, Button, Card, ErrorText, Screen, Title, colors } from '@/components/ui';
import { api, describePerson, useLoad } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Placeholder overview: step 4 adds flags and a "next step" card per person.
export default function FamilyHome() {
  const { profile, signOut } = useAuth();
  const { data: people, error, loading } = useLoad(api.people, []);

  return (
    <Screen>
      <Title>Hello, {profile?.full_name}</Title>
      <ErrorText>{error}</ErrorText>
      {!loading && people?.length === 0 ? (
        <Body muted>Ask your loved one’s caregiver for an invite code, then tap “Join with a code”.</Body>
      ) : null}
      {people?.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/family/[id]', params: { id: p.id } })}
        >
          <Card>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{p.nickname}</Text>
            {describePerson(p) ? <Text style={{ fontSize: 16, color: colors.muted }}>{describePerson(p)}</Text> : null}
          </Card>
        </Pressable>
      ))}
      <Button title="Join with a code" onPress={() => router.push('/join')} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
