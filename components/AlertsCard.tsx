import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ACK_NOTES, ALERT_ICONS, acknowledgeAlert, type AlertItem } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { errorText, timeAgo } from '@/lib/format';
import { useTheme } from '@/lib/theme';

import { Caption, Card, Chip, ErrorText, IconBadge, Row } from './ui';

/** Alert rows; tapping one shows quick replies to mark it as seen. */
export function AlertRows({ alerts, onChanged }: { alerts: AlertItem[]; onChanged: () => void }) {
  const t = useTheme();
  const { session } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ack(a: AlertItem, note: string) {
    if (!session) return;
    setError(null);
    try {
      await acknowledgeAlert(a.id, session.user.id, note);
      setOpen(null);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card style={{ padding: 0, gap: 0 }}>
      {alerts.map((a, i) => {
        const color = a.level === 'alert' ? t.danger : a.level === 'watch' ? t.warning : t.primary;
        const done = !!a.acknowledged_at;
        return (
          <View key={a.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border, opacity: done ? 0.75 : 1 }}>
            <Pressable
              onPress={() => setOpen(open === a.id ? null : a.id)}
              disabled={done}
              accessibilityRole="button"
              accessibilityLabel={`${a.level === 'alert' ? 'Importante: ' : ''}${a.title}${a.detail ? `. ${a.detail}` : ''}${done ? '. Visto' : '. Toca para marcar como visto'}`}
              style={{ flexDirection: 'row', gap: 12, padding: 14 }}
            >
              <IconBadge name={ALERT_ICONS[a.kind] ?? 'bell-outline'} color={done ? t.muted : color} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{a.title}</Text>
                {a.detail ? <Caption>{a.detail}</Caption> : null}
                <Caption>
                  {timeAgo(a.created_at)}
                  {a.created_by_name ? ` · registrado por ${a.created_by_name}` : ''}
                </Caption>
                {done ? (
                  <Text style={{ fontSize: 14, color: t.success, fontWeight: '600' }}>
                    ✓ {a.ack_note ?? 'Visto'} · {a.acknowledged_by_name ?? 'alguien del equipo'}, {timeAgo(a.acknowledged_at!)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {open === a.id ? (
              <Row style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                {ACK_NOTES.map((note) => (
                  <Chip key={note} label={note} selected={false} onPress={() => void ack(a, note)} />
                ))}
              </Row>
            ) : null}
          </View>
        );
      })}
      {error ? (
        <View style={{ padding: 14 }}>
          <ErrorText>{error}</ErrorText>
        </View>
      ) : null}
    </Card>
  );
}

/** The few most recent open alerts for Hoy, with a link to the full list. */
export function AlertsCard({ open, onChanged }: { open: AlertItem[]; onChanged: () => void }) {
  const t = useTheme();
  if (open.length === 0) {
    return (
      <Card onPress={() => router.push('/alerts')} accessibilityLabel="Sin avisos pendientes. Ver historial de avisos" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge name="check-circle-outline" color={t.success} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Sin avisos pendientes</Text>
          <Caption>Ver avisos anteriores</Caption>
        </View>
      </Card>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <AlertRows alerts={open.slice(0, 3)} onChanged={onChanged} />
      <Pressable onPress={() => router.push('/alerts')} accessibilityRole="link" style={{ alignSelf: 'flex-end', padding: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.primary }}>
          {open.length > 3 ? `Ver los ${open.length} avisos ›` : 'Ver todos los avisos ›'}
        </Text>
      </Pressable>
    </View>
  );
}
