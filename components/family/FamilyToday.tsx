import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { NextAppointmentCard } from '@/components/appointments';
import { ActivityList } from '@/components/care';
import { PersonCard } from '@/components/PersonCard';
import { Button, Caption, EmptyState, ErrorText, Heading, Icon, Loading, Screen, Title } from '@/components/ui';
import { VisitCard } from '@/components/VisitCard';
import { DayHero, WarningList, dayTitle } from '@/components/widgets';
import { api, useLoad } from '@/lib/api';
import { lastEntryAt, overallStatus } from '@/lib/family';
import { timeAgo } from '@/lib/format';
import { buildWarnings, dailyStats } from '@/lib/insights';
import { useOutbox } from '@/lib/outbox';
import { usePerson } from '@/lib/person';
import { addDays, startOfDay } from '@/lib/stats';
import { useTheme } from '@/lib/theme';
import { useInsightData } from '@/lib/useInsights';

/** Family home: how is she/he today? Status, next appointment, the visit, today at a glance and the day's log. */
export function FamilyToday() {
  const t = useTheme();
  const { person, loading: peopleLoading } = usePerson();
  const { lastSyncedAt } = useOutbox();
  const insight = useInsightData(person, 14);
  const pid = person?.id;
  const today = useLoad(async () => {
    if (!pid) return null;
    const start = startOfDay(new Date());
    const [items, next] = await Promise.all([api.activity(pid, start, addDays(start, 1)), api.nextAppointment(pid)]);
    return { items, next };
  }, [pid, lastSyncedAt]);

  if (peopleLoading) return <Loading />;
  if (!person) {
    return (
      <Screen>
        <EmptyState
          icon="account-heart-outline"
          title="Sigue los cuidados de tu familiar"
          body="Pide a su cuidador un código de invitación. Con él verás cómo está, sus constantes, su medicación, sus citas y cualquier aviso."
        >
          <Button title="Unirse con un código" icon="key-outline" onPress={() => router.push('/join')} />
        </EmptyState>
      </Screen>
    );
  }

  const data = insight.data;
  const days = data ? dailyStats(data, 14) : [];
  const d = days[days.length - 1];
  const warnings = data ? buildWarnings(data) : [];
  const status = overallStatus(warnings, person.nickname);
  const lastAt = data ? lastEntryAt(data) : null;
  const items = today.data?.items ?? [];

  const tone = status.level === 'alert' ? t.danger : status.level === 'watch' ? t.warning : t.success;
  const toneBg = status.level === 'alert' ? t.dangerSoft : status.level === 'watch' ? t.warningSoft : t.successSoft;
  const icon = status.level === 'alert' ? 'alert-octagon-outline' : status.level === 'watch' ? 'eye-outline' : 'shield-check-outline';

  return (
    <Screen>
      <PersonCard person={person} />
      <ErrorText>{insight.error ?? today.error}</ErrorText>

      {data ? (
        <View accessible accessibilityLabel={`${status.title}. ${status.message}`} style={{ backgroundColor: toneBg, borderRadius: 20, padding: 18, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name={icon} color={tone} size={34} />
            <Text style={{ flex: 1, fontSize: 22, fontWeight: '800', color: tone }}>{status.title}</Text>
          </View>
          <Text style={{ fontSize: 16, lineHeight: 22, color: t.text }}>{status.message}</Text>
          <Caption>{lastAt ? `Último registro ${timeAgo(lastAt)}` : 'Todavía no hay registros.'}</Caption>
        </View>
      ) : null}

      <NextAppointmentCard appointment={today.data?.next ?? null} />

      <View>
        <Title>Hoy</Title>
        <Caption>{dayTitle(new Date())}</Caption>
      </View>
      <VisitCard items={items} nickname={person.nickname} />

      {d ? (
        <DayHero
          fluidGoal={person.fluid_goal_ml}
          summary={{
            dosesDone: Math.min(d.dosesGiven, d.dosesDue),
            dosesScheduled: d.dosesDue,
            fluidsMl: d.fluidsMl,
            mainMeals: d.mainMeals,
            wellbeing: d.wellbeing,
            checkedIn: d.checkIn,
          }}
        />
      ) : null}

      {warnings.length ? (
        <>
          <Heading>Avisos</Heading>
          <WarningList warnings={warnings} limit={4} />
        </>
      ) : null}

      <Heading>Lo que pasó en el día</Heading>
      {items.length ? (
        <ActivityList items={items} />
      ) : (
        <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.border, borderRadius: 20, padding: 24, alignItems: 'center' }}>
          <Caption>Todavía no hay registros hoy.</Caption>
        </View>
      )}
    </Screen>
  );
}
