import { Body, Button, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

// Placeholder: step 3 replaces this with the visit list, check-in form and streak counter.
export default function CaregiverHome() {
  const { profile, signOut } = useAuth();

  return (
    <Screen>
      <Title>Hello, {profile?.full_name}</Title>
      <Body muted>Your visits and check-ins will appear here.</Body>
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
