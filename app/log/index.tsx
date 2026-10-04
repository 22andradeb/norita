import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Caption, IconBadge, Screen } from '@/components/ui';
import { LOG_STYLE, SHEET_KINDS } from '@/lib/logStyle';
import { usePerson } from '@/lib/person';
import { radius, useTheme } from '@/lib/theme';

/** The "+" sheet: every kind of entry as a tile, two taps from anywhere. */
export default function LogSheet() {
  const t = useTheme();
  const { personId, date } = useLocalSearchParams<{ personId: string; date?: string }>();
  const { person } = usePerson();

  return (
    <Screen edges={['bottom']}>
      <Caption>Registrando para {person?.nickname}</Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {SHEET_KINDS.map((kind) => {
          const s = LOG_STYLE[kind];
          const fall = kind === 'fall';
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={() => {
                if (kind === 'medication') {
                  router.back();
                  router.navigate('/home/meds');
                  return;
                }
                router.replace({ pathname: '/log/[kind]', params: { kind, personId, ...(date ? { date } : {}) } });
              }}
              style={({ pressed }) => ({
                width: '30.5%',
                aspectRatio: 1,
                borderRadius: radius.lg,
                backgroundColor: fall ? t.dangerSoft : t.card,
                borderWidth: 1,
                borderColor: fall ? 'transparent' : t.border,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <IconBadge name={s.icon} color={s.color} size={46} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: fall ? t.danger : t.text, textAlign: 'center' }}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Examen médico"
          onPress={() => router.replace('/exam-new')}
          style={({ pressed }) => ({
            width: '30.5%',
            aspectRatio: 1,
            borderRadius: radius.lg,
            backgroundColor: t.card,
            borderWidth: 1,
            borderColor: t.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <IconBadge name="file-document-outline" color={t.primary} size={46} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.text, textAlign: 'center' }}>Examen médico</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
