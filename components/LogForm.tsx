import { useState } from 'react';
import { Text, View } from 'react-native';

import type { Field, Values } from '@/lib/logKinds';
import { errorText } from '@/lib/format';
import { useTheme } from '@/lib/theme';

import { Button, Chip, ErrorText, Field as TextField, Row } from './ui';
import { WhenPicker } from './WhenPicker';

type Raw = Record<string, unknown>;

function initialRaw(fields: Field[]): Raw {
  const raw: Raw = {};
  for (const f of fields) {
    if (f.default === undefined) continue;
    raw[f.key] = f.type === 'number' ? String(f.default) : f.default;
  }
  return raw;
}

/** Converts what was typed/tapped into typed values, or returns the first problem found. */
function parse(fields: Field[], raw: Raw): { values: Values } | { error: string } {
  const values: Values = {};
  for (const f of fields) {
    const input = raw[f.key];
    const empty = input === undefined || input === '' || (Array.isArray(input) && input.length === 0);
    if (empty) {
      if (f.required) return { error: `Falta: ${f.label}.` };
      continue;
    }
    if (f.type === 'number') {
      const n = Number(String(input).replace(',', '.'));
      if (!Number.isFinite(n)) return { error: `${f.label}: tiene que ser un número.` };
      if (!f.decimals && !Number.isInteger(n)) return { error: `${f.label}: tiene que ser un número entero.` };
      if (n < f.min || n > f.max) return { error: `${f.label}: debe estar entre ${f.min} y ${f.max}.` };
      values[f.key] = n;
    } else if (f.type === 'text') {
      const s = String(input).trim();
      if (s) values[f.key] = s;
      else if (f.required) return { error: `Falta: ${f.label}.` };
    } else {
      values[f.key] = input;
    }
  }
  return { values };
}

export function LogForm({
  fields,
  validate,
  submitLabel = 'Guardar',
  defaultWhen,
  onSubmit,
}: {
  fields: Field[];
  validate?: (values: Values) => string | null;
  submitLabel?: string;
  /** When set, the form asks when it happened, starting from this time. */
  defaultWhen?: Date;
  onSubmit: (values: Values, when: Date) => Promise<void>;
}) {
  const [raw, setRaw] = useState<Raw>(() => initialRaw(fields));
  const [when, setWhen] = useState<Date>(() => defaultWhen ?? new Date());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string, value: unknown) => setRaw((r) => ({ ...r, [key]: value }));

  async function submit() {
    const result = parse(fields, raw);
    if ('error' in result) return setError(result.error);
    const problem = validate?.(result.values);
    if (problem) return setError(problem);
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(result.values, when);
    } catch (e) {
      setError(errorText(e));
      setSubmitting(false);
    }
  }

  return (
    <View style={{ gap: 22 }}>
      {defaultWhen ? <WhenPicker value={when} onChange={setWhen} /> : null}
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} value={raw[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
      <ErrorText>{error}</ErrorText>
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const label = field.required ? `${field.label} *` : field.label;

  switch (field.type) {
    case 'number':
      return (
        <TextField
          label={field.unit ? `${label} (${field.unit})` : label}
          value={(value as string | undefined) ?? ''}
          onChangeText={onChange}
          keyboardType={field.decimals ? 'decimal-pad' : 'number-pad'}
          returnKeyType="done"
        />
      );
    case 'text':
      return (
        <TextField
          label={label}
          value={(value as string | undefined) ?? ''}
          onChangeText={onChange}
          maxLength={field.maxLength}
          multiline={field.multiline}
          style={field.multiline ? { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 } : undefined}
        />
      );
    case 'bool':
      return (
        <Group label={label}>
          <Chip label="Sí" selected={value === true} onPress={() => onChange(value === true ? undefined : true)} />
          <Chip label="No" selected={value === false} onPress={() => onChange(value === false ? undefined : false)} />
        </Group>
      );
    case 'choice':
      return (
        <Group label={label}>
          {field.options.map((o) => (
            <Chip
              key={String(o.value)}
              label={o.label}
              selected={value === o.value}
              // Tapping the selected chip again clears an optional answer.
              onPress={() => onChange(value === o.value && !field.required ? undefined : o.value)}
            />
          ))}
        </Group>
      );
    case 'multi': {
      const selected = (value as unknown[] | undefined) ?? [];
      return (
        <Group label={label}>
          {field.options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <Chip
                key={String(o.value)}
                label={o.label}
                selected={on}
                onPress={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
              />
            );
          })}
        </Group>
      );
    }
  }
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }} accessibilityRole="text">
        {label}
      </Text>
      <Row>{children}</Row>
    </View>
  );
}
