import { api, useLoad } from './api';
import { sinceFor, type InsightData } from './insights';
import { useOutbox } from './outbox';
import type { LinkedPerson } from './api';

/** Loads everything the warnings, streaks and analysis charts need for the last `days` days. */
export function useInsightData(person: LinkedPerson | null, days: number) {
  const { lastSyncedAt } = useOutbox();
  const pid = person?.id;
  const goal = person?.fluid_goal_ml ?? 1500;
  return useLoad<InsightData | null>(async () => {
    if (!pid) return null;
    const since = sinceFor(days);
    const [medications, doses, checkIns, meals, sleep, vitals, events, entries] = await Promise.all([
      api.medications(pid),
      api.doses(pid, since),
      api.checkIns(pid, since),
      api.meals(pid, since),
      api.sleep(pid, since),
      api.vitals(pid, since),
      api.events(pid, since),
      api.entries(pid, since),
    ]);
    return { medications, doses, checkIns, meals, sleep, vitals, events, entries, fluidGoal: goal };
  }, [pid, days, goal, lastSyncedAt]);
}
