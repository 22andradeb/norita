import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { LinkedPerson } from '@/lib/api';
import { describePerson } from '@/lib/api';
import { cap, fmtNum, timeAgo } from '@/lib/format';
import type { Warning } from '@/lib/insights';
import { addDays, isSameDay, scoreLabel, type DaySummary } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import { formatReading, type Metric, type Reading } from '@/lib/vitals';

import { Ring, Sparkline } from './charts';
import { Caption, Card, Icon, IconBadge, StatusPill } from './ui';

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.36, fontWeight: '800', color: t.primary }}>{name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0].toUpperCase())
          .join('')}</Text>
    </View>
  );
}

/** Name of the selected person; tapping opens the switcher. */
export function PersonHeader({ person, subtitle }: { person: LinkedPerson; subtitle?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/people')}
      accessibilityRole="button"
      accessibilityLabel={`${person.nickname}. Cambiar de persona`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <Avatar name={person.nickname} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.4 }}>{person.nickname}</Text>
          <Icon name="chevron-down" size={22} color={t.muted} />
        </View>
        <Caption>{subtitle ?? describePerson(person)}</Caption>
      </View>
    </Pressable>
  );
}

/** The last seven days; the selected one is filled. */
export function WeekStrip({ selected, onSelect }: { selected: Date; onSelect: (d: Date) => void }) {
  const t = useTheme();
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((d) => {
        const on = isSameDay(d, selected);
        return (
          <Pressable
            key={d.toISOString()}
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            style={{
              width: 44,
              paddingVertical: 8,
              borderRadius: 14,
              alignItems: 'center',
              backgroundColor: on ? t.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.onPrimary : t.muted }}>
              {['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()]}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: on ? t.onPrimary : t.text }}>{d.getDate()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wellbeing score ring plus medication, fluid and meal rings for the day. */
export function DayHero({ summary, fluidGoal, onCheckIn }: { summary: DaySummary; fluidGoal: number; onCheckIn?: () => void }) {
  const t = useTheme();
  const score = summary.wellbeing;
  return (
    <Card style={{ gap: 18, paddingVertical: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Ring progress={(score ?? 0) / 100} color={accents.wellbeing} size={112} stroke={12}>
          <Text style={{ fontSize: 34, fontWeight: '800', color: t.text }}>{score ?? '–'}</Text>
        </Ring>
        <View style={{ flex: 1, gap: 4 }}>
          <Caption>Bienestar</Caption>
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.text }}>
            {score == null ? 'Sin revisión todavía' : scoreLabel(score)}
          </Text>
          <Caption>
            {score == null
              ? onCheckIn
                ? 'Haz una revisión rápida para ver la puntuación de hoy.'
                : 'Aparece cuando el cuidador hace la revisión.'
              : 'Según apetito, movilidad, ánimo y confusión en la última revisión.'}
          </Caption>
          {score == null && onCheckIn ? (
            <Pressable onPress={onCheckIn} accessibilityRole="button" style={{ paddingVertical: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.primary }}>Hacer revisión →</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <MiniRing
          label="Medicación"
          value={summary.dosesScheduled ? `${summary.dosesDone}/${summary.dosesScheduled}` : '–'}
          progress={summary.dosesScheduled ? summary.dosesDone / summary.dosesScheduled : 0}
          color={accents.meds}
        />
        <MiniRing
          label="Líquidos"
          value={`${fmtNum(summary.fluidsMl / 1000, 1)} L`}
          progress={summary.fluidsMl / fluidGoal}
          color={accents.fluids}
        />
        <MiniRing label="Comidas" value={`${summary.mainMeals}/3`} progress={summary.mainMeals / 3} color={accents.meals} />
      </View>
    </Card>
  );
}

function MiniRing({ label, value, progress, color }: { label: string; value: string; progress: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ring progress={progress} color={color} size={72} stroke={8}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: t.text }}>{value}</Text>
      </Ring>
      <Caption>{label}</Caption>
    </View>
  );
}

/** Oura-style vital widget: latest value, status against the reference range, and a trend line. */
export function MetricWidget({ metric, readings, onPress }: { metric: Metric; readings: Reading[]; onPress: () => void }) {
  const t = useTheme();
  const latest = readings[readings.length - 1];
  const status = latest ? metric.status(latest, readings) : null;
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${metric.label}: ${latest ? `${formatReading(metric, latest)} ${metric.unit}, ${status?.label}` : 'sin lecturas'}`}
      style={{ flex: 1, minHeight: 172, gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconBadge name={metric.icon} color={metric.color} size={32} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: t.text, flex: 1 }} numberOfLines={1}>
          {metric.label}
        </Text>
      </View>
      {latest ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: t.text, letterSpacing: -0.5 }}>
              {formatReading(metric, latest)}
            </Text>
            <Text style={{ fontSize: 14, color: t.muted }}>{metric.unit}</Text>
          </View>
          {status ? <StatusPill level={status.level} label={status.label} /> : null}
          <Sparkline values={readings.slice(-10).map((r) => r.value)} color={metric.color} height={30} />
          <Caption>{timeAgo(latest.at)}</Caption>
        </>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: t.track }}>—</Text>
          <Caption>Sin lecturas</Caption>
        </View>
      )}
    </Card>
  );
}

/** Two-column grid for widgets. */
export function Grid({ children }: { children: React.ReactNode[] }) {
  const rows: React.ReactNode[][] = [];
  children.forEach((c, i) => (i % 2 === 0 ? rows.push([c]) : rows[rows.length - 1].push(c)));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
          {row}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

export function StatTile({
  icon,
  color,
  label,
  value,
  caption,
}: {
  icon: React.ComponentProps<typeof IconBadge>['name'];
  color: string;
  label: string;
  value: string;
  caption?: string;
}) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconBadge name={icon} color={color} />
      <View style={{ flex: 1 }}>
        <Caption>{label}</Caption>
        <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{value}</Text>
        {caption ? <Caption>{caption}</Caption> : null}
      </View>
    </Card>
  );
}

/** List of warnings, most serious first. */
export function WarningList({ warnings, limit }: { warnings: Warning[]; limit?: number }) {
  const t = useTheme();
  const shown = limit ? warnings.slice(0, limit) : warnings;
  if (warnings.length === 0) {
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge name="check-circle-outline" color={t.success} />
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t.text }}>Todo en orden. No hay avisos.</Text>
      </Card>
    );
  }
  return (
    <Card style={{ padding: 0, gap: 0 }}>
      {shown.map((w, i) => {
        const color = w.level === 'alert' ? t.danger : w.level === 'watch' ? t.warning : t.primary;
        return (
          <View
            key={w.title + i}
            accessible
            accessibilityLabel={`${w.level === 'alert' ? 'Importante: ' : ''}${w.title}${w.detail ? `. ${w.detail}` : ''}`}
            style={{ flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}
          >
            <IconBadge name={w.icon} color={color} size={38} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{w.title}</Text>
              {w.detail ? <Caption>{w.detail}</Caption> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** Streak with a flame, current and best run. */
export function StreakTile({ label, current, best, color }: { label: string; current: number; best: number; color: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, gap: 4 }} accessibilityLabel={`${label}: ${current} días seguidos, récord ${best}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="fire" color={current > 0 ? color : t.muted} size={22} />
        <Text style={{ fontSize: 26, fontWeight: '800', color: t.text }}>{current}</Text>
        <Caption>{current === 1 ? 'día' : 'días'}</Caption>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{label}</Text>
      <Caption>Récord: {best}</Caption>
    </Card>
  );
}

export const dayTitle = (d: Date) => cap(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));

/** Card with an icon, title and one-line summary, wrapping a chart. */
export function ChartCard({
  icon,
  color,
  title,
  summary,
  children,
  onPress,
}: {
  icon: React.ComponentProps<typeof IconBadge>['name'];
  color: string;
  title: string;
  summary?: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={summary ? `${title}, ${summary}` : title} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBadge name={icon} color={color} size={34} />
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t.text }}>{title}</Text>
        {summary ? <Caption>{summary}</Caption> : null}
        {onPress ? <Icon name="chevron-right" color={t.muted} /> : null}
      </View>
      {children}
    </Card>
  );
}

/** "↑ 4 mmHg" style change, coloured by whether the change is good news. */
export function Delta({ change, unit, decimals = 0, higherIsBetter }: { change: number | null; unit: string; decimals?: number; higherIsBetter?: boolean }) {
  const t = useTheme();
  if (change == null) return <Caption>Sin datos para comparar</Caption>;
  const flat = Math.abs(change) < 0.5 * Math.pow(10, -decimals);
  if (flat) return <Text style={{ fontSize: 15, fontWeight: '700', color: t.muted }}>= Sin cambios</Text>;
  const up = change > 0;
  const good = higherIsBetter === undefined ? null : up === higherIsBetter;
  const color = good == null ? t.text : good ? t.success : t.warning;
  return (
    <Text style={{ fontSize: 15, fontWeight: '700', color }}>
      {up ? '↑' : '↓'} {fmtNum(Math.abs(change), decimals)}
      {unit}
    </Text>
  );
}
