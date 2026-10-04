import { useState } from 'react';

import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { CONSENT_VERSION, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// DRAFT wording — must be reviewed (GDPR / data-protection officer) before any pilot.
// When you change it, bump CONSENT_VERSION in lib/auth.tsx so everyone re-consents.
const CAREGIVER_TEXT = [
  'Norita records care information about the people you look after: visit check-ins, vital signs, medications and stock, food and drink, sleep, toileting, personal care, falls, skin, behaviour and appointments.',
  'This is health information. It is shared only with the care team and family members you invite with a code.',
  'Record only what is needed for their care. Don’t enter full names, addresses, ID numbers or unrelated medical history in notes.',
];

const FAMILY_TEXT = [
  'You will see care records and alerts about the person you are linked to, including health information such as vital signs and medications.',
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
