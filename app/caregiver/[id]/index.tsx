import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { ActivityFeed, MedicationList, SyncBanner } from '@/components/care';
import { Body, Button, Card, Chip, ErrorText, Heading, Row, Screen, Title, colors } from '@/components/ui';
import { api, describePerson, useLoad, type Medication } from '@/lib/api';
import { LOG_KINDS, QUICK_LOGS, type LogKindKey } from '@/lib/logKinds';
import { useOutbox } from '@/lib/outbox';

export default function PersonPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Re-fetch whenever queued entries finish syncing, so the timeline shows them.
  const { lastSyncedAt } = useOutbox();
  const person = useLoad(() => api.person(id), [id]);
  const meds = useLoad(() => api.medications(id), [id, lastSyncedAt]);
  const activity = useLoad(() => api.activity(id), [id, lastSyncedAt]);

  const log = (kind: LogKindKey, med?: Medication) =>
    router.push({
      pathname: '/caregiver/[id]/log/[kind]',
      params: { id, kind, ...(med ? { medicationId: med.id, medicationName: med.name } : {}) },
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: person.data?.nickname ?? '' }} />
      {person.data ? (
        <View>
          <Title>{person.data.nickname}</Title>
          {describePerson(person.data) ? <Body muted>{describePerson(person.data)}</Body> : null}
        </View>
      ) : null}
      <ErrorText>{person.error ?? meds.error ?? activity.error}</ErrorText>
      <SyncBanner />

      <Heading>Log something</Heading>
      <Row>
        {QUICK_LOGS.map((kind) => (
          <Chip key={kind} label={LOG_KINDS[kind].button} selected={false} onPress={() => log(kind)} />
        ))}
      </Row>

      <Heading>Medications</Heading>
      <MedicationList
        medications={meds.data ?? []}
        onGive={(m) => log('dose', m)}
        onStock={(m) => log('stock', m)}
      />
      <Button title="Add medication" variant="secondary" onPress={() => log('medication')} />

      <Heading>Family access</Heading>
      <InviteCard olderAdultId={id} nickname={person.data?.nickname ?? ''} />

      <Heading>Recent activity</Heading>
      <ActivityFeed items={activity.data ?? []} />
    </Screen>
  );
}

function InviteCard({ olderAdultId, nickname }: { olderAdultId: string; nickname: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    setError(null);
    setLoading(true);
    try {
      setCode(await api.createInvite(olderAdultId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!code) {
    return (
      <View style={{ gap: 8 }}>
        <Body muted>Create a one-time code so a family member (or another caregiver) can follow {nickname}.</Body>
        <ErrorText>{error}</ErrorText>
        <Button title="Create invite code" variant="secondary" onPress={create} loading={loading} />
      </View>
    );
  }

  const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;
  return (
    <Card>
      <Text style={{ fontSize: 16, color: colors.muted }}>Invite code (works once, for 7 days)</Text>
      <Text selectable style={{ fontSize: 32, fontWeight: '700', letterSpacing: 4, color: colors.text }}>
        {pretty}
      </Text>
      <Button
        title="Share code"
        onPress={() =>
          Share.share({
            message: `You're invited to follow ${nickname}'s care on Norita. Open the app, choose "Join with a code" and enter: ${pretty}`,
          })
        }
      />
    </Card>
  );
}
