import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useLoad } from '@/lib/api';
import { DOC_TYPES, isStuck, listDocuments, outOfRange, transcribe, type LabResult, type MedicalDocument } from '@/lib/documents';
import { cap, fmtShortDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { IconName } from '@/lib/vitals';

import { Button, Caption, Card, EmptyState, ErrorText, IconBadge, StatusPill } from './ui';

const DOC_ICONS: Record<MedicalDocument['doc_type'], IconName> = {
  lab: 'test-tube',
  imaging: 'radiology-box-outline',
  report: 'file-document-outline',
  prescription: 'prescription',
  other: 'file-outline',
};

const FLAG: Record<LabResult['flag'], { level: 'normal' | 'watch' | 'alert' | 'none'; label: string } | null> = {
  normal: { level: 'normal', label: 'En rango' },
  high: { level: 'alert', label: 'Alto' },
  low: { level: 'alert', label: 'Bajo' },
  abnormal: { level: 'watch', label: 'Alterado' },
  unknown: null,
};

const docDate = (d: MedicalDocument) =>
  d.exam_date
    ? cap(new Date(`${d.exam_date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }))
    : `Subido el ${fmtShortDate(new Date(d.created_at))}`;

/** All medical documents for a person, refreshing while any is still being transcribed. */
export function ExamsSection({ olderAdultId }: { olderAdultId: string }) {
  const docs = useLoad(() => listDocuments(olderAdultId), [olderAdultId]);
  const processing = (docs.data ?? []).some((d) => d.status === 'processing' && !isStuck(d));

  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void docs.reload(), 4000);
    return () => clearInterval(timer);
  }, [processing, docs.reload]);

  return (
    <View style={{ gap: 12 }}>
      <Button title="Subir examen" icon="file-upload-outline" onPress={() => router.push('/exam-new')} />
      <Caption>Haz una foto de los resultados o sube el PDF. Se transcriben automáticamente.</Caption>
      <ErrorText>{docs.error}</ErrorText>
      {docs.data && docs.data.length === 0 ? (
        <EmptyState
          icon="file-document-multiple-outline"
          title="Aún no hay exámenes"
          body="Guarda aquí análisis, informes y pruebas. Todo el equipo de cuidados podrá consultarlos."
        />
      ) : null}
      {(docs.data ?? []).map((d) => (
        <ExamCard key={d.id} doc={d} onRetry={async () => {
          await transcribe(d.id);
          await docs.reload();
        }} />
      ))}
    </View>
  );
}

function ExamCard({ doc: d, onRetry }: { doc: MedicalDocument; onRetry: () => void }) {
  const t = useTheme();
  const flagged = outOfRange(d);
  const stuck = isStuck(d);
  return (
    <Card
      onPress={d.status === 'ready' ? () => router.push({ pathname: '/exam/[id]', params: { id: d.id } }) : undefined}
      accessibilityLabel={d.title ?? 'Examen'}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconBadge name={DOC_ICONS[d.doc_type]} color={t.primary} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: t.text }} numberOfLines={2}>
            {d.title ?? DOC_TYPES[d.doc_type]}
          </Text>
          <Caption>
            {docDate(d)}
            {d.lab_name ? ` · ${d.lab_name}` : ''}
          </Caption>
        </View>
      </View>

      {d.status === 'processing' && !stuck ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={t.primary} />
          <Caption>Transcribiendo… puede tardar un minuto.</Caption>
        </View>
      ) : null}
      {d.status === 'failed' || stuck ? (
        <>
          <Text style={{ fontSize: 15, color: t.danger }}>{d.error ?? 'La transcripción no terminó.'}</Text>
          <Button title="Reintentar" variant="secondary" compact onPress={onRetry} />
        </>
      ) : null}
      {d.status === 'ready' ? (
        <>
          {d.summary ? (
            <Text style={{ fontSize: 15, lineHeight: 21, color: t.text }} numberOfLines={3}>
              {d.summary}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {d.results.length ? <StatusPill level="none" label={`${d.results.length} resultados`} /> : null}
            {flagged.length ? (
              <StatusPill level="alert" label={`${flagged.length} fuera de rango`} />
            ) : d.results.length ? (
              <StatusPill level="normal" label="Todo en rango" />
            ) : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}

/** Results grouped by section, with value, unit, reference range and a flag. */
export function ResultsTable({ results }: { results: LabResult[] }) {
  const t = useTheme();
  const groups = new Map<string, LabResult[]>();
  for (const r of results) {
    const k = r.section ?? '';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <View style={{ gap: 14 }}>
      {[...groups.entries()].map(([section, rows]) => (
        <Card key={section || 'results'} style={{ padding: 0, gap: 0 }}>
          {section ? (
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.muted, padding: 14, paddingBottom: 4, letterSpacing: 0.3 }}>
              {section.toUpperCase()}
            </Text>
          ) : null}
          {rows.map((r, i) => {
            const flag = FLAG[r.flag];
            const bad = r.flag === 'high' || r.flag === 'low' || r.flag === 'abnormal';
            return (
              <View
                key={`${r.name}-${i}`}
                accessible
                accessibilityLabel={`${r.name}: ${r.value} ${r.unit ?? ''}${r.reference_range ? `, referencia ${r.reference_range}` : ''}${flag ? `, ${flag.label}` : ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 14,
                  borderTopWidth: i === 0 && !section ? 0 : 1,
                  borderTopColor: t.border,
                  backgroundColor: bad ? t.dangerSoft : 'transparent',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{r.name}</Text>
                  {r.reference_range ? <Caption>Referencia: {r.reference_range}</Caption> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: bad ? t.danger : t.text }}>
                    {r.value}
                    {r.unit ? <Text style={{ fontSize: 13, fontWeight: '400', color: t.muted }}> {r.unit}</Text> : null}
                  </Text>
                  {flag ? <StatusPill level={flag.level} label={flag.label} /> : null}
                </View>
              </View>
            );
          })}
        </Card>
      ))}
    </View>
  );
}

export { DOC_ICONS };
