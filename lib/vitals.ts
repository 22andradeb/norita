import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { fmtNum } from './format';
import { accents } from './theme';

// Vital-sign widgets. Status uses general adult reference ranges to colour a reading; it is a
// prompt to pay attention, not a diagnosis. Ranges should be reviewed with a clinician and,
// later, made adjustable per person (e.g. a diabetic glucose target).

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Level = 'normal' | 'watch' | 'alert';
export type Status = { level: Level; label: string };
export type Reading = { at: string; value: number; value2?: number };
export type VitalsRow = { recorded_at: string } & Record<string, unknown>;

export type Metric = {
  key: string;
  label: string;
  unit: string;
  icon: IconName;
  color: string;
  decimals: number;
  /** Shaded "usual" band on charts (for blood pressure: the systolic band). */
  band?: [number, number];
  rangeText: string;
  read: (row: VitalsRow) => Reading | null;
  status: (reading: Reading, history: Reading[]) => Status;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const single =
  (column: string) =>
  (row: VitalsRow): Reading | null => {
    const value = num(row[column]);
    return value === null ? null : { at: row.recorded_at, value };
  };

const within = (v: number, low: number, high: number) => v >= low && v <= high;

export const METRICS = {
  blood_pressure: {
    key: 'blood_pressure',
    label: 'Tensión arterial',
    unit: 'mmHg',
    icon: 'gauge',
    color: accents.bloodPressure,
    decimals: 0,
    band: [90, 140],
    rangeText: 'Rango habitual en adultos: por debajo de 140/90 y la alta por encima de 90.',
    read: (row) => {
      const s = num(row.systolic);
      const d = num(row.diastolic);
      return s === null || d === null ? null : { at: row.recorded_at, value: s, value2: d };
    },
    status: ({ value: s, value2: d = 0 }) => {
      if (s >= 180 || d >= 120) return { level: 'alert', label: 'Muy alta' };
      if (s < 90) return { level: 'alert', label: 'Baja' };
      if (s >= 140 || d >= 90) return { level: 'watch', label: 'Alta' };
      return { level: 'normal', label: 'En rango' };
    },
  },
  heart_rate: {
    key: 'heart_rate',
    label: 'Pulso',
    unit: 'lpm',
    icon: 'heart-pulse',
    color: accents.heartRate,
    decimals: 0,
    band: [50, 100],
    rangeText: 'Rango habitual en reposo: 50–100 latidos por minuto.',
    read: single('heart_rate'),
    status: ({ value }) => {
      if (value < 40 || value > 130) return { level: 'alert', label: value < 40 ? 'Muy bajo' : 'Muy alto' };
      if (!within(value, 50, 100)) return { level: 'watch', label: value < 50 ? 'Bajo' : 'Alto' };
      return { level: 'normal', label: 'En rango' };
    },
  },
  spo2: {
    key: 'spo2',
    label: 'Oxígeno',
    unit: '%',
    icon: 'lungs',
    color: accents.spo2,
    decimals: 0,
    band: [95, 100],
    rangeText: 'Rango habitual: 95–100 %. Por debajo del 92 % suele requerir consulta médica.',
    read: single('spo2'),
    status: ({ value }) => {
      if (value < 90) return { level: 'alert', label: 'Bajo' };
      if (value < 95) return { level: 'watch', label: 'Algo bajo' };
      return { level: 'normal', label: 'En rango' };
    },
  },
  blood_glucose: {
    key: 'blood_glucose',
    label: 'Glucosa',
    unit: 'mg/dL',
    icon: 'water-opacity',
    color: accents.glucose,
    decimals: 0,
    band: [70, 180],
    rangeText: 'Rango objetivo habitual: 70–180 mg/dL. Por debajo de 70 es baja.',
    read: single('blood_glucose_mg_dl'),
    status: ({ value }) => {
      if (value < 70) return { level: 'alert', label: 'Baja' };
      if (value > 250) return { level: 'alert', label: 'Muy alta' };
      if (value > 180) return { level: 'watch', label: 'Alta' };
      return { level: 'normal', label: 'En rango' };
    },
  },
  temperature: {
    key: 'temperature',
    label: 'Temperatura',
    unit: '°C',
    icon: 'thermometer',
    color: accents.temperature,
    decimals: 1,
    band: [36, 37.7],
    rangeText: 'Rango habitual: 36,0–37,7 °C. A partir de 37,8 °C es fiebre.',
    read: single('temperature_c'),
    status: ({ value }) => {
      if (value >= 39) return { level: 'alert', label: 'Fiebre alta' };
      if (value < 35) return { level: 'alert', label: 'Muy baja' };
      if (value >= 37.8) return { level: 'watch', label: 'Fiebre' };
      if (value < 36) return { level: 'watch', label: 'Baja' };
      return { level: 'normal', label: 'En rango' };
    },
  },
  respiratory_rate: {
    key: 'respiratory_rate',
    label: 'Respiración',
    unit: 'rpm',
    icon: 'weather-windy',
    color: accents.respiration,
    decimals: 0,
    band: [12, 20],
    rangeText: 'Rango habitual en reposo: 12–20 respiraciones por minuto.',
    read: single('respiratory_rate'),
    status: ({ value }) => {
      if (value < 8 || value > 25) return { level: 'alert', label: value < 8 ? 'Muy baja' : 'Muy alta' };
      if (!within(value, 12, 20)) return { level: 'watch', label: value < 12 ? 'Baja' : 'Alta' };
      return { level: 'normal', label: 'En rango' };
    },
  },
  weight: {
    key: 'weight',
    label: 'Peso',
    unit: 'kg',
    icon: 'scale-bathroom',
    color: accents.weight,
    decimals: 1,
    rangeText: 'Vigila cambios de más del 5 % en un mes.',
    read: single('weight_kg'),
    status: (reading, history) => {
      // Compare with the oldest reading from the last 30 days.
      const monthAgo = Date.parse(reading.at) - 30 * 86_400_000;
      const base = history.find((r) => Date.parse(r.at) >= monthAgo && r.at < reading.at);
      if (!base) return { level: 'normal', label: 'Registrando' };
      const change = ((reading.value - base.value) / base.value) * 100;
      const text = `${change > 0 ? '+' : ''}${fmtNum(change, 1)} % en 30 d`;
      if (Math.abs(change) >= 5) return { level: 'alert', label: text };
      if (Math.abs(change) >= 3) return { level: 'watch', label: text };
      return { level: 'normal', label: 'Estable' };
    },
  },
  pain: {
    key: 'pain',
    label: 'Dolor',
    unit: '/10',
    icon: 'emoticon-sad-outline',
    color: accents.pain,
    decimals: 0,
    band: [0, 3],
    rangeText: '0 = sin dolor, 10 = el peor. 4–6 es moderado, 7 o más es intenso.',
    read: single('pain_score'),
    status: ({ value }) => {
      if (value >= 7) return { level: 'alert', label: 'Intenso' };
      if (value >= 4) return { level: 'watch', label: 'Moderado' };
      return { level: 'normal', label: value === 0 ? 'Sin dolor' : 'Leve' };
    },
  },
} satisfies Record<string, Metric>;

export type MetricKey = keyof typeof METRICS;

export const METRIC_ORDER: MetricKey[] = [
  'blood_pressure',
  'heart_rate',
  'spo2',
  'blood_glucose',
  'temperature',
  'respiratory_rate',
  'weight',
  'pain',
];

export function isMetricKey(key: string): key is MetricKey {
  return key in METRICS;
}

/** Readings for one metric, oldest first. */
export function readingsFor(metric: Metric, rows: VitalsRow[]): Reading[] {
  return rows
    .map(metric.read)
    .filter((r): r is Reading => r !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function formatReading(metric: Metric, r: Reading) {
  const f = (v: number) => fmtNum(v, metric.decimals);
  return r.value2 !== undefined ? `${f(r.value)}/${f(r.value2)}` : f(r.value);
}
