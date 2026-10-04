import type { DoseRow, Medication } from './api';
import { type DayStats, type InsightData, type Warning } from './insights';
import { addDays, isSameDay, mean } from './stats';
import { METRICS, METRIC_ORDER, readingsFor, type Metric, type Reading } from './vitals';

// Calculations for the family dashboards: reassurance-first summaries and comparisons.

/**
 * 0–100 score for how complete the day's care was: something logged, a check-in, scheduled doses
 * given, fluids against the goal and main meals. Medication weight is shared out when nothing is scheduled.
 */
export function careScore(d: DayStats, fluidGoal: number): number | null {
  // Today isn't over: don't score it until something has been logged.
  if (d.entries === 0 && isSameDay(d.day, new Date())) return null;
  const parts: [number, number][] = [
    [d.entries > 0 ? 1 : 0, 25],
    [d.checkIn ? 1 : 0, 15],
    [Math.min(1, d.fluidsMl / fluidGoal), 15],
    [d.mainMeals / 3, 15],
  ];
  if (d.dosesDue > 0) parts.push([Math.min(1, d.dosesGiven / d.dosesDue), 30]);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  return Math.round((parts.reduce((s, [v, w]) => s + v * w, 0) / weight) * 100);
}

export type OverallStatus = { level: 'ok' | 'watch' | 'alert'; title: string; message: string };

export function overallStatus(warnings: Warning[], nickname: string): OverallStatus {
  const alerts = warnings.filter((w) => w.level === 'alert').length;
  const watch = warnings.filter((w) => w.level === 'watch').length;
  if (alerts) {
    return {
      level: 'alert',
      title: 'Hay algo importante',
      message: `${alerts === 1 ? 'Un aviso necesita' : `${alerts} avisos necesitan`} tu atención. Habla con el equipo de cuidados si tienes dudas.`,
    };
  }
  if (watch) {
    return {
      level: 'watch',
      title: 'Algunas cosas a vigilar',
      message: `${nickname} está siendo atendido/a. Hay ${watch === 1 ? 'un detalle' : `${watch} detalles`} que conviene seguir de cerca.`,
    };
  }
  return { level: 'ok', title: 'Todo en orden', message: `Los cuidados de ${nickname} se están registrando con normalidad y no hay avisos.` };
}

export type Comparison = { label: string; now: number | null; before: number | null; unit: string; decimals: number; higherIsBetter: boolean };

/** This period vs the previous one of the same length, from daily stats covering both. */
export function compare(days: DayStats[], period: number, fluidGoal: number): Comparison[] {
  const now = days.slice(-period);
  const before = days.slice(-period * 2, -period);
  const avg = (ds: DayStats[], f: (d: DayStats) => number | null) => mean(ds.map(f).filter((v): v is number => v != null));
  const adherence = (ds: DayStats[]) => {
    const due = ds.reduce((s, d) => s + d.dosesDue, 0);
    return due ? (ds.reduce((s, d) => s + Math.min(d.dosesGiven, d.dosesDue), 0) / due) * 100 : null;
  };
  const logged = (d: DayStats) => (d.entries ? d : null);
  return [
    { label: 'Medicación', now: adherence(now), before: adherence(before), unit: ' %', decimals: 0, higherIsBetter: true },
    { label: 'Líquidos', now: avg(now, (d) => logged(d) && d.fluidsMl / 1000), before: avg(before, (d) => logged(d) && d.fluidsMl / 1000), unit: ' L', decimals: 1, higherIsBetter: true },
    { label: 'Sueño', now: avg(now, (d) => d.sleepHours), before: avg(before, (d) => d.sleepHours), unit: ' h', decimals: 1, higherIsBetter: true },
    { label: 'Cuidados', now: avg(now, (d) => careScore(d, fluidGoal)), before: avg(before, (d) => careScore(d, fluidGoal)), unit: '', decimals: 0, higherIsBetter: true },
  ];
}

export type MetricSummary = {
  metric: Metric;
  readings: Reading[];
  latest: Reading | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  inRangePct: number | null;
  /** Average now minus average in the previous period of the same length. */
  change: number | null;
};

export function metricSummaries(data: InsightData, period: number, now = new Date()): MetricSummary[] {
  const start = addDays(now, -period + 1).getTime();
  const prevStart = addDays(now, -period * 2 + 1).getTime();
  return METRIC_ORDER.map((key) => {
    const metric: Metric = METRICS[key];
    const all = readingsFor(metric, data.vitals);
    const readings = all.filter((r) => Date.parse(r.at) >= start);
    const previous = all.filter((r) => Date.parse(r.at) >= prevStart && Date.parse(r.at) < start);
    const values = readings.map((r) => r.value);
    const avg = mean(values);
    const prevAvg = mean(previous.map((r) => r.value));
    const normal = readings.filter((r) => metric.status(r, all).level === 'normal').length;
    return {
      metric,
      readings,
      latest: all[all.length - 1] ?? null,
      avg,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      inRangePct: readings.length ? Math.round((normal / readings.length) * 100) : null,
      change: avg != null && prevAvg != null ? avg - prevAvg : null,
    };
  });
}

export type MedicationReport = {
  medication: Medication;
  due: number;
  given: number;
  missed: number;
  pct: number | null;
  /** Average minutes between the scheduled time and when the dose was logged. */
  avgDelayMin: number | null;
  /** How many days the current stock lasts at the usual rate. */
  daysLeft: number | null;
};

const minutesOfDay = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function medicationReports(medications: Medication[], doses: DoseRow[], period: number, now = new Date()): MedicationReport[] {
  const start = addDays(now, -period + 1);
  start.setHours(0, 0, 0, 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return medications.map((m) => {
    const mine = doses.filter((d) => d.medication_id === m.id && Date.parse(d.recorded_at) >= start.getTime());
    const scheduled = mine.filter((d) => d.scheduled_time);
    const given = scheduled.filter((d) => d.status === 'given');
    const due = m.as_needed ? 0 : m.times.length * (period - 1) + m.times.filter((t) => minutesOfDay(t) <= nowMin).length;
    const delays = given.map((d) => {
      const at = new Date(d.recorded_at);
      return Math.abs(at.getHours() * 60 + at.getMinutes() - minutesOfDay(d.scheduled_time!));
    });
    const perDay = m.as_needed
      ? mine.filter((d) => d.status === 'given').length / period
      : m.times.length;
    return {
      medication: m,
      due,
      given: given.length,
      missed: mine.filter((d) => d.status === 'missed' || d.status === 'refused').length,
      pct: due ? Math.min(100, Math.round((given.length / due) * 100)) : null,
      avgDelayMin: delays.length ? Math.round(mean(delays)!) : null,
      daysLeft: perDay > 0 ? Math.floor(m.stock_quantity / perDay) : null,
    };
  });
}

/** Per-day adherence (0–100, or null when nothing was due) for the calendar. */
export function adherenceByDay(days: DayStats[]) {
  return days.map((d) => ({ day: d.day, pct: d.dosesDue ? Math.round((Math.min(d.dosesGiven, d.dosesDue) / d.dosesDue) * 100) : null }));
}

export function lastEntryAt(data: InsightData) {
  return data.entries.reduce<string | null>((latest, e) => (!latest || e.recorded_at > latest ? e.recorded_at : latest), null);
}

export const isToday = (d: Date) => isSameDay(d, new Date());
