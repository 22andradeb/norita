import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Body, Button, Caption, Card, ErrorText, Icon, Screen, StatusPill } from '@/components/ui';
import {
  FRAIL,
  FRAIL_ILLNESSES,
  WHO5,
  readFrail,
  readWho5,
  scoreFrail,
  scoreWho5,
  type FrailAnswers,
} from '@/lib/assessments';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { enqueue, newId } from '@/lib/outbox';
import { usePerson } from '@/lib/person';
import { radius, useTheme } from '@/lib/theme';

/** Large, single-tap answer row (radio or checkbox). */
function Option({ label, selected, onPress, multi }: { label: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: selected ? t.primary : t.border,
        backgroundColor: selected ? t.primarySoft : t.card,
      }}
    >
      <Icon
        name={multi ? (selected ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline') : selected ? 'radiobox-marked' : 'radiobox-blank'}
        color={selected ? t.primary : t.muted}
      />
      <Text style={{ flex: 1, fontSize: 17, color: t.text, fontWeight: selected ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
}

function Question({ number, text, children }: { number: number; text: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 19, fontWeight: '800', color: t.text }}>
        {number}. {text}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <>
      <Option label="Sí" selected={value === true} onPress={() => onChange(true)} />
      <Option label="No" selected={value === false} onPress={() => onChange(false)} />
    </>
  );
}

/** Runs WHO-5 or FRAIL with the person, saves it (offline-first) and shows the result. */
export default function AssessmentScreen() {
  const t = useTheme();
  const { instrument } = useLocalSearchParams<{ instrument: 'who5' | 'frail' }>();
  const { session } = useAuth();
  const { person } = usePerson();
  const isWho5 = instrument === 'who5';

  const [who5, setWho5] = useState<(number | undefined)[]>([undefined, undefined, undefined, undefined, undefined]);
  const [fatigue, setFatigue] = useState<FrailAnswers['fatigue'] | undefined>();
  const [resistance, setResistance] = useState<boolean | undefined>();
  const [ambulation, setAmbulation] = useState<boolean | undefined>();
  const [illnesses, setIllnesses] = useState<string[]>([]);
  const [weightLoss, setWeightLoss] = useState<boolean | undefined>();
  const [result, setResult] = useState<{ score: number; category: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const complete = isWho5
    ? who5.every((v) => v !== undefined)
    : fatigue !== undefined && resistance !== undefined && ambulation !== undefined && weightLoss !== undefined;

  async function save() {
    if (!session || !person || !complete) return;
    setError(null);
    setSaving(true);
    try {
      const answers = isWho5
        ? (who5 as number[])
        : ({ fatigue: fatigue!, resistance: resistance!, ambulation: ambulation!, illnesses, weight_loss: weightLoss! } satisfies FrailAnswers);
      const scored = isWho5 ? scoreWho5(answers as number[]) : scoreFrail(answers as FrailAnswers);
      await enqueue(session.user.id, [
        {
          table: 'assessments',
          row: {
            id: newId(),
            older_adult_id: person.id,
            recorded_by: session.user.id,
            recorded_at: new Date().toISOString(),
            instrument,
            answers,
            // Recomputed by the database; sent because the columns are required.
            score: scored.score,
            category: scored.category,
          },
        },
      ]);
      setResult(scored);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const reading = isWho5 ? readWho5(result.score) : readFrail(result.score);
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: isWho5 ? WHO5.short : FRAIL.short }} />
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <Caption>{isWho5 ? 'Puntuación WHO-5' : 'Puntuación FRAIL'}</Caption>
          <Text style={{ fontSize: 56, fontWeight: '800', color: t.text }}>{isWho5 ? result.score : `${result.score}/5`}</Text>
          <StatusPill level={reading.level} label={reading.label} />
          <Body style={{ textAlign: 'center' }}>{reading.advice}</Body>
        </Card>
        <Caption>
          Es una herramienta de cribado, no un diagnóstico. El equipo de cuidados verá el resultado y su evolución en la app.
        </Caption>
        <Button title="Listo" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: isWho5 ? WHO5.short : FRAIL.short }} />
      <Card tone="primary">
        <Body style={{ fontWeight: '700' }}>{isWho5 ? WHO5.name : FRAIL.name}</Body>
        <Body>
          Lee cada pregunta a {person?.nickname} y marca lo que responda. Si no puede responder por sí mismo/a, anótalo en otra
          ocasión: la escala está pensada para que conteste la propia persona.
        </Body>
        <Caption>Se recomienda repetirla {isWho5 ? WHO5.every : FRAIL.every}.</Caption>
      </Card>

      {isWho5 ? (
        <>
          <Body muted>{WHO5.instructions}</Body>
          <Text style={{ fontSize: 17, fontStyle: 'italic', color: t.text }}>{WHO5.stem}</Text>
          {WHO5.items.map((item, i) => (
            <Question key={item} number={i + 1} text={item}>
              {WHO5.options.map((o) => (
                <Option
                  key={o.value}
                  label={o.label}
                  selected={who5[i] === o.value}
                  onPress={() => setWho5((prev) => prev.map((v, j) => (j === i ? o.value : v)))}
                />
              ))}
            </Question>
          ))}
        </>
      ) : (
        <>
          <Question number={1} text={FRAIL.fatigue.question}>
            {FRAIL.fatigue.options.map((o) => (
              <Option key={o.value} label={o.label} selected={fatigue === o.value} onPress={() => setFatigue(o.value as FrailAnswers['fatigue'])} />
            ))}
          </Question>
          <Question number={2} text={FRAIL.resistance}>
            <YesNo value={resistance} onChange={setResistance} />
          </Question>
          <Question number={3} text={FRAIL.ambulation}>
            <YesNo value={ambulation} onChange={setAmbulation} />
          </Question>
          <Question number={4} text={FRAIL.illnesses}>
            <Caption>Marca todas las que correspondan ({illnesses.length} marcadas). Puntúa con 5 o más.</Caption>
            {FRAIL_ILLNESSES.map((ill) => {
              const on = illnesses.includes(ill.value);
              return (
                <Option
                  key={ill.value}
                  multi
                  label={ill.label}
                  selected={on}
                  onPress={() => setIllnesses((prev) => (on ? prev.filter((v) => v !== ill.value) : [...prev, ill.value]))}
                />
              );
            })}
          </Question>
          <Question number={5} text={FRAIL.weightLoss}>
            <YesNo value={weightLoss} onChange={setWeightLoss} />
          </Question>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      {!complete ? <Caption>Responde todas las preguntas para ver el resultado.</Caption> : null}
      <Button title="Guardar y ver resultado" onPress={save} loading={saving} />
      <Caption>
        {isWho5
          ? '© Psychiatric Research Unit, WHO Collaborating Centre in Mental Health. Versión española de 1998, de uso libre.'
          : 'Escala FRAIL (Morley, Malmstrom y Miller, 2012), versión en español.'}
      </Caption>
    </Screen>
  );
}
