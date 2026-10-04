import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { formatWhen } from '@/components/care';
import { fmtNum } from '@/lib/format';
import { Legend, LineChart } from '@/components/charts';
import { Body, Button, Caption, Card, ErrorText, Heading, IconBadge, Screen, Segmented, StatusPill } from '@/components/ui';
import { api, useLoad } from '@/lib/api';
import { useOutbox } from '@/lib/outbox';
import { usePerson } from '@/lib/person';
import { addDays, mean } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import { METRICS, formatReading, isMetricKey, readingsFor, type Metric } from '@/lib/vitals';

type Period = '7' | '30' | '90';

/** Full view of one vital sign: big chart, stats, reference range and every reading. */
export default function MetricDetail() {
  const t = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { person, canLog } = usePerson();
  const { lastSyncedAt } = useOutbox();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  const pid = person?.id;

  const { data, error } = useLoad(async () => (pid ? api.vitals(pid, addDays(new Date(), -days + 1)) : []), [
    pid,
    days,
    lastSyncedAt,
  ]);

  if (!isMetricKey(key) || !person) return <Body>Medida desconocida.</Body>;
  const metric: Metric = METRICS[key];
  const readings = readingsFor(metric, data ?? []);
  const latest = readings[readings.length - 1];
  const status = latest ? metric.status(latest, readings) : null;
  const values = readings.map((r) => r.value);
  const bp = metric.key === 'blood_pressure';
  const fmt = (v: number | null) => (v == null ? '—' : fmtNum(v, metric.decimals));

  const series = [{ points: readings.map((r) => ({ t: Date.parse(r.at), v: r.value })), color: metric.color }];
  if (bp) series.push({ points: readings.map((r) => ({ t: Date.parse(r.at), v: r.value2! })), color: accents.spo2 });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: metric.label }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBadge name={metric.icon} color={metric.color} size={56} />
        <View style={{ flex: 1 }}>
          <Caption>{person.nickname} · última lectura</Caption>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: 40, fontWeight: '800', color: t.text, letterSpacing: -1 }}>
              {latest ? formatReading(metric, latest) : '—'}
            </Text>
            <Text style={{ fontSize: 16, color: t.muted }}>{metric.unit}</Text>
          </View>
          {status ? <StatusPill level={status.level} label={status.label} /> : null}
        </View>
      </View>

      <Segmented<Period>
        options={[
          { value: '7', label: 'Semana' },
          { value: '30', label: 'Mes' },
          { value: '90', label: '3 meses' },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <ErrorText>{error}</ErrorText>

      <Card>
        {readings.length ? (
          <LineChart series={series} band={metric.band} from={addDays(new Date(), -days + 1).getTime()} to={Date.now()} height={220} />
        ) : (
          <Caption>No hay lecturas en este periodo.</Caption>
        )}
        {bp ? (
          <Legend
            items={[
              { label: 'Sistólica (alta)', color: metric.color },
              { label: 'Diastólica (baja)', color: accents.spo2 },
            ]}
          />
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[
          ['Media', fmt(mean(values))],
          ['Mínimo', fmt(values.length ? Math.min(...values) : null)],
          ['Máximo', fmt(values.length ? Math.max(...values) : null)],
          ['Lecturas', String(readings.length)],
        ].map(([label, value]) => (
          <Card key={label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{value}</Text>
            <Caption>{label}</Caption>
          </Card>
        ))}
      </View>
      {bp ? <Caption>Media, mínimo y máximo se refieren a la tensión alta (sistólica).</Caption> : null}

      <Card tone="primary">
        <Body style={{ fontWeight: '700' }}>Sobre esta medida</Body>
        <Body>{metric.rangeText}</Body>
        <Caption>Son rangos de referencia generales, no un diagnóstico. Pregunta a su médico cuál es el adecuado.</Caption>
      </Card>

      {canLog ? (
        <Button
          title="Añadir lectura"
          icon="plus"
          onPress={() => router.push({ pathname: '/log/[kind]', params: { kind: 'vitals', personId: person.id } })}
        />
      ) : null}

      <Heading>Todas las lecturas</Heading>
      <Card style={{ padding: 0, gap: 0 }}>
        {[...readings].reverse().map((r, i) => {
          const s = metric.status(r, readings);
          return (
            <View
              key={r.at + i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                gap: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: t.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>
                  {formatReading(metric, r)} <Text style={{ fontSize: 14, color: t.muted }}>{metric.unit}</Text>
                </Text>
                <Caption>{formatWhen(r.at)}</Caption>
              </View>
              <StatusPill level={s.level} label={s.label} />
            </View>
          );
        })}
        {readings.length === 0 ? (
          <View style={{ padding: 14 }}>
            <Caption>Aún no hay lecturas.</Caption>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
