import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { registerForPush, type PushStatus } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

import { Button, Caption, Card, Chip, ErrorText, Row, StatusPill } from './ui';

const LEVELS = [
  { value: 'important', label: 'Solo lo importante', help: 'Caídas, avisos urgentes, valores muy fuera de rango y días sin ninguna visita.' },
  { value: 'all', label: 'Todos los avisos', help: 'También tomas olvidadas, valores fuera de lo habitual, exámenes alterados y recordatorios de citas.' },
  { value: 'none', label: 'Ninguno', help: 'No recibirás notificaciones. Los avisos seguirán apareciendo en la app.' },
] as const;

const STATUS: Record<PushStatus, { level: 'normal' | 'watch' | 'none'; label: string }> = {
  enabled: { level: 'normal', label: 'Activadas en este móvil' },
  denied: { level: 'watch', label: 'Permiso denegado' },
  unavailable: { level: 'none', label: 'No disponibles en este dispositivo' },
  not_configured: { level: 'watch', label: 'Falta configurar el proyecto' },
  error: { level: 'watch', label: 'No se pudo registrar el móvil' },
};

export function NotificationSettings() {
  const t = useTheme();
  const { session, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void registerForPush(false).then(setStatus);
  }, []);

  async function setLevel(level: (typeof LEVELS)[number]['value']) {
    if (!session) return;
    setError(null);
    const { error } = await supabase.from('profiles').update({ notify_level: level }).eq('id', session.user.id);
    if (error) setError(errorText(error));
    else await refreshProfile();
  }

  const current = LEVELS.find((l) => l.value === (profile?.notify_level ?? 'important'))!;

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Avisar a mi móvil</Text>
        {status ? <StatusPill level={STATUS[status].level} label={STATUS[status].label} /> : null}
      </View>
      <Row>
        {LEVELS.map((l) => (
          <Chip key={l.value} label={l.label} selected={current.value === l.value} onPress={() => void setLevel(l.value)} />
        ))}
      </Row>
      <Caption>{current.help}</Caption>
      {status === 'denied' ? (
        <Button title="Abrir Ajustes para permitirlas" variant="secondary" icon="bell-ring-outline" compact onPress={() => void Linking.openSettings()} />
      ) : null}
      {status === 'not_configured' ? (
        <Caption>Para recibir notificaciones, el proyecto de Expo tiene que estar vinculado (ver README, «Notifications»).</Caption>
      ) : null}
      {status === 'error' ? (
        <Button title="Reintentar" variant="secondary" compact onPress={() => void registerForPush(true).then(setStatus)} />
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
