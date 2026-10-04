import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { api, type LinkedPerson } from './api';
import { useAuth } from './auth';
import { errorText } from './format';

// Which person the dashboard is showing. Remembered per user across app launches.

type PersonState = {
  people: LinkedPerson[];
  person: LinkedPerson | null;
  /** True when the signed-in user is a caregiver for the selected person. */
  canLog: boolean;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  reload: () => Promise<void>;
};

const PersonContext = createContext<PersonState | null>(null);

export function PersonProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const storageKey = `norita.selectedPerson.${userId}`;

  const [people, setPeople] = useState<LinkedPerson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const [list, saved] = await Promise.all([api.myPeople(userId), AsyncStorage.getItem(storageKey)]);
      setPeople(list);
      setSelectedId((current) => {
        const wanted = current ?? saved;
        return list.some((p) => p.id === wanted) ? wanted : (list[0]?.id ?? null);
      });
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [userId, storageKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      AsyncStorage.setItem(storageKey, id).catch(() => {});
    },
    [storageKey],
  );

  const person = people.find((p) => p.id === selectedId) ?? null;

  return (
    <PersonContext.Provider
      value={{ people, person, canLog: person?.myRole === 'caregiver', loading, error, select, reload }}
    >
      {children}
    </PersonContext.Provider>
  );
}

export function usePerson() {
  const ctx = useContext(PersonContext);
  if (!ctx) throw new Error('usePerson must be used inside <PersonProvider>');
  return ctx;
}
