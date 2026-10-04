import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/lib/theme';
import type { IconName } from '@/lib/vitals';

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

export default function HomeTabs() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: icon('home-variant-outline') }} />
      <Tabs.Screen name="meds" options={{ title: 'Medicación', tabBarIcon: icon('pill') }} />
      <Tabs.Screen name="trends" options={{ title: 'Análisis', tabBarIcon: icon('chart-box-outline') }} />
      <Tabs.Screen name="team" options={{ title: 'Equipo', tabBarIcon: icon('account-group-outline') }} />
    </Tabs>
  );
}
