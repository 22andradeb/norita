import { Body, Button, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

// Placeholder: step 4 replaces this with the check-in timeline, flags and next-step card.
export default function FamilyHome() {
  const { profile, signOut } = useAuth();

  return (
    <Screen>
      <Title>Hello, {profile?.full_name}</Title>
      <Body muted>Check-ins and alerts about your loved one will appear here.</Body>
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
