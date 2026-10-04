import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { BarChart, Legend, LineChart } from '@/components/charts';
import { PersonCard } from '@/components/PersonCard';
import { ScalesHistory } from '@/components/scales';
import { Caption, Card, EmptyState, ErrorText, Loading, Screen, Segmented, StatusPill, Title } from '@/components/ui';
import { ChartCard, Delta, StreakTile } from '@/components/widgets';
import { compare, metricSummaries, type MetricSummary } from '@/lib/family';
import { fmtNum, timeAgo } from '@/lib/format';
import { dailyStats, streaks, type InsightData } from '@/lib/insights';
import { useLoad, type LinkedPerson } from '@/lib/api';
import { listAssessments, type Assessment } from '@/lib/assessments';
import { usePerson } from '@/lib/person';
import { addDays, mean } from '@/lib/stats';
import { accents, useTheme } from '@/lib/theme';
import { useInsightData } from '@/lib/useInsights';
import { formatReading, METRICS } from '@/lib/vitals';

import { MedsSection } from './FamilyMeds';

type Period = '7' | '30' | '90';
type Section = 'vitals' | 'meds' | 'wellbeing';

/** Family health view, split into vital signs, medication and wellbeing. */
export function FamilyHealth() {
  const { person, loading: peopleLoading } = usePerson();
  const [section, setSection] = useState<Section>('vitals');
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  // Twice the period, so each metric can be compared with the period before.
  const { data, error, loading } = useInsightData(person, Math.max(days * 2, 14));
  const scales = useLoad(async () => (person ? listAssessments(person.id) : []), [person?.id]);

  if (peopleLoading) return <Loading />;
  if (!person) {
    return (
      <Screen>
        <EmptyState icon="heart-pulse" title="No hay ninguna persona" body="Únete con un código desde la pestaña Hoy." />
      </Screen>
    );
  }

  return (
    <Screen>
      <PersonCard person={person} />
      <View>
        <Title>Salud</Title>
        <Caption>
          {days === 7 ? 'Última semana' : days === 30 ? 'Últimos 30 días' : 'Últimos 3 meses'} de {person.nickname}
        </Caption>
      </View>
      <Segmented<Section>
        options={[
          { value: 'vitals', label: 'Signos vitales' },
          { value: 'meds', label: 'Medicación' },
          { value: 'wellbeing', label: 'Bienestar' },
        ]}
        value={section}
        onChange={setSection}
      />
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
      {loading && !data ? <Caption>Cargando…</Caption> : null}
      {data && section === 'vitals' ? <VitalsSection data={data} days={days} person={person} /> : null}
      {data && section === 'meds' ? <MedsSection data={data} days={days} /> : null}
      {data && section === 'wellbeing' ? <WellbeingSection data={data} days={days} person={person} assessments={scales.data ?? []} /> : null}
      <DisclaimerText />
    </Screen>
  );
}

function DisclaimerText() {
  const t = useTheme();
  return (
    <Text style={{ color: t.muted, fontSize: 13, marginTop: 8 }}>
      Esta información es orientativa y no sustituye la valoración de un profesional sanitario. Ante cualquier duda, consulta con su médico.
    </Text>
  );
}

function VitalsSection({ data, days, person }: { data: InsightData; days: number; person: LinkedPerson }) {
  const t = useTheme();
  const summaries = metricSummaries(data, days);
  const since = addDays(new Date(), -days + 1).getTime();
  const recent = summaries.filter((s) => s.latest && Date.parse(s.latest.at) >= addDays(new Date(), -7).getTime());
  const levels = recent.map((s) => s.metric.status(s.latest!, s.readings).level);
  const worst = levels.includes('alert') ? 'alert' : levels.includes('watch') ? 'watch' : recent.length ? 'normal' : 'none';
  const head =
    worst === 'alert'
      ? { title: 'Revisar', text: 'Algún valor reciente está claramente fuera de lo esperado.', color: t.danger, bg: t.dangerSoft }
      : worst === 'watch'
        ? { title: 'A vigilar', text: 'Algún valor reciente está algo fuera del rango habitual.', color: t.warning, bg: t.warningSoft }
        : worst === 'normal'
          ? { title: 'Estable', text: 'Los últimos valores están dentro de lo esperado.', color: t.success, bg: t.successSoft }
          : { title: 'Sin mediciones recientes', text: 'No hay constantes de la última semana.', color: t.muted, bg: t.cardAlt };
  const bp = summaries.find((s) => s.metric.key === 'blood_pressure')?.latest;
  const hr = summaries.find((s) => s.metric.key === 'heart_rate')?.latest;
  const withData = summaries.filter((s) => s.inRangePct != null);
  const overall = withData.length ? Math.round(mean(withData.map((s) => s.inRangePct!))!) : null;

  return (
    <>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: head.bg, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: head.color }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontWeight: '800', color: t.text }}>{head.title}</Text>
            <Text style={{ fontSize: 15, color: t.muted }}>{head.text}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Caption>Última tensión</Caption>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.text }}>{bp ? formatReading(METRICS.blood_pressure, bp) : '—'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Caption>Último pulso</Caption>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.text }}>{hr ? formatReading(METRICS.heart_rate, hr) : '—'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Caption>En rango</Caption>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.text }}>{overall == null ? '—' : `${overall} %`}</Text>
          </View>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 22, height: 12, borderRadius: 3, backgroundColor: t.successSoft, borderWidth: 1, borderColor: t.success }} />
        <Caption style={{ flex: 1 }}>
          Franja verde: rango de referencia habitual en adultos. Su médico puede indicar otros valores para {person.nickname}.
        </Caption>
      </View>
      {summaries.map((s) => (
        <HealthMetricCard key={s.metric.key} summary={s} from={since} />
      ))}
    </>
  );
}

function WellbeingSection({ data, days, person, assessments }: { data: InsightData; days: number; person: LinkedPerson; assessments: Assessment[] }) {
  const t = useTheme();
  const all = dailyStats(data, Math.max(days, 14));
  const stats = all.slice(-days);
  const st = streaks(all, person.fluid_goal_ml);
  const since = addDays(new Date(), -days + 1).getTime();
  const checkIns = data.checkIns.filter((c) => Date.parse(c.recorded_at) >= since);
  const label = (d: Date) => (days === 7 ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()] : String(d.getDate()));
  const avg = (vals: (number | null)[]) => mean(vals.filter((v): v is number => v != null));
  const sleep = avg(stats.map((d) => d.sleepHours));
  const comparisons = compare(dailyStats(data, days * 2), days, person.fluid_goal_ml);

  return (
    <>
      <ScalesHistory assessments={assessments} />
      <ChartCard icon="compare-horizontal" color={accents.wellbeing} title="Frente al periodo anterior">
        {comparisons.map((c) => (
          <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
            <Text style={{ flex: 1, fontSize: 16, color: t.text }}>{c.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>
              {c.now == null ? '—' : `${fmtNum(c.now, c.decimals)}${c.unit}`}
            </Text>
            <View style={{ minWidth: 96, alignItems: 'flex-end' }}>
              <Delta change={c.now != null && c.before != null ? c.now - c.before : null} unit={c.unit} decimals={c.decimals} higherIsBetter={c.higherIsBetter} />
            </View>
          </View>
        ))}
        <Caption>«Cuidados» es una puntuación diaria (0–100): registros, revisión, medicación, líquidos y comidas.</Caption>
      </ChartCard>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StreakTile label="Objetivo de líquidos" current={st.hydration.current} best={st.hydration.best} color={accents.fluids} />
        <StreakTile label="Revisiones diarias" current={st.checkIn.current} best={st.checkIn.best} color={accents.meals} />
      </View>
      {checkIns.length > 1 ? (
        <ChartCard icon="chart-line" color={accents.wellbeing} title="Apetito, movilidad y ánimo">
          <LineChart
            series={[
              { points: checkIns.filter((c) => c.appetite != null).map((c) => ({ t: Date.parse(c.recorded_at), v: c.appetite! })), color: accents.meals },
              { points: checkIns.filter((c) => c.mobility != null).map((c) => ({ t: Date.parse(c.recorded_at), v: c.mobility! })), color: accents.respiration },
              { points: checkIns.filter((c) => c.mood != null).map((c) => ({ t: Date.parse(c.recorded_at), v: c.mood! })), color: accents.wellbeing },
            ]}
            band={[4, 5]}
            from={since}
            to={Date.now()}
            height={170}
          />
          <Legend
            items={[
              { label: 'Apetito', color: accents.meals },
              { label: 'Movilidad', color: accents.respiration },
              { label: 'Ánimo', color: accents.wellbeing },
            ]}
          />
          <Caption>1 = muy mal, 5 = muy bien. La franja verde marca «bien» y «muy bien».</Caption>
        </ChartCard>
      ) : null}
      <ChartCard icon="head-question-outline" color={accents.heartRate} title="Confusión">
        <BarChart
          bars={stats.map((d) => {
            const day = checkIns.filter((c) => new Date(c.recorded_at).toDateString() === d.day.toDateString() && c.confusion != null);
            const worst = day.length ? Math.max(...day.map((c) => c.confusion!)) : null;
            return { label: label(d.day), value: worst, color: worst == null ? undefined : worst >= 2 ? accents.bloodPressure : worst === 1 ? '#E3A008' : accents.meds };
          })}
          color={accents.heartRate}
          max={3}
        />
        <Caption>0 = ninguna, 1 = leve, 2 = moderada, 3 = grave (el peor valor de cada día).</Caption>
      </ChartCard>
      <ChartCard icon="cup-water" color={accents.fluids} title="Líquidos" summary={`Objetivo ${fmtNum(person.fluid_goal_ml / 1000, 1)} L`}>
        <BarChart
          bars={stats.map((d) => ({
            label: label(d.day),
            value: d.fluidsMl || null,
            color: d.fluidsMl >= person.fluid_goal_ml ? accents.fluids : d.fluidsMl >= person.fluid_goal_ml * 0.6 ? '#E3A008' : accents.bloodPressure,
          }))}
          color={accents.fluids}
          goal={person.fluid_goal_ml}
          format={(v) => fmtNum(v / 1000, 1)}
        />
        <Caption>Azul: objetivo cumplido · ámbar: más del 60 % · rojo: menos.</Caption>
      </ChartCard>
      <ChartCard icon="silverware-fork-knife" color={accents.meals} title="Comidas principales">
        <BarChart bars={stats.map((d) => ({ label: label(d.day), value: d.entries ? d.mainMeals : null }))} color={accents.meals} max={3} />
        <Caption>Desayuno, comida y cena con algo de ingesta.</Caption>
      </ChartCard>
      <ChartCard icon="weather-night" color={accents.sleep} title="Sueño" summary={sleep == null ? 'Sin datos' : `Media ${fmtNum(sleep, 1)} h`}>
        <BarChart bars={stats.map((d) => ({ label: label(d.day), value: d.sleepHours }))} color={accents.sleep} goal={7} />
        <Caption>La línea discontinua marca 7 horas.</Caption>
      </ChartCard>
    </>
  );
}

function HealthMetricCard({ summary: s, from }: { summary: MetricSummary; from: number }) {
  const t = useTheme();
  const { metric } = s;
  const status = s.latest ? metric.status(s.latest, s.readings) : null;
  const bp = metric.key === 'blood_pressure';
  const series = [{ points: s.readings.map((r) => ({ t: Date.parse(r.at), v: r.value })), color: metric.color }];
  if (bp) series.push({ points: s.readings.map((r) => ({ t: Date.parse(r.at), v: r.value2! })), color: accents.spo2 });
  const f = (v: number | null) => (v == null ? '—' : fmtNum(v, metric.decimals));

  return (
    <ChartCard
      icon={metric.icon}
      color={metric.color}
      title={metric.label}
      onPress={() => router.push({ pathname: '/metric/[key]', params: { key: metric.key } })}
    >
      {s.latest ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: t.text }}>{formatReading(metric, s.latest)}</Text>
            <Text style={{ fontSize: 14, color: t.muted }}>{metric.unit}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {status ? <StatusPill level={status.level} label={status.label} /> : null}
            <Caption>{timeAgo(s.latest.at)}</Caption>
          </View>
        </View>
      ) : null}

      {s.readings.length ? (
        <>
          <LineChart series={series} band={metric.band} from={from} to={Date.now()} height={160} />
          {bp ? (
            <Legend
              items={[
                { label: 'Sistólica (alta)', color: metric.color },
                { label: 'Diastólica (baja)', color: accents.spo2 },
              ]}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              ['Media', f(s.avg)],
              ['Mín.', f(s.min)],
              ['Máx.', f(s.max)],
              ['En rango', s.inRangePct == null ? '—' : `${s.inRangePct} %`],
            ].map(([label, value]) => (
              <View key={label} style={{ flex: 1, backgroundColor: t.cardAlt, borderRadius: 12, padding: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>{value}</Text>
                <Caption>{label}</Caption>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Caption>Respecto al periodo anterior:</Caption>
            <Delta change={s.change} unit={` ${metric.unit}`} decimals={metric.decimals} />
          </View>
        </>
      ) : (
        <Caption>{s.latest ? 'Sin mediciones en este periodo.' : 'Todavía no se ha medido.'}</Caption>
      )}
      <Caption>{metric.rangeText}</Caption>
    </ChartCard>
  );
}
