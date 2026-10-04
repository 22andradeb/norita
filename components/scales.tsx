import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { FRAIL, WHO5, isDue, latestOf, readFrail, readWho5, type Assessment, type Instrument } from '@/lib/assessments';
import { fmtShortDate, timeAgo } from '@/lib/format';
import { accents, useTheme } from '@/lib/theme';

import { BarChart, LineChart, Ring } from './charts';
import { Button, Caption, Card, StatusPill } from './ui';
import { ChartCard } from './widgets';

const open = (instrument: Instrument) => router.push({ pathname: '/assessment/[instrument]', params: { instrument } });

/** Latest WHO-5 (0–100 ring) and FRAIL result, with a prompt when either is due again. */
export function ScalesCard({ assessments }: { assessments: Assessment[] }) {
  const t = useTheme();
  const who5 = latestOf(assessments, 'who5');
  const frail = latestOf(assessments, 'frail');
  const w = who5 ? readWho5(who5.score) : null;
  const f = frail ? readFrail(frail.score) : null;

  return (
    <Card style={{ gap: 16, paddingVertical: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Ring progress={(who5?.score ?? 0) / 100} color={accents.wellbeing} size={108} stroke={12}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: t.text }}>{who5?.score ?? '–'}</Text>
        </Ring>
        <View style={{ flex: 1, gap: 4 }}>
          <Caption>Bienestar · WHO-5 (0–100)</Caption>
          {w ? (
            <>
              <StatusPill level={w.level} label={w.label} />
              <Caption>{timeAgo(who5!.recorded_at)}</Caption>
            </>
          ) : (
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Aún sin valorar</Text>
          )}
          {isDue(who5, WHO5.everyDays) ? (
            <Button title={who5 ? 'Repetir valoración' : 'Valorar bienestar'} compact variant="secondary" onPress={() => open('who5')} />
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Caption>Fragilidad · escala FRAIL (0–5)</Caption>
          {f ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: t.text }}>{frail!.score}/5</Text>
              <StatusPill level={f.level} label={f.label} />
            </View>
          ) : (
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Aún sin valorar</Text>
          )}
          {frail ? <Caption>{timeAgo(frail.recorded_at)}</Caption> : null}
        </View>
        {isDue(frail, FRAIL.everyDays) ? (
          <Button title={frail ? 'Repetir' : 'Valorar'} compact variant="secondary" onPress={() => open('frail')} />
        ) : null}
      </View>
      {f && f.level !== 'normal' ? <Caption>{f.advice}</Caption> : null}
      {w && w.level !== 'normal' ? <Caption>{w.advice}</Caption> : null}
    </Card>
  );
}

/** Evolution of both scales over the last year. */
export function ScalesHistory({ assessments }: { assessments: Assessment[] }) {
  const t = useTheme();
  const who5 = assessments.filter((a) => a.instrument === 'who5');
  const frail = assessments.filter((a) => a.instrument === 'frail');
  const from = Math.min(Date.now() - 90 * 86_400_000, ...who5.map((a) => Date.parse(a.recorded_at)));

  return (
    <>
      <ChartCard icon="emoticon-happy-outline" color={accents.wellbeing} title="Bienestar (WHO-5)" summary={who5.length ? `Última: ${who5[who5.length - 1].score}` : 'Sin valoraciones'}>
        {who5.length ? (
          <LineChart
            series={[{ points: who5.map((a) => ({ t: Date.parse(a.recorded_at), v: a.score })), color: accents.wellbeing }]}
            band={[51, 100]}
            from={from}
            to={Date.now()}
            height={170}
          />
        ) : null}
        <Caption>0–100. La franja verde (más de 50) es bienestar adecuado; 50 o menos conviene valorarlo con su médico. Se recomienda cada 2 semanas.</Caption>
        <Button title="Hacer valoración WHO-5" variant="secondary" compact onPress={() => open('who5')} />
      </ChartCard>

      <ChartCard icon="human-cane" color={accents.respiration} title="Fragilidad (FRAIL)" summary={frail.length ? `Última: ${frail[frail.length - 1].score}/5` : 'Sin valoraciones'}>
        {frail.length ? (
          <BarChart
            bars={frail.slice(-12).map((a) => ({
              label: fmtShortDate(new Date(a.recorded_at)),
              value: a.score,
              color: a.score === 0 ? t.success : a.score <= 2 ? '#E3A008' : accents.bloodPressure,
            }))}
            color={accents.respiration}
            max={5}
          />
        ) : null}
        <Caption>
          0 robusto/a · 1–2 prefrágil · 3–5 frágil. El consenso del Ministerio de Sanidad (2026) considera 1 punto o más como alta probabilidad de fragilidad. Se recomienda cada mes.
        </Caption>
        <Button title="Hacer valoración FRAIL" variant="secondary" compact onPress={() => open('frail')} />
      </ChartCard>
    </>
  );
}
