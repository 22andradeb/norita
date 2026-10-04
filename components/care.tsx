import { Text, View } from 'react-native';

import type { ActivityItem, Medication } from '@/lib/api';
import { EVENT_CATEGORIES, FIELDS_BY_ACTIVITY, describe, type EventCategory } from '@/lib/logKinds';
import { discardFailed, useOutbox } from '@/lib/outbox';

import { Body, Button, Card, Row, colors } from './ui';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatWhen = (iso: string) => dateFormat.format(new Date(iso));

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  drink: 'Drink',
};

const DOSE_STATUS: Record<string, string> = {
  given: 'given',
  refused: 'refused',
  missed: 'missed',
  held: 'held back',
};

type Described = { title: string; lines: string[]; tone?: 'warning' | 'danger' };

function describeActivity(item: ActivityItem): Described {
  const d = item.data;
  switch (item.kind) {
    case 'check_in':
      return { title: 'Visit check-in', lines: describe(FIELDS_BY_ACTIVITY.check_in, d) };
    case 'vitals': {
      const lines = describe(
        FIELDS_BY_ACTIVITY.vitals.filter((f) => f.key !== 'systolic' && f.key !== 'diastolic'),
        d,
      );
      if (d.systolic != null) lines.unshift(`Blood pressure: ${d.systolic}/${d.diastolic} mmHg`);
      return { title: 'Vital signs', lines };
    }
    case 'meal':
      return {
        title: MEAL_LABEL[d.meal_type as string] ?? 'Meal',
        lines: describe(
          FIELDS_BY_ACTIVITY.meal.filter((f) => f.key !== 'meal_type'),
          d,
        ),
      };
    case 'care_event': {
      const category = EVENT_CATEGORIES[d.category as EventCategory];
      const tone = d.severity === 'urgent' ? 'danger' : d.severity === 'concern' ? 'warning' : undefined;
      return {
        title: category?.title ?? 'Note',
        lines: describe(category?.fields ?? [], (d.details as Record<string, unknown>) ?? {}),
        tone,
      };
    }
    case 'medication_dose': {
      const name = [d.medication_name, d.medication_dose].filter(Boolean).join(' ');
      const status = DOSE_STATUS[d.status as string] ?? String(d.status);
      return {
        title: `${name} — ${status}`,
        lines: d.status === 'given' && d.quantity !== 1 ? [`Amount: ${d.quantity}`] : [],
        tone: d.status === 'refused' || d.status === 'missed' ? 'warning' : undefined,
      };
    }
    case 'stock_change': {
      const delta = d.delta as number;
      const verb = d.reason === 'refill' ? 'Refill' : d.reason === 'initial' ? 'Starting stock' : 'Stock removed';
      return {
        title: `${d.medication_name}: ${verb}`,
        lines: [`${delta > 0 ? '+' : ''}${delta} ${d.stock_unit}`],
      };
    }
  }
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <Body muted>Nothing has been logged yet.</Body>;
  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => {
        const { title, lines, tone } = describeActivity(item);
        const notes = item.data.notes as string | undefined;
        return (
          <Card key={`${item.kind}:${item.id}`} tone={tone}>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              {formatWhen(item.recorded_at)}
              {item.recorded_by_name ? ` · ${item.recorded_by_name}` : ''}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {tone === 'danger' ? 'Urgent: ' : ''}
              {title}
            </Text>
            {lines.map((line) => (
              <Text key={line} style={{ fontSize: 16, color: colors.text }}>
                {line}
              </Text>
            ))}
            {notes ? <Text style={{ fontSize: 16, color: colors.text, fontStyle: 'italic' }}>“{notes}”</Text> : null}
          </Card>
        );
      })}
    </View>
  );
}

export const isLowStock = (m: Medication) => m.low_stock_threshold != null && m.stock_quantity <= m.low_stock_threshold;

export function MedicationList({
  medications,
  onGive,
  onStock,
}: {
  medications: Medication[];
  onGive?: (m: Medication) => void;
  onStock?: (m: Medication) => void;
}) {
  if (medications.length === 0) return <Body muted>No medications added yet.</Body>;
  return (
    <View style={{ gap: 12 }}>
      {medications.map((m) => {
        const low = isLowStock(m);
        const schedule = m.as_needed ? 'When needed' : m.times.length ? m.times.join(', ') : 'No set times';
        return (
          <Card key={m.id} tone={low ? 'warning' : undefined}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {m.name}
              {m.dose ? ` · ${m.dose}` : ''}
            </Text>
            <Text style={{ fontSize: 16, color: colors.text }}>{schedule}</Text>
            {m.instructions ? <Text style={{ fontSize: 16, color: colors.muted }}>{m.instructions}</Text> : null}
            <Text style={{ fontSize: 16, fontWeight: '600', color: low ? colors.warning : colors.text }}>
              {low ? 'Low stock: ' : 'In stock: '}
              {m.stock_quantity} {m.stock_unit}
            </Text>
            {onGive || onStock ? (
              <Row>
                {onGive ? (
                  <View style={{ flex: 1 }}>
                    <Button title="Log dose" onPress={() => onGive(m)} />
                  </View>
                ) : null}
                {onStock ? (
                  <View style={{ flex: 1 }}>
                    <Button title="Stock" variant="secondary" onPress={() => onStock(m)} />
                  </View>
                ) : null}
              </Row>
            ) : null}
          </Card>
        );
      })}
    </View>
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
            {pending === 1 ? '1 entry is' : `${pending} entries are`} saved on this phone and will sync when you’re
            back online.
          </Body>
        </Card>
      ) : null}
      {failed.length > 0 ? (
        <Card tone="danger">
          <Body>
            {failed.length === 1 ? '1 entry' : `${failed.length} entries`} could not be saved: {failed[0].error}
          </Body>
          <Button title="Dismiss" variant="secondary" onPress={() => void discardFailed()} />
        </Card>
      ) : null}
    </View>
  );
}
