import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    // On success the root layout's guards move the user to the right area automatically.
    if (error) setError(error.message);
  }

  return (
    <Screen>
      <Title>Norita</Title>
      <Body muted>Sign in to continue.</Body>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={onSubmit} loading={submitting} />
      <Button title="Create an account" variant="secondary" onPress={() => router.push('/sign-up')} />
    </Screen>
  );
}
