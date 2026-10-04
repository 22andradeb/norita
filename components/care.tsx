import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ActivityItem, Medication } from '@/lib/api';
import { EVENT_CATEGORIES, FIELDS_BY_ACTIVITY, describe, type EventCategory, type LogKindKey } from '@/lib/logKinds';
import { fmtNum, fmtTime, fmtWhen, translateError } from '@/lib/format';
import { LOG_STYLE } from '@/lib/logStyle';
import { discardFailed, useOutbox } from '@/lib/outbox';
import type { DoseSlot } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import type { IconName } from '@/lib/vitals';

import { Body, Button, Caption, Card, Chip, IconBadge, Row, StatusPill } from './ui';

export { fmtTime as formatTime, fmtWhen as formatWhen } from '@/lib/format';

const DOSE_STATUS: Record<string, string> = { given: 'Tomada', refused: 'Rechazada', missed: 'Olvidada', held: 'No dada' };
const MEAL_NAMES: Record<string, string> = { breakfast: 'Desayuno', lunch: 'Comida', dinner: 'Cena', snack: 'Merienda' };

type Described = { styleKey: LogKindKey; title: string; lines: string[]; tone?: 'warning' | 'danger'; style?: { icon: IconName; color: string } };

function describeActivity(item: ActivityItem): Described {
  const d = item.data;
  switch (item.kind) {
    case 'check_in':
      return { styleKey: 'checkin', title: 'Revisión de la visita', lines: describe(FIELDS_BY_ACTIVITY.check_in, d) };
    case 'vitals': {
      const lines = describe(
        FIELDS_BY_ACTIVITY.vitals.filter((f) => f.key !== 'systolic' && f.key !== 'diastolic'),
        d,
      );
      if (d.systolic != null) lines.unshift(`Tensión: ${d.systolic}/${d.diastolic} mmHg`);
      return { styleKey: 'vitals', title: 'Constantes vitales', lines };
    }
    case 'meal': {
      if (d.meal_type === 'drink') {
        return { styleKey: 'drink', title: `Bebida · ${d.fluids_ml} ml`, lines: d.description ? [String(d.description)] : [] };
      }
      const name = MEAL_NAMES[d.meal_type as string] ?? String(d.meal_type);
      return {
        styleKey: 'meal',
        title: name,
        lines: describe(
          FIELDS_BY_ACTIVITY.meal.filter((f) => f.key !== 'meal_type'),
          d,
        ),
      };
    }
    case 'care_event': {
      const category = d.category as EventCategory;
      const def = EVENT_CATEGORIES[category];
      return {
        styleKey: category in LOG_STYLE ? (category as LogKindKey) : 'other',
        title: def?.title ?? 'Nota',
        lines: describe(def?.fields ?? [], (d.details as Record<string, unknown>) ?? {}),
        tone: d.severity === 'urgent' ? 'danger' : d.severity === 'concern' ? 'warning' : undefined,
      };
    }
    case 'medication_dose': {
      const name = [d.medication_name, d.medication_dose].filter(Boolean).join(' ');
      return {
        styleKey: 'dose',
        title: name,
        lines: [
          `${DOSE_STATUS[d.status as string] ?? d.status}${d.scheduled_time ? ` · toma de las ${d.scheduled_time}` : ''}${
            d.status === 'given' && d.quantity !== 1 ? ` · ×${d.quantity}` : ''
          }`,
        ],
        tone: d.status === 'refused' || d.status === 'missed' ? 'warning' : undefined,
      };
    }
    case 'visit': {
      const arrival = d.kind === 'arrival';
      return {
        styleKey: 'other',
        style: { icon: arrival ? 'door-open' : 'door-closed', color: accents.wellbeing },
        title: arrival ? 'Llegada del cuidador' : 'Salida del cuidador',
        lines: [],
      };
    }
    case 'stock_change': {
      const delta = d.delta as number;
      const verb = d.reason === 'refill' ? 'Reposición' : d.reason === 'initial' ? 'Existencias iniciales' : 'Retirado';
      return {
        styleKey: 'stock',
        title: `${d.medication_name}`,
        lines: [`${verb}: ${delta > 0 ? '+' : ''}${delta} ${d.stock_unit}`],
      };
    }
  }
}

/** Timeline of entries as rows with a category icon, newest first. */
export function ActivityList({ items, showDate }: { items: ActivityItem[]; showDate?: boolean }) {
  const t = useTheme();
  if (items.length === 0) return <Caption>Aún no hay nada registrado este día.</Caption>;
  return (
    <Card style={{ padding: 0, gap: 0 }}>
      {items.map((item, i) => {
        const { styleKey, title, lines, tone, style: custom } = describeActivity(item);
        const style = custom ?? LOG_STYLE[styleKey];
        const notes = item.data.notes as string | undefined;
        return (
          <View
            key={`${item.kind}:${item.id}`}
            style={{
              flexDirection: 'row',
              gap: 12,
              padding: 14,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: t.border,
              backgroundColor: tone === 'danger' ? t.dangerSoft : tone === 'warning' ? t.warningSoft : 'transparent',
            }}
          >
            <IconBadge name={style.icon} color={style.color} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, flex: 1 }}>
                  {tone === 'danger' ? 'Urgente · ' : ''}
                  {title}
                </Text>
                <Caption>{showDate ? fmtWhen(item.recorded_at) : fmtTime(item.recorded_at)}</Caption>
              </View>
              {lines.map((line) => (
                <Text key={line} style={{ fontSize: 15, color: t.text }}>
                  {line}
                </Text>
              ))}
              {notes ? <Text style={{ fontSize: 15, color: t.muted, fontStyle: 'italic' }}>“{notes}”</Text> : null}
              {item.recorded_by_name ? <Caption>por {item.recorded_by_name}</Caption> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

export const isLowStock = (m: Medication) => m.low_stock_threshold != null && m.stock_quantity <= m.low_stock_threshold;

/** Today's scheduled doses as a checklist. Caregivers tap a row to record what happened. */
export function DoseChecklist({
  slots,
  canLog,
  onRecord,
}: {
  slots: DoseSlot[];
  canLog: boolean;
  onRecord: (slot: DoseSlot, status: 'given' | 'refused' | 'missed' | 'held') => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  if (slots.length === 0) return <Caption>No hay tomas programadas. Añade horas a un medicamento para crear la lista diaria.</Caption>;

  return (
    <Card style={{ padding: 0, gap: 0 }}>
      {slots.map((s, i) => {
        const key = `${s.medication.id}@${s.time}`;
        const done = s.status === 'given';
        const level = s.status === 'given' ? 'normal' : s.status === 'held' ? 'none' : s.status ? 'watch' : 'none';
        return (
          <View key={key} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
            <Pressable
              disabled={!canLog || !!s.status}
              onPress={() => setOpen(open === key ? null : key)}
              accessibilityRole="button"
              accessibilityLabel={`${s.time} ${s.medication.name}${s.status ? `, ${DOSE_STATUS[s.status]}` : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  borderWidth: 2,
                  borderColor: done ? t.success : t.border,
                  backgroundColor: done ? t.success : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? <Text style={{ color: t.card, fontWeight: '900' }}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>
                  {s.medication.name}
                  {s.medication.dose ? ` · ${s.medication.dose}` : ''}
                </Text>
                <Caption>
                  {s.time}
                  {s.recordedAt ? ` · registrada a las ${fmtTime(s.recordedAt)}` : ''}
                </Caption>
              </View>
              {s.status ? <StatusPill level={level} label={DOSE_STATUS[s.status]} /> : canLog ? <Caption>Toca para registrar</Caption> : null}
            </Pressable>
            {open === key ? (
              <Row style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                {(['given', 'refused', 'missed', 'held'] as const).map((status) => (
                  <Chip
                    key={status}
                    label={DOSE_STATUS[status]}
                    selected={status === 'given'}
                    onPress={() => {
                      setOpen(null);
                      onRecord(s, status);
                    }}
                  />
                ))}
              </Row>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

export function MedicationCard({
  medication: m,
  onGive,
  onStock,
}: {
  medication: Medication;
  onGive?: () => void;
  onStock?: () => void;
}) {
  const t = useTheme();
  const low = isLowStock(m);
  const schedule = m.as_needed ? 'Solo si lo necesita' : m.times.length ? m.times.join(' · ') : 'Sin horario fijo';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge name="pill" color={LOG_STYLE.medication.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>
            {m.name}
            {m.dose ? ` · ${m.dose}` : ''}
          </Text>
          <Caption>{schedule}</Caption>
        </View>
      </View>
      {m.instructions ? <Body muted>{m.instructions}</Body> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, color: t.text }}>
          Quedan {fmtNum(m.stock_quantity)} {m.stock_unit}
        </Text>
        {low ? <StatusPill level="watch" label="Quedan pocas" /> : null}
      </View>
      {onGive || onStock ? (
        <Row>
          {onGive ? (
            <View style={{ flex: 1 }}>
              <Button title={m.as_needed ? 'Dar ahora' : 'Registrar toma'} onPress={onGive} compact />
            </View>
          ) : null}
          {onStock ? (
            <View style={{ flex: 1 }}>
              <Button title="Existencias" variant="secondary" onPress={onStock} compact />
            </View>
          ) : null}
        </Row>
      ) : null}
    </Card>
  );
}

/** Tells the caregiver when entries are still on the phone or were rejected by the server. */
export function SyncBanner() {
  const { pending, failed } = useOutbox();
  if (pending === 0 && failed.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      {pending > 0 ? (
        <Card tone="warning">
          <Body>
            {pending === 1 ? '1 registro está guardado' : `${pending} registros están guardados`} en este móvil y se
            sincronizarán cuando vuelva la conexión.
          </Body>
        </Card>
      ) : null}
      {failed.length > 0 ? (
        <Card tone="danger">
          <Body>
            {failed.length === 1 ? 'No se pudo guardar 1 registro' : `No se pudieron guardar ${failed.length} registros`}: {translateError(failed[0].error ?? '')}
          </Body>
          <Button title="Descartar" variant="secondary" onPress={() => void discardFailed()} compact />
        </Card>
      ) : null}
    </View>
  );
}
