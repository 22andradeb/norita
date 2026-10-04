import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from './supabase';

export type Role = 'caregiver' | 'family';

// Bump this when the consent text in app/consent.tsx changes, so users re-consent.
export const CONSENT_VERSION = '2026-10-v1';

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  consented_at: string | null;
  consent_version: string | null;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  hasCurrentConsent: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, consented_at, consent_version')
      .eq('id', userId)
      .single();
    if (error) console.warn('Failed to load profile', error.message);
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let initialized = false;
    let currentUserId: string | undefined;

    // Fires INITIAL_SESSION on subscribe, then on every sign-in, sign-out and token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const nextUserId = next?.user.id;
      // Only reload the profile when the user actually changes, not on token refreshes.
      if (initialized && nextUserId === currentUserId) return;
      initialized = true;
      currentUserId = nextUserId;
      setLoading(true);
      // Defer the query: Supabase warns against awaiting other calls inside this callback.
      setTimeout(async () => {
        await loadProfile(nextUserId);
        setLoading(false);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthState = {
    session,
    profile,
    loading,
    hasCurrentConsent: !!profile?.consented_at && profile.consent_version === CONSENT_VERSION,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
