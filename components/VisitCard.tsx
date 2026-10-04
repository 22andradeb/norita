import { Text, View } from 'react-native';

import type { ActivityItem } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { useTheme } from '@/lib/theme';

import { Button, Caption, Card, StatusPill } from './ui';
import { Avatar } from './widgets';

/**
 * Today's caregiver visit: who came and when they arrived and left. Caregivers also get the
 * "He llegado" / "Me voy" buttons.
 */
export function VisitCard({
  items,
  nickname,
  onArrive,
  onLeave,
}: {
  items: ActivityItem[];
  nickname: string;
  onArrive?: () => void;
  onLeave?: () => void;
}) {
  const t = useTheme();
  const visits = items.filter((i) => i.kind === 'visit').sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const arrival = visits.find((v) => v.data.kind === 'arrival');
  const departure = [...visits].reverse().find((v) => v.data.kind === 'departure');
  const lastEvent = visits[visits.length - 1];
  const here = lastEvent?.data.kind === 'arrival';
  const name = arrival?.recorded_by_name ?? departure?.recorded_by_name ?? null;
  const caregiverMode = !!(onArrive || onLeave);

  if (!arrival && !caregiverMode) {
    return (
      <Card>
        <Caption>VISITA DE HOY</Caption>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Aún no se ha registrado la llegada del cuidador.</Text>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 12 }}>
      {name ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={name} size={52} />
          <View style={{ flex: 1 }}>
            <Caption style={{ letterSpacing: 0.5 }}>ACOMPAÑA A {nickname.toUpperCase()}</Caption>
            <Text style={{ fontSize: 19, fontWeight: '800', color: t.text }}>{name}</Text>
          </View>
          {here ? <StatusPill level="normal" label="Está ahora" /> : null}
        </View>
      ) : (
        <Caption style={{ letterSpacing: 0.5 }}>VISITA DE HOY</Caption>
      )}
      {arrival || departure ? (
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12, gap: 8 }}>
          <Row label="Llegada" value={arrival ? fmtTime(arrival.recorded_at) : '—'} />
          <Row label="Salida" value={departure && !here ? fmtTime(departure.recorded_at) : '—'} />
        </View>
      ) : null}
      {caregiverMode ? (
        here ? (
          <Button title="Me voy" icon="door-closed" variant="secondary" onPress={onLeave!} />
        ) : (
          <Button title={arrival ? 'He vuelto' : 'He llegado'} icon="door-open" onPress={onArrive!} />
        )
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: 17, color: t.text, width: 80 }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{value}</Text>
    </View>
  );
}
