import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { describePerson, type LinkedPerson } from '@/lib/api';
import { usePerson } from '@/lib/person';
import { radius, useTheme } from '@/lib/theme';

import { Card, Icon } from './ui';
import { Avatar } from './widgets';

/** Who we're looking at, with a link to their profile and a switcher when there's more than one. */
export function PersonCard({ person }: { person: LinkedPerson }) {
  const t = useTheme();
  const { people } = usePerson();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Avatar name={person.nickname} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 21, fontWeight: '800', color: t.text }} numberOfLines={1}>
          {person.nickname}
        </Text>
        {describePerson(person) ? <Text style={{ fontSize: 14, color: t.muted }}>{describePerson(person)}</Text> : null}
        <Pressable onPress={() => router.navigate('/home/team')} accessibilityRole="link" hitSlop={8}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.primary }}>Ver perfil ›</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => router.push('/people')}
        accessibilityRole="button"
        accessibilityLabel={people.length > 1 ? 'Cambiar de persona' : 'Personas'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          minHeight: 44,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{people.length > 1 ? 'Cambiar' : 'Personas'}</Text>
        <Icon name="chevron-down" size={18} color={t.muted} />
      </Pressable>
    </Card>
  );
}
