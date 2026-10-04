import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { AppointmentCard } from '@/components/appointments';
import { PersonCard } from '@/components/PersonCard';
import { Button, Caption, EmptyState, ErrorText, Heading, Loading, Screen, Title } from '@/components/ui';
import { api, useLoad, type Appointment } from '@/lib/api';
import { errorText } from '@/lib/format';
import { usePerson } from '@/lib/person';

/** Appointments: the whole care team (family included) can add, edit and cancel them. */
export default function Appointments() {
  const { person, loading: peopleLoading } = usePerson();
  const pid = person?.id;
  const appts = useLoad(async () => (pid ? api.appointments(pid) : []), [pid]);
  const team = useLoad(async () => (pid ? api.team(pid) : []), [pid]);

  if (peopleLoading) return <Loading />;
  if (!person) {
    return (
      <Screen>
        <EmptyState icon="calendar-clock" title="No hay ninguna persona" body="Añade o únete a una persona desde la pestaña Hoy." />
      </Screen>
    );
  }

  const now = Date.now();
  const all = appts.data ?? [];
  const upcoming = all.filter((a) => Date.parse(a.starts_at) >= now && a.status === 'scheduled');
  const past = all.filter((a) => Date.parse(a.starts_at) < now || a.status === 'cancelled').reverse();
  const familyIds = new Set((team.data ?? []).filter((m) => m.role === 'family').map((m) => m.user_id));

  function cancel(a: Appointment) {
    Alert.alert('Cancelar cita', `¿Seguro que quieres cancelar «${a.title}»?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancelar cita',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.updateAppointment(a.id, { status: 'cancelled' });
            await appts.reload();
          } catch (e) {
            Alert.alert('No se pudo cancelar', errorText(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <PersonCard person={person} />
      <Title>Citas</Title>
      <Button title="Añadir cita" icon="calendar-plus" onPress={() => router.push('/appointment')} />
      <ErrorText>{appts.error}</ErrorText>

      <Heading>Próximas</Heading>
      {upcoming.length === 0 ? (
        <Caption>No hay citas próximas.</Caption>
      ) : (
        <View style={{ gap: 12 }}>
          {upcoming.map((a) => (
            <AppointmentCard key={a.id} appointment={a} addedByFamily={!!a.created_by && familyIds.has(a.created_by)} onCancel={() => cancel(a)} />
          ))}
        </View>
      )}

      {past.length ? (
        <>
          <Heading>Pasadas y canceladas</Heading>
          <View style={{ gap: 12 }}>
            {past.slice(0, 20).map((a) => (
              <AppointmentCard key={a.id} appointment={a} addedByFamily={!!a.created_by && familyIds.has(a.created_by)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
