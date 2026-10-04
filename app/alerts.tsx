import { AlertRows } from '@/components/AlertsCard';
import { Caption, ErrorText, Heading, Loading, Screen } from '@/components/ui';
import { listAlerts, openAlerts } from '@/lib/alerts';
import { useLoad } from '@/lib/api';
import { usePerson } from '@/lib/person';

/** All alerts of the last two weeks: pending first, then the ones someone already handled. */
export default function Alerts() {
  const { person } = usePerson();
  const pid = person?.id;
  const alerts = useLoad(async () => (pid ? listAlerts(pid, 14) : []), [pid]);

  if (!alerts.data) return alerts.error ? <ErrorText>{alerts.error}</ErrorText> : <Loading />;
  const pending = openAlerts(alerts.data);
  const pendingIds = new Set(pending.map((a) => a.id));
  const rest = alerts.data.filter((a) => !pendingIds.has(a.id));

  return (
    <Screen edges={['bottom']}>
      <Caption>Avisos de {person?.nickname} de las últimas 2 semanas. Toca uno pendiente para marcarlo como visto; el resto del equipo verá quién se encarga.</Caption>
      <Heading>Pendientes</Heading>
      {pending.length ? <AlertRows alerts={pending} onChanged={alerts.reload} /> : <Caption>No hay avisos pendientes.</Caption>}
      {rest.length ? (
        <>
          <Heading>Anteriores</Heading>
          <AlertRows alerts={rest} onChanged={alerts.reload} />
        </>
      ) : null}
    </Screen>
  );
}
