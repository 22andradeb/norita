import { supabase } from './supabase';

// Validated scales. Wording must stay as published: changing it can invalidate the scale.
//
// WHO-5 Well-Being Index, official Spanish version ("OMS (cinco) Índice de Bienestar", 1998,
// Psychiatric Research Unit, WHO Collaborating Centre in Mental Health). Free to use.
// Spanish version validated in older adults: Lucas-Carrasco, Psychiatry Clin Neurosci 2012.
//
// FRAIL scale (Morley, Malmstrom & Miller, J Nutr Health Aging 2012), Spanish wording as commonly
// used in Spanish primary care (Fisterra / PAPPS). Have a clinician confirm it matches the version
// used by the person's health service. Spain's 2026 consensus on frailty prevention takes
// FRAIL >= 1 as "high probability of frailty" in people aged 70+.
//
// Scores are recomputed by the database (score_assessment trigger); the app's copy below is only
// for showing the result straight away, including offline.

export type Instrument = 'who5' | 'frail';

export const WHO5 = {
  name: 'Índice de Bienestar OMS-5 (WHO-5)',
  short: 'Bienestar (WHO-5)',
  every: 'cada 2 semanas',
  everyDays: 14,
  instructions:
    'Por favor, indique para cada una de las cinco afirmaciones cuál define mejor cómo se ha sentido usted durante las últimas dos semanas.',
  stem: 'Durante las últimas dos semanas:',
  items: [
    'Me he sentido alegre y de buen humor',
    'Me he sentido tranquilo y relajado',
    'Me he sentido activo y enérgico',
    'Me he despertado fresco y descansado',
    'Mi vida cotidiana ha estado llena de cosas que me interesan',
  ],
  options: [
    { value: 5, label: 'Todo el tiempo' },
    { value: 4, label: 'La mayor parte del tiempo' },
    { value: 3, label: 'Más de la mitad del tiempo' },
    { value: 2, label: 'Menos de la mitad del tiempo' },
    { value: 1, label: 'De vez en cuando' },
    { value: 0, label: 'Nunca' },
  ],
};

export const FRAIL_ILLNESSES = [
  { value: 'hypertension', label: 'Hipertensión arterial' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'cancer', label: 'Cáncer (que no sea un cáncer de piel de poca importancia)' },
  { value: 'lung', label: 'Enfermedad pulmonar crónica' },
  { value: 'heart_attack', label: 'Infarto de miocardio' },
  { value: 'heart_failure', label: 'Insuficiencia cardiaca congestiva' },
  { value: 'angina', label: 'Angina de pecho' },
  { value: 'asthma', label: 'Asma' },
  { value: 'arthritis', label: 'Artritis' },
  { value: 'stroke', label: 'Ictus' },
  { value: 'kidney', label: 'Enfermedad renal' },
] as const;

export const FRAIL = {
  name: 'Escala FRAIL de fragilidad',
  short: 'Fragilidad (FRAIL)',
  every: 'cada mes',
  everyDays: 30,
  fatigue: {
    question: '¿Qué parte del tiempo durante las últimas 4 semanas se ha sentido cansado/a?',
    options: [
      { value: 'all', label: 'Todo el tiempo' },
      { value: 'most', label: 'La mayor parte del tiempo' },
      { value: 'some', label: 'Parte del tiempo' },
      { value: 'little', label: 'Un poco del tiempo' },
      { value: 'none', label: 'En ningún momento' },
    ],
  },
  resistance: '¿Tiene alguna dificultad para subir 10 escalones sin descansar, por sí mismo/a y sin ningún tipo de ayuda?',
  ambulation: '¿Tiene alguna dificultad para caminar varios cientos de metros (una manzana), por sí mismo/a y sin ayuda?',
  illnesses: '¿Algún médico le ha dicho alguna vez que tiene alguna de estas enfermedades?',
  weightLoss: '¿Ha perdido más del 5 % de su peso en el último año?',
};

export type FrailAnswers = {
  fatigue: 'all' | 'most' | 'some' | 'little' | 'none';
  resistance: boolean;
  ambulation: boolean;
  illnesses: string[];
  weight_loss: boolean;
};

export type Assessment = {
  id: string;
  older_adult_id: string;
  recorded_at: string;
  instrument: Instrument;
  answers: number[] | FrailAnswers;
  score: number;
  category: string;
};

export function scoreWho5(answers: number[]) {
  const score = answers.reduce((a, b) => a + b, 0) * 4;
  return { score, category: score <= 28 ? 'very_low' : score <= 50 ? 'low' : 'good' };
}

export function scoreFrail(a: FrailAnswers) {
  const score =
    (a.fatigue === 'all' || a.fatigue === 'most' ? 1 : 0) +
    (a.resistance ? 1 : 0) +
    (a.ambulation ? 1 : 0) +
    (a.illnesses.length >= 5 ? 1 : 0) +
    (a.weight_loss ? 1 : 0);
  return { score, category: score === 0 ? 'robust' : score <= 2 ? 'prefrail' : 'frail' };
}

type Reading = { level: 'normal' | 'watch' | 'alert'; label: string; advice: string };

export function readWho5(score: number): Reading {
  if (score <= 28) return { level: 'alert', label: 'Muy bajo', advice: 'Puntuación muy baja: conviene comentarlo con su médico, puede indicar síntomas depresivos.' };
  if (score <= 50) return { level: 'watch', label: 'Bajo', advice: 'Por debajo de 50 se recomienda valorarlo con su médico.' };
  return { level: 'normal', label: 'Adecuado', advice: 'Bienestar adecuado. Un cambio de 10 puntos o más entre valoraciones es relevante.' };
}

export function readFrail(score: number): Reading {
  if (score >= 3) return { level: 'alert', label: 'Frágil', advice: 'Alta probabilidad de fragilidad: coméntalo con su médico de atención primaria.' };
  if (score >= 1) return { level: 'watch', label: 'Prefrágil', advice: 'Según el consenso del Ministerio de Sanidad (2026), 1 punto o más indica alta probabilidad de fragilidad: coméntalo con su médico de atención primaria.' };
  return { level: 'normal', label: 'Robusto/a', advice: 'Sin indicios de fragilidad en este cribado.' };
}

export const isDue = (latest: Assessment | null, everyDays: number) =>
  !latest || Date.now() - Date.parse(latest.recorded_at) > everyDays * 86_400_000;

export async function listAssessments(olderAdultId: string, sinceDays = 365) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('assessments')
    .select('id, older_adult_id, recorded_at, instrument, answers, score, category')
    .eq('older_adult_id', olderAdultId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Assessment[];
}

export function latestOf(list: Assessment[], instrument: Instrument) {
  const own = list.filter((a) => a.instrument === instrument);
  return own[own.length - 1] ?? null;
}
