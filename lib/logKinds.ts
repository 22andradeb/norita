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

const QUALITY = scale(['Very poor', 'Poor', 'OK', 'Good', 'Very good']);

const notes: Field = { key: 'notes', label: 'Notes', type: 'text', multiline: true, maxLength: 1000 };

const severity = (fallback: 'info' | 'concern' | 'urgent' = 'info'): Field => ({
  key: 'severity',
  label: 'How concerning is this?',
  type: 'choice',
  required: true,
  default: fallback,
  options: [
    { value: 'info', label: 'Routine' },
    { value: 'concern', label: 'Worth watching' },
    { value: 'urgent', label: 'Urgent' },
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
  { key: 'appetite', label: 'Appetite', type: 'choice', options: QUALITY },
  { key: 'mobility', label: 'Mobility', type: 'choice', options: QUALITY },
  { key: 'mood', label: 'Mood', type: 'choice', options: QUALITY },
  {
    key: 'confusion',
    label: 'Confusion',
    type: 'choice',
    options: [
      { value: 0, label: 'None' },
      { value: 1, label: 'Mild' },
      { value: 2, label: 'Moderate' },
      { value: 3, label: 'Severe' },
    ],
  },
  { key: 'social_contact', label: 'Social contact today', type: 'bool' },
  {
    key: 'medications',
    label: 'Medications',
    type: 'choice',
    options: [
      { value: 'all_taken', label: 'All taken' },
      { value: 'some_missed', label: 'Some missed' },
      { value: 'none_taken', label: 'None taken' },
      { value: 'not_applicable', label: 'Not applicable' },
    ],
  },
  notes,
];

// --- Vital signs ------------------------------------------------------------

const vitalFields: Field[] = [
  { key: 'systolic', label: 'Blood pressure — systolic (top)', type: 'number', unit: 'mmHg', min: 50, max: 260 },
  { key: 'diastolic', label: 'Blood pressure — diastolic (bottom)', type: 'number', unit: 'mmHg', min: 30, max: 160 },
  { key: 'heart_rate', label: 'Heart rate', type: 'number', unit: 'bpm', min: 20, max: 250 },
  { key: 'temperature_c', label: 'Temperature', type: 'number', unit: '°C', min: 30, max: 45, decimals: true },
  { key: 'spo2', label: 'Oxygen saturation (SpO₂)', type: 'number', unit: '%', min: 50, max: 100 },
  { key: 'respiratory_rate', label: 'Breathing rate', type: 'number', unit: '/min', min: 4, max: 60 },
  { key: 'blood_glucose_mg_dl', label: 'Blood sugar', type: 'number', unit: 'mg/dL', min: 20, max: 800 },
  { key: 'weight_kg', label: 'Weight', type: 'number', unit: 'kg', min: 20, max: 300, decimals: true },
  {
    key: 'pain_score',
    label: 'Pain (0 = none, 10 = worst)',
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
    label: 'Meal',
    type: 'choice',
    required: true,
    options: [
      { value: 'breakfast', label: 'Breakfast' },
      { value: 'lunch', label: 'Lunch' },
      { value: 'dinner', label: 'Dinner' },
      { value: 'snack', label: 'Snack' },
      { value: 'drink', label: 'Drink only' },
    ],
  },
  {
    key: 'amount_eaten',
    label: 'How much was eaten',
    type: 'choice',
    options: [
      { value: 'none', label: 'None' },
      { value: 'little', label: 'A little' },
      { value: 'half', label: 'About half' },
      { value: 'most', label: 'Most' },
      { value: 'all', label: 'All' },
    ],
  },
  { key: 'fluids_ml', label: 'Fluids drunk', type: 'number', unit: 'ml', min: 0, max: 5000 },
  { key: 'description', label: 'What was served', type: 'text', maxLength: 300 },
  notes,
];

// --- Other care events (stored in care_events.details) ----------------------

const yesNo = (key: string, label: string): Field => ({ key, label, type: 'bool' });

export const EVENT_CATEGORIES = {
  sleep: {
    title: 'Sleep',
    fields: [
      { key: 'hours', label: 'Hours slept', type: 'number', unit: 'h', min: 0, max: 24, decimals: true },
      { key: 'quality', label: 'Sleep quality', type: 'choice', options: QUALITY },
      { key: 'night_wakings', label: 'Times woken in the night', type: 'number', min: 0, max: 30 },
      yesNo('daytime_napping', 'Napped during the day'),
    ],
  },
  toileting: {
    title: 'Toileting',
    fields: [
      {
        key: 'type',
        label: 'Type',
        type: 'choice',
        required: true,
        options: [
          { value: 'urine', label: 'Urine' },
          { value: 'bowel', label: 'Bowel movement' },
          { value: 'both', label: 'Both' },
        ],
      },
      yesNo('continent', 'Made it to the toilet'),
      yesNo('pad_changed', 'Pad changed'),
      {
        key: 'stool',
        label: 'Stool',
        type: 'choice',
        options: [
          { value: 'hard', label: 'Hard' },
          { value: 'normal', label: 'Normal' },
          { value: 'loose', label: 'Loose' },
          { value: 'diarrhoea', label: 'Diarrhoea' },
        ],
      },
      yesNo('blood_seen', 'Blood seen'),
    ],
  },
  fall: {
    title: 'Fall or near-fall',
    severity: 'concern',
    fields: [
      yesNo('near_miss', 'Near-fall only (did not reach the floor)'),
      yesNo('injured', 'Injured'),
      yesNo('hit_head', 'Hit their head'),
      yesNo('needed_help_up', 'Needed help getting up'),
      { key: 'where', label: 'Where it happened', type: 'text', maxLength: 100 },
    ],
  },
  skin: {
    title: 'Skin',
    fields: [
      {
        key: 'issue',
        label: 'What did you see',
        type: 'choice',
        required: true,
        options: [
          { value: 'redness', label: 'Redness' },
          { value: 'pressure_sore', label: 'Pressure sore' },
          { value: 'bruise', label: 'Bruise' },
          { value: 'wound', label: 'Cut or wound' },
          { value: 'rash', label: 'Rash' },
          { value: 'swelling', label: 'Swelling' },
          { value: 'dry', label: 'Very dry skin' },
        ],
      },
      { key: 'area', label: 'Body area', type: 'text', maxLength: 100 },
      yesNo('dressing_applied', 'Dressing or cream applied'),
    ],
  },
  hygiene: {
    title: 'Personal care',
    fields: [
      {
        key: 'tasks',
        label: 'What was done',
        type: 'multi',
        options: [
          { value: 'wash', label: 'Wash' },
          { value: 'shower', label: 'Shower or bath' },
          { value: 'oral_care', label: 'Teeth or dentures' },
          { value: 'hair', label: 'Hair' },
          { value: 'shave', label: 'Shave' },
          { value: 'nails', label: 'Nails' },
          { value: 'dressing', label: 'Dressed' },
          { value: 'bed_linen', label: 'Bed linen changed' },
        ],
      },
      {
        key: 'assistance',
        label: 'Help needed',
        type: 'choice',
        options: [
          { value: 'independent', label: 'Independent' },
          { value: 'some', label: 'Some help' },
          { value: 'full', label: 'Full help' },
        ],
      },
      yesNo('refused', 'Refused care'),
    ],
  },
  activity: {
    title: 'Activity',
    fields: [
      {
        key: 'kind',
        label: 'Activity',
        type: 'choice',
        required: true,
        options: [
          { value: 'walk', label: 'Walk' },
          { value: 'exercise', label: 'Exercises' },
          { value: 'outing', label: 'Outing' },
          { value: 'visitors', label: 'Visitors' },
          { value: 'hobby', label: 'Hobby or game' },
          { value: 'call', label: 'Phone or video call' },
        ],
      },
      { key: 'minutes', label: 'Duration', type: 'number', unit: 'min', min: 0, max: 600 },
      { key: 'enjoyment', label: 'Engagement', type: 'choice', options: QUALITY },
    ],
  },
  behaviour: {
    title: 'Behaviour',
    fields: [
      {
        key: 'observed',
        label: 'What did you notice',
        type: 'multi',
        required: true,
        options: [
          { value: 'agitated', label: 'Agitated' },
          { value: 'withdrawn', label: 'Withdrawn' },
          { value: 'wandering', label: 'Wandering' },
          { value: 'aggressive', label: 'Aggressive' },
          { value: 'tearful', label: 'Tearful' },
          { value: 'hallucinations', label: 'Seeing or hearing things' },
          { value: 'sundowning', label: 'Worse in the evening' },
        ],
      },
      { key: 'trigger', label: 'Possible trigger', type: 'text', maxLength: 200 },
      { key: 'helped', label: 'What helped', type: 'text', maxLength: 200 },
    ],
  },
  appointment: {
    title: 'Appointment',
    fields: [
      {
        key: 'with',
        label: 'With',
        type: 'choice',
        required: true,
        options: [
          { value: 'gp', label: 'GP / family doctor' },
          { value: 'nurse', label: 'Nurse' },
          { value: 'specialist', label: 'Specialist' },
          { value: 'dentist', label: 'Dentist' },
          { value: 'optician', label: 'Optician' },
          { value: 'physio', label: 'Physiotherapist' },
          { value: 'hospital', label: 'Hospital' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'outcome', label: 'Outcome or next steps', type: 'text', multiline: true, maxLength: 500 },
    ],
  },
  other: {
    title: 'Note',
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
    validate: (v) => (category === 'other' && !v.notes ? 'Write a note.' : null),
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
  { key: 'name', label: 'Medication name', type: 'text', required: true, maxLength: 120 },
  { key: 'dose', label: 'Dose (e.g. 500 mg, 1 tablet)', type: 'text', maxLength: 60 },
  {
    key: 'form',
    label: 'Form',
    type: 'choice',
    options: ['Tablet', 'Capsule', 'Liquid', 'Inhaler', 'Drops', 'Cream', 'Patch', 'Injection'].map((f) => ({
      value: f.toLowerCase(),
      label: f,
    })),
  },
  { key: 'times', label: 'When it is taken', type: 'multi', options: TIMES.map((t) => ({ value: t, label: t })) },
  { key: 'as_needed', label: 'Only when needed (PRN)', type: 'bool', default: false },
  { key: 'instructions', label: 'Instructions (e.g. with food)', type: 'text', maxLength: 300 },
  { key: 'stock_quantity', label: 'How many are in stock now', type: 'number', min: 0, max: 10000, decimals: true },
  {
    key: 'stock_unit',
    label: 'Counted in',
    type: 'choice',
    default: 'tablets',
    options: ['tablets', 'capsules', 'ml', 'doses', 'patches', 'units'].map((u) => ({ value: u, label: u })),
  },
  { key: 'low_stock_threshold', label: 'Warn me when stock is at or below', type: 'number', min: 0, max: 10000 },
];

const medicationKind: LogKind = {
  title: 'Add medication',
  button: 'Add medication',
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
  title: 'Medication dose',
  button: 'Give',
  fields: [
    {
      key: 'status',
      label: 'What happened',
      type: 'choice',
      required: true,
      default: 'given',
      options: [
        { value: 'given', label: 'Given' },
        { value: 'refused', label: 'Refused' },
        { value: 'missed', label: 'Missed' },
        { value: 'held', label: 'Held back (on purpose)' },
      ],
    },
    { key: 'quantity', label: 'Amount given', type: 'number', min: 0.01, max: 100, decimals: true, default: 1 },
    notes,
  ],
  build: (v, ctx) => [
    {
      table: 'medication_doses',
      row: {
        ...logRow(ctx),
        medication_id: ctx.medicationId,
        status: v.status,
        quantity: v.quantity ?? 1,
        notes: v.notes,
      },
    },
  ],
};

const stockKind: LogKind = {
  title: 'Update stock',
  button: 'Stock',
  fields: [
    {
      key: 'reason',
      label: 'What changed',
      type: 'choice',
      required: true,
      default: 'refill',
      options: [
        { value: 'refill', label: 'Refill received' },
        { value: 'disposed', label: 'Thrown away or lost' },
      ],
    },
    { key: 'quantity', label: 'How many', type: 'number', required: true, min: 0.01, max: 10000, decimals: true },
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
    title: 'Visit check-in',
    button: 'Visit check-in',
    fields: checkInFields,
    validate: (v) =>
      checkInFields.some((f) => f.key !== 'notes' && v[f.key] !== undefined) ? null : 'Answer at least one question.',
    build: (v, ctx) => [{ table: 'check_ins', row: { ...logRow(ctx), ...pick(v, fieldKeys(checkInFields)) } }],
  },
  vitals: {
    title: 'Vital signs',
    button: 'Vital signs',
    fields: vitalFields,
    validate: (v) => {
      if ((v.systolic === undefined) !== (v.diastolic === undefined)) {
        return 'Enter both blood pressure numbers, or neither.';
      }
      if (v.systolic !== undefined && (v.systolic as number) <= (v.diastolic as number)) {
        return 'The top blood pressure number should be higher than the bottom one.';
      }
      return VITAL_KEYS.some((k) => v[k] !== undefined) ? null : 'Enter at least one measurement.';
    },
    build: (v, ctx) => [{ table: 'vitals', row: { ...logRow(ctx), ...pick(v, fieldKeys(vitalFields)) } }],
  },
  meal: {
    title: 'Food and drink',
    button: 'Food & drink',
    fields: mealFields,
    build: (v, ctx) => [{ table: 'meals', row: { ...logRow(ctx), ...pick(v, fieldKeys(mealFields)) } }],
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

/** Buttons shown on the person's page, in order. Medication kinds are reached from the medication list. */
export const QUICK_LOGS: LogKindKey[] = [
  'checkin',
  'vitals',
  'meal',
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
      return value ? 'Yes' : 'No';
    case 'number':
      return field.unit ? `${value} ${field.unit}` : String(value);
    default:
      return String(value);
  }
}

export const FIELDS_BY_ACTIVITY = {
  check_in: checkInFields,
  vitals: vitalFields,
  meal: mealFields,
};
