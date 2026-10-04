// Every kind of entry a caregiver can log, described as data. The same definitions render the
// entry form (components/LogForm.tsx) and format entries in the timeline (components/care.tsx).

export type Option = { value: string | number; label: string };

type BaseField = { key: string; label: string; required?: boolean; default?: unknown };

export type Field =
  | (BaseField & { type: 'number'; unit?: string; min: number; max: number; decimals?: boolean })
  | (BaseField & { type: 'choice'; options: Option[] })
  | (BaseField & { type: 'multi'; options: Option[] })
  | (BaseField & { type: 'bool' })
  | (BaseField & { type: 'text'; multiline?: boolean; maxLength: number });

export type Values = Record<string, unknown>;

export type BuildContext = {
  olderAdultId: string;
  userId: string;
  medicationId?: string;
  /** Scheduled slot ("08:00") a dose belongs to, when logged from the Meds checklist. */
  scheduledTime?: string;
  now: string;
  newId: () => string;
};

export type Write = { table: string; row: Record<string, unknown> };

export type LogKind = {
  title: string;
  /** Short label for the button on the person's page. */
  button: string;
  fields: Field[];
  validate?: (values: Values) => string | null;
  build: (values: Values, ctx: BuildContext) => Write[];
};

const scale = (labels: [string, string, string, string, string]): Option[] =>
  labels.map((label, i) => ({ value: i + 1, label }));

const QUALITY = scale(['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien']);

const notes: Field = { key: 'notes', label: 'Notas', type: 'text', multiline: true, maxLength: 1000 };

const severity = (fallback: 'info' | 'concern' | 'urgent' = 'info'): Field => ({
  key: 'severity',
  label: '¿Cuánto preocupa?',
  type: 'choice',
  required: true,
  default: fallback,
  options: [
    { value: 'info', label: 'Rutina' },
    { value: 'concern', label: 'Vigilar' },
    { value: 'urgent', label: 'Urgente' },
  ],
});

/** Row columns common to every log table. */
const logRow = (ctx: BuildContext) => ({
  id: ctx.newId(),
  older_adult_id: ctx.olderAdultId,
  recorded_by: ctx.userId,
  recorded_at: ctx.now,
});

const pick = (values: Values, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => values[k] !== undefined).map((k) => [k, values[k]]));

const fieldKeys = (fields: Field[]) => fields.map((f) => f.key);

// --- Visit check-in ---------------------------------------------------------

const checkInFields: Field[] = [
  { key: 'appetite', label: 'Apetito', type: 'choice', options: QUALITY },
  { key: 'mobility', label: 'Movilidad', type: 'choice', options: QUALITY },
  { key: 'mood', label: 'Ánimo', type: 'choice', options: QUALITY },
  {
    key: 'confusion',
    label: 'Confusión',
    type: 'choice',
    options: [
      { value: 0, label: 'Ninguna' },
      { value: 1, label: 'Leve' },
      { value: 2, label: 'Moderada' },
      { value: 3, label: 'Grave' },
    ],
  },
  { key: 'social_contact', label: 'Contacto social hoy', type: 'bool' },
  {
    key: 'medications',
    label: 'Medicación',
    type: 'choice',
    options: [
      { value: 'all_taken', label: 'Toda tomada' },
      { value: 'some_missed', label: 'Faltó alguna' },
      { value: 'none_taken', label: 'Ninguna tomada' },
      { value: 'not_applicable', label: 'No aplica' },
    ],
  },
  notes,
];

// --- Vital signs ------------------------------------------------------------

const vitalFields: Field[] = [
  { key: 'systolic', label: 'Tensión — sistólica (alta)', type: 'number', unit: 'mmHg', min: 50, max: 260 },
  { key: 'diastolic', label: 'Tensión — diastólica (baja)', type: 'number', unit: 'mmHg', min: 30, max: 160 },
  { key: 'heart_rate', label: 'Frecuencia cardiaca', type: 'number', unit: 'lpm', min: 20, max: 250 },
  { key: 'temperature_c', label: 'Temperatura', type: 'number', unit: '°C', min: 30, max: 45, decimals: true },
  { key: 'spo2', label: 'Saturación de oxígeno (SpO₂)', type: 'number', unit: '%', min: 50, max: 100 },
  { key: 'respiratory_rate', label: 'Frecuencia respiratoria', type: 'number', unit: 'rpm', min: 4, max: 60 },
  { key: 'blood_glucose_mg_dl', label: 'Glucosa', type: 'number', unit: 'mg/dL', min: 20, max: 800 },
  { key: 'weight_kg', label: 'Peso', type: 'number', unit: 'kg', min: 20, max: 300, decimals: true },
  {
    key: 'pain_score',
    label: 'Dolor (0 = nada, 10 = máximo)',
    type: 'choice',
    options: Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })),
  },
  notes,
];

const VITAL_KEYS = vitalFields.filter((f) => f.key !== 'notes').map((f) => f.key);

// --- Food and drink ---------------------------------------------------------

const mealFields: Field[] = [
  {
    key: 'meal_type',
    label: 'Comida',
    type: 'choice',
    required: true,
    options: [
      { value: 'breakfast', label: 'Desayuno' },
      { value: 'lunch', label: 'Comida' },
      { value: 'dinner', label: 'Cena' },
      { value: 'snack', label: 'Merienda' },
    ],
  },
  {
    key: 'amount_eaten',
    label: 'Cuánto ha comido',
    type: 'choice',
    options: [
      { value: 'none', label: 'Nada' },
      { value: 'little', label: 'Un poco' },
      { value: 'half', label: 'La mitad' },
      { value: 'most', label: 'Casi todo' },
      { value: 'all', label: 'Todo' },
    ],
  },
  { key: 'fluids_ml', label: 'Líquidos bebidos', type: 'number', unit: 'ml', min: 0, max: 5000 },
  { key: 'description', label: 'Qué se sirvió', type: 'text', maxLength: 300 },
  notes,
];

const drinkFields: Field[] = [
  {
    key: 'fluids_ml',
    label: 'Cantidad',
    type: 'choice',
    required: true,
    options: [100, 150, 200, 250, 300, 500].map((ml) => ({ value: ml, label: `${ml} ml` })),
  },
  { key: 'description', label: 'Qué ha bebido', type: 'text', maxLength: 300 },
  notes,
];

// --- Other care events (stored in care_events.details) ----------------------

const yesNo = (key: string, label: string): Field => ({ key, label, type: 'bool' });

export const EVENT_CATEGORIES = {
  sleep: {
    title: 'Sueño',
    fields: [
      { key: 'hours', label: 'Horas dormidas', type: 'number', unit: 'h', min: 0, max: 24, decimals: true },
      { key: 'quality', label: 'Calidad del sueño', type: 'choice', options: QUALITY },
      { key: 'night_wakings', label: 'Veces que se despertó', type: 'number', min: 0, max: 30 },
      yesNo('daytime_napping', 'Siesta durante el día'),
    ],
  },
  toileting: {
    title: 'Baño y continencia',
    fields: [
      {
        key: 'type',
        label: 'Tipo',
        type: 'choice',
        required: true,
        options: [
          { value: 'urine', label: 'Orina' },
          { value: 'bowel', label: 'Deposición' },
          { value: 'both', label: 'Ambas' },
        ],
      },
      yesNo('continent', 'Llegó al baño a tiempo'),
      yesNo('pad_changed', 'Cambio de pañal/compresa'),
      {
        key: 'stool',
        label: 'Heces',
        type: 'choice',
        options: [
          { value: 'hard', label: 'Duras' },
          { value: 'normal', label: 'Normales' },
          { value: 'loose', label: 'Blandas' },
          { value: 'diarrhoea', label: 'Diarrea' },
        ],
      },
      yesNo('blood_seen', 'Se vio sangre'),
    ],
  },
  fall: {
    title: 'Caída o casi caída',
    severity: 'concern',
    fields: [
      yesNo('near_miss', 'Solo casi caída (no llegó al suelo)'),
      yesNo('injured', 'Se hizo daño'),
      yesNo('hit_head', 'Se golpeó la cabeza'),
      yesNo('needed_help_up', 'Necesitó ayuda para levantarse'),
      { key: 'where', label: 'Dónde ocurrió', type: 'text', maxLength: 100 },
    ],
  },
  skin: {
    title: 'Piel',
    fields: [
      {
        key: 'issue',
        label: 'Qué has visto',
        type: 'choice',
        required: true,
        options: [
          { value: 'redness', label: 'Enrojecimiento' },
          { value: 'pressure_sore', label: 'Úlcera por presión' },
          { value: 'bruise', label: 'Moratón' },
          { value: 'wound', label: 'Corte o herida' },
          { value: 'rash', label: 'Sarpullido' },
          { value: 'swelling', label: 'Hinchazón' },
          { value: 'dry', label: 'Piel muy seca' },
        ],
      },
      { key: 'area', label: 'Zona del cuerpo', type: 'text', maxLength: 100 },
      yesNo('dressing_applied', 'Se aplicó apósito o crema'),
    ],
  },
  hygiene: {
    title: 'Higiene personal',
    fields: [
      {
        key: 'tasks',
        label: 'Qué se hizo',
        type: 'multi',
        options: [
          { value: 'wash', label: 'Aseo' },
          { value: 'shower', label: 'Ducha o baño' },
          { value: 'oral_care', label: 'Dientes o dentadura' },
          { value: 'hair', label: 'Pelo' },
          { value: 'shave', label: 'Afeitado' },
          { value: 'nails', label: 'Uñas' },
          { value: 'dressing', label: 'Vestirse' },
          { value: 'bed_linen', label: 'Cambio de sábanas' },
        ],
      },
      {
        key: 'assistance',
        label: 'Ayuda necesaria',
        type: 'choice',
        options: [
          { value: 'independent', label: 'Autónomo/a' },
          { value: 'some', label: 'Algo de ayuda' },
          { value: 'full', label: 'Ayuda total' },
        ],
      },
      yesNo('refused', 'Rechazó la ayuda'),
    ],
  },
  activity: {
    title: 'Actividad',
    fields: [
      {
        key: 'kind',
        label: 'Actividad',
        type: 'choice',
        required: true,
        options: [
          { value: 'walk', label: 'Paseo' },
          { value: 'exercise', label: 'Ejercicios' },
          { value: 'outing', label: 'Salida' },
          { value: 'visitors', label: 'Visitas' },
          { value: 'hobby', label: 'Afición o juego' },
          { value: 'call', label: 'Llamada o videollamada' },
        ],
      },
      { key: 'minutes', label: 'Duración', type: 'number', unit: 'min', min: 0, max: 600 },
      { key: 'enjoyment', label: 'Participación', type: 'choice', options: QUALITY },
    ],
  },
  behaviour: {
    title: 'Conducta',
    fields: [
      {
        key: 'observed',
        label: 'Qué has notado',
        type: 'multi',
        required: true,
        options: [
          { value: 'agitated', label: 'Agitación' },
          { value: 'withdrawn', label: 'Retraimiento' },
          { value: 'wandering', label: 'Deambulación' },
          { value: 'aggressive', label: 'Agresividad' },
          { value: 'tearful', label: 'Llanto' },
          { value: 'hallucinations', label: 'Ve u oye cosas' },
          { value: 'sundowning', label: 'Peor al atardecer' },
        ],
      },
      { key: 'trigger', label: 'Posible desencadenante', type: 'text', maxLength: 200 },
      { key: 'helped', label: 'Qué ayudó', type: 'text', maxLength: 200 },
    ],
  },
  appointment: {
    title: 'Cita médica',
    fields: [
      {
        key: 'with',
        label: 'Con',
        type: 'choice',
        required: true,
        options: [
          { value: 'gp', label: 'Médico de cabecera' },
          { value: 'nurse', label: 'Enfermería' },
          { value: 'specialist', label: 'Especialista' },
          { value: 'dentist', label: 'Dentista' },
          { value: 'optician', label: 'Óptica' },
          { value: 'physio', label: 'Fisioterapia' },
          { value: 'hospital', label: 'Hospital' },
          { value: 'other', label: 'Otro' },
        ],
      },
      { key: 'outcome', label: 'Resultado o próximos pasos', type: 'text', multiline: true, maxLength: 500 },
    ],
  },
  other: {
    title: 'Nota',
    fields: [],
  },
} satisfies Record<string, { title: string; fields: Field[]; severity?: 'info' | 'concern' | 'urgent' }>;

export type EventCategory = keyof typeof EVENT_CATEGORIES;

function eventKind(category: EventCategory): LogKind {
  const def: { title: string; fields: Field[]; severity?: 'info' | 'concern' | 'urgent' } =
    EVENT_CATEGORIES[category];
  return {
    title: def.title,
    button: def.title,
    fields: [...def.fields, severity(def.severity), notes],
    validate: (v) => (category === 'other' && !v.notes ? 'Escribe una nota.' : null),
    build: (v, ctx) => [
      {
        table: 'care_events',
        row: {
          ...logRow(ctx),
          category,
          severity: v.severity ?? 'info',
          details: pick(v, fieldKeys(def.fields)),
          notes: v.notes,
        },
      },
    ],
  };
}

// --- Medications ------------------------------------------------------------

const TIMES = ['07:00', '08:00', '09:00', '12:00', '13:00', '14:00', '17:00', '18:00', '20:00', '21:00', '22:00'];

const medicationFields: Field[] = [
  { key: 'name', label: 'Nombre del medicamento', type: 'text', required: true, maxLength: 120 },
  { key: 'dose', label: 'Dosis (p. ej. 500 mg, 1 comprimido)', type: 'text', maxLength: 60 },
  {
    key: 'form',
    label: 'Forma',
    type: 'choice',
    options: [
      { value: 'tablet', label: 'Comprimido' },
      { value: 'capsule', label: 'Cápsula' },
      { value: 'liquid', label: 'Jarabe o líquido' },
      { value: 'inhaler', label: 'Inhalador' },
      { value: 'drops', label: 'Gotas' },
      { value: 'cream', label: 'Crema' },
      { value: 'patch', label: 'Parche' },
      { value: 'injection', label: 'Inyección' },
    ],
  },
  { key: 'times', label: 'Horas de toma', type: 'multi', options: TIMES.map((t) => ({ value: t, label: t })) },
  { key: 'as_needed', label: 'Solo si lo necesita', type: 'bool', default: false },
  { key: 'instructions', label: 'Instrucciones (p. ej. con comida)', type: 'text', maxLength: 300 },
  { key: 'stock_quantity', label: 'Cuántas unidades quedan ahora', type: 'number', min: 0, max: 10000, decimals: true },
  {
    key: 'stock_unit',
    label: 'Se cuenta en',
    type: 'choice',
    default: 'comprimidos',
    options: ['comprimidos', 'cápsulas', 'ml', 'dosis', 'parches', 'unidades'].map((u) => ({ value: u, label: u })),
  },
  { key: 'low_stock_threshold', label: 'Avisar cuando queden', type: 'number', min: 0, max: 10000 },
];

const medicationKind: LogKind = {
  title: 'Añadir medicamento',
  button: 'Añadir medicamento',
  fields: medicationFields,
  build: (v, ctx) => {
    const id = ctx.newId();
    const writes: Write[] = [
      {
        table: 'medications',
        row: {
          id,
          older_adult_id: ctx.olderAdultId,
          created_by: ctx.userId,
          ...pick(v, ['name', 'dose', 'form', 'instructions', 'as_needed', 'stock_unit', 'low_stock_threshold']),
          times: (v.times as string[] | undefined)?.slice().sort() ?? [],
        },
      },
    ];
    const stock = v.stock_quantity as number | undefined;
    if (stock) {
      writes.push({
        table: 'medication_stock_events',
        row: { ...logRow(ctx), medication_id: id, delta: stock, reason: 'initial' },
      });
    }
    return writes;
  },
};

const doseKind: LogKind = {
  title: 'Toma',
  button: 'Dar',
  fields: [
    {
      key: 'status',
      label: 'Qué pasó',
      type: 'choice',
      required: true,
      default: 'given',
      options: [
        { value: 'given', label: 'Tomada' },
        { value: 'refused', label: 'Rechazada' },
        { value: 'missed', label: 'Olvidada' },
        { value: 'held', label: 'No dada (a propósito)' },
      ],
    },
    { key: 'quantity', label: 'Cantidad dada', type: 'number', min: 0.01, max: 100, decimals: true, default: 1 },
    notes,
  ],
  build: (v, ctx) => [
    {
      table: 'medication_doses',
      row: {
        ...logRow(ctx),
        medication_id: ctx.medicationId,
        scheduled_time: ctx.scheduledTime,
        status: v.status,
        quantity: v.quantity ?? 1,
        notes: v.notes,
      },
    },
  ],
};

const stockKind: LogKind = {
  title: 'Actualizar existencias',
  button: 'Existencias',
  fields: [
    {
      key: 'reason',
      label: 'Qué cambió',
      type: 'choice',
      required: true,
      default: 'refill',
      options: [
        { value: 'refill', label: 'Ha llegado reposición' },
        { value: 'disposed', label: 'Desechado o perdido' },
      ],
    },
    { key: 'quantity', label: 'Cuántas', type: 'number', required: true, min: 0.01, max: 10000, decimals: true },
    notes,
  ],
  build: (v, ctx) => [
    {
      table: 'medication_stock_events',
      row: {
        ...logRow(ctx),
        medication_id: ctx.medicationId,
        delta: v.reason === 'disposed' ? -(v.quantity as number) : v.quantity,
        reason: v.reason,
        notes: v.notes,
      },
    },
  ],
};

// --- Registry ---------------------------------------------------------------

export const LOG_KINDS = {
  checkin: {
    title: 'Revisión de la visita',
    button: 'Revisión',
    fields: checkInFields,
    validate: (v) =>
      checkInFields.some((f) => f.key !== 'notes' && v[f.key] !== undefined) ? null : 'Responde al menos una pregunta.',
    build: (v, ctx) => [{ table: 'check_ins', row: { ...logRow(ctx), ...pick(v, fieldKeys(checkInFields)) } }],
  },
  vitals: {
    title: 'Constantes vitales',
    button: 'Constantes',
    fields: vitalFields,
    validate: (v) => {
      if ((v.systolic === undefined) !== (v.diastolic === undefined)) {
        return 'Introduce los dos valores de tensión, o ninguno.';
      }
      if (v.systolic !== undefined && (v.systolic as number) <= (v.diastolic as number)) {
        return 'La tensión alta debe ser mayor que la baja.';
      }
      return VITAL_KEYS.some((k) => v[k] !== undefined) ? null : 'Introduce al menos una medida.';
    },
    build: (v, ctx) => [{ table: 'vitals', row: { ...logRow(ctx), ...pick(v, fieldKeys(vitalFields)) } }],
  },
  meal: {
    title: 'Comida',
    button: 'Comida',
    fields: mealFields,
    build: (v, ctx) => [{ table: 'meals', row: { ...logRow(ctx), ...pick(v, fieldKeys(mealFields)) } }],
  },
  drink: {
    title: 'Bebida',
    button: 'Bebida',
    fields: drinkFields,
    build: (v, ctx) => [
      { table: 'meals', row: { ...logRow(ctx), meal_type: 'drink', ...pick(v, fieldKeys(drinkFields)) } },
    ],
  },
  sleep: eventKind('sleep'),
  toileting: eventKind('toileting'),
  fall: eventKind('fall'),
  skin: eventKind('skin'),
  hygiene: eventKind('hygiene'),
  activity: eventKind('activity'),
  behaviour: eventKind('behaviour'),
  appointment: eventKind('appointment'),
  other: eventKind('other'),
  medication: medicationKind,
  dose: doseKind,
  stock: stockKind,
} satisfies Record<string, LogKind>;

export type LogKindKey = keyof typeof LOG_KINDS;

export function isLogKind(key: string): key is LogKindKey {
  return key in LOG_KINDS;
}

/** "Label: value" lines for the fields present in `data`, used by the timeline. */
export function describe(fields: Field[], data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const field of fields) {
    const value = data[field.key];
    if (value === undefined || value === null || value === '' || field.key === 'notes' || field.key === 'severity') {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) continue;
    lines.push(`${field.label}: ${formatValue(field, value)}`);
  }
  return lines;
}

function formatValue(field: Field, value: unknown): string {
  switch (field.type) {
    case 'choice':
      return field.options.find((o) => o.value === value)?.label ?? String(value);
    case 'multi':
      return (value as unknown[]).map((v) => field.options.find((o) => o.value === v)?.label ?? String(v)).join(', ');
    case 'bool':
      return value ? 'Sí' : 'No';
    case 'number':
      return `${(value as number).toLocaleString('es-ES')}${field.unit ? ` ${field.unit}` : ''}`;
    default:
      return String(value);
  }
}

export const FIELDS_BY_ACTIVITY = {
  check_in: checkInFields,
  vitals: vitalFields,
  meal: mealFields,
};
