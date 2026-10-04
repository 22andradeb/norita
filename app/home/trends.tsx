import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { BarChart, CoverageCalendar, HBars, Legend, LineChart } from '@/components/charts';
import { Caption, Card, EmptyState, ErrorText, Heading, IconBadge, Loading, Screen, Segmented } from '@/components/ui';
import { PersonHeader, StatTile, StreakTile, WarningList } from '@/components/widgets';
import { fmtNum } from '@/lib/format';
import { adherence, buildWarnings, categoryCounts, dailyStats, entriesByHour, streaks, timeInRange } from '@/lib/insights';
import { LOG_STYLE } from '@/lib/logStyle';
import type { LogKindKey } from '@/lib/logKinds';
import { usePerson } from '@/lib/person';
import { addDays, mean } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import { useInsightData } from '@/lib/useInsights';
import { METRICS, METRIC_ORDER, formatReading, readingsFor, type IconName, type Metric, type Reading } from '@/lib/vitals';

type Period = '7' | '30' | '90';

/** Analysis for family and caregivers: warnings, streaks, logging coverage and trends. */
export default function Analysis() {
  const t = useTheme();
  const { person, loading: peopleLoading } = usePerson();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  // Warnings and streaks need at least two weeks of history, whatever the period shown.
  const { data, error, loading } = useInsightData(person, Math.max(days, 14));

  if (peopleLoading) return <Loading />;
  if (!person) {
    return (
      <Screen>
        <EmptyState icon="chart-box-outline" title="No hay ninguna persona" body="Primero añade o únete a una persona desde la pestaña Hoy." />
      </Screen>
    );
  }

  const all = data ? dailyStats(data, Math.max(days, 14)) : [];
  const stats = all.slice(-days);
  const warnings = data ? buildWarnings(data) : [];
  const s = streaks(all, person.fluid_goal_ml);
  const since = addDays(new Date(), -days + 1).getTime();
  const inPeriod = <T extends { recorded_at: string }>(rows: T[]) => rows.filter((r) => Date.parse(r.recorded_at) >= since);
  const vitals = data ? inPeriod(data.vitals) : [];
  const checkIns = data ? inPeriod(data.checkIns) : [];
  const label = (d: Date) => (days === 7 ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()] : String(d.getDate()));

  const avg = (vals: (number | null)[]) => mean(vals.filter((v): v is number => v != null));
  const meds = adherence(stats);
  const wellbeingAvg = avg(stats.map((d) => d.wellbeing));
  const fluidsAvg = avg(stats.map((d) => (d.entries ? d.fluidsMl : null)));
  const sleepAvg = avg(stats.map((d) => d.sleepHours));
  const loggedDays = stats.filter((d) => d.entries > 0).length;
  const tir = timeInRange(vitals);
  const tirTotal = tir.reduce((a, r) => a + r.total, 0);
  const tirAvg = tirTotal ? Math.round(tir.reduce((a, r) => a + (r.pct ?? 0) * r.total, 0) / tirTotal) : null;

  const counts = data ? categoryCounts({ ...data, checkIns, vitals, doses: inPeriod(data.doses), meals: inPeriod(data.meals), events: inPeriod(data.events) }) : [];
  const hours = data ? entriesByHour(inPeriod(data.entries)) : [];

  const metrics = METRIC_ORDER.map((k) => METRICS[k] as Metric)
    .map((m) => ({ metric: m, readings: readingsFor(m, vitals) }))
    .filter((m) => m.readings.length > 0);

  return (
    <Screen>
      <PersonHeader person={person} subtitle="Análisis" />
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
      {loading && !data ? <Caption>Cargando análisis…</Caption> : null}

      <Heading>Avisos</Heading>
      <WarningList warnings={warnings} />

      <Heading>Resumen del periodo</Heading>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile icon="pill" color={accents.meds} label="Adherencia" value={meds == null ? '—' : `${meds} %`} />
          <StatTile icon="emoticon-happy-outline" color={accents.wellbeing} label="Bienestar medio" value={wellbeingAvg == null ? '—' : String(Math.round(wellbeingAvg))} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile icon="cup-water" color={accents.fluids} label="Líquidos al día" value={fluidsAvg == null ? '—' : `${fmtNum(fluidsAvg / 1000, 1)} L`} />
          <StatTile icon="weather-night" color={accents.sleep} label="Sueño medio" value={sleepAvg == null ? '—' : `${fmtNum(sleepAvg, 1)} h`} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile icon="calendar-check-outline" color={accents.respiration} label="Días con registros" value={`${loggedDays}/${days}`} />
          <StatTile icon="heart-pulse" color={accents.bloodPressure} label="Lecturas en rango" value={tirAvg == null ? '—' : `${tirAvg} %`} />
        </View>
      </View>

      <Heading>Rachas</Heading>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StreakTile label="Revisiones diarias" current={s.checkIn.current} best={s.checkIn.best} color={accents.meals} />
          <StreakTile label="Días con registros" current={s.logging.current} best={s.logging.best} color={accents.respiration} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StreakTile label="Medicación completa" current={s.meds.current} best={s.meds.best} color={accents.meds} />
          <StreakTile label="Objetivo de líquidos" current={s.hydration.current} best={s.hydration.best} color={accents.fluids} />
        </View>
      </View>

      <ChartCard icon="calendar-month-outline" color={accents.wellbeing} title="Días registrados" summary={`${loggedDays} de ${days}`}>
        {stats.length ? <CoverageCalendar days={stats.slice(-Math.min(days, 42)).map((d) => ({ day: d.day, value: d.entries }))} /> : null}
        <Caption>Los días en rojo no tienen ningún registro. Cuanto más intenso el color, más registros.</Caption>
      </ChartCard>

      <ChartCard icon="pill" color={accents.meds} title="Adherencia a la medicación" summary={meds == null ? 'Sin tomas programadas' : `${meds} %`}>
        <BarChart
          bars={stats.map((d) => {
            const pct = d.dosesDue ? Math.round((Math.min(d.dosesGiven, d.dosesDue) / d.dosesDue) * 100) : null;
            return {
              label: label(d.day),
              value: pct,
              color: pct == null ? undefined : pct >= 100 ? accents.meds : pct >= 50 ? '#E3A008' : accents.bloodPressure,
            };
          })}
          color={accents.meds}
          max={100}
          format={(v) => `${v}`}
        />
        <Caption>Porcentaje de tomas programadas registradas como tomadas cada día.</Caption>
      </ChartCard>

      <ChartCard icon="emoticon-happy-outline" color={accents.wellbeing} title="Bienestar" summary={wellbeingAvg == null ? 'Sin datos' : `Media ${Math.round(wellbeingAvg)}`}>
        <BarChart bars={stats.map((d) => ({ label: label(d.day), value: d.wellbeing }))} color={accents.wellbeing} max={100} />
        {checkIns.length > 1 ? (
          <>
            <Caption>Apetito, movilidad y ánimo (1 = muy mal, 5 = muy bien)</Caption>
            <LineChart
              series={[
                { points: checkIns.filter((c) => c.appetite != null).map((c) => ({ t: Date.parse(c.recorded_at), v: c.appetite! })), color: accents.meals },
                { points: checkIns.filter((c) => c.mobility != null).map((c) => ({ t: Date.parse(c.recorded_at), v: c.mobility! })), color: accents.respiration },
                { points: checkIns.filter((c) => c.mood != null).map((c) => ({ t: Date.parse(c.recorded_at), v: c.mood! })), color: accents.wellbeing },
              ]}
              from={since}
              to={Date.now()}
              height={160}
            />
            <Legend
              items={[
                { label: 'Apetito', color: accents.meals },
                { label: 'Movilidad', color: accents.respiration },
                { label: 'Ánimo', color: accents.wellbeing },
              ]}
            />
          </>
        ) : null}
      </ChartCard>

      <Heading>Constantes vitales</Heading>
      {tir.length ? (
        <ChartCard icon="target" color={accents.bloodPressure} title="Tiempo en rango" summary={tirAvg == null ? '' : `${tirAvg} % global`}>
          <HBars
            rows={tir.map((r) => ({
              label: r.metric.label,
              value: r.pct ?? 0,
              color: (r.pct ?? 0) >= 80 ? t.success : (r.pct ?? 0) >= 50 ? t.warning : t.danger,
              text: `${r.pct} % · ${r.total} ${r.total === 1 ? 'lectura' : 'lecturas'}`,
            }))}
            max={100}
          />
          <Caption>Porcentaje de lecturas dentro del rango de referencia habitual.</Caption>
        </ChartCard>
      ) : (
        <Caption>No hay constantes registradas en este periodo.</Caption>
      )}
      {metrics.map(({ metric, readings }) => (
        <MetricChart key={metric.key} metric={metric} readings={readings} from={since} to={Date.now()} />
      ))}

      <Heading>Cuidados diarios</Heading>
      <ChartCard icon="cup-water" color={accents.fluids} title="Líquidos" summary={fluidsAvg == null ? 'Sin datos' : `Media ${fmtNum(fluidsAvg / 1000, 1)} L`}>
        <BarChart
          bars={stats.map((d) => ({ label: label(d.day), value: d.fluidsMl || null }))}
          color={accents.fluids}
          goal={person.fluid_goal_ml}
          format={(v) => fmtNum(v / 1000, 1)}
        />
        <Caption>La línea discontinua es el objetivo diario de {fmtNum(person.fluid_goal_ml / 1000, 1)} L.</Caption>
      </ChartCard>
      <ChartCard icon="silverware-fork-knife" color={accents.meals} title="Comidas principales" summary={`Media ${fmtNum(avg(stats.map((d) => (d.entries ? d.mainMeals : null))) ?? 0, 1)} de 3`}>
        <BarChart bars={stats.map((d) => ({ label: label(d.day), value: d.entries ? d.mainMeals : null }))} color={accents.meals} max={3} />
        <Caption>Desayuno, comida y cena con algo de ingesta.</Caption>
      </ChartCard>
      <ChartCard icon="weather-night" color={accents.sleep} title="Sueño" summary={sleepAvg == null ? 'Sin datos' : `Media ${fmtNum(sleepAvg, 1)} h`}>
        <BarChart bars={stats.map((d) => ({ label: label(d.day), value: d.sleepHours }))} color={accents.sleep} goal={7} />
        <Caption>La línea discontinua marca 7 horas.</Caption>
      </ChartCard>

      <Heading>Actividad del equipo</Heading>
      <ChartCard icon="format-list-bulleted" color={accents.neutral} title="Qué se ha registrado" summary={`${counts.reduce((a, [, n]) => a + n, 0)} registros`}>
        {counts.length ? (
          <HBars
            rows={counts.map(([key, n]) => {
              const style = LOG_STYLE[key as LogKindKey] ?? LOG_STYLE.other;
              return { label: style.label, value: n, color: style.color };
            })}
          />
        ) : (
          <Caption>Nada registrado en este periodo.</Caption>
        )}
      </ChartCard>
      <ChartCard icon="clock-outline" color={accents.neutral} title="A qué hora se registra" summary="">
        <BarChart
          bars={hours.map((n, h) => ({ label: h % 3 === 0 ? `${h}h` : '', value: n || null }))}
          color={t.primary}
          height={120}
        />
        <Caption>Ayuda a ver en qué momentos del día hay visitas y cuándo no.</Caption>
      </ChartCard>

      <Text style={{ color: t.muted, fontSize: 13, marginTop: 8 }}>
        Los avisos y rangos son orientativos y se basan en referencias generales. No sustituyen la valoración de un profesional sanitario.
      </Text>
    </Screen>
  );
}

function ChartCard({
  icon,
  color,
  title,
  summary,
  children,
  onPress,
}: {
  icon: IconName;
  color: string;
  title: string;
  summary: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}, ${summary}`} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBadge name={icon} color={color} size={34} />
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t.text }}>{title}</Text>
        <Caption>{summary}</Caption>
      </View>
      {children}
    </Card>
  );
}

function MetricChart({ metric, readings, from, to }: { metric: Metric; readings: Reading[]; from: number; to: number }) {
  const latest = readings[readings.length - 1];
  const series = [{ points: readings.map((r) => ({ t: Date.parse(r.at), v: r.value })), color: metric.color }];
  const bp = metric.key === 'blood_pressure';
  if (bp) {
    series.push({ points: readings.map((r) => ({ t: Date.parse(r.at), v: r.value2! })), color: accents.spo2 });
  }
  return (
    <ChartCard
      icon={metric.icon}
      color={metric.color}
      title={metric.label}
      summary={`Última ${formatReading(metric, latest)} ${metric.unit}`}
      onPress={() => router.push({ pathname: '/metric/[key]', params: { key: metric.key } })}
    >
      <LineChart series={series} band={metric.band} from={from} to={to} />
      {bp ? (
        <Legend
          items={[
            { label: 'Sistólica (alta)', color: metric.color },
            { label: 'Diastólica (baja)', color: accents.spo2 },
          ]}
        />
      ) : null}
    </ChartCard>
  );
}
