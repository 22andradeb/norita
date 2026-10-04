import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { IconName } from '@/lib/vitals';

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

// Caregivers and family members get different tabs: caregivers log and act, family members
// follow along through summaries and analysis. The same route files serve both (see each screen).
export default function HomeTabs() {
  const t = useTheme();
  const family = useAuth().profile?.role === 'family';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: icon(family ? 'white-balance-sunny' : 'home-variant-outline') }} />
      {/* Caregivers reach their Análisis screen from links on Hoy and Historial. */}
      <Tabs.Screen
        name="trends"
        options={family ? { title: 'Salud', tabBarIcon: icon('heart-pulse') } : { title: 'Análisis', tabBarIcon: icon('chart-box-outline'), href: null }}
      />
      <Tabs.Screen name="meds" options={{ title: 'Medicación', tabBarIcon: icon('pill'), href: family ? null : undefined }} />
      <Tabs.Screen name="citas" options={{ title: 'Citas', tabBarIcon: icon('calendar-clock') }} />
      <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: icon('file-document-multiple-outline') }} />
      <Tabs.Screen name="team" options={{ title: 'Equipo', tabBarIcon: icon('account-group-outline') }} />
    </Tabs>
  );
}
