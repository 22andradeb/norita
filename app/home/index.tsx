import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { FamilyToday } from '@/components/family/FamilyToday';
import { AlertsCard } from '@/components/AlertsCard';
import { NextAppointmentCard } from '@/components/appointments';
import { ActivityList, SyncBanner } from '@/components/care';
import { ScalesCard } from '@/components/scales';
import { Button, Caption, Card, EmptyState, ErrorText, Fab, Heading, Loading, Screen } from '@/components/ui';
import { VisitCard } from '@/components/VisitCard';
import { DayHero, Grid, MetricWidget, PersonHeader, StreakTile, WeekStrip, dayTitle } from '@/components/widgets';
import { listAlerts, openAlerts } from '@/lib/alerts';
import { api, useLoad } from '@/lib/api';
import { listAssessments } from '@/lib/assessments';
import { useAuth } from '@/lib/auth';
import { dailyStats, streaks } from '@/lib/insights';
import { useOutbox } from '@/lib/outbox';
import { usePerson } from '@/lib/person';
import { recordDose, recordVisit } from '@/lib/quickLog';
import { addDays, doseSlots, isSameDay, nextDose, startOfDay, summarizeDay } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import { useInsightData } from '@/lib/useInsights';
import { METRICS, METRIC_ORDER, readingsFor } from '@/lib/vitals';

export default function TodayTab() {
  const family = useAuth().profile?.role === 'family';
  return family ? <FamilyToday /> : <Today />;
}

function Today() {
  const t = useTheme();
  const { session, profile } = useAuth();
  const { person, canLog, loading: peopleLoading } = usePerson();
  const { lastSyncedAt } = useOutbox();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const isToday = isSameDay(day, new Date());
  const pid = person?.id;

  const { data, error } = useLoad(async () => {
    if (!pid) return null;
    const [items, meds, vitals, next] = await Promise.all([
      api.activity(pid, day, addDays(day, 1)),
      api.medications(pid),
      api.vitals(pid, addDays(new Date(), -90)),
      api.nextAppointment(pid),
    ]);
    return { items, meds, vitals, next };
  }, [pid, day.getTime(), lastSyncedAt]);
  // Two weeks of history for streaks.
  const insight = useInsightData(person, 14);
  const alertFeed = useLoad(async () => (pid ? listAlerts(pid, 14) : []), [pid, lastSyncedAt]);
  const scales = useLoad(async () => (pid ? listAssessments(pid) : []), [pid, lastSyncedAt]);

  if (peopleLoading) return <Loading />;

  if (!person) {
    return (
      <Screen>
        <EmptyState
          icon="account-heart-outline"
          title={`Hola, ${profile?.full_name?.split(' ')[0] ?? ''}`}
          body={
            profile?.role === 'caregiver'
              ? 'Añade a la primera persona que cuidas para empezar a registrar visitas, constantes, medicación y mucho más.'
              : 'Pide al cuidador de tu familiar un código de invitación para seguir sus cuidados.'
          }
        >
          {profile?.role === 'caregiver' ? (
            <Button title="Añadir persona" icon="account-plus-outline" onPress={() => router.push('/add-person')} />
          ) : null}
          <Button
            title="Unirse con un código"
            icon="key-outline"
            variant={profile?.role === 'caregiver' ? 'secondary' : 'primary'}
            onPress={() => router.push('/join')}
          />
        </EmptyState>
      </Screen>
    );
  }

  const slots = data ? doseSlots(data.meds, data.items) : [];
  const summary = summarizeDay(data?.items ?? [], slots);
  const upcoming = isToday && canLog ? nextDose(slots) : null;
  const days = insight.data ? dailyStats(insight.data, 14) : [];
  const s = streaks(days, person.fluid_goal_ml);

  const openLog = (kind?: string) =>
    router.push(
      kind
        ? { pathname: '/log/[kind]', params: { kind, personId: person.id, ...(isToday ? {} : { date: day.toISOString() }) } }
        : { pathname: '/log', params: { personId: person.id, ...(isToday ? {} : { date: day.toISOString() }) } },
    );

  return (
    <Screen overlay={canLog ? <Fab label="Registrar algo" onPress={() => openLog()} /> : undefined}>
      <PersonHeader person={person} subtitle={dayTitle(day)} />
      <WeekStrip selected={day} onSelect={(d) => setDay(startOfDay(d))} />
      <SyncBanner />
      <ErrorText>{error ?? insight.error}</ErrorText>

      {isToday ? <NextAppointmentCard appointment={data?.next ?? null} /> : null}
      {isToday && canLog && session ? (
        <VisitCard
          items={data?.items ?? []}
          nickname={person.nickname}
          onArrive={() => void recordVisit(session.user.id, person.id, 'arrival')}
          onLeave={() => void recordVisit(session.user.id, person.id, 'departure')}
        />
      ) : null}

      {isToday ? <ScalesCard assessments={scales.data ?? []} /> : null}
      <DayHero summary={summary} fluidGoal={person.fluid_goal_ml} onCheckIn={canLog ? () => openLog('checkin') : undefined} />

      {upcoming && session ? (
        <Card tone="primary" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Caption style={{ color: t.primary }}>Próxima toma · {upcoming.time}</Caption>
            <Text style={{ fontSize: 18, fontWeight: '800', color: t.text }}>
              {upcoming.medication.name}
              {upcoming.medication.dose ? ` · ${upcoming.medication.dose}` : ''}
            </Text>
          </View>
          <View style={{ width: 120 }}>
            <Button title="Tomada" icon="check" compact onPress={() => void recordDose(session.user.id, person.id, upcoming, 'given')} />
          </View>
        </Card>
      ) : null}

      <Heading>Avisos</Heading>
      {alertFeed.data ? <AlertsCard open={openAlerts(alertFeed.data)} onChanged={alertFeed.reload} /> : <Caption>Cargando avisos…</Caption>}

      <Heading
        action={
          <Text onPress={() => router.navigate('/home/trends')} style={{ color: t.primary, fontSize: 16, fontWeight: '700' }}>
            Análisis
          </Text>
        }
      >
        Constantes vitales
      </Heading>
      <Grid>
        {METRIC_ORDER.map((key) => (
          <MetricWidget
            key={key}
            metric={METRICS[key]}
            readings={readingsFor(METRICS[key], data?.vitals ?? [])}
            onPress={() => router.push({ pathname: '/metric/[key]', params: { key } })}
          />
        ))}
      </Grid>

      <Heading>Rachas</Heading>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StreakTile label="Revisiones" current={s.checkIn.current} best={s.checkIn.best} color={accents.meals} />
        <StreakTile label="Medicación completa" current={s.meds.current} best={s.meds.best} color={accents.meds} />
      </View>

      <Heading>{isToday ? 'Registro de hoy' : 'Registro del día'}</Heading>
      <ActivityList items={data?.items ?? []} />
    </Screen>
  );
}
