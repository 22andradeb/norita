import { router } from 'expo-router';
import { Text, View } from 'react-native';

import type { Appointment, AppointmentKind } from '@/lib/api';
import { cap, fmtTime } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { IconName } from '@/lib/vitals';

import { Button, Caption, Card, Icon, IconBadge, Row, StatusPill } from './ui';

export const APPOINTMENT_KINDS: Record<AppointmentKind, { label: string; icon: IconName }> = {
  consultation: { label: 'Consulta médica', icon: 'doctor' },
  tests: { label: 'Análisis o pruebas', icon: 'test-tube' },
  therapy: { label: 'Terapia o rehabilitación', icon: 'human-cane' },
  vaccine: { label: 'Vacuna', icon: 'needle' },
  dentist: { label: 'Dentista', icon: 'tooth-outline' },
  other: { label: 'Otra', icon: 'calendar-clock' },
};

const fmtDate = (iso: string) =>
  cap(new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));

/** Compact "next appointment" banner for the Today screens. */
export function NextAppointmentCard({ appointment }: { appointment: Appointment | null }) {
  const t = useTheme();
  if (!appointment) return null;
  const kind = APPOINTMENT_KINDS[appointment.kind];
  return (
    <Card onPress={() => router.navigate('/home/citas')} accessibilityLabel={`Próxima cita: ${appointment.title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <IconBadge name="calendar-clock" color={t.primary} size={46} />
      <View style={{ flex: 1 }}>
        <Caption style={{ letterSpacing: 0.5 }}>PRÓXIMA CITA</Caption>
        <Text style={{ fontSize: 18, fontWeight: '800', color: t.text }}>
          {new Date(appointment.starts_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {fmtTime(appointment.starts_at)} · {appointment.title}
        </Text>
        <Caption>
          {kind.label}
          {appointment.needs_companion ? ' · requiere acompañamiento' : ''}
        </Caption>
      </View>
      <Icon name="chevron-right" color={t.muted} />
    </Card>
  );
}

export function AppointmentCard({
  appointment: a,
  addedByFamily,
  onCancel,
}: {
  appointment: Appointment;
  addedByFamily?: boolean;
  onCancel?: () => void;
}) {
  const t = useTheme();
  const kind = APPOINTMENT_KINDS[a.kind];
  const cancelled = a.status === 'cancelled';
  const past = Date.parse(a.starts_at) < Date.now();
  const details = [kind.label, a.place, a.professional].filter(Boolean).join(' · ');
  return (
    <Card style={cancelled ? { opacity: 0.7 } : undefined}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <IconBadge name={kind.icon} color={t.primary} size={42} />
        <View style={{ flex: 1, gap: 2 }}>
          <Caption>
            {fmtDate(a.starts_at)} · {fmtTime(a.starts_at)}
          </Caption>
          <Text
            style={{
              fontSize: 19,
              fontWeight: '800',
              color: t.text,
              textDecorationLine: cancelled ? 'line-through' : 'none',
            }}
          >
            {a.title}
          </Text>
          {details ? <Text style={{ fontSize: 15, color: t.muted }}>{details}</Text> : null}
        </View>
      </View>
      {a.notes ? <Text style={{ fontSize: 15, color: t.text }}>{a.notes}</Text> : null}
      <Row>
        {cancelled ? <StatusPill level="alert" label="Cancelada" /> : null}
        {a.needs_companion && !cancelled ? <StatusPill level="watch" label="Requiere acompañamiento" /> : null}
        {addedByFamily ? <StatusPill level="none" label="Añadida por la familia" /> : null}
      </Row>
      {!cancelled && !past ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button title="Editar" variant="secondary" compact onPress={() => router.push({ pathname: '/appointment', params: { id: a.id } })} />
          </View>
          {onCancel ? (
            <View style={{ flex: 1 }}>
              <Button title="Cancelar cita" variant="secondary" compact onPress={onCancel} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
