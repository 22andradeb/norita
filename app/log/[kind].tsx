import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { LogForm } from '@/components/LogForm';
import { Body, IconBadge, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { LOG_KINDS, isLogKind, type LogKind } from '@/lib/logKinds';
import { LOG_STYLE } from '@/lib/logStyle';
import { enqueue, newId } from '@/lib/outbox';

/** Default time for an entry: now, or — when logging for an earlier day — that day at the current time. */
function defaultWhen(date?: string) {
  const now = new Date();
  if (!date) return now;
  const d = new Date(date);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d > now ? now : d;
}

export default function LogEntry() {
  const { kind, personId, medicationId, medicationName, date } = useLocalSearchParams<{
    kind: string;
    personId: string;
    medicationId?: string;
    medicationName?: string;
    date?: string;
  }>();
  const { session } = useAuth();

  if (!isLogKind(kind) || !session || !personId) return <Body>Tipo de registro desconocido.</Body>;
  const def: LogKind = LOG_KINDS[kind];
  const style = LOG_STYLE[kind];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: medicationName ? `${def.title}: ${medicationName}` : def.title }} />
      <View style={{ alignItems: 'center' }}>
        <IconBadge name={style.icon} color={style.color} size={56} />
      </View>
      <LogForm
        key={kind}
        fields={def.fields}
        validate={def.validate}
        // A medication is a definition, not an event, so it has no "when".
        defaultWhen={kind === 'medication' ? undefined : defaultWhen(date)}
        onSubmit={async (values, when) => {
          const writes = def.build(values, {
            olderAdultId: personId,
            userId: session.user.id,
            medicationId,
            now: when.toISOString(),
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
