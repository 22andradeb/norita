import type { ActivityItem, Medication } from './api';

// Pure calculations behind the dashboard rings, scores and charts.

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const isSameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type DoseSlot = {
  medication: Medication;
  time: string;
  status: string | null;
  recordedAt: string | null;
};

/** Today's scheduled doses (one per medication per time), matched against logged doses. */
export function doseSlots(medications: Medication[], dayItems: ActivityItem[]): DoseSlot[] {
  const doses = dayItems.filter((i) => i.kind === 'medication_dose');
  const slots: DoseSlot[] = [];
  for (const m of medications) {
    if (m.as_needed) continue;
    for (const time of m.times) {
      const dose = doses.find((d) => d.data.medication_id === m.id && d.data.scheduled_time === time);
      slots.push({
        medication: m,
        time,
        status: (dose?.data.status as string) ?? null,
        recordedAt: dose?.recorded_at ?? null,
      });
    }
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.medication.name.localeCompare(b.medication.name));
}

/** The next dose still to do: first open slot from an hour ago onwards, else the earliest open one. */
export function nextDose(slots: DoseSlot[], now = new Date()): DoseSlot | null {
  const open = slots.filter((s) => !s.status);
  const hhmm = `${String(Math.max(0, now.getHours() - 1)).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return open.find((s) => s.time >= hhmm) ?? open[0] ?? null;
}

export type DaySummary = {
  dosesDone: number;
  dosesScheduled: number;
  fluidsMl: number;
  mainMeals: number;
  checkedIn: boolean;
};

export function summarizeDay(dayItems: ActivityItem[], slots: DoseSlot[]): DaySummary {
  const meals = dayItems.filter((i) => i.kind === 'meal');
  const checkIns = dayItems.filter((i) => i.kind === 'check_in'); // newest first
  const eatenMain = new Set(
    meals
      .filter((m) => ['breakfast', 'lunch', 'dinner'].includes(m.data.meal_type as string) && m.data.amount_eaten !== 'none')
      .map((m) => m.data.meal_type),
  );
  return {
    dosesDone: slots.filter((s) => s.status === 'given').length,
    dosesScheduled: slots.length,
    fluidsMl: meals.reduce((sum, m) => sum + ((m.data.fluids_ml as number) ?? 0), 0),
    mainMeals: eatenMain.size,
    checkedIn: checkIns.length > 0,
  };
}

/** Consecutive days with at least one check-in, counting back from today (or yesterday if none yet today). */
export function checkInStreak(checkIns: { recorded_at: string }[], today = new Date()): number {
  const days = new Set(checkIns.map((c) => dayKey(new Date(c.recorded_at))));
  let cursor = days.has(dayKey(today)) ? startOfDay(today) : addDays(today, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Groups rows into one bucket per day for the last `days` days (oldest first). */
export function perDay<T extends { recorded_at: string }>(
  rows: T[],
  days: number,
  reduce: (rows: T[]) => number | null,
  today = new Date(),
): { day: Date; value: number | null }[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = dayKey(new Date(r.recorded_at));
    buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    const items = buckets.get(dayKey(day));
    return { day, value: items ? reduce(items) : null };
  });
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
