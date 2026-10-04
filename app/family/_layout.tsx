import { Stack } from 'expo-router';

export default function FamilyLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 } }}>
      <Stack.Screen name="index" options={{ title: 'Overview' }} />
    </Stack>
  );
}
