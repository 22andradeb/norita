import { Stack } from 'expo-router';

// Deep links (e.g. after joining with a code) still get "My people" underneath to go back to.
export const unstable_settings = { initialRouteName: 'index' };

export default function CaregiverLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'My people' }} />
      <Stack.Screen name="add-person" options={{ title: 'Add a person', presentation: 'modal' }} />
      <Stack.Screen name="[id]/index" options={{ title: '' }} />
      <Stack.Screen name="[id]/log/[kind]" options={{ title: '' }} />
    </Stack>
  );
}
