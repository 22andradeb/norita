import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Button, Chip, Row } from './ui';

const HOUR = 3_600_000;

/** "When did this happen?" — quick presets plus a full date/time picker. Never in the future. */
export function WhenPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const t = useTheme();
  const now = Date.now();
  const offset = now - value.getTime();
  const presets = [
    { label: 'Ahora', ms: 0 },
    { label: 'Hace 1 h', ms: HOUR },
    { label: 'Hace 3 h', ms: 3 * HOUR },
  ];
  const clamp = (d: Date) => (d.getTime() > Date.now() ? new Date() : d);

  function openAndroid() {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) onChange(clamp(time));
          },
        });
      },
    });
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>Cuándo</Text>
      <Row>
        {presets.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            selected={Math.abs(offset - p.ms) < 60_000}
            onPress={() => onChange(new Date(Date.now() - p.ms))}
          />
        ))}
      </Row>
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="compact"
            maximumDate={new Date()}
            themeVariant={t.dark ? 'dark' : 'light'}
            locale="es-ES"
            onChange={(_, d) => d && onChange(clamp(d))}
            accessibilityLabel="Fecha y hora"
          />
        </View>
      ) : (
        <Button
          title={value.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          variant="secondary"
          icon="calendar-clock"
          onPress={openAndroid}
          compact
        />
      )}
    </View>
  );
}
