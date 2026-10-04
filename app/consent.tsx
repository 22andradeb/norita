import { useState } from 'react';

import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { CONSENT_VERSION, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// DRAFT wording — must be reviewed (GDPR / data-protection officer) before any pilot.
// When you change it, bump CONSENT_VERSION in lib/auth.tsx so everyone re-consents.
const CAREGIVER_TEXT = [
  'Norita records short, structured notes about each visit: appetite, mobility, mood, confusion, medication and social contact.',
  'These notes are shared only with the family members linked to the person you care for.',
  'We do not collect free-text medical histories, ID numbers or location.',
];

const FAMILY_TEXT = [
  'You will see visit notes and alerts about the person you are linked to.',
  'Alerts are based on simple comparisons with that person’s usual pattern. They are not a medical diagnosis.',
  'You can ask us to delete your account and data at any time.',
];

export default function Consent() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onAgree() {
    if (!session) return;
    setError(null);
    setSubmitting(true);
    const { error } = await supabase
      .from('profiles')
      .update({ consented_at: new Date().toISOString(), consent_version: CONSENT_VERSION })
      .eq('id', session.user.id);
    if (error) {
      setSubmitting(false);
      return setError(error.message);
    }
    // Refreshing flips the consent guard in the root layout, which moves the user on.
    await refreshProfile();
  }

  const lines = profile?.role === 'family' ? FAMILY_TEXT : CAREGIVER_TEXT;

  return (
    <Screen>
      <Title>Before you start</Title>
      {lines.map((line) => (
        <Body key={line}>{line}</Body>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button title="I agree" onPress={onAgree} loading={submitting} />
      <Button title="Not now — sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
