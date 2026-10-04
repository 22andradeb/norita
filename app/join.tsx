import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Join() {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const id = await api.redeemInvite(code);
      router.replace({
        pathname: profile?.role === 'family' ? '/family/[id]' : '/caregiver/[id]',
        params: { id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Body>
        {profile?.role === 'family'
          ? 'Enter the 8-character code the caregiver shared with you.'
          : 'Enter the 8-character code another caregiver shared with you to join this person’s care team.'}
      </Body>
      <Field
        label="Invite code"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        style={{ fontSize: 24, letterSpacing: 4 }}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Join" onPress={onSubmit} loading={submitting} />
    </Screen>
  );
}
