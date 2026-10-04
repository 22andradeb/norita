import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActivityList } from '@/components/care';
import { CoverageCalendar } from '@/components/charts';
import { ExamsSection } from '@/components/exams';
import { PersonCard } from '@/components/PersonCard';
import { Button, Caption, Card, EmptyState, ErrorText, Heading, Icon, Loading, Screen, Segmented, StatusPill, Title } from '@/components/ui';
import { ChartCard, StreakTile } from '@/components/widgets';
import { api, useLoad, type ActivityItem, type LinkedPerson } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cap, fmtTime, plural } from '@/lib/format';
import { dailyStats, streaks } from '@/lib/insights';
import { useOutbox } from '@/lib/outbox';
import { usePerson } from '@/lib/person';
import { addDays, dayKey, startOfDay } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import { useInsightData } from '@/lib/useInsights';

const DAYS = 30;

/**
 * History for both roles: the day-by-day care log of the last month (with how regular care has
 * been at the top) and the medical documents (exams) anyone on the team has uploaded.
 */
export function FamilyHistory() {
  const [section, setSection] = useState<'days' | 'exams'>('days');
  const { person, loading: peopleLoading } = usePerson();

  if (peopleLoading) return <Loading />;
  if (!person) {
    return (
      <Screen>
        <EmptyState icon="calendar-month-outline" title="No hay ninguna persona" body="Únete con un código desde la pestaña Hoy." />
      </Screen>
    );
  }

  return (
    <Screen>
      <PersonCard person={person} />
      <Title>Historial</Title>
      <Segmented<'days' | 'exams'>
        options={[
          { value: 'days', label: 'Día a día' },
          { value: 'exams', label: 'Exámenes' },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === 'days' ? <DaysSection person={person} /> : <ExamsSection olderAdultId={person.id} />}
    </Screen>
  );
}

function DaysSection({ person }: { person: LinkedPerson }) {
  const t = useTheme();
  const caregiver = useAuth().profile?.role === 'caregiver';
  const { lastSyncedAt } = useOutbox();
  const insight = useInsightData(person, DAYS);
  const history = useLoad(() => api.recentActivity(person.id, startOfDay(addDays(new Date(), -DAYS + 1)), 1000), [person.id, lastSyncedAt]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([dayKey(new Date())]));

  const stats = insight.data ? dailyStats(insight.data, DAYS) : [];
  const st = streaks(stats, person.fluid_goal_ml);
  const loggedDays = stats.filter((d) => d.entries > 0).length;

  // Group entries by day, newest first, including empty days so gaps are visible.
  const byDay = new Map<string, ActivityItem[]>();
  for (const item of history.data ?? []) {
    const k = dayKey(new Date(item.recorded_at));
    byDay.set(k, [...(byDay.get(k) ?? []), item]);
  }
  const days = Array.from({ length: DAYS }, (_, i) => addDays(new Date(), -i));

  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <>
      <ErrorText>{insight.error ?? history.error}</ErrorText>
      {caregiver ? (
        <Button title="Ver análisis completo" icon="chart-box-outline" variant="secondary" onPress={() => router.navigate('/home/trends')} />
      ) : null}

      <ChartCard icon="calendar-month-outline" color={accents.wellbeing} title="Días con cuidados" summary={`${loggedDays} de ${DAYS}`}>
        {stats.length ? <CoverageCalendar days={stats.map((d) => ({ day: d.day, value: d.entries }))} /> : null}
        <Caption>En rojo, los días sin ningún registro.</Caption>
      </ChartCard>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StreakTile label="Días con registros" current={st.logging.current} best={st.logging.best} color={accents.respiration} />
        <StreakTile label="Medicación completa" current={st.meds.current} best={st.meds.best} color={accents.meds} />
      </View>

      <Heading>Día a día</Heading>
      {days.map((day) => {
        const k = dayKey(day);
        const items = byDay.get(k) ?? [];
        const isOpen = open.has(k);
        const title = cap(day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
        if (items.length === 0) {
          return (
            <View
              key={k}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.border }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: t.muted }}>{title}</Text>
              <StatusPill level={day.getTime() > Date.now() - 86_400_000 ? 'none' : 'watch'} label="Sin registros" />
            </View>
          );
        }
        const times = items.map((i) => i.recorded_at).sort();
        const checkIn = items.some((i) => i.kind === 'check_in');
        const urgent = items.some((i) => i.kind === 'care_event' && (i.data.severity === 'urgent' || i.data.category === 'fall'));
        return (
          <Card key={k} style={{ gap: 12 }}>
            <Pressable
              onPress={() => toggle(k)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${title}, ${plural(items.length, 'registro', 'registros')}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: t.text }}>{title}</Text>
                <Caption>
                  {fmtTime(times[0])} a {fmtTime(times[times.length - 1])} · {plural(items.length, 'registro', 'registros')}
                </Caption>
              </View>
              {urgent ? (
                <StatusPill level="alert" label="Aviso" />
              ) : checkIn ? (
                <StatusPill level="normal" label="Revisión hecha" />
              ) : (
                <StatusPill level="watch" label="Sin revisión" />
              )}
              <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} color={t.muted} />
            </Pressable>
            {isOpen ? <ActivityList items={items} /> : null}
          </Card>
        );
      })}
    </>
  );
}
