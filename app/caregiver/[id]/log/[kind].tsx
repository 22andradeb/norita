import { Stack, router, useLocalSearchParams } from 'expo-router';

import { LogForm } from '@/components/LogForm';
import { Body, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { LOG_KINDS, isLogKind, type LogKind } from '@/lib/logKinds';
import { enqueue, newId } from '@/lib/outbox';

export default function LogEntry() {
  const { id, kind, medicationId, medicationName } = useLocalSearchParams<{
    id: string;
    kind: string;
    medicationId?: string;
    medicationName?: string;
  }>();
  const { session } = useAuth();

  if (!isLogKind(kind) || !session) return <Body>Unknown entry type.</Body>;
  const def: LogKind = LOG_KINDS[kind];

  return (
    <Screen>
      <Stack.Screen options={{ title: medicationName ? `${def.title}: ${medicationName}` : def.title }} />
      <LogForm
        key={kind}
        fields={def.fields}
        validate={def.validate}
        onSubmit={async (values) => {
          const writes = def.build(values, {
            olderAdultId: id,
            userId: session.user.id,
            medicationId,
            now: new Date().toISOString(),
            newId,
          });
          // Saved on the phone straight away; syncs in the background, even if offline now.
          await enqueue(session.user.id, writes);
          router.back();
        }}
      />
    </Screen>
  );
}
