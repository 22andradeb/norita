import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';

export type Gender = 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';

export type OlderAdult = {
  id: string;
  nickname: string;
  birth_year: number | null;
  gender: Gender | null;
};

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

const PERSON_COLUMNS = 'id, nickname, birth_year, gender';

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  async people() {
    return unwrap<OlderAdult[]>(await supabase.from('older_adults').select(PERSON_COLUMNS).order('nickname'));
  },
  async person(id: string) {
    return unwrap<OlderAdult>(await supabase.from('older_adults').select(PERSON_COLUMNS).eq('id', id).single());
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
  async activity(olderAdultId: string, limit = 50) {
    return unwrap<ActivityItem[]>(
      await supabase
        .from('activity')
        .select('*')
        .eq('older_adult_id', olderAdultId)
        .order('recorded_at', { ascending: false })
        .limit(limit),
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
      setError(e instanceof Error ? e.message : String(e));
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
  if (p.birth_year) parts.push(`about ${new Date().getFullYear() - p.birth_year}`);
  if (p.gender && p.gender !== 'prefer_not_to_say') {
    parts.push({ female: 'woman', male: 'man', non_binary: 'non-binary' }[p.gender]);
  }
  return parts.join(' · ');
}
