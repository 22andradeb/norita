import type { LogKindKey } from './logKinds';
import { accents } from './theme';
import type { IconName } from './vitals';

/** Icon and colour for each kind of entry, used by the log sheet and the timeline. */
export const LOG_STYLE: Record<LogKindKey, { icon: IconName; color: string; label: string }> = {
  checkin: { icon: 'clipboard-check-outline', color: accents.wellbeing, label: 'Revisión' },
  vitals: { icon: 'heart-pulse', color: accents.bloodPressure, label: 'Constantes' },
  meal: { icon: 'silverware-fork-knife', color: accents.meals, label: 'Comida' },
  drink: { icon: 'cup-water', color: accents.fluids, label: 'Bebida' },
  sleep: { icon: 'weather-night', color: accents.sleep, label: 'Sueño' },
  toileting: { icon: 'toilet', color: accents.spo2, label: 'Baño' },
  hygiene: { icon: 'shower-head', color: accents.respiration, label: 'Higiene' },
  activity: { icon: 'walk', color: accents.meds, label: 'Actividad' },
  behaviour: { icon: 'emoticon-confused-outline', color: accents.heartRate, label: 'Conducta' },
  skin: { icon: 'bandage', color: accents.weight, label: 'Piel' },
  fall: { icon: 'alert-octagon-outline', color: accents.bloodPressure, label: 'Caída' },
  appointment: { icon: 'stethoscope', color: accents.glucose, label: 'Cita médica' },
  other: { icon: 'note-text-outline', color: accents.neutral, label: 'Nota' },
  medication: { icon: 'pill', color: accents.meds, label: 'Medicación' },
  dose: { icon: 'pill', color: accents.meds, label: 'Toma' },
  stock: { icon: 'package-variant-closed', color: accents.meds, label: 'Existencias' },
};

/** Order of tiles in the "+" log sheet. */
export const SHEET_KINDS: LogKindKey[] = [
  'checkin',
  'vitals',
  'medication',
  'meal',
  'drink',
  'sleep',
  'toileting',
  'hygiene',
  'activity',
  'behaviour',
  'skin',
  'fall',
  'appointment',
  'other',
];
