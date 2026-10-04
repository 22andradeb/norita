import { useState, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

/** Progress ring (0–1). Children render in the centre. */
export function Ring({
  progress,
  color,
  size = 64,
  stroke = 8,
  children,
}: {
  progress: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

function useWidth(initial = 0) {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  return { width, onLayout };
}

/** Small trend line for widgets. */
export function Sparkline({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  const { width, onLayout } = useWidth();
  if (values.length < 2) return <View style={{ height }} onLayout={onLayout} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const last = pts[pts.length - 1];
  return (
    <View style={{ height }} onLayout={onLayout} accessible={false}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Polyline
            points={pts.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}

export type Point = { t: number; v: number };
export type Series = { points: Point[]; color: string; label?: string };

const fmt = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toLocaleString('es-ES'));

/** Time-series line chart with an optional shaded "usual range" band. */
export function LineChart({
  series,
  band,
  from,
  to,
  height = 180,
}: {
  series: Series[];
  band?: [number, number];
  from: number;
  to: number;
  height?: number;
}) {
  const t = useTheme();
  const { width, onLayout } = useWidth();
  const all = series.flatMap((s) => s.points.map((p) => p.v));
  if (band) all.push(...band);
  const rawMin = all.length ? Math.min(...all) : 0;
  const rawMax = all.length ? Math.max(...all) : 1;
  const pad = (rawMax - rawMin || 1) * 0.12;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const left = 36;
  const right = 8;
  const top = 8;
  const bottom = 22;
  const plotW = Math.max(1, width - left - right);
  const plotH = height - top - bottom;
  const x = (tt: number) => left + ((tt - from) / Math.max(1, to - from)) * plotW;
  const y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const dateLabel = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const ticks = [yMin + pad, (yMin + yMax) / 2, yMax - pad];

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {band ? (
            <Rect x={left} y={y(band[1])} width={plotW} height={Math.max(0, y(band[0]) - y(band[1]))} fill={t.successSoft} />
          ) : null}
          {ticks.map((v) => (
            <Line key={v} x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke={t.border} strokeWidth={1} />
          ))}
          {ticks.map((v) => (
            <SvgText key={`l${v}`} x={left - 6} y={y(v) + 4} fontSize={11} fill={t.muted} textAnchor="end">
              {fmt(v)}
            </SvgText>
          ))}
          <SvgText x={left} y={height - 6} fontSize={11} fill={t.muted}>
            {dateLabel(from)}
          </SvgText>
          <SvgText x={left + plotW} y={height - 6} fontSize={11} fill={t.muted} textAnchor="end">
            {dateLabel(to)}
          </SvgText>
          {series.map((s, si) => (
            <Polyline
              key={`p${si}`}
              points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          ))}
          {series.flatMap((s, si) =>
            s.points.map((p, pi) => <Circle key={`d${si}-${pi}`} cx={x(p.t)} cy={y(p.v)} r={3} fill={s.color} />),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

/** Daily bars with an optional goal line. Null values draw as an empty slot. */
export function BarChart({
  bars,
  color,
  goal,
  max,
  height = 140,
  format = fmt,
}: {
  bars: { label: string; value: number | null; color?: string }[];
  color: string;
  goal?: number;
  max?: number;
  height?: number;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const { width, onLayout } = useWidth();
  const top = 16;
  const bottom = 20;
  const plotH = height - top - bottom;
  const peak = max ?? Math.max(goal ?? 0, ...bars.map((b) => b.value ?? 0), 1);
  const slot = width / Math.max(1, bars.length);
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => top + (1 - v / peak) * plotH;
  const showLabelEvery = Math.ceil(bars.length / 8);

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {goal ? (
            <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={t.muted} strokeDasharray="4 4" strokeWidth={1} />
          ) : null}
          {bars.map((b, i) => {
            const cx = slot * i + slot / 2;
            return (
              <G key={i}>
                {b.value != null ? (
                  <Rect
                    x={cx - barW / 2}
                    y={y(b.value)}
                    width={barW}
                    height={Math.max(2, top + plotH - y(b.value))}
                    rx={Math.min(6, barW / 2)}
                    fill={b.color ?? color}
                  />
                ) : (
                  <Rect x={cx - barW / 2} y={top + plotH - 2} width={barW} height={2} fill={t.track} />
                )}
                {bars.length <= 8 && b.value != null ? (
                  <SvgText x={cx} y={y(b.value) - 4} fontSize={11} fill={t.muted} textAnchor="middle">
                    {format(b.value)}
                  </SvgText>
                ) : null}
                {i % showLabelEvery === 0 ? (
                  <SvgText x={cx} y={height - 5} fontSize={11} fill={t.muted} textAnchor="middle">
                    {b.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i.color }} />
          <Text style={{ fontSize: 14, color: t.muted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Calendar of the last weeks, Monday first. Days with no entries are highlighted so gaps in
 * logging stand out; otherwise the colour deepens with the number of entries.
 */
export function CoverageCalendar({ days }: { days: { day: Date; value: number }[] }) {
  const t = useTheme();
  const max = Math.max(1, ...days.map((d) => d.value));
  const lead = (days[0].day.getDay() + 6) % 7; // Monday = 0
  const cells: ({ day: Date; value: number } | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const tint = (value: number) => {
    const alpha = Math.round(40 + (value / max) * 215).toString(16).padStart(2, '0');
    return `${t.primary}${alpha}`;
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {weekdays.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: t.muted }}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: 7 }, (_, ci) => {
            const c = row[ci];
            if (!c) return <View key={ci} style={{ flex: 1, aspectRatio: 1 }} />;
            const empty = c.value === 0;
            const strong = !empty && c.value / max > 0.55;
            return (
              <View
                key={ci}
                accessible
                accessibilityLabel={`${c.day.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: ${c.value} registros`}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: empty ? t.dangerSoft : tint(c.value),
                  borderWidth: empty ? 1 : 0,
                  borderColor: t.danger,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: empty ? t.danger : strong ? t.onPrimary : t.text }}>
                  {c.day.getDate()}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Labelled horizontal bars, e.g. time in range per vital sign or entries per category. */
export function HBars({
  rows,
  max,
}: {
  rows: { label: string; value: number; color: string; text?: string }[];
  max?: number;
}) {
  const t = useTheme();
  const peak = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }} accessible accessibilityLabel={`${r.label}: ${r.text ?? r.value}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, color: t.text }}>{r.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{r.text ?? r.value}</Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: t.track, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(2, (r.value / peak) * 100)}%`, height: 10, borderRadius: 5, backgroundColor: r.color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Calendar (Monday first) where each day has its own colour, e.g. medication adherence. */
export function DayGrid({ days }: { days: { day: Date; color: string; textColor: string; label: string }[] }) {
  const t = useTheme();
  const lead = (days[0].day.getDay() + 6) % 7;
  const cells = [...Array.from({ length: lead }, () => null), ...days];
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: t.muted }}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: 7 }, (_, ci) => {
            const c = row[ci];
            if (!c) return <View key={ci} style={{ flex: 1, aspectRatio: 1 }} />;
            return (
              <View
                key={ci}
                accessible
                accessibilityLabel={`${c.day.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: ${c.label}`}
                style={{ flex: 1, aspectRatio: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.color }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.textColor }}>{c.day.getDate()}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
