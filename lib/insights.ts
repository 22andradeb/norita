import type { CheckInRow, DoseRow, EntryRow, EventRow, MealRow, Medication, SleepRow } from './api';
import { fmtNum, fmtShortDate, plural } from './format';
import { addDays, dayKey, isSameDay, mean, startOfDay, wellbeingScore } from './stats';
import type { IconName, Level, VitalsRow } from './vitals';
import { METRICS, METRIC_ORDER, formatReading, readingsFor } from './vitals';

// Everything the analysis screens and warnings are computed from, for one person.
export type InsightData = {
  medications: Medication[];
  doses: DoseRow[];
  checkIns: CheckInRow[];
  meals: MealRow[];
  sleep: SleepRow[];
  vitals: VitalsRow[];
  events: EventRow[];
  entries: EntryRow[];
  fluidGoal: number;
};

export type Warning = { level: Level | 'info'; icon: IconName; title: string; detail?: string };

export type DayStats = {
  day: Date;
  entries: number;
  checkIn: boolean;
  vitals: boolean;
  dosesGiven: number;
  dosesDue: number;
  fluidsMl: number;
  mainMeals: number;
  sleepHours: number | null;
  wellbeing: number | null;
};

const byDay = <T extends { recorded_at: string }>(rows: T[]) => {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = dayKey(new Date(r.recorded_at));
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
};

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Per-day figures for the last `days` days, oldest first. Today's due doses only count slots already past. */
export function dailyStats(data: InsightData, days: number, now = new Date()): DayStats[] {
  const entries = byDay(data.entries);
  const checkIns = byDay(data.checkIns);
  const vitals = byDay(data.vitals);
  const doses = byDay(data.doses);
  const meals = byDay(data.meals);
  const sleep = byDay(data.sleep);
  const slotTimes = data.medications.filter((m) => !m.as_needed).flatMap((m) => m.times);

  return Array.from({ length: days }, (_, i) => {
    const day = addDays(now, i - days + 1);
    const k = dayKey(day);
    const today = isSameDay(day, now);
    const dayMeals = meals.get(k) ?? [];
    const scores = (checkIns.get(k) ?? []).map(wellbeingScore).filter((s): s is number => s != null);
    const hours = (sleep.get(k) ?? []).map((s) => s.details.hours).filter((h): h is number => typeof h === 'number');
    return {
      day,
      entries: (entries.get(k) ?? []).length,
      checkIn: checkIns.has(k),
      vitals: vitals.has(k),
      dosesGiven: (doses.get(k) ?? []).filter((d) => d.status === 'given' && d.scheduled_time).length,
      dosesDue: today ? slotTimes.filter((t) => t <= hhmm(now)).length : slotTimes.length,
      fluidsMl: dayMeals.reduce((s, m) => s + (m.fluids_ml ?? 0), 0),
      mainMeals: new Set(
        dayMeals
          .filter((m) => ['breakfast', 'lunch', 'dinner'].includes(m.meal_type) && m.amount_eaten !== 'none')
          .map((m) => m.meal_type),
      ).size,
      sleepHours: hours.length ? Math.max(...hours) : null,
      wellbeing: scores.length ? Math.round(mean(scores)!) : null,
    };
  });
}

export type Streak = { current: number; best: number };

/** Current run (counting back from today, or from yesterday if today isn't done yet) and best run. */
export function streak(days: DayStats[], ok: (d: DayStats) => boolean): Streak {
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = ok(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && !ok(days[i])) i--;
  for (; i >= 0 && ok(days[i]); i--) current++;
  return { current, best };
}

export function streaks(days: DayStats[], fluidGoal: number) {
  return {
    checkIn: streak(days, (d) => d.checkIn),
    logging: streak(days, (d) => d.entries > 0),
    meds: streak(days, (d) => d.dosesDue > 0 && d.dosesGiven >= d.dosesDue),
    hydration: streak(days, (d) => d.fluidsMl >= fluidGoal),
  };
}

export function adherence(days: DayStats[]) {
  const due = days.reduce((s, d) => s + d.dosesDue, 0);
  const given = days.reduce((s, d) => s + Math.min(d.dosesGiven, d.dosesDue), 0);
  return due ? Math.round((given / due) * 100) : null;
}

/** Share of readings in the usual range, per vital sign with readings. */
export function timeInRange(vitals: VitalsRow[]) {
  return METRIC_ORDER.map((key) => {
    const metric = METRICS[key];
    const readings = readingsFor(metric, vitals);
    const normal = readings.filter((r) => metric.status(r, readings).level === 'normal').length;
    return { metric, total: readings.length, pct: readings.length ? Math.round((normal / readings.length) * 100) : null };
  }).filter((r) => r.total > 0);
}

/** Things a family member (or caregiver) should know about, most serious first. */
export function buildWarnings(data: InsightData, now = new Date()): Warning[] {
  const w: Warning[] = [];
  const days = dailyStats(data, 14, now);
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const lastWeek = days.slice(-8, -1);
  const weekAgo = addDays(now, -7);

  // Missing logs.
  if (today.entries === 0 && now.getHours() >= 12) {
    w.push({
      level: now.getHours() >= 18 ? 'alert' : 'watch',
      icon: 'calendar-remove-outline',
      title: 'Hoy no se ha registrado nada',
      detail: 'Puede que la visita no se haya hecho o que no se haya anotado.',
    });
  }
  const emptyDays = lastWeek.filter((d) => d.entries === 0);
  if (emptyDays.length) {
    w.push({
      level: emptyDays.length >= 3 ? 'alert' : 'watch',
      icon: 'calendar-alert',
      title: `${plural(emptyDays.length, 'día', 'días')} sin registros esta semana`,
      detail: emptyDays.map((d) => fmtShortDate(d.day)).join(', '),
    });
  }
  if (!yesterday.checkIn && yesterday.entries > 0) {
    w.push({ level: 'watch', icon: 'clipboard-alert-outline', title: 'Ayer no hubo revisión de la visita' });
  }

  // Medication.
  const recentDoses = data.doses.filter((d) => Date.parse(d.recorded_at) >= addDays(now, -1).getTime());
  const missed = recentDoses.filter((d) => d.status === 'missed' || d.status === 'refused');
  if (missed.length) {
    w.push({
      level: missed.length >= 2 ? 'alert' : 'watch',
      icon: 'pill',
      title: `${plural(missed.length, 'toma olvidada o rechazada', 'tomas olvidadas o rechazadas')} desde ayer`,
    });
  }
  // Today's slots whose time has passed, minus every scheduled dose logged today (whatever the outcome).
  const loggedToday = data.doses.filter((d) => d.scheduled_time && isSameDay(new Date(d.recorded_at), now)).length;
  const pendingNow = today.dosesDue - loggedToday;
  if (pendingNow > 0) {
    w.push({ level: 'watch', icon: 'clock-alert-outline', title: `${plural(pendingNow, 'toma de hoy', 'tomas de hoy')} sin registrar` });
  }
  const weekAdherence = adherence(lastWeek);
  if (weekAdherence != null && weekAdherence < 80) {
    w.push({ level: 'watch', icon: 'pill', title: `Adherencia a la medicación del ${weekAdherence} % esta semana` });
  }
  for (const m of data.medications) {
    if (m.low_stock_threshold != null && m.stock_quantity <= m.low_stock_threshold) {
      w.push({ level: 'watch', icon: 'package-variant-closed', title: `Quedan pocas existencias de ${m.name}`, detail: `${fmtNum(m.stock_quantity)} ${m.stock_unit}` });
    }
  }

  // Food, fluids, sleep.
  if (yesterday.entries > 0 && yesterday.fluidsMl < data.fluidGoal * 0.6) {
    w.push({
      level: 'watch',
      icon: 'cup-water',
      title: `Ayer bebió poco: ${fmtNum(yesterday.fluidsMl / 1000, 1)} L`,
      detail: `Objetivo: ${fmtNum(data.fluidGoal / 1000, 1)} L`,
    });
  }
  if (yesterday.entries > 0 && yesterday.mainMeals <= 1) {
    w.push({ level: 'watch', icon: 'silverware-fork-knife', title: `Ayer solo se registró ${plural(yesterday.mainMeals, 'comida principal', 'comidas principales')}` });
  }
  const lastSleep = [...days].reverse().find((d) => d.sleepHours != null);
  if (lastSleep && lastSleep.sleepHours! < 5 && Date.parse(lastSleep.day.toISOString()) >= addDays(now, -2).getTime()) {
    w.push({ level: 'watch', icon: 'weather-night', title: `Durmió poco: ${fmtNum(lastSleep.sleepHours!, 1)} h` });
  }

  // Vitals: latest reading of each sign, if recent and out of range.
  for (const key of METRIC_ORDER) {
    const metric = METRICS[key];
    const readings = readingsFor(metric, data.vitals);
    const latest = readings[readings.length - 1];
    if (!latest || Date.parse(latest.at) < weekAgo.getTime()) continue;
    const s = metric.status(latest, readings);
    if (s.level !== 'normal') {
      w.push({
        level: s.level,
        icon: metric.icon,
        title: `${metric.label}: ${s.label.toLowerCase()}`,
        detail: `${formatReading(metric, latest)} ${metric.unit} · ${fmtShortDate(new Date(latest.at))}`,
      });
    }
  }
  if (data.vitals.length && !days.slice(-3).some((d) => d.vitals)) {
    w.push({ level: 'info', icon: 'heart-pulse', title: 'Sin constantes en los últimos 3 días' });
  }

  // Events.
  const recentEvents = data.events.filter((e) => Date.parse(e.recorded_at) >= weekAgo.getTime());
  const falls = recentEvents.filter((e) => e.category === 'fall');
  if (falls.length) {
    w.push({ level: 'alert', icon: 'alert-octagon-outline', title: `${plural(falls.length, 'caída', 'caídas')} en los últimos 7 días` });
  }
  const urgent = recentEvents.filter((e) => e.severity === 'urgent' && e.category !== 'fall');
  if (urgent.length) {
    w.push({ level: 'alert', icon: 'alert-circle-outline', title: `${plural(urgent.length, 'aviso urgente', 'avisos urgentes')} esta semana` });
  }
  const toileting = data.events.filter((e) => e.category === 'toileting');
  if (toileting.length) {
    const lastBowel = [...toileting].reverse().find((e) => e.details.type === 'bowel' || e.details.type === 'both');
    const since = lastBowel ? Date.parse(lastBowel.recorded_at) : 0;
    if (now.getTime() - since > 3 * 86_400_000) {
      w.push({ level: 'watch', icon: 'toilet', title: 'Sin deposiciones registradas en más de 3 días' });
    }
  }

  // Wellbeing trend and confusion.
  const recent = mean(days.slice(-3).map((d) => d.wellbeing).filter((v): v is number => v != null));
  const before = mean(days.slice(0, -3).map((d) => d.wellbeing).filter((v): v is number => v != null));
  if (recent != null && before != null && before - recent >= 15) {
    w.push({
      level: 'watch',
      icon: 'trending-down',
      title: 'El bienestar ha bajado',
      detail: `Media de los últimos 3 días: ${Math.round(recent)} (antes ${Math.round(before)})`,
    });
  }
  const lastCheckIn = data.checkIns[data.checkIns.length - 1];
  if (lastCheckIn && (lastCheckIn.confusion ?? 0) >= 2 && Date.parse(lastCheckIn.recorded_at) >= addDays(now, -2).getTime()) {
    w.push({ level: 'watch', icon: 'head-question-outline', title: 'Más confusión de lo habitual en la última revisión' });
  }

  const order = { alert: 0, watch: 1, info: 2, normal: 3 };
  return w.sort((a, b) => order[a.level] - order[b.level]);
}

/** Number of entries per hour of the day (0–23). */
export function entriesByHour(entries: EntryRow[]) {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const e of entries) hours[new Date(e.recorded_at).getHours()]++;
  return hours;
}

/** How often each kind of care was logged. */
export function categoryCounts(data: InsightData) {
  const counts = new Map<string, number>();
  const add = (k: string, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n);
  add('checkin', data.checkIns.length);
  add('vitals', data.vitals.length);
  add('dose', data.doses.length);
  for (const m of data.meals) add(m.meal_type === 'drink' ? 'drink' : 'meal');
  for (const e of data.events) add(e.category);
  return [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
}

export const sinceFor = (days: number, now = new Date()) => startOfDay(addDays(now, -days + 1));
