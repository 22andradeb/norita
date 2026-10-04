import { router } from 'expo-router';
import { View } from 'react-native';

import { DoseChecklist, MedicationCard, SyncBanner, isLowStock } from '@/components/care';
import { Body, Button, Caption, Card, EmptyState, ErrorText, Fab, Heading, Loading, Screen } from '@/components/ui';
import { PersonHeader } from '@/components/widgets';
import { api, useLoad, type Medication } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtNum } from '@/lib/format';
import { useOutbox } from '@/lib/outbox';
import { usePerson } from '@/lib/person';
import { recordDose } from '@/lib/quickLog';
import { addDays, doseSlots, startOfDay } from '@/lib/stats';

export default function Meds() {
  const { session } = useAuth();
  const { person, canLog, loading: peopleLoading } = usePerson();
  const { lastSyncedAt } = useOutbox();
  const pid = person?.id;

  const { data, error } = useLoad(async () => {
    if (!pid) return null;
    const today = startOfDay(new Date());
    const [meds, items] = await Promise.all([api.medications(pid), api.activity(pid, today, addDays(today, 1))]);
    return { meds, items };
  }, [pid, lastSyncedAt]);

  if (peopleLoading) return <Loading />;
  if (!person) {
    return (
      <Screen>
        <EmptyState icon="pill" title="No hay ninguna persona" body="Primero añade o únete a una persona desde la pestaña Hoy." />
      </Screen>
    );
  }

  const meds = data?.meds ?? [];
  const slots = doseSlots(meds, data?.items ?? []);
  const asNeeded = meds.filter((m) => m.as_needed);
  const low = meds.filter(isLowStock);
  const done = slots.filter((s) => s.status === 'given').length;

  const open = (kind: 'dose' | 'stock' | 'medication', m?: Medication) =>
    router.push({
      pathname: '/log/[kind]',
      params: { kind, personId: person.id, ...(m ? { medicationId: m.id, medicationName: m.name } : {}) },
    });

  return (
    <Screen overlay={canLog ? <Fab label="Añadir medicamento" onPress={() => open('medication')} /> : undefined}>
      <PersonHeader person={person} subtitle="Medicación" />
      <SyncBanner />
      <ErrorText>{error}</ErrorText>

      {low.length ? (
        <Card tone="warning">
          <Body style={{ fontWeight: '700' }}>Quedan pocas existencias</Body>
          {low.map((m) => (
            <Body key={m.id}>
              {m.name}: quedan {fmtNum(m.stock_quantity)} {m.stock_unit}
            </Body>
          ))}
        </Card>
      ) : null}

      <Heading action={slots.length ? <Caption>{`${done} de ${slots.length} tomadas`}</Caption> : undefined}>
        Tomas de hoy
      </Heading>
      <DoseChecklist
        slots={slots}
        canLog={canLog}
        onRecord={(slot, status) => session && void recordDose(session.user.id, person.id, slot, status)}
      />

      {asNeeded.length ? (
        <>
          <Heading>Si lo necesita</Heading>
          {asNeeded.map((m) => (
            <MedicationCard key={m.id} medication={m} onGive={canLog ? () => open('dose', m) : undefined} />
          ))}
        </>
      ) : null}

      <Heading>Todos los medicamentos</Heading>
      {meds.length === 0 ? (
        <EmptyState icon="pill" title="Aún no hay medicamentos" body="Añade cada medicamento con sus horas para tener la lista diaria de tomas y el control de existencias.">
          {canLog ? <Button title="Añadir medicamento" icon="plus" onPress={() => open('medication')} /> : null}
        </EmptyState>
      ) : (
        <View style={{ gap: 12 }}>
          {meds.map((m) => (
            <MedicationCard
              key={m.id}
              medication={m}
              onGive={canLog && !m.as_needed ? () => open('dose', m) : undefined}
              onStock={canLog ? () => open('stock', m) : undefined}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
