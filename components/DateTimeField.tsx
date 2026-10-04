import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Button } from './ui';

/** Date and time input that allows future dates (e.g. appointments). */
export function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const t = useTheme();

  function openAndroid() {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) onChange(time);
          },
        });
      },
    });
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="compact"
            locale="es-ES"
            minuteInterval={5}
            themeVariant={t.dark ? 'dark' : 'light'}
            onChange={(_, d) => d && onChange(d)}
            accessibilityLabel={label}
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
