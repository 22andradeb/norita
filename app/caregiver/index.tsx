import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { SyncBanner } from '@/components/care';
import { Body, Button, Card, ErrorText, Screen, Title, colors } from '@/components/ui';
import { api, describePerson, useLoad } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function CaregiverHome() {
  const { profile, signOut } = useAuth();
  const { data: people, error, loading } = useLoad(api.people, []);

  return (
    <Screen>
      <Title>Hello, {profile?.full_name}</Title>
      <SyncBanner />
      <ErrorText>{error}</ErrorText>
      {!loading && people?.length === 0 ? (
        <Body muted>Add the first person you care for. You’ll then be able to log visits, vitals, medications and more.</Body>
      ) : null}
      {people?.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/caregiver/[id]', params: { id: p.id } })}
        >
          <Card>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{p.nickname}</Text>
            {describePerson(p) ? <Text style={{ fontSize: 16, color: colors.muted }}>{describePerson(p)}</Text> : null}
          </Card>
        </Pressable>
      ))}
      <Button title="Add a person" onPress={() => router.push('/caregiver/add-person')} />
      <Button title="Join with a code" variant="secondary" onPress={() => router.push('/join')} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
