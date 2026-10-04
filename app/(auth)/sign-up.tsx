import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Caption, Card, ErrorText, Field, IconBadge, Screen, Title } from '@/components/ui';
import type { Role } from '@/lib/auth';
import { translateError } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { IconName } from '@/lib/vitals';

function RoleCard({
  icon,
  title,
  caption,
  selected,
  onPress,
}: {
  icon: IconName;
  title: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}${selected ? ', selected' : ''}`}
      style={[{ flex: 1, alignItems: 'center', gap: 6 }, selected && { borderColor: t.primary, borderWidth: 2, backgroundColor: t.primarySoft }]}
    >
      <IconBadge name={icon} color={t.primary} size={48} />
      <Body style={{ fontWeight: '700' }}>{title}</Body>
      <Caption style={{ textAlign: 'center' }}>{caption}</Caption>
    </Card>
  );
}

export default function SignUp() {
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!role) return setError('Elige si eres cuidador/a o familiar.');
    if (!fullName.trim()) return setError('Escribe tu nombre.');
    if (password.length < 8) return setError('Usa una contraseña de al menos 8 caracteres.');

    setSubmitting(true);
    // role and full_name are read once by the handle_new_user trigger to create the profile row.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { role, full_name: fullName.trim() } },
    });
    setSubmitting(false);

    if (error) return setError(translateError(error.message));
    // With email confirmation on, there's no session until the user clicks the link.
    if (!data.session) setNotice('Revisa tu correo para confirmar la cuenta y después inicia sesión.');
  }

  return (
    <Screen>
      <Title>Crear cuenta</Title>
      <Body>Soy…</Body>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <RoleCard
          icon="hand-heart-outline"
          title="Cuidador/a"
          caption="Registro visitas y cuidados"
          selected={role === 'caregiver'}
          onPress={() => setRole('caregiver')}
        />
        <RoleCard
          icon="account-heart-outline"
          title="Familiar"
          caption="Sigo a un ser querido"
          selected={role === 'family'}
          onPress={() => setRole('family')}
        />
      </View>
      <Field label="Tu nombre" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
      <Field
        label="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ErrorText>{error}</ErrorText>
      {notice ? <Body>{notice}</Body> : null}
      <Button title="Crear cuenta" onPress={onSubmit} loading={submitting} />
      <Button title="Ya tengo cuenta" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
