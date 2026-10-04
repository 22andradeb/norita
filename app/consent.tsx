import { useState } from 'react';

import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { CONSENT_VERSION, useAuth } from '@/lib/auth';
import { translateError } from '@/lib/format';
import { supabase } from '@/lib/supabase';

// BORRADOR — debe revisarlo el delegado de protección de datos (RGPD / LOPDGDD) antes de cualquier piloto.
// Si cambias el texto, sube CONSENT_VERSION en lib/auth.tsx para que todos vuelvan a aceptarlo.
const CAREGIVER_TEXT = [
  'Norita guarda información de cuidados de las personas que atiendes: revisiones de la visita, constantes vitales, medicación y existencias, comidas y bebidas, sueño, baño, higiene, caídas, piel, conducta y citas médicas.',
  'Son datos de salud. Solo los ve el equipo de cuidados y los familiares que invites con un código.',
  'Registra solo lo necesario para el cuidado. No escribas en las notas nombres completos, direcciones, números de identificación ni antecedentes médicos que no hagan falta.',
];

const FAMILY_TEXT = [
  'Verás los registros de cuidados y los avisos de la persona a la que estás vinculado/a, incluidos datos de salud como constantes vitales y medicación.',
  'Los avisos se basan en comparaciones sencillas con lo habitual en esa persona y en rangos de referencia generales. No son un diagnóstico médico.',
  'Puedes pedirnos que eliminemos tu cuenta y tus datos en cualquier momento.',
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
      return setError(translateError(error.message));
    }
    // Refreshing flips the consent guard in the root layout, which moves the user on.
    await refreshProfile();
  }

  const lines = profile?.role === 'family' ? FAMILY_TEXT : CAREGIVER_TEXT;

  return (
    <Screen>
      <Title>Antes de empezar</Title>
      {lines.map((line) => (
        <Body key={line}>{line}</Body>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button title="Acepto" onPress={onAgree} loading={submitting} />
      <Button title="Ahora no — cerrar sesión" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
