import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ActivityFeed, MedicationList } from '@/components/care';
import { Body, ErrorText, Heading, Screen, Title } from '@/components/ui';
import { api, describePerson, useLoad } from '@/lib/api';

// Read-only view for family. Step 4 turns this into the dashboard with flags and next steps.
export default function FamilyPersonPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = useLoad(() => api.person(id), [id]);
  const meds = useLoad(() => api.medications(id), [id]);
  const activity = useLoad(() => api.activity(id), [id]);

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

      <Heading>Recent activity</Heading>
      <ActivityFeed items={activity.data ?? []} />

      <Heading>Medications</Heading>
      <MedicationList medications={meds.data ?? []} />
    </Screen>
  );
}
