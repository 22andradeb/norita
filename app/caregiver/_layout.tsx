import { Stack } from 'expo-router';

export default function CaregiverLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 } }}>
      <Stack.Screen name="index" options={{ title: 'Today' }} />
    </Stack>
  );
}
