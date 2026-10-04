import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Role } from './auth';
import { errorText } from './format';
import { supabase } from './supabase';
import type { VitalsRow } from './vitals';

export type Gender = 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';

export type OlderAdult = {
  id: string;
  nickname: string;
  birth_year: number | null;
  gender: Gender | null;
  fluid_goal_ml: number;
};

/** A person the signed-in user is linked to, with the user's role on that care team. */
export type LinkedPerson = OlderAdult & { myRole: Role };

export type Medication = {
  id: string;
  name: string;
  dose: string | null;
  form: string | null;
  instructions: string | null;
  times: string[];
  as_needed: boolean;
  stock_quantity: number;
  stock_unit: string;
  low_stock_threshold: number | null;
};

export type ActivityItem = {
  kind: 'check_in' | 'vitals' | 'meal' | 'care_event' | 'medication_dose' | 'stock_change';
  id: string;
  older_adult_id: string;
  recorded_at: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  data: Record<string, unknown>;
};

export type CheckInRow = {
  recorded_at: string;
  appetite: number | null;
  mobility: number | null;
  mood: number | null;
  confusion: number | null;
};

export type MealRow = { recorded_at: string; meal_type: string; amount_eaten: string | null; fluids_ml: number | null };
export type SleepRow = { recorded_at: string; details: { hours?: number; quality?: number } };
export type DoseRow = { recorded_at: string; status: string; scheduled_time: string | null; medication_id: string };
export type EventRow = { recorded_at: string; category: string; severity: string; details: Record<string, unknown> };
export type EntryRow = { kind: ActivityItem['kind']; recorded_at: string };
export type TeamMember ={ user_id: string; role: Role; full_name: string; joined_at: string };

const PERSON_COLUMNS = 'id, nickname, birth_year, gender, fluid_goal_ml';

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  async myPeople(userId: string): Promise<LinkedPerson[]> {
    // care_team → older_adults is many-to-one, so PostgREST embeds a single object (the untyped
    // client can't know that and guesses an array).
    const res = await supabase.from('care_team').select(`role, older_adults(${PERSON_COLUMNS})`).eq('user_id', userId);
    const rows = unwrap(res as unknown as { data: { role: Role; older_adults: OlderAdult | null }[] | null; error: { message: string } | null });
    return rows
      .flatMap((r) => (r.older_adults ? [{ ...r.older_adults, myRole: r.role }] : []))
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
  },
  async updatePerson(id: string, changes: Partial<Pick<OlderAdult, 'nickname' | 'birth_year' | 'gender' | 'fluid_goal_ml'>>) {
    unwrap(await supabase.from('older_adults').update(changes).eq('id', id));
  },
  async medications(olderAdultId: string) {
    return unwrap<Medication[]>(
      await supabase
        .from('medications')
        .select('id, name, dose, form, instructions, times, as_needed, stock_quantity, stock_unit, low_stock_threshold')
        .eq('older_adult_id', olderAdultId)
        .eq('active', true)
        .order('name'),
    );
  },
  async activity(olderAdultId: string, from: Date, to: Date) {
    return unwrap<ActivityItem[]>(
      await supabase
        .from('activity')
        .select('*')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', from.toISOString())
        .lt('recorded_at', to.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(300),
    );
  },
  async recentAlerts(olderAdultId: string, since: Date) {
    return unwrap<ActivityItem[]>(
      await supabase
        .from('activity')
        .select('*')
        .eq('older_adult_id', olderAdultId)
        .eq('kind', 'care_event')
        .in('data->>severity', ['concern', 'urgent'])
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(5),
    );
  },
  async vitals(olderAdultId: string, since: Date) {
    return unwrap<VitalsRow[]>(
      await supabase
        .from('vitals')
        .select('*')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: true })
        .limit(2000),
    );
  },
  async checkIns(olderAdultId: string, since: Date) {
    return unwrap<CheckInRow[]>(
      await supabase
        .from('check_ins')
        .select('recorded_at, appetite, mobility, mood, confusion')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: true }),
    );
  },
  async meals(olderAdultId: string, since: Date) {
    return unwrap<MealRow[]>(
      await supabase
        .from('meals')
        .select('recorded_at, meal_type, amount_eaten, fluids_ml')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: true }),
    );
  },
  async sleep(olderAdultId: string, since: Date) {
    return unwrap<SleepRow[]>(
      await supabase
        .from('care_events')
        .select('recorded_at, details')
        .eq('older_adult_id', olderAdultId)
        .eq('category', 'sleep')
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: true }),
    );
  },
  async doses(olderAdultId: string, since: Date) {
    return unwrap<DoseRow[]>(
      await supabase
        .from('medication_doses')
        .select('recorded_at, status, scheduled_time, medication_id')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: true })
        .limit(5000),
    );
  },
  async events(olderAdultId: string, since: Date) {
    return unwrap<EventRow[]>(
      await supabase
        .from('care_events')
        .select('recorded_at, category, severity, details')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: true })
        .limit(5000),
    );
  },
  /** Just the timestamps and kinds of every entry, for coverage and timing charts. */
  async entries(olderAdultId: string, since: Date) {
    return unwrap<EntryRow[]>(
      await supabase
        .from('activity')
        .select('kind, recorded_at')
        .eq('older_adult_id', olderAdultId)
        .gte('recorded_at', since.toISOString())
        .limit(10000),
    );
  },
  async team(olderAdultId: string) {
    return unwrap<TeamMember[]>(
      await supabase
        .from('team_members')
        .select('user_id, role, full_name, joined_at')
        .eq('older_adult_id', olderAdultId)
        .order('joined_at'),
    );
  },
  async createPerson(input: { nickname: string; birthYear?: number; gender?: Gender }) {
    return unwrap<string>(
      await supabase.rpc('create_older_adult', {
        p_nickname: input.nickname,
        p_birth_year: input.birthYear ?? null,
        p_gender: input.gender ?? null,
      }),
    );
  },
  async createInvite(olderAdultId: string) {
    return unwrap<string>(await supabase.rpc('create_invite', { p_older_adult_id: olderAdultId }));
  },
  async redeemInvite(code: string) {
    return unwrap<string>(await supabase.rpc('redeem_invite', { p_code: code }));
  },
};

/** Loads data whenever the screen comes into focus, and again when any dependency changes. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, error, loading, reload };
}

export function describePerson(p: Pick<OlderAdult, 'birth_year' | 'gender'>) {
  const parts: string[] = [];
  if (p.birth_year) parts.push(`${new Date().getFullYear() - p.birth_year} años`);
  if (p.gender && p.gender !== 'prefer_not_to_say') {
    parts.push({ female: 'Mujer', male: 'Hombre', non_binary: 'No binario' }[p.gender]);
  }
  return parts.join(' · ');
}
