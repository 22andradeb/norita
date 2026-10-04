import { router } from 'expo-router';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { Body, Button, Caption, Card, Chip, EmptyState, ErrorText, Heading, Row, Screen, StatusPill } from '@/components/ui';
import { Avatar, PersonHeader } from '@/components/widgets';
import { api, useLoad } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { usePerson } from '@/lib/person';
import { useTheme } from '@/lib/theme';

export default function Team() {
  const t = useTheme();
  const { session, profile, signOut } = useAuth();
  const { person, canLog, reload } = usePerson();
  const pid = person?.id;
  const team = useLoad(async () => (pid ? api.team(pid) : []), [pid]);
  const [goalError, setGoalError] = useState<string | null>(null);

  async function setGoal(ml: number) {
    if (!pid) return;
    setGoalError(null);
    try {
      await api.updatePerson(pid, { fluid_goal_ml: ml });
      await reload();
    } catch (e) {
      setGoalError(errorText(e));
    }
  }

  return (
    <Screen>
      {person ? (
        <PersonHeader person={person} />
      ) : (
        <EmptyState icon="account-group-outline" title="No hay ninguna persona" body="Añade o únete a una persona para ver su equipo de cuidados." />
      )}

      <Button title="Cambiar, añadir o unirse a una persona" variant="secondary" icon="account-switch-outline" onPress={() => router.push('/people')} />

      {person ? (
        <>
          <Heading>Equipo de cuidados</Heading>
          <Card style={{ padding: 0, gap: 0 }}>
            {(team.data ?? []).map((m, i) => (
              <View
                key={m.user_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: t.border,
                }}
              >
                <Avatar name={m.full_name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>
                    {m.full_name}
                    {m.user_id === session?.user.id ? ' (tú)' : ''}
                  </Text>
                  <Caption>Se unió el {new Date(m.joined_at).toLocaleDateString('es-ES')}</Caption>
                </View>
                <StatusPill level={m.role === 'caregiver' ? 'normal' : 'none'} label={m.role === 'caregiver' ? 'Cuidador/a' : 'Familiar'} />
              </View>
            ))}
          </Card>
          <ErrorText>{team.error}</ErrorText>

          {canLog ? <InviteCard olderAdultId={person.id} nickname={person.nickname} /> : null}

          {canLog ? (
            <>
              <Heading>Objetivo diario de líquidos</Heading>
              <Row>
                {[1000, 1500, 2000, 2500].map((ml) => (
                  <Chip key={ml} label={`${(ml / 1000).toLocaleString('es-ES')} L`} selected={person.fluid_goal_ml === ml} onPress={() => void setGoal(ml)} />
                ))}
              </Row>
              <Caption>Consulta la cantidad adecuada con su médico, sobre todo si tiene problemas de corazón o de riñón.</Caption>
              <ErrorText>{goalError}</ErrorText>
            </>
          ) : null}
        </>
      ) : null}

      <Heading>Tu cuenta</Heading>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{profile?.full_name}</Text>
        <Caption>{session?.user.email}</Caption>
        <Caption>{profile?.role === 'caregiver' ? 'Cuenta de cuidador/a' : 'Cuenta de familiar'}</Caption>
      </Card>
      <Button title="Cerrar sesión" variant="secondary" icon="logout" onPress={signOut} />
    </Screen>
  );
}

function InviteCard({ olderAdultId, nickname }: { olderAdultId: string; nickname: string }) {
  const t = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    setError(null);
    setLoading(true);
    try {
      setCode(await api.createInvite(olderAdultId));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  const pretty = code ? `${code.slice(0, 4)}-${code.slice(4)}` : '';
  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Invitar a un familiar u otro cuidador</Text>
      {code ? (
        <>
          <Text selectable style={{ fontSize: 34, fontWeight: '800', letterSpacing: 4, color: t.text }}>
            {pretty}
          </Text>
          <Caption>Sirve una vez y caduca en 7 días.</Caption>
          <Button
            title="Compartir código"
            icon="share-variant-outline"
            onPress={() =>
              Share.share({
                message: `Te invito a seguir los cuidados de ${nickname} en Norita. Abre la app, elige «Unirse con un código» e introduce: ${pretty}`,
              })
            }
          />
        </>
      ) : (
        <>
          <Body muted>Crea un código de un solo uso y envíaselo. Lo introducirá en la app para unirse.</Body>
          <ErrorText>{error}</ErrorText>
          <Button title="Crear código de invitación" icon="key-outline" onPress={create} loading={loading} />
        </>
      )}
    </Card>
  );
}
