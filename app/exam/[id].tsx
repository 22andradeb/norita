import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { DOC_ICONS, ResultsTable } from '@/components/exams';
import { Body, Button, Caption, Card, ErrorText, Heading, Icon, IconBadge, Loading, Screen, StatusPill } from '@/components/ui';
import { useLoad } from '@/lib/api';
import { DOC_TYPES, getDocument, originalUrl, outOfRange } from '@/lib/documents';
import { cap, errorText } from '@/lib/format';
import { useTheme } from '@/lib/theme';

/** One transcribed document: summary, results with reference ranges, transcript and the original. */
export default function ExamDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useLoad(() => getDocument(id), [id]);
  const [showText, setShowText] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  if (!doc.data) return doc.error ? <Body>{doc.error}</Body> : <Loading />;
  const d = doc.data;
  const flagged = outOfRange(d);
  const date = d.exam_date
    ? cap(new Date(`${d.exam_date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    : null;

  async function openOriginal() {
    setOpenError(null);
    try {
      await Linking.openURL(await originalUrl(d.storage_path));
    } catch (e) {
      setOpenError(errorText(e));
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: DOC_TYPES[d.doc_type] }} />
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <IconBadge name={DOC_ICONS[d.doc_type]} color={t.primary} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.text }}>{d.title ?? DOC_TYPES[d.doc_type]}</Text>
          {date ? <Caption>{date}</Caption> : null}
          {[d.lab_name, d.professional].filter(Boolean).length ? <Caption>{[d.lab_name, d.professional].filter(Boolean).join(' · ')}</Caption> : null}
        </View>
      </View>

      {d.summary ? (
        <Card tone={flagged.length ? 'warning' : 'primary'}>
          <Body style={{ fontWeight: '700' }}>Resumen</Body>
          <Body>{d.summary}</Body>
          {d.results.length ? (
            flagged.length ? (
              <StatusPill level="alert" label={`${flagged.length} de ${d.results.length} valores fuera de rango`} />
            ) : (
              <StatusPill level="normal" label="Todos los valores en rango" />
            )
          ) : null}
        </Card>
      ) : null}

      {d.results.length ? (
        <>
          <Heading>Resultados</Heading>
          <ResultsTable results={d.results} />
          <Caption>«Fuera de rango» se basa en los valores de referencia que aparecen en el propio documento.</Caption>
        </>
      ) : null}

      <Button title="Ver documento original" icon="open-in-new" variant="secondary" onPress={openOriginal} />
      <ErrorText>{openError}</ErrorText>

      {d.transcript ? (
        <Card>
          <Pressable
            onPress={() => setShowText(!showText)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showText }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Icon name="text-box-outline" color={t.primary} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t.text }}>Texto transcrito</Text>
            <Icon name={showText ? 'chevron-up' : 'chevron-down'} color={t.muted} />
          </Pressable>
          {showText ? (
            <Text selectable style={{ fontSize: 15, lineHeight: 22, color: t.text }}>
              {d.transcript}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Text style={{ color: t.muted, fontSize: 13 }}>
        Transcripción automática con inteligencia artificial: puede contener errores. Comprueba los valores con el documento original y consulta cualquier duda con su médico.
      </Text>
    </Screen>
  );
}
