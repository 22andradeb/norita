import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { usePerson } from '@/lib/person';

export default function Join() {
  const { profile } = useAuth();
  const { reload, select } = usePerson();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const id = await api.redeemInvite(code);
      await reload();
      select(id);
      router.back();
    } catch (e) {
      setError(errorText(e));
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Body>
        {profile?.role === 'family'
          ? 'Introduce el código de 8 caracteres que te ha enviado el cuidador.'
          : 'Introduce el código de 8 caracteres que te ha enviado otro cuidador para unirte al equipo de cuidados.'}
      </Body>
      <Field
        label="Código de invitación"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        placeholder="ABCD-2345"
        style={{ fontSize: 24, letterSpacing: 4 }}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Unirme" onPress={onSubmit} loading={submitting} />
    </Screen>
  );
}
