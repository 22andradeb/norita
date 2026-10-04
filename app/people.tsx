import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Caption, Card, Icon, Screen, StatusPill } from '@/components/ui';
import { Avatar } from '@/components/widgets';
import { describePerson } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePerson } from '@/lib/person';
import { useTheme } from '@/lib/theme';

export default function People() {
  const t = useTheme();
  const { profile } = useAuth();
  const { people, person, select } = usePerson();

  return (
    <Screen edges={['bottom']}>
      {people.map((p) => {
        const selected = p.id === person?.id;
        return (
          <Card
            key={p.id}
            onPress={() => {
              select(p.id);
              router.back();
            }}
            accessibilityLabel={`${p.nickname}${selected ? ', seleccionada' : ''}`}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, selected && { borderColor: t.primary, borderWidth: 2 }]}
          >
            <Avatar name={p.nickname} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: '700', color: t.text }}>{p.nickname}</Text>
              {describePerson(p) ? <Caption>{describePerson(p)}</Caption> : null}
            </View>
            <StatusPill level="none" label={p.myRole === 'caregiver' ? 'Cuidador/a' : 'Familiar'} />
            {selected ? <Icon name="check" color={t.primary} /> : null}
          </Card>
        );
      })}
      {profile?.role === 'caregiver' ? (
        <Button title="Añadir persona" icon="account-plus-outline" onPress={() => router.replace('/add-person')} />
      ) : null}
      <Button title="Unirse con un código" icon="key-outline" variant="secondary" onPress={() => router.replace('/join')} />
    </Screen>
  );
}
