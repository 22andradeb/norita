import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import type { Role } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

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
    if (!role) return setError('Choose whether you are a caregiver or a family member.');
    if (!fullName.trim()) return setError('Enter your name.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');

    setSubmitting(true);
    // role and full_name are read once by the handle_new_user trigger to create the profile row.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { role, full_name: fullName.trim() } },
    });
    setSubmitting(false);

    if (error) return setError(error.message);
    // With email confirmation on, there's no session until the user clicks the link.
    if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
  }

  return (
    <Screen>
      <Title>Create an account</Title>
      <Body>I am a…</Body>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Caregiver" variant="secondary" selected={role === 'caregiver'} onPress={() => setRole('caregiver')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Family member" variant="secondary" selected={role === 'family'} onPress={() => setRole('family')} />
        </View>
      </View>
      <Field label="Your name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
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
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ErrorText>{error}</ErrorText>
      {notice ? <Body>{notice}</Body> : null}
      <Button title="Create account" onPress={onSubmit} loading={submitting} />
      <Button title="I already have an account" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
