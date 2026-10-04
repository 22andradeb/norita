import { Stack } from 'expo-router';

// Deep links (e.g. after joining with a code) still get the overview underneath to go back to.
export const unstable_settings = { initialRouteName: 'index' };

export default function FamilyLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Overview' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
