import { Text, View } from 'react-native';

import { DayGrid, HBars, Ring } from '@/components/charts';
import { Caption, Card, EmptyState, Heading, IconBadge, Row, StatusPill } from '@/components/ui';
import { ChartCard } from '@/components/widgets';
import { adherenceByDay, medicationReports, type MedicationReport } from '@/lib/family';
import { fmtNum, plural } from '@/lib/format';
import { dailyStats, type InsightData } from '@/lib/insights';
import { accents, useTheme } from '@/lib/theme';

/** Medication for family: is it being given, on time, and is there enough left? */
export function MedsSection({ data, days }: { data: InsightData; days: number }) {
  const t = useTheme();
  const reports = medicationReports(data.medications, data.doses, days);
  const scheduled = reports.filter((r) => r.due > 0);
  const due = scheduled.reduce((s, r) => s + r.due, 0);
  const given = scheduled.reduce((s, r) => s + Math.min(r.given, r.due), 0);
  const missed = reports.reduce((s, r) => s + r.missed, 0);
  const pct = due ? Math.round((given / due) * 100) : null;
  const byDay = adherenceByDay(dailyStats(data, days));
  const runningOut = reports.filter((r) => r.daysLeft != null && r.daysLeft <= 7);

  const cell = (p: number | null) =>
    p == null
      ? { color: t.cardAlt, textColor: t.muted, label: 'sin tomas programadas' }
      : p >= 100
        ? { color: t.success, textColor: t.card, label: 'todas las tomas' }
        : p >= 50
          ? { color: t.warningSoft, textColor: t.warning, label: `${p} % de las tomas` }
          : { color: t.dangerSoft, textColor: t.danger, label: `${p} % de las tomas` };

  return (
    <>
      {data.medications.length === 0 ? (
        <EmptyState icon="pill" title="Sin medicamentos registrados" body="Cuando el cuidador añada medicamentos, aquí verás si se toman a su hora y cuántos quedan." />
      ) : (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 20 }}>
            <Ring progress={(pct ?? 0) / 100} color={accents.meds} size={110} stroke={12}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: t.text }}>{pct == null ? '–' : `${pct}%`}</Text>
            </Ring>
            <View style={{ flex: 1, gap: 4 }}>
              <Caption>Adherencia</Caption>
              <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>
                {pct == null ? 'Sin tomas programadas' : pct >= 90 ? 'Muy buena' : pct >= 75 ? 'Aceptable' : 'Mejorable'}
              </Text>
              <Caption>
                {given} de {due} tomas programadas registradas como tomadas.
              </Caption>
              {missed ? <StatusPill level="watch" label={`${plural(missed, 'olvidada o rechazada', 'olvidadas o rechazadas')}`} /> : null}
            </View>
          </Card>

          {runningOut.length ? (
            <Card tone="warning">
              <Text style={{ fontSize: 17, fontWeight: '800', color: t.warning }}>Habrá que reponer pronto</Text>
              {runningOut.map((r) => (
                <Text key={r.medication.id} style={{ fontSize: 16, color: t.text }}>
                  {r.medication.name}: para unos {plural(r.daysLeft!, 'día', 'días')}
                </Text>
              ))}
            </Card>
          ) : null}

          {byDay.length ? (
            <ChartCard icon="calendar-check-outline" color={accents.meds} title="Cumplimiento por día">
              <DayGrid days={byDay.map((d) => ({ day: d.day, ...cell(d.pct) }))} />
              <Row>
                <LegendDot color={t.success} label="Todas" />
                <LegendDot color={t.warningSoft} label="Más de la mitad" />
                <LegendDot color={t.dangerSoft} label="Menos de la mitad" />
              </Row>
            </ChartCard>
          ) : null}

          {scheduled.length ? (
            <ChartCard icon="chart-bar" color={accents.meds} title="Adherencia por medicamento">
              <HBars
                rows={scheduled.map((r) => ({
                  label: r.medication.name,
                  value: r.pct ?? 0,
                  color: (r.pct ?? 0) >= 90 ? t.success : (r.pct ?? 0) >= 75 ? t.warning : t.danger,
                  text: `${r.pct} %`,
                }))}
                max={100}
              />
            </ChartCard>
          ) : null}

          <Heading>Cada medicamento</Heading>
          {reports.map((r) => (
            <MedicationReportCard key={r.medication.id} report={r} />
          ))}
        </>
      )}
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 13, color: t.muted }}>{label}</Text>
    </View>
  );
}

function MedicationReportCard({ report: r }: { report: MedicationReport }) {
  const t = useTheme();
  const m = r.medication;
  const low = r.daysLeft != null && r.daysLeft <= 7;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge name="pill" color={accents.meds} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>
            {m.name}
            {m.dose ? ` · ${m.dose}` : ''}
          </Text>
          <Caption>{m.as_needed ? 'Solo si lo necesita' : m.times.length ? m.times.join(' · ') : 'Sin horario fijo'}</Caption>
        </View>
        {r.pct != null ? <StatusPill level={r.pct >= 90 ? 'normal' : r.pct >= 75 ? 'watch' : 'alert'} label={`${r.pct} %`} /> : null}
      </View>
      {m.instructions ? <Caption>{m.instructions}</Caption> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Tomadas" value={m.as_needed ? String(r.given) : `${Math.min(r.given, r.due)}/${r.due}`} />
        <Stat label="Olvidadas" value={String(r.missed)} />
        <Stat label="Puntualidad" value={r.avgDelayMin == null ? '—' : `±${r.avgDelayMin} min`} />
      </View>
      <Text style={{ fontSize: 16, color: low ? t.warning : t.text, fontWeight: low ? '700' : '400' }}>
        Quedan {fmtNum(m.stock_quantity)} {m.stock_unit}
        {r.daysLeft != null ? ` · para unos ${plural(r.daysLeft, 'día', 'días')}` : ''}
      </Text>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.cardAlt, borderRadius: 12, padding: 8, alignItems: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>{value}</Text>
      <Caption>{label}</Caption>
    </View>
  );
}
